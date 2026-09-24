import { access, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPublicUrl, pages, siteUrl } from './site-config.mjs';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, '..');

const errors = [];
const pageSources = new Map();

for (const [relativePath, activeSection] of pages) {
	const filePath = resolve(projectRoot, relativePath);
	const source = await readFile(filePath, 'utf8');
	pageSources.set(relativePath, source);
	const header = source.match(/<header class="sidebar">[\s\S]*?<\/header>/)?.[0] ?? '';
	const footer = source.match(/<footer class="footer">[\s\S]*?<\/footer>/)?.[0] ?? '';
	const pathPrefix = '../'.repeat(relativePath.split('/').length - 1);

	check(relativePath, Boolean(header), '共通ヘッダーがありません');
	check(relativePath, Boolean(footer), '共通フッターがありません');
	check(relativePath, count(source, /id="js-toggle"/g) === 1, '#js-toggle は1個必要です');
	check(relativePath, count(source, /id="gnavi"/g) === 1, '#gnavi は1個必要です');
	check(relativePath, !/href="[^"]*index\.(?:html|php)(?:[?#][^"]*)?"/.test(source), 'ディレクトリトップへのリンクに index.html または index.php を含めないでください');
	check(relativePath, header.includes('aria-label="メニューを開く" aria-expanded="false" aria-controls="gnavi"'), 'メニューボタンのARIA属性が一致しません');
	check(relativePath, header.includes('id="gnavi" aria-label="メインナビゲーション"'), 'メインナビのARIA属性が一致しません');
	check(relativePath, count(header, /class="gnavi__item(?: active)?"/g) === 5, 'メインナビは5項目必要です');
	check(relativePath, count(header, /class="gnavi__engtxt"/g) === 5, 'メインナビの英語表記は5項目必要です');
	check(relativePath, count(header, /data-tide-date/g) === 1, 'モバイル用の日付表示がありません');
	check(relativePath, count(header, /data-tide-high/g) === 1, 'モバイル用の満潮表示がありません');
	check(relativePath, count(header, /data-tide-low/g) === 1, 'モバイル用の干潮表示がありません');
	check(relativePath, source.includes(`<script src="${pathPrefix}assets/js/main.js" defer></script>`), 'main.js の参照先が一致しません');

	const activeLinks = header.match(/<a [^>]*class="gnavi__item active"[^>]*>/g) ?? [];
	if (activeSection) {
		const activeHref = `${pathPrefix}${activeSection}/`;
		check(relativePath, activeLinks.length === 1, '現在地は1項目だけに設定してください');
		check(relativePath, activeLinks[0]?.includes(`href="${activeHref}"`) && activeLinks[0]?.includes('aria-current="page"'), '現在地のリンク先またはARIA属性が一致しません');
	} else {
		check(relativePath, activeLinks.length === 0, 'このページではメインナビに現在地を設定しません');
	}

	check(relativePath, footer.includes('aria-label="フッターナビゲーション"'), 'フッターナビのARIA属性がありません');
	check(relativePath, count(footer, /class="footer__item"/g) === 4, 'フッターナビは4項目必要です');
	check(relativePath, count(footer, /出典：/g) === 1, '潮位表の出典はフッターに1回だけ必要です');
	check(relativePath, footer.includes('気象庁「千葉」潮位表</a>（加工）'), '潮位表の出典表記が一致しません');

	const commonLayout = `${header}${footer}`;
	const ids = [...commonLayout.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
	const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
	check(relativePath, duplicateIds.length === 0, `重複IDがあります: ${[...new Set(duplicateIds)].join(', ')}`);

	for (const reference of commonLayout.matchAll(/(?:href|src)="([^"]+)"/g)) {
		const target = reference[1];
		if (/^(?:https?:|mailto:|tel:|#)/.test(target)) {
			continue;
		}

		const localPath = resolve(dirname(filePath), target.split(/[?#]/)[0]);
		try {
			await access(localPath);
		} catch {
			errors.push(`${relativePath}: 共通レイアウトのリンク先がありません: ${target}`);
		}
	}
}

const mainScriptSource = await readFile(resolve(projectRoot, 'assets/js/main.js'), 'utf8');
const resolverSource = mainScriptSource.match(/function getTideDataUrl\(year\) \{[\s\S]*?\n\}/)?.[0];
check('assets/js/main.js', Boolean(resolverSource), '潮位JSONのURL解決関数がありません');

if (resolverSource) {
	const getTideDataUrl = new Function('document', `${resolverSource}; return getTideDataUrl;`)({
		scripts: [{ src: 'https://example.test/assets/js/main.js' }],
		baseURI: 'https://example.test/about/index.html'
	});
	const resolvedUrl = String(getTideDataUrl('2026'));
	check('assets/js/main.js', resolvedUrl === 'https://example.test/assets/data/tides/2026.json', `下層ページ用の潮位JSON参照が不正です: ${resolvedUrl}`);
}

for (const year of ['2026', '2027']) {
	const tideData = JSON.parse(await readFile(resolve(projectRoot, `assets/data/tides/${year}.json`), 'utf8'));
	const expectedDays = isLeapYear(Number(year)) ? 366 : 365;
	check(`assets/data/tides/${year}.json`, Object.keys(tideData.days ?? {}).length === expectedDays, `${expectedDays}日分の潮位データが必要です`);
}

const expectedSitemapUrls = [...pageSources]
	.filter(([, source]) => !/<meta[^>]+(?:name="robots"[^>]+content="[^"]*noindex|content="[^"]*noindex[^"]*"[^>]+name="robots")[^>]*>/i.test(source))
	.map(([relativePath]) => getPublicUrl(relativePath))
	.sort((a, b) => a.localeCompare(b, 'en'));
const sitemapSource = await readFile(resolve(projectRoot, 'sitemap.xml'), 'utf8');
const sitemapUrls = [...sitemapSource.matchAll(/<loc>([^<]+)<\/loc>/g)]
	.map((match) => match[1])
	.sort((a, b) => a.localeCompare(b, 'en'));
check('sitemap.xml', sitemapSource.includes('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'), 'XMLサイトマップの名前空間がありません');
check('sitemap.xml', JSON.stringify(sitemapUrls) === JSON.stringify(expectedSitemapUrls), '公開対象ページのURL一覧と一致しません');
check('sitemap.xml', new Set(sitemapUrls).size === sitemapUrls.length, 'URLが重複しています');
check('sitemap.xml', sitemapUrls.every((url) => url.startsWith(siteUrl)), 'サイト外または相対URLが含まれています');
check('sitemap.xml', sitemapUrls.every((url) => !/\/index\.(?:html|php)$/.test(url)), 'index.html または index.php を含むURLがあります');

const robotsSource = await readFile(resolve(projectRoot, 'robots.txt'), 'utf8');
check('robots.txt', robotsSource.includes(`Sitemap: ${siteUrl}sitemap.xml`), 'サイトマップURLがありません');

if (errors.length) {
	console.error(errors.join('\n'));
	process.exitCode = 1;
} else {
	console.log(`共通レイアウト、潮位参照、サイトマップを検証しました（${pages.size}ページ）`);
}

function check(relativePath, condition, message) {
	if (!condition) {
		errors.push(`${relativePath}: ${message}`);
	}
}

function count(source, pattern) {
	return source.match(pattern)?.length ?? 0;
}

function isLeapYear(year) {
	return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}
