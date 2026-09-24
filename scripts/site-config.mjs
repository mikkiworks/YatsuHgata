export const siteUrl = 'https://yatsuhigata.com/';

export const pages = new Map([
	['index.html', null],
	['about/conservation.html', 'about'],
	['about/history.html', 'about'],
	['about/index.html', 'about'],
	['about/master.html', 'about'],
	['access/index.html', 'access'],
	['contact/index.php', 'contact'],
	['guide/index.html', 'guide'],
	['guide/living.html', 'guide'],
	['guide/shop.html', 'guide'],
	['news/2026/0922.html', 'news'],
	['news/2026/0923.html', 'news'],
	['news/2026/0923-02.html', 'news'],
	['news/index.html', 'news'],
	['partner/index.html', null],
	['privacy/index.html', null]
]);

export function getPublicUrl(relativePath) {
	let publicPath = `/${relativePath}`;

	if (relativePath === 'index.html') {
		publicPath = '/';
	} else {
		publicPath = publicPath.replace(/\/index\.(?:html|php)$/, '/');
	}

	return new URL(publicPath, siteUrl).href;
}
