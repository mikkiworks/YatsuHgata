import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../assets/js/main.js', import.meta.url), 'utf8');
const data = Object.fromEntries(await Promise.all([2026, 2027].map(async (year) => [
	year, JSON.parse(await readFile(new URL(`../assets/data/tides/${year}.json`, import.meta.url), 'utf8'))
])));

function createView(today, fetcher = async (url) => ({ ok: true, json: async () => data[/([0-9]{4})\.json/.exec(url)[1]] })) {
	const links = [];
	const document = { scripts: [{ src: 'https://example.test/assets/js/main.js?v=20261120-1' }], addEventListener() {} };
	function element() {
		return {
			textContent: '',
			replaceChildren(...children) { this.children = children; this.textContent = children.map((child) => typeof child === 'string' ? child : child.textContent).join(''); },
			parentElement: { querySelector: () => ({ after(link) { links.push(link); } }) }
		};
	}
	const fields = Object.fromEntries(['date', 'high', 'low'].map((key) => [`[data-tide-${key}]`, Array.from({ length: 3 }, element)]));
	document.createElement = element;
	document.querySelectorAll = (selector) => fields[selector] ?? [];
	class FixedDate extends Date {
		constructor(...args) { super(...(args.length ? args : [`${today}T12:00:00+09:00`])); }
	}
	const context = vm.createContext({ document, navigator: { userAgent: '' }, Date: FixedDate, Intl, URL, console: { warn() {} }, fetch: fetcher });
	vm.runInContext(source, context);
	return {
		links, fields,
		start: () => vm.runInContext('loadTodayTides()', context),
		label: () => fields['[data-tide-date]'][0].textContent,
		high: () => fields['[data-tide-high]'][0].textContent
	};
}

for (const today of ['2026-10-23', '2026-12-31', '2027-01-01']) {
	let fetchCount = 0;
	const view = createView(today, async (url) => {
		fetchCount++;
		assert.ok(String(url).includes(`${today.slice(0, 4)}.json`));
		return { ok: true, json: async () => data[today.slice(0, 4)] };
	});
	await view.start();
	assert.ok(view.label().startsWith('今日 '));
	assert.ok(!view.label().includes('の満干時間'));
	assert.equal(view.fields['[data-tide-high]'][0].children[0].textContent, '満潮');
	assert.equal(view.fields['[data-tide-low]'][0].children[0].textContent, '干潮');
	assert.ok(view.fields['[data-tide-date]'].every((field) => field.textContent === view.label()));
	for (const kind of ['high', 'low']) {
		const prefix = kind === 'high' ? '満潮' : '干潮';
		const expected = data[today.slice(0, 4)].days[today][kind].map((event) => event.time).join('／') || '該当なし';
		assert.ok(view.fields[`[data-tide-${kind}]`].every((field) => field.textContent === `${prefix}　${expected}`));
	}
	assert.equal(fetchCount, 1, '複数の表示に対して取得は1回');
	assert.equal(view.links.length, 3);
	assert.ok(view.links.every((link) => link.href === 'https://example.test/guide/tides.html'));
}
for (const fetcher of [
	async () => { throw new Error('offline'); },
	async () => ({ ok: false, status: 404 }),
	async () => ({ ok: true, json: async () => ({ days: {} }) })
]) {
	const view = createView('2026-10-23', fetcher);
	await view.start();
	assert.equal(view.high(), '満潮　取得できません');
	assert.equal(view.links.length, 3, '取得できない場合も詳細リンクを表示');
}
console.log('満干時間：今日の各表示、年末年始、詳細リンク、通信失敗・データ欠落を検証しました');
