import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPublicUrl, pages } from './site-config.mjs';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, '..');
const urls = [];

for (const relativePath of pages.keys()) {
	const source = await readFile(resolve(projectRoot, relativePath), 'utf8');

	if (/<meta[^>]+(?:name="robots"[^>]+content="[^"]*noindex|content="[^"]*noindex[^"]*"[^>]+name="robots")[^>]*>/i.test(source)) {
		continue;
	}

	urls.push(getPublicUrl(relativePath));
}

urls.sort((a, b) => a.localeCompare(b, 'en'));

const sitemap = [
	'<?xml version="1.0" encoding="UTF-8"?>',
	'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
	...urls.flatMap((url) => [
		'\t<url>',
		`\t\t<loc>${escapeXml(url)}</loc>`,
		'\t</url>'
	]),
	'</urlset>',
	''
].join('\n');

await writeFile(resolve(projectRoot, 'sitemap.xml'), sitemap, 'utf8');
console.log(`sitemap.xml を更新しました（${urls.length} URL）`);

function escapeXml(value) {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&apos;');
}
