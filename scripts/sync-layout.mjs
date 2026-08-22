import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, '..');

const pages = new Map([
	['about/conservation.html', 'about'],
	['about/history.html', 'about'],
	['about/index.html', 'about'],
	['about/master.html', 'about'],
	['access/index.html', 'access'],
	['contact/index.html', 'contact'],
	['guide/index.html', 'guide'],
	['guide/living.html', 'guide'],
	['guide/shop.html', 'guide'],
	['news/details.html', 'news'],
	['news/index.html', 'news'],
	['partner/index.html', null],
	['privacy/index.html', null]
]);

const navigationItems = [
	{ key: 'news', href: '../news/index.html', english: 'NEWS', label: '最新情報' },
	{ key: 'about', href: '../about/index.html', english: 'ABOUT', label: '谷津干潟とは' },
	{ key: 'guide', href: '../guide/index.html', english: 'GUIDE', label: '観察・散策ガイド' },
	{ key: 'access', href: '../access/index.html', english: 'ACCESS', label: 'アクセス' },
	{ key: 'contact', href: '../contact/index.html', english: 'CONTACT', label: 'お問い合わせ' }
];

let updateCount = 0;

for (const [relativePath, activeSection] of pages) {
	const filePath = resolve(projectRoot, relativePath);
	const source = await readFile(filePath, 'utf8');
	const newline = source.includes('\r\n') ? '\r\n' : '\n';
	let updated = replaceBlock(source, 'header', 'sidebar', renderHeader(activeSection), newline);
	updated = replaceBlock(updated, 'footer', 'footer', renderFooter(), newline);

	if (updated !== source) {
		await writeFile(filePath, updated, 'utf8');
		updateCount += 1;
	}
}

console.log(`${updateCount}ページの共通レイアウトを更新しました`);

function renderHeader(activeSection) {
	const navigation = navigationItems.map((item) => {
		const isActive = item.key === activeSection;
		const activeClass = isActive ? ' active' : '';
		const currentAttribute = isActive ? ' aria-current="page"' : '';

		return [
			'\t\t\t<li>',
			`\t\t\t\t<a href="${item.href}" class="gnavi__item${activeClass}"${currentAttribute}>`,
			`\t\t\t\t\t<span class="gnavi__engtxt">${item.english}</span>`,
			`\t\t\t\t\t${item.label}`,
			'\t\t\t\t</a>',
			'\t\t\t</li>'
		].join('\n');
	}).join('\n');

	return [
		'<header class="sidebar">',
		'',
		'\t<!-- SP用ハンバーガーボタン -->',
		'\t<button type="button" class="sidebar__toggle" id="js-toggle" aria-label="メニューを開く" aria-expanded="false" aria-controls="gnavi">',
		'\t\t<span></span>',
		'\t\t<span></span>',
		'\t\t<span></span>',
		'\t</button>',
		'',
		'\t<!-- ロゴ -->',
		'\t<a href="../index.html" class="sidebar__logo">',
		'\t\t<img class="logo__item" src="../assets/images/logo.png" alt="谷津干潟ナビ">',
		'\t</a>',
		'',
		'\t<!-- グローバルナビ -->',
		'\t<nav class="gnavi dotted-line-btm" id="gnavi" aria-label="メインナビゲーション">',
		'',
		'\t\t<!-- SP用満干時間 -->',
		'\t\t<div class="tidearea sp" aria-live="polite">',
		'\t\t\t<strong class="tidearea__title" data-tide-date>今日の満干時間</strong>',
		'\t\t\t<span class="tidearea__time" data-tide-high>満潮　読み込み中</span>',
		'\t\t\t<span class="tidearea__time" data-tide-low>干潮　読み込み中</span>',
		'\t\t</div>',
		'',
		'\t\t<ul>',
		navigation,
		'\t\t</ul>',
		'\t</nav>',
		'</header>'
	].join('\n');
}

function renderFooter() {
	return [
		'<footer class="footer">',
		'\t<a href="../index.html" class="footer__logo">',
		'\t\t<img src="../assets/images/logo.png" alt="谷津干潟ナビ">',
		'\t</a>',
		'\t<nav aria-label="フッターナビゲーション">',
		'\t<ul class="footer__list">',
		'\t\t<li class="footer__item"><a href="../about/master.html">管理人について</a></li>',
		'\t\t<li class="footer__item"><a href="../partner/index.html">協力パートナー募集</a></li>',
		'\t\t<li class="footer__item"><a href="../privacy/index.html">プライバシーポリシー</a></li>',
		'\t\t<li class="footer__item"><a href="../contact/index.html">お問い合わせ</a></li>',
		'\t</ul>',
		'\t</nav>',
		'\t<small class="footer__source">出典：<a href="https://www.data.jma.go.jp/kaiyou/db/tide/suisan/suisan.php?stn=QL" target="_blank" rel="noopener noreferrer">気象庁「千葉」潮位表</a>（加工）</small>',
		'\t<small class="footer__copy">Copyright &copy; YATSUHIGATA NAVI. All rights reserved.</small>',
		'</footer>'
	].join('\n');
}

function replaceBlock(source, tagName, className, replacement, newline) {
	const pattern = new RegExp(`^([\\t ]*)<${tagName} class="${className}">[\\s\\S]*?^[\\t ]*</${tagName}>`, 'm');

	if (!pattern.test(source)) {
		throw new Error(`${tagName}.${className}が見つかりません`);
	}

	return source.replace(pattern, (_match, indent) => (
		replacement
			.split('\n')
			.map((line) => line ? `${indent}${line}` : '')
			.join(newline)
	));
}
