<?php
// Included by index.php only. No credentials or submitted content are stored here.
if (!defined('CONTACT_ENTRY')) {
    http_response_code(404);
    exit;
}

const CONTACT_MAIL = 'contact@yatsuhigata.com';
const CONTACT_TTL = 3600;

function contact_escape(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function contact_redirect(string $step = ''): void
{
    header('Location: index.php' . ($step !== '' ? '?step=' . $step : ''), true, 303);
    exit;
}

function contact_token(): string
{
    return bin2hex(random_bytes(32));
}

function contact_length(string $value): int
{
    return preg_match_all('/./us', $value, $matches);
}

// Shared, locked rate limits survive new sessions. Keys are hashes; no message is stored.
function contact_allow_send(string $email): bool
{
    $file = sys_get_temp_dir() . '/yatsuhigata-contact-' . hash('sha256', __DIR__) . '.json';
    $handle = @fopen($file, 'c+');
    if (!$handle) {
        return false;
    }
    @chmod($file, 0600);
    if (!flock($handle, LOCK_EX)) {
        fclose($handle);
        return false;
    }
    try {
        $raw = stream_get_contents($handle);
        $records = $raw === '' ? [] : json_decode($raw, true);
        if (!is_array($records)) {
            return false;
        }
        $now = time();
        foreach ($records as $key => $times) {
            $records[$key] = array_values(array_filter($times, static function ($time) use ($now) {
                return $time > $now - 3600;
            }));
            if (!$records[$key]) {
                unset($records[$key]);
            }
        }
        $limits = [
            hash('sha256', 'ip:' . ($_SERVER['REMOTE_ADDR'] ?? 'unknown')) => 5,
            hash('sha256', 'email:' . strtolower($email)) => 3,
        ];
        foreach ($limits as $key => $limit) {
            $times = $records[$key] ?? [];
            if (count($times) >= $limit || ($times && max($times) > $now - 60)) {
                return false;
            }
        }
        if (count($records) > 10000) {
            return false;
        }
        foreach ($limits as $key => $limit) {
            $records[$key][] = $now;
        }
        $encoded = json_encode($records);
        rewind($handle);
        if (!ftruncate($handle, 0) || fwrite($handle, $encoded) !== strlen($encoded)) {
            return false;
        }
        return fflush($handle);
    } finally {
        flock($handle, LOCK_UN);
        fclose($handle);
    }
}

function contact_mail(string $to, string $subject, string $body, string $replyTo, bool $automatic = false): bool
{
    // Fixed sender/envelope sender. User text never enters a subject or sender header.
    $headers = [
        'From' => CONTACT_MAIL,
        'Reply-To' => $replyTo,
        'MIME-Version' => '1.0',
        'Content-Type' => 'text/plain; charset=UTF-8',
        'Content-Transfer-Encoding' => 'base64',
    ];
    if ($automatic) {
        $headers['Auto-Submitted'] = 'auto-replied';
        $headers['X-Auto-Response-Suppress'] = 'All';
    }
    // Split the encoded subject on UTF-8 character boundaries (RFC 2047).
    preg_match_all('/.{1,12}/us', $subject, $chunks);
    $subject = implode("\r\n ", array_map(static function ($chunk) {
        return '=?UTF-8?B?' . base64_encode($chunk) . '?=';
    }, $chunks[0]));
    $body = str_replace(["\r\n", "\r"], "\n", $body);
    $body = str_replace("\n", "\r\n", $body);
    try {
        return @mail($to, $subject, chunk_split(base64_encode($body), 76, "\r\n"), $headers, '-f' . CONTACT_MAIL);
    } catch (Throwable $error) {
        error_log('Contact mail transport failed.');
        return false;
    }
}

header('Content-Type: text/html; charset=UTF-8');
header('Cache-Control: no-store, private');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: SAMEORIGIN');
header('Referrer-Policy: same-origin');
ini_set('session.use_strict_mode', '1');
session_name('yatsuhigata_contact');
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/contact/',
    'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
    'httponly' => true,
    'samesite' => 'Lax',
]);
session_start();

$blank = ['organization' => '', 'name' => '', 'email' => '', 'url' => '', 'message' => ''];
if (!isset($_SESSION['contact']) || time() - $_SESSION['contact']['started'] > CONTACT_TTL) {
    $_SESSION['contact'] = ['token' => contact_token(), 'started' => time(), 'values' => $blank];
}
$state =& $_SESSION['contact'];
$errors = [];
$step = 'input';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if (!in_array($method, ['GET', 'POST'], true)) {
    header('Allow: GET, POST');
    http_response_code(405);
    exit;
}

if ($method === 'POST') {
    $action = is_string($_POST['action'] ?? null) ? $_POST['action'] : '';
    $token = is_string($_POST['token'] ?? null) ? $_POST['token'] : '';
    if ($action === 'send' && isset($state['completed'])) {
        contact_redirect('complete');
    }
    if (!hash_equals($state['token'], $token)) {
        http_response_code(400);
        $errors[] = '入力の有効期限が切れたか、画面の状態が変わりました。内容を確認し、もう一度お進みください。';
    } elseif ($action === 'confirm') {
        $values = $blank;
        $labels = ['organization' => '企業名・組織名', 'name' => 'お名前', 'email' => 'メールアドレス', 'url' => 'URL・SNS', 'message' => 'お問い合わせ内容'];
        $limits = ['organization' => 200, 'name' => 100, 'email' => 254, 'url' => 500, 'message' => 5000];
        foreach ($blank as $key => $unused) {
            $raw = $_POST[$key] ?? '';
            if (!is_string($raw) || strlen($raw) > $limits[$key] * 4 || !preg_match('//u', $raw)) {
                $errors[] = $labels[$key] . 'の入力が長すぎるか、使用できない文字が含まれています。';
                continue;
            }
            $value = trim(str_replace(["\r\n", "\r"], "\n", $raw));
            $values[$key] = $value;
            if (preg_match('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', $value)
                || ($key !== 'message' && preg_match('/[\r\n]/', $value))) {
                $errors[] = $labels[$key] . 'に使用できない文字が含まれています。';
            }
            if (contact_length($value) > $limits[$key]) {
                $errors[] = $labels[$key] . 'は' . $limits[$key] . '文字以内で入力してください。';
            }
        }
        foreach (['name', 'email', 'message'] as $key) {
            if (preg_match('/\A[\s\x{3000}]*\z/u', $values[$key])) {
                $errors[] = $labels[$key] . 'を入力してください。';
            }
        }
        if ($values['email'] !== '' && !filter_var($values['email'], FILTER_VALIDATE_EMAIL)) {
            $errors[] = 'メールアドレスを正しく入力してください。';
        }
        if (($_POST['website_check'] ?? '') !== '' || time() - $state['started'] < 3) {
            $errors[] = '少し時間をおいて、もう一度確認画面へお進みください。';
        }
        $state['values'] = $values;
        unset($state['confirmed'], $state['completed']);
        if (!$errors) {
            $state['confirmed'] = true;
            $state['id'] = strtoupper(bin2hex(random_bytes(8)));
            $state['token'] = contact_token();
            contact_redirect('confirm');
        }
    } elseif ($action === 'back') {
        unset($state['confirmed']);
        $state['token'] = contact_token();
        contact_redirect();
    } elseif ($action === 'send' && !empty($state['confirmed'])) {
        if (!contact_allow_send($state['values']['email'])) {
            $state['error'] = '短時間の送信が続いているか、現在送信を受け付けられません。時間をおいてお試しください。お急ぎの場合は contact@yatsuhigata.com へ直接ご連絡ください。';
            contact_redirect('confirm');
        }
        $v = $state['values'];
        $body = "谷津干潟ナビにお問い合わせが届きました。\n\n受付番号：{$state['id']}\n";
        foreach (['organization' => '企業名・組織名', 'name' => 'お名前', 'email' => 'メールアドレス', 'url' => 'URL・SNS', 'message' => 'お問い合わせ内容'] as $key => $label) {
            $body .= "\n【{$label}】\n" . ($v[$key] !== '' ? $v[$key] : '（未入力）') . "\n";
        }
        if (!contact_mail(CONTACT_MAIL, '【谷津干潟ナビ】お問い合わせ', $body, $v['email'])) {
            error_log('Contact admin mail rejected: ' . $state['id']);
            $state['error'] = '送信できませんでした。1分以上おいて再度お試しください。解決しない場合は contact@yatsuhigata.com へ直接ご連絡ください。';
            contact_redirect('confirm');
        }
        // Mark accepted before the second mail, while holding the session lock.
        $state['completed'] = ['id' => $state['id'], 'reply' => false];
        $state['confirmed'] = false;
        $reply = "谷津干潟ナビへお問い合わせいただき、ありがとうございます。\nお問い合わせを受け付けました。\n\n受付番号：{$state['id']}\n\n内容を確認のうえ、必要に応じて担当者より返信いたします。\n返信までお時間をいただく場合があります。\n\nこのメールは、お問い合わせフォームから自動送信しています。\nお心当たりのない場合は、このメールを削除してください。\n\n谷津干潟ナビ\nhttps://yatsuhigata.com/\ncontact@yatsuhigata.com\n";
        $state['completed']['reply'] = contact_mail($v['email'], '【谷津干潟ナビ】お問い合わせ受付', $reply, CONTACT_MAIL, true);
        if (!$state['completed']['reply']) {
            error_log('Contact auto-reply rejected: ' . $state['id']);
        }
        $state['values'] = $blank;
        $state['token'] = contact_token();
        contact_redirect('complete');
    } else {
        http_response_code(400);
        $errors[] = '入力内容を確認し、確認画面から送信してください。';
    }
}

$requestedStep = $_GET['step'] ?? '';
if ($method === 'GET' && $requestedStep === 'confirm') {
    if (empty($state['confirmed'])) {
        contact_redirect(isset($state['completed']) ? 'complete' : '');
    }
    $step = 'confirm';
} elseif ($method === 'GET' && $requestedStep === 'complete') {
    if (!isset($state['completed'])) {
        contact_redirect();
    }
    $step = 'complete';
}
if (isset($state['error'])) {
    $errors[] = $state['error'];
    unset($state['error']);
}
$values = $state['values'];
$token = $state['token'];
$result = $state['completed'] ?? null;
$pageTitle = ['input' => 'お問い合わせ', 'confirm' => 'お問い合わせ内容の確認', 'complete' => 'お問い合わせ受付完了'][$step];
