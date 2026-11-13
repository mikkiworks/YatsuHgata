const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const code = fs.readFileSync(__dirname + '/AnalyticsCollector.gs', 'utf8');
const instrumented = code.replace('return {run, installTrigger};',
  'return {run, installTrigger, periods, shift, regime, gsc, ga, safeCell};');

function fixture(options = {}) {
  const props = {YH_SPREADSHEET_ID: 'sheet', YH_GA4_PROPERTY_ID: '123456',
    YH_GSC_SITE_URL: 'https://yatsuhigata.com/', YH_ERROR_EMAIL: 'owner@example.com'};
  const sheets = new Map(), calls = [], mails = [], sleeps = [], triggers = [];
  let uuid = 0, attempts = 0;
  class Sheet {
    constructor() { this.rows = []; this.cols = 26; this.maxRows = 1000; }
    getMaxColumns() { return this.cols; }
    insertColumnsAfter(_, n) { this.cols += n; }
    getLastColumn() { return Math.max(0, ...this.rows.map(r => r.length)); }
    getLastRow() { return this.rows.length; }
    getMaxRows() { return this.maxRows; }
    insertRowsAfter(_, n) { this.maxRows += n; }
    setFrozenRows() {}
    getRange(r, c, nr, nc) {
      const sheet = this;
      return {
        setValues(vals) {
          assert.equal(vals.length, nr);
          for (let i = 0; i < nr; i++) {
            assert.equal(vals[i].length, nc);
            if (options.failWrite && r > 1 && sheet === sheets.get('YH_GA4')) throw new Error('write failed');
            sheet.rows[r + i - 1] ||= [];
            for (let j = 0; j < nc; j++) sheet.rows[r + i - 1][c + j - 1] = vals[i][j];
          }
          return this;
        },
        getValues() { return Array.from({length: nr}, (_, i) => Array.from({length: nc}, (_, j) => sheet.rows[r + i - 1]?.[c + j - 1] ?? '')); },
        setFontWeight() { return this; }, setBackground() { return this; }, setNumberFormat() { return this; }
      };
    }
    appendRow(r) { this.rows.push(r); }
  }
  const ss = {getSheetByName: name => sheets.get(name), insertSheet(name) { const s = new Sheet(); sheets.set(name, s); return s; }, getUrl: () => 'https://docs.google.com/spreadsheets/d/test'};
  const sandbox = {
    console: {log() {}, error() {}}, Date, JSON, Math,
    Utilities: {getUuid: () => 'run-' + (++uuid), sleep: n => sleeps.push(n),
      formatDate(date, tz, fmt) {
        if (fmt === 'yyyy-MM-dd') {
          // 土曜08:00 JSTの固定例。実際の現在日時に依存させない。
          return tz === 'America/Los_Angeles' ? (options.scToday || '2026-11-06') : (options.today || '2026-11-07');
        }
        return '2026-11-07T08:00:00+09:00';
      }},
    PropertiesService: {getScriptProperties: () => ({getProperties: () => ({...props}), getProperty: key => props[key]})},
    LockService: {getScriptLock: () => ({tryLock: () => !options.locked, releaseLock() {}})},
    SpreadsheetApp: {openById: () => ss, flush() {}},
    MailApp: {sendEmail: mail => mails.push(mail)},
    ScriptApp: {getOAuthToken: () => 'ephemeral-test-token', WeekDay: {SATURDAY: 'SATURDAY'},
      getProjectTriggers: () => triggers.slice(), deleteTrigger: t => triggers.splice(triggers.indexOf(t), 1),
      newTrigger(name) {
        const t = {getHandlerFunction: () => name, getUniqueId: () => 'trigger', name};
        const builder = {timeBased() { return this; }, everyWeeks(n) { t.weeks = n; return this; },
          onWeekDay(n) { t.day = n; return this; }, atHour(n) { t.hour = n; return this; },
          nearMinute(n) { t.minute = n; return this; }, inTimezone(n) { t.timezone = n; return this; },
          create() { triggers.push(t); return t; }};
        return builder;
      }},
    UrlFetchApp: {fetch(url, req) {
      const body = JSON.parse(req.payload); calls.push({url, body});
      assert.equal(req.headers.Authorization, 'Bearer ephemeral-test-token');
      if (options.httpStatus && attempts++ < (options.failCount || 99)) {
        return {getResponseCode: () => options.httpStatus, getContentText: () => 'private error text'};
      }
      let result;
      if (url.includes('webmasters')) {
        assert.equal(body.dataState, 'final');
        assert.equal(body.type, 'web');
        let keys = body.dimensions.map(d => d === 'date' ? body.endDate : d === 'query' ? '=private query' : 'https://yatsuhigata.com/guide/');
        let rows = options.emptyGsc ? [] : [{keys, clicks: 10, impressions: 100, ctr: 0.1, position: 3}];
        if (options.gscPaging && !body.startRow) rows = Array.from({length: 25000}, () => rows[0]);
        result = {rows};
      } else {
        assert.equal(body.dimensionFilter.filter.stringFilter.value, 'yatsuhigata.com');
        const val = {sessions: 20, totalUsers: 15, activeUsers: 10, engagedSessions: 12,
          engagementRate: 0.6, averageSessionDuration: 30, screenPageViews: 40, userEngagementDuration: 120};
        const dimensionValues = body.dimensions.map(({name}) => ({value:
          name === 'date' ? body.dateRanges[0].endDate.replaceAll('-', '') :
          name.includes('Page') ? '/guide/?x=1' : name === 'sessionSource' ? 'google' : 'organic'}));
        const row = {dimensionValues, metricValues: body.metrics.map(m => ({value: String(val[m.name])}))};
        result = {rowCount: 1, rows: [row], metadata: {timeZone: options.badTimezone ? 'UTC' : 'Asia/Tokyo', subjectToThresholding: true}};
        if (options.gaPaging) result = {...result, rowCount: 10001,
          rows: Number(body.offset) ? [row] : Array.from({length: 10000}, () => row)};
      }
      return {getResponseCode: () => 200, getContentText: () => JSON.stringify(result)};
    }}
  };
  vm.createContext(sandbox);
  vm.runInContext(instrumented + '\nglobalThis.api = YatsuAnalytics;', sandbox);
  function objects(name) { const rows = sheets.get(name).rows; return rows.slice(1).map(r => Object.fromEntries(rows[0].map((k, i) => [k, r[i]]))); }
  return {sandbox, api: sandbox.api, props, sheets, calls, mails, sleeps, triggers, objects};
}

const f = fixture();
assert.equal(f.api.shift('2026-03-01', -1), '2026-02-28');
assert.equal(f.api.shift('2024-03-01', -1), '2024-02-29');
assert.equal(f.api.shift('2026-01-01', -1), '2025-12-31');
const ps = f.api.periods('2026-11-02');
assert.equal(ps[0].start, '2026-10-27');
assert.equal(ps[1].start, '2026-10-20');
assert.equal(ps[2].start, '2026-10-06');
assert.equal(ps[3].start, '2026-09-08');
for (const [start, end, expected] of [
  ['2026-11-01', '2026-11-06', 'BEFORE'], ['2026-11-07', '2026-11-07', 'TRANSITION_DAY'],
  ['2026-11-08', '2026-11-14', 'AFTER'], ['2026-11-01', '2026-11-08', 'MIXED_WITH_TRANSITION']
]) assert.equal(f.api.regime(start, end, '2026-11-07'), expected);

const id = f.sandbox.yatsuAnalyticsManualTest();
assert.equal(f.objects('YH_RUNS').at(-1).status, 'SUCCESS');
assert.equal(f.objects('YH_RUNS').at(-1).period_end, '2026-11-02');
assert.equal(f.calls.length, 37); // 1 final-date probe + 4*(4 GSC + 5 GA4)
assert.equal(f.objects('YH_COMPARISONS').length, 24);
assert(f.objects('YH_GSC').some(r => r.query === "'=private query"));
const landing = f.objects('YH_GA4').find(r => r.report === 'landing');
assert.equal(landing.page_url, 'https://yatsuhigata.com/guide/?x=1');
assert.equal(landing.totalUsers, 15);
assert.equal(landing.engagement_seconds_per_active_user, 12);
assert.equal(f.objects('YH_GA4').find(r => r.report === 'page').sessions, '');
const before = f.sheets.get('YH_GA4').rows.length;
f.sandbox.yatsuAnalyticsWeekly();
assert.equal(f.sheets.get('YH_GA4').rows.length, 2 * before - 1);
assert.equal(f.objects('YH_GA4').filter(r => r.run_id === id).length, before - 1);
assert.equal(f.mails.length, 0);
f.sandbox.yatsuAnalyticsInstallTrigger();
f.sandbox.yatsuAnalyticsInstallTrigger();
assert.equal(f.triggers.length, 1);
assert.equal(f.triggers[0].day, 'SATURDAY');
assert.equal(f.triggers[0].hour, 8);
assert.equal(f.triggers[0].timezone, 'Asia/Tokyo');

for (const options of [{httpStatus: 403}, {badTimezone: true}, {emptyGsc: true}, {failWrite: true}, {locked: true}]) {
  const bad = fixture(options);
  assert.throws(() => bad.sandbox.yatsuAnalyticsManualTest());
  assert.equal(bad.mails.length, 1);
  assert(!bad.mails[0].body.includes('ephemeral-test-token'));
  assert(!bad.mails[0].body.includes('private error text'));
  if (bad.sheets.has('YH_RUNS')) assert.equal(bad.objects('YH_RUNS').at(-1).status, 'FAILED');
  if (options.failWrite) assert(bad.sheets.get('YH_GSC').rows.length > 1, 'partial writes remain but run is FAILED');
}
const invalid = fixture(); invalid.props.YH_GA4_PROPERTY_ID = 'G-1NTGB4XW62';
assert.throws(() => invalid.sandbox.yatsuAnalyticsManualTest(), /プロパティID/);
assert.equal(invalid.mails.length, 1);
const retry = fixture({httpStatus: 429, failCount: 2});
retry.sandbox.yatsuAnalyticsManualTest();
assert.deepEqual(retry.sleeps, [1000, 2000]);
const exhausted = fixture({httpStatus: 503});
assert.throws(() => exhausted.sandbox.yatsuAnalyticsManualTest());
assert.deepEqual(exhausted.sleeps, [1000, 2000, 4000]);
assert.equal(exhausted.mails.length, 1);

const pg = fixture({gscPaging: true});
const cfg = {gscSite: 'https://yatsuhigata.com/', propertyId: '123456', hostname: 'yatsuhigata.com', gaTimezone: 'Asia/Tokyo'};
assert.equal(pg.api.gsc({start: '2026-10-01', end: '2026-10-28'}, ['query'], {started: Date.now(), cfg}).length, 25001);
assert.equal(pg.calls[1].body.startRow, 25000);
const pa = fixture({gaPaging: true});
assert.equal(pa.api.ga({start: '2026-10-01', end: '2026-10-28'}, ['date'], ['sessions'], {started: Date.now(), cfg}).rows.length, 10001);
assert.equal(pa.calls[1].body.offset, '10000');
const transition = fixture({today: '2026-11-25', scToday: '2026-11-24'});
transition.sandbox.yatsuAnalyticsManualTest();
const transitionComparison = transition.objects('YH_COMPARISONS').find(r => r.source === 'GA4' && r.days === 7);
assert.equal(transitionComparison.current_exclusion_regime, 'AFTER');
assert.equal(transitionComparison.previous_exclusion_regime, 'MIXED_WITH_TRANSITION');
assert.equal(transitionComparison.comparison_caution, 'EXCLUSION_SETTING_CHANGED_OR_TRANSITION_INCLUDED');
const invalidHeader = fixture();
invalidHeader.sandbox.yatsuAnalyticsManualTest();
invalidHeader.sheets.get('YH_GA4').rows[0][0] = 'wrong_header';
assert.throws(() => invalidHeader.sandbox.yatsuAnalyticsManualTest(), /列が不一致/);
assert.equal(invalidHeader.objects('YH_RUNS').at(-1).status, 'FAILED');
assert.equal(invalidHeader.mails.length, 1);
JSON.parse(fs.readFileSync(__dirname + '/appsscript.example.json', 'utf8'));
console.log('PASS: date windows, transition labels, 37-request full run, append-only history, metric/URL mapping, trigger replacement, retries, pagination, partial failure and error notification.');
