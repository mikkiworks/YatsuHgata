import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../assets/js/main.js', import.meta.url), 'utf8');
const data = Object.fromEntries(await Promise.all([2026, 2027].map(async (year) => [
	year, JSON.parse(await readFile(new URL(`../assets/data/tides/${year}.json`, import.meta.url), 'utf8'))
])));

function createView(today, fetcher = async (url) => ({ ok: true, json: async () => data[/([0-9]{4})\.json/.exec(url)[1]] })) {
	const rows = [];
	const document = { activeElement: null, scripts: [{ src: 'https://example.test/assets/js/main.js' }], addEventListener() {} };
	function element() {
		return {
			textContent: '', disabled: false, classList: { add() {} }, setAttribute() {}, before() {},
			parentElement: { parentElement: { querySelector: () => ({ after() {} }) } },
			append(...children) { this.children = children; rows.push(this); },
			addEventListener(event, callback) { this[event] = callback; },
			focus() { document.activeElement = this; }
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
		rows, fields,
		start: () => vm.runInContext('loadTodayTides()', context),
		label: () => fields['[data-tide-date]'][0].textContent,
		high: () => fields['[data-tide-high]'][0].textContent,
		click(index, direction) { const button = rows[index].children[direction === 'next' ? 2 : 0]; button.focus(); button.click(); },
		flush: () => new Promise((resolve) => setImmediate(resolve))
	};
}

let fetchCount = 0;
const view = createView('2026-10-23', async () => {
	fetchCount++;
	return { ok: true, json: async () => data[2026] };
});
await view.start();
assert.equal(view.rows.length, 3);
assert.ok(view.label().startsWith('今日 '));
assert.ok(view.rows.every((row) => row.children[0].disabled));
view.click(0, 'previous');
assert.ok(view.label().startsWith('今日 '), '今日より前には移動しない');
view.click(1, 'next');
await view.flush();
assert.match(view.label(), /10月24日/);
assert.ok(view.fields['[data-tide-date]'].every((field) => field.textContent === view.label()), '全表示の日付を同期する');
assert.equal(view.high(), `満潮　${data[2026].days['2026-10-24'].high.map((event) => event.time).join('／')}`);
view.click(2, 'previous');
await view.flush();
assert.ok(view.label().startsWith('今日 '));
assert.equal(fetchCount, 1, '年別データを再利用する');

const month = createView('2026-10-31');
await month.start();
month.click(0, 'next');
await month.flush();
assert.match(month.label(), /11月1日/);

let resolveNextYear;
const boundary = createView('2026-12-31', async (url) => {
	if (String(url).includes('2027')) return new Promise((resolve) => { resolveNextYear = resolve; });
	return { ok: true, json: async () => data[2026] };
});
await boundary.start();
boundary.click(0, 'next');
assert.match(boundary.label(), /2027年1月1日/);
boundary.click(0, 'previous');
await boundary.flush();
resolveNextYear({ ok: true, json: async () => data[2027] });
await boundary.flush();
assert.match(boundary.label(), /12月31日/);
assert.equal(boundary.high(), `満潮　${data[2026].days['2026-12-31'].high.map((event) => event.time).join('／')}`, '遅れて届いた別日付のデータで上書きしない');
boundary.click(0, 'next');
await boundary.flush();
assert.equal(boundary.high(), `満潮　${data[2027].days['2027-01-01'].high.map((event) => event.time).join('／')}`);

const last = createView('2027-12-30');
await last.start();
last.click(0, 'next');
await last.flush();
assert.ok(last.rows.every((row) => row.children[2].disabled));
last.click(0, 'next');
assert.match(last.label(), /12月31日/);

let attempts = 0;
const retry = createView('2026-10-23', async () => {
	if (++attempts === 1) throw new Error('offline');
	return { ok: true, json: async () => data[2026] };
});
await retry.start();
assert.equal(retry.high(), '満潮　取得できません');
retry.click(0, 'next');
await retry.flush();
assert.notEqual(retry.high(), '満潮　取得できません');
assert.equal(attempts, 2, '取得失敗後に再取得できる');
console.log('満干時間：日付同期、今日の下限、月末・年末、データ上限、非同期競合、再取得を検証しました');
