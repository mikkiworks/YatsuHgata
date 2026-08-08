import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const STATION = {
	code: 'QL',
	name: '千葉',
	location: '千葉県市原市五井',
	latitude: 35.566667,
	longitude: 140.05
};

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, '..');
const year = getTargetYear(process.argv.slice(2));
const sourceUrl = `https://www.data.jma.go.jp/kaiyou/data/db/tide/suisan/txt/${year}/${STATION.code}.txt`;
const outputPath = resolve(projectRoot, 'assets', 'data', 'tides', `${year}.json`);

const response = await fetch(sourceUrl, {
	headers: {
		'User-Agent': 'YatsuHigata-Navi tide updater (https://yatsuhigata.com/)'
	}
});

if (!response.ok) {
	throw new Error(`気象庁の潮位表を取得できませんでした: ${response.status} ${response.statusText}`);
}

const sourceText = await response.text();
const days = parseTideTable(sourceText, year, STATION.code);

if (Object.keys(days).length < 365) {
	throw new Error(`潮位データの日数が不足しています: ${Object.keys(days).length}日`);
}

const output = {
	year,
	station: STATION,
	source: {
		name: '気象庁「千葉」潮位表',
		url: sourceUrl,
		format: 'annual-fixed-width-text',
		attribution: '気象庁「千葉」潮位表を加工して作成'
	},
	days
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(output)}\n`, 'utf8');

console.log(`${year}年の潮位データを${outputPath}へ保存しました (${Object.keys(days).length}日)`);

function getTargetYear(args) {
	const yearIndex = args.indexOf('--year');
	const value = yearIndex >= 0 ? args[yearIndex + 1] : getCurrentJapanYear();
	const parsedYear = Number(value);

	if (!Number.isInteger(parsedYear) || parsedYear < 2000 || parsedYear > 2099) {
		throw new Error(`年の指定が不正です: ${value ?? '(未指定)'}`);
	}

	return parsedYear;
}

function getCurrentJapanYear() {
	return new Intl.DateTimeFormat('en', {
		timeZone: 'Asia/Tokyo',
		year: 'numeric'
	}).format(new Date());
}

function parseTideTable(text, expectedYear, expectedStationCode) {
	const parsedDays = {};
	const lines = text.split(/\r?\n/).filter(Boolean);

	for (const line of lines) {
		if (line.length < 136) {
			throw new Error(`潮位表に短い行があります (${line.length}文字)`);
		}

		const lineYear = 2000 + Number(line.slice(72, 74));
		const month = Number(line.slice(74, 76));
		const day = Number(line.slice(76, 78));
		const stationCode = line.slice(78, 80);

		if (lineYear !== expectedYear || stationCode !== expectedStationCode) {
			throw new Error(`想定外のデータ行です: ${lineYear}年 ${stationCode}`);
		}

		const dateKey = [lineYear, month, day]
			.map((value, index) => index === 0 ? String(value) : String(value).padStart(2, '0'))
			.join('-');

		parsedDays[dateKey] = {
			high: parseEvents(line, 80),
			low: parseEvents(line, 108)
		};
	}

	return parsedDays;
}

function parseEvents(line, startIndex) {
	const events = [];

	for (let index = 0; index < 4; index += 1) {
		const offset = startIndex + index * 7;
		const rawTime = line.slice(offset, offset + 4);
		const rawHeight = line.slice(offset + 4, offset + 7);

		if (rawTime === '9999' || rawHeight === '999') {
			continue;
		}

		const digits = rawTime.replaceAll(' ', '0');
		const hour = Number(digits.slice(0, 2));
		const minute = Number(digits.slice(2, 4));
		const heightCm = Number(rawHeight);

		if (hour > 23 || minute > 59 || !Number.isFinite(heightCm)) {
			throw new Error(`満干潮データの形式が不正です: ${rawTime}/${rawHeight}`);
		}

		events.push({
			time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
			heightCm
		});
	}

	return events;
}
