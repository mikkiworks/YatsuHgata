import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { adjacentMonth, dateSequence, japanDateKey, monthDates, setupTidePage } from '../assets/js/tides-page.mjs';

const data = Object.fromEntries(await Promise.all([2026, 2027].map(async (year) => [year,
	JSON.parse(await readFile(new URL(`../assets/data/tides/${year}.json`, import.meta.url), 'utf8'))
])));

function mockPage() {
	function node(fragment = false) {
		return {
			fragment, children: [], textContent: '', hidden: false, disabled: false,
			classList: { add() {} }, setAttribute() {},
			append(...items) { this.children.push(...items.flatMap((item) => item.fragment ? item.children : [item])); },
			replaceChildren(...items) { this.children = []; this.append(...items); },
			addEventListener(event, callback) { this[event] = callback; }
		};
	}
	const fields = new Map();
	return {
		querySelector(selector) { if (!fields.has(selector)) fields.set(selector, node()); return fields.get(selector); },
		createElement: () => node(), createDocumentFragment: () => node(true),
		get(name) { return this.querySelector(`[data-${name}]`); }
	};
}

assert.equal(japanDateKey(new Date('2026-12-31T15:30:00Z')), '2027-01-01', '日本時間で日付を判定');
assert.deepEqual(dateSequence('2026-12-30', 4), ['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02']);
assert.equal(monthDates('2026-02').length, 28);
assert.equal(monthDates('2028-02').length, 29);
assert.equal(monthDates('2026-04').length, 30);
assert.equal(monthDates('2026-10').length, 31);
assert.equal(adjacentMonth('2026-12', 1), '2027-01');
assert.equal(adjacentMonth('2027-01', -1), '2026-12');

let requests = 0;
const fetcher = async (url) => {
	requests++;
	return { ok: true, json: async () => data[/([0-9]{4})\.json/.exec(url)[1]] };
};
const page = mockPage();
await setupTidePage(page, new Date('2026-12-28T12:00:00+09:00'), fetcher);
assert.equal(page.get('week-body').children.length, 7);
assert.equal(page.get('month-body').children.length, 31);
assert.equal(requests, 2, '週間と月間で年別データを共有');
const newYear = page.get('week-body').children[4];
assert.equal(newYear.children[1].children[0].textContent, data[2027].days['2027-01-01'].high[0].time);
page.get('month-next').click();
await new Promise((resolve) => setImmediate(resolve));
assert.equal(page.get('month-label').textContent, '2027年1月');
assert.equal(page.get('month-body').children.length, 31);
assert.equal(requests, 2);
page.get('month-prev').click();
await new Promise((resolve) => setImmediate(resolve));
assert.equal(page.get('month-label').textContent, '2026年12月');

const last = mockPage();
await setupTidePage(last, new Date('2027-12-30T12:00:00+09:00'), fetcher);
assert.equal(last.get('month-next').disabled, true);
assert.equal(last.get('week-body').children[2].children[1].textContent, 'データなし');
assert.match(last.get('week-status').textContent, /表示できない日/);
const first = mockPage();
await setupTidePage(first, new Date('2026-01-01T12:00:00+09:00'), fetcher);
assert.equal(first.get('month-prev').disabled, true);

let offline = true;
const retry = mockPage();
await setupTidePage(retry, new Date('2026-10-23T12:00:00+09:00'), async (url) => {
	if (offline) return { ok: false };
	return fetcher(url);
});
assert.equal(retry.get('week-retry').hidden, false);
assert.equal(retry.get('month-retry').hidden, false);
offline = false;
await Promise.all([retry.get('week-retry').click(), retry.get('month-retry').click()]);
assert.equal(retry.get('week-body').children.length, 7);
assert.equal(retry.get('month-body').children.length, 31);
assert.equal(retry.get('month-status').textContent, '');

let releaseYear;
const race = mockPage();
await setupTidePage(race, new Date('2026-12-01T12:00:00+09:00'), async (url) => {
	if (String(url).includes('2027')) return new Promise((resolve) => { releaseYear = resolve; });
	return fetcher(url);
});
race.get('month-next').click();
race.get('month-prev').click();
await new Promise((resolve) => setImmediate(resolve));
releaseYear({ ok: true, json: async () => data[2027] });
await new Promise((resolve) => setImmediate(resolve));
assert.equal(race.get('month-label').textContent, '2026年12月');
assert.equal(race.get('month-body').children[0].children[1].children[0].textContent, data[2026].days['2026-12-01'].high[0].time, '月の連打で古い応答が上書きしない');
console.log('週間・月間：日本時間、月の日数、年跨ぎ、実データ、月移動、収録範囲、再取得を検証しました');
