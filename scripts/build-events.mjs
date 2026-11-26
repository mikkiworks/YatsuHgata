import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pages } from './site-config.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
export async function buildEvents(check = false) {
 const events = [];
 const seen = new Set();
 for (const path of pages.keys()) {
  if (!/^news\/(?:index|page\d+)\.html$/.test(path)) continue;
  const source = await readFile(resolve(root, path), 'utf8');
  for (const match of source.matchAll(/<li class="news__item"[\s\S]*?<\/li>/g)) {
   if (!match[0].includes('news__cat--event')) continue;
   const href = match[0].match(/href="([^"]+)"/)[1];
   if (seen.has(href)) throw new Error(`イベント記事が重複しています: ${href}`);
   seen.add(href);
   const article = await readFile(resolve(root, 'news', href), 'utf8');
   const attrs = article.match(/<article\b[^>]*>/)?.[0] || '';
   const start = attrs.match(/data-event-start="([^"]+)"/)?.[1];
   const end = attrs.match(/data-event-end="([^"]+)"/)?.[1];
   const exclude = (attrs.match(/data-event-exclude="([^"]*)"/)?.[1] || '').split(',').filter(Boolean);
   const valid = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && new Date(value+'T00:00:00Z').toISOString().slice(0,10) === value;
   if (!valid(start) || !valid(end) || start > end || exclude.some(d => !valid(d) || d < start || d > end)) throw new Error(`開催日を確認してください: ${href}`);
   const title = article.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/)[1].replace(/<[^>]*>/g, '').trim();
   const calendar = attrs.match(/data-event-calendar="([^"]+)"/)?.[1] || (start === end ? 'dates' : 'period');
   if (!['dates', 'period'].includes(calendar)) throw new Error(`カレンダー分類が不正です: ${href}`);
   events.push({ href, title, start, end, exclude, calendar });
  }
 }
 const content = JSON.stringify(events, null, 2)+'\n';
 const destination = resolve(root, 'assets/data/events.json');
 if (check) {
  if (await readFile(destination, 'utf8') !== content) throw new Error('カレンダー情報が未更新です。node scripts/build-events.mjs を実行してください。');
 } else await writeFile(destination, content);
 return events;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
 const events = await buildEvents(process.argv.includes('--check'));
 console.log(`イベント開催日${events.length}件を${process.argv.includes('--check') ? '検証' : '生成'}しました。`);
}
