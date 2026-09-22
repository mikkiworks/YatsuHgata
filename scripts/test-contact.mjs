// Usage: node scripts/test-contact.mjs /path/to/node_modules
// Requires @php-wasm/node and @php-wasm/universal (3.1.55). No real email is sent.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve, dirname} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const modules = resolve(process.argv[2] || 'node_modules');
const {PHP} = await import(pathToFileURL(resolve(modules, '@php-wasm/universal/index.js')));
const {loadNodeRuntime} = await import(pathToFileURL(resolve(modules, '@php-wasm/node/index.js')));
const php = new PHP(await loadNodeRuntime('8.3', {emscriptenOptions: {processId: 1234}}));
const dir = '/tmp/yatsu-form-test';
php.mkdir(dir);
const source = await readFile(resolve(root, 'contact/form.php'), 'utf8');
assert.equal((source.match(/@mail\(/g) || []).length, 1);
// Substitute only the transport, preserving all production validation and MIME encoding.
const stub = `
function test_mail($to, $subject, $body, $headers, $params) {
    $file = __DIR__ . '/mail.json';
    $mails = is_file($file) ? json_decode(file_get_contents($file), true) : [];
    $mails[] = compact('to', 'subject', 'body', 'headers', 'params');
    file_put_contents($file, json_encode($mails));
    $mode = is_file(__DIR__ . '/mode') ? trim(file_get_contents(__DIR__ . '/mode')) : '';
    return $mode !== 'admin-fail' && !($mode === 'reply-fail' && isset($headers['Auto-Submitted']));
}
`;
php.writeFile(resolve(dir,'form.php'), source.replace('<?php', '<?php\n' + stub).replace('@mail(', 'test_mail('));
php.writeFile(resolve(dir,'index.php'), await readFile(resolve(root,'contact/index.php'),'utf8'));
let cookie = '', ip = 1, count = 0;
async function request(step = '', data) {
    const r = await php.run({scriptPath: resolve(dir,'index.php'), relativeUri: '/contact/index.php' + (step ? '?step='+step : ''), method: data ? 'POST' : 'GET', headers: {'content-type':'application/x-www-form-urlencoded', cookie}, body: data ? new TextEncoder().encode(new URLSearchParams(data).toString()) : undefined, $_SERVER: {REMOTE_ADDR:'192.0.2.'+ip, HTTPS:'on'}});
    assert.equal(r.errors.replace(/Contact (?:admin mail|auto-reply) rejected: [A-F0-9]+\n/g, ''), '', r.errors);
    const set = r.headers['set-cookie'];
    if(set) cookie = (Array.isArray(set) ? set[0] : set).split(';')[0];
    return r;
}
const token = r => r.text.match(/name="token" value="([a-f0-9]+)"/)?.[1];
const location = r => r.headers.location?.[0] ?? r.headers.location;
async function age(seconds = 4) {
    const id = cookie.split('=')[1];
    const r = await php.run({code:`<?php session_name('yatsuhigata_contact'); session_id('${id}'); session_start(); $_SESSION['contact']['started'] -= ${seconds}; session_write_close();`});
    assert.equal(r.errors,'');
}
async function fresh() {cookie=''; ip++; const r=await request(); await age(); return r;}
const valid = () => ({organization:'谷津の会',name:'テスト太郎',email:`visitor${ip}@example.test`,url:'https://example.test/',message:'日本語の問い合わせ\n二行目 🐦',website_check:''});
async function confirm(r, overrides = {}) {return request('', {...valid(),...overrides,token:token(r),action:'confirm'});}
async function mails() {try {return JSON.parse(php.readFileAsText(resolve(dir,'mail.json')));} catch {return [];}}
function ok(label) {count++; console.log('PASS '+label);}
try {
    let r=await fresh(); assert.match(r.text,/確認画面へ/); assert.match(cookie,/yatsuhigata_contact=/); ok('input and session');
    let bad=await request('',{...valid(),action:'confirm',token:'invalid'}); assert.equal(bad.httpStatusCode,400); assert.equal((await mails()).length,0); ok('CSRF rejection');
    bad=await confirm(r,{name:'',email:'wrong',message:''}); assert.match(bad.text,/メールアドレスを正しく/); assert.match(bad.text,/お名前を入力/); ok('required and email validation');
    bad=await confirm(bad,{email:'a@example.test\r\nBcc: bad@example.test'}); assert.match(bad.text,/使用できない文字/); ok('header injection rejection');
    const arrayData={...valid(), 'name[]':'array', token:token(bad), action:'confirm'}; delete arrayData.name; bad=await request('',arrayData);
    assert.match(bad.text,/使用できない文字/); ok('array input rejection');
    r=await request();
    bad=await confirm(r,{message:'あ'.repeat(5001)}); assert.match(bad.text,/長すぎる|5000文字以内/); ok('length limit');
    bad=await confirm(bad,{website_check:'bot'}); assert.match(bad.text,/少し時間をおいて/); ok('honeypot');
    r=await fresh();
    let c=await confirm(r,{name:'<script>alert(1)</script>'}); assert.equal(c.httpStatusCode,303); assert.equal(location(c),'index.php?step=confirm');
    c=await request('confirm'); assert.match(c.text,/&lt;script&gt;/); assert.doesNotMatch(c.text,/<script>alert/); assert.match(c.text,/二行目 🐦/); ok('confirmation and escaping');
    r=await request('',{action:'back',token:token(c)}); assert.equal(r.httpStatusCode,303); r=await request(); assert.match(r.text,/value="&lt;script&gt;/); ok('back preserves fields');
    await confirm(r); c=await request('confirm'); const sendToken=token(c);
    r=await request('',{action:'send',token:sendToken,message:'tampered'}); assert.equal(location(r),'index.php?step=complete');
    r=await request('complete'); assert.match(r.text,/お問い合わせを受け付けました/);
    let sent=await mails(); assert.equal(sent.length,2); assert.equal(sent[0].to,'contact@yatsuhigata.com'); assert.match(Buffer.from(sent[0].body,'base64').toString(),/二行目 🐦/); assert.doesNotMatch(Buffer.from(sent[0].body,'base64').toString(),/tampered/); assert.equal(sent[0].headers['Reply-To'],valid().email); assert.equal(sent[1].to,valid().email); assert.equal(sent[1].headers['Auto-Submitted'],'auto-replied'); assert.doesNotMatch(Buffer.from(sent[1].body,'base64').toString(),/二行目/); ok('two mails, fixed sender, reply-to, Japanese MIME, server-side draft');
    await request('',{action:'send',token:sendToken}); await request('complete'); assert.equal((await mails()).length,2); ok('duplicate submit and refresh');
    r=await request(); await confirm(r); c=await request('confirm'); await request('',{action:'send',token:token(c)}); c=await request('confirm'); assert.match(c.text,/短時間の送信/); assert.equal((await mails()).length,2); ok('rate limit');
    r=await fresh(); await confirm(r); c=await request('confirm'); php.writeFile(resolve(dir,'mode'),'admin-fail'); await request('',{action:'send',token:token(c)}); r=await request('confirm'); assert.match(r.text,/送信できませんでした/); assert.equal((await mails()).length,3); ok('admin failure retains confirmation and skips reply');
    r=await fresh(); await confirm(r); c=await request('confirm'); php.writeFile(resolve(dir,'mode'),'reply-fail'); await request('',{action:'send',token:token(c)}); r=await request('complete'); assert.match(r.text,/再送信は不要/); assert.equal((await mails()).length,5); ok('reply failure still completes');
    r=await fresh(); await age(3601); bad=await confirm(r); assert.match(bad.text,/有効期限が切れた/); assert.equal((await mails()).length,5); ok('expired session');
    r=await fresh(); const direct=await request('complete'); assert.equal(direct.httpStatusCode,303); assert.equal(location(direct),'index.php'); bad=await request('',{action:'send',token:token(r)}); assert.match(bad.text,/確認画面から送信/); ok('direct completion and unconfirmed send rejected');
    console.log(`${count} checks passed. No real email sent.`);
} finally {
    php.rmdir(dir, {recursive:true});
    php.exit();
}
process.exit(0);
