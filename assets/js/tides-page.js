const FIRST_MONTH = '2026-01';
const LAST_MONTH = '2027-12';

export function japanDateKey(date = new Date()) {
	const parts = Object.fromEntries(new Intl.DateTimeFormat('en', {
		timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit'
	}).formatToParts(date).map(({ type, value }) => [type, value]));
	return `${parts.year}-${parts.month}-${parts.day}`;
}

export function dateSequence(start, count) {
	const date = new Date(`${start}T12:00:00+09:00`);
	return Array.from({ length: count }, () => {
		const key = japanDateKey(date);
		date.setUTCDate(date.getUTCDate() + 1);
		return key;
	});
}

export function monthDates(month) {
	const [year, number] = month.split('-').map(Number);
	return dateSequence(`${month}-01`, new Date(Date.UTC(year, number, 0)).getUTCDate());
}

export function adjacentMonth(month, offset) {
	const [year, number] = month.split('-').map(Number);
	return japanDateKey(new Date(Date.UTC(year, number - 1 + offset, 1))).slice(0, 7);
}

export async function setupTidePage(root = document, now = new Date(), fetcher = fetch) {
	const find = (name) => root.querySelector(`[data-${name}]`);
	if (!find('week-body')) return;
	const today = japanDateKey(now);
	const week = dateSequence(today, 7);
	let month = today.slice(0, 7) < FIRST_MONTH ? FIRST_MONTH : today.slice(0, 7) > LAST_MONTH ? LAST_MONTH : today.slice(0, 7);
	let monthRequest = 0;
	const cache = new Map();
	const label = (key, options) => new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', ...options }).format(new Date(`${key}T12:00:00+09:00`));
	const fullLabel = (key) => label(key, { year: 'numeric', month: 'long', day: 'numeric' });
	find('week-range').textContent = `${fullLabel(week[0])}〜${fullLabel(week[6])}`;

	async function loadYear(year) {
		if (!cache.has(year)) {
			cache.set(year, fetcher(new URL(`../data/tides/${year}.json`, import.meta.url))
				.then((response) => {
					if (!response.ok) throw new Error('潮位データを取得できませんでした');
					return response.json();
				}).catch((error) => { cache.delete(year); throw error; }));
		}
		return cache.get(year);
	}

	async function getDays(keys) {
		const years = [...new Set(keys.map((key) => key.slice(0, 4)))];
		const results = await Promise.all(years.map(async (year) => {
			if (year < '2026' || year > '2027') return {};
			return (await loadYear(year)).days;
		}));
		return Object.assign({}, ...results);
	}

	function fillTable(body, keys, days) {
		const fragment = root.createDocumentFragment();
		for (const key of keys) {
			const row = root.createElement('tr');
			const weekday = new Date(`${key}T12:00:00+09:00`).getUTCDay();
			if (weekday === 0) row.classList.add('is-sunday');
			if (weekday === 6) row.classList.add('is-saturday');
			if (key === today) { row.classList.add('is-today'); row.setAttribute('aria-current', 'date'); }
			const heading = root.createElement('th');
			heading.scope = 'row';
			heading.textContent = `${Number(key.slice(5, 7))}/${Number(key.slice(8))}（${label(key, { weekday: 'short' })}）${key === today ? ' 今日' : ''}`;
			row.append(heading);
			for (const kind of ['high', 'low']) {
				const cell = root.createElement('td');
				const events = days[key]?.[kind];
				if (!events) cell.textContent = 'データなし';
				else if (!events.length) cell.textContent = 'なし';
				else events.forEach(({ time }) => {
					const item = root.createElement('time');
					item.dateTime = `${key}T${time}:00+09:00`;
					item.textContent = time;
					cell.append(item);
				});
				row.append(cell);
			}
			fragment.append(row);
		}
		body.replaceChildren(fragment);
	}

	async function renderWeek() {
		find('week-status').textContent = '読み込み中です。';
		find('week-retry').hidden = true;
		try {
			const days = await getDays(week);
			fillTable(find('week-body'), week, days);
			find('week-status').textContent = week.some((key) => !days[key]) ? 'データの収録範囲外など、表示できない日があります。' : '';
		} catch {
			find('week-status').textContent = '満干時間を取得できませんでした。再読み込みしてください。';
			find('week-retry').hidden = false;
		}
	}

	async function renderMonth() {
		const request = ++monthRequest;
		const keys = monthDates(month);
		const monthLabel = `${Number(month.slice(0, 4))}年${Number(month.slice(5))}月`;
		find('month-label').textContent = monthLabel;
		find('month-caption').textContent = `${monthLabel}の満潮・干潮（日本時間）`;
		find('month-prev').disabled = month <= FIRST_MONTH;
		find('month-next').disabled = month >= LAST_MONTH;
		find('month-body').replaceChildren();
		find('month-status').textContent = '読み込み中です。';
		find('month-retry').hidden = true;
		try {
			const days = await getDays(keys);
			if (request !== monthRequest) return;
			fillTable(find('month-body'), keys, days);
			find('month-status').textContent = keys.some((key) => !days[key]) ? 'データがない日があります。' : '';
		} catch {
			if (request !== monthRequest) return;
			find('month-status').textContent = '満干時間を取得できませんでした。再読み込みしてください。';
			find('month-retry').hidden = false;
		}
	}
	for (const [name, offset] of [['month-prev', -1], ['month-next', 1]]) {
		find(name).addEventListener('click', () => {
			const candidate = adjacentMonth(month, offset);
			if (candidate < FIRST_MONTH || candidate > LAST_MONTH) return;
			month = candidate;
			void renderMonth();
		});
	}
	find('week-retry').addEventListener('click', renderWeek);
	find('month-retry').addEventListener('click', renderMonth);
	await Promise.all([renderWeek(), renderMonth()]);
}

if (typeof document !== 'undefined') void setupTidePage();
