/** 谷津干潟ナビ: GAS V8。既存プロジェクトのグローバル名との衝突を避ける。 */
function yatsuAnalyticsManualTest() { return YatsuAnalytics.run('MANUAL'); }
function yatsuAnalyticsWeekly() { return YatsuAnalytics.run('WEEKLY'); }
function yatsuAnalyticsInstallTrigger() { return YatsuAnalytics.installTrigger(); }

const YatsuAnalytics = (() => {
  const TZ = 'Asia/Tokyo';
  const PREFIX = 'YH_';
  const BASE = ['run_id', 'fetched_at_jst', 'period_key', 'period_start', 'period_end',
    'data_timezone', 'site_url', 'source_property', 'exclusion_regime'];
  const GSC_HEADERS = BASE.concat(['report', 'data_date', 'query', 'page_url',
    'clicks', 'impressions', 'ctr', 'position', 'quality_json']);
  const GA_METRICS = ['sessions', 'totalUsers', 'activeUsers', 'engagedSessions',
    'engagementRate', 'averageSessionDuration', 'screenPageViews', 'userEngagementDuration'];
  const PAGE_METRICS = ['screenPageViews', 'activeUsers', 'userEngagementDuration'];
  const GA_HEADERS = BASE.concat(['report', 'data_date', 'source', 'medium', 'channel',
    'landing_path', 'page_path', 'page_url']).concat(GA_METRICS,
    ['engagement_seconds_per_active_user', 'quality_json']);
  const COMP_HEADERS = ['run_id', 'fetched_at_jst', 'source', 'days', 'data_timezone',
    'current_start', 'current_end', 'previous_start', 'previous_end', 'metric',
    'current_value', 'previous_value', 'difference', 'relative_change',
    'percentage_point_change', 'current_exclusion_regime', 'previous_exclusion_regime',
    'comparison_caution'];
  const RUN_HEADERS = ['run_id', 'logged_at_jst', 'mode', 'status', 'period_end',
    'message', 'detail_json'];

  function config() {
    const p = PropertiesService.getScriptProperties().getProperties();
    ['YH_SPREADSHEET_ID', 'YH_GA4_PROPERTY_ID', 'YH_GSC_SITE_URL', 'YH_ERROR_EMAIL'].forEach(k => {
      if (!p[k] || !p[k].trim()) throw new Error('スクリプトプロパティが未設定: ' + k);
    });
    if (!/^\d+$/.test(p.YH_GA4_PROPERTY_ID)) throw new Error('GA4はG-で始まる測定IDではなく数字のプロパティIDを指定してください。');
    if (!/^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(p.YH_ERROR_EMAIL)) throw new Error('通知先はメールアドレス1件を指定してください。');
    const lag = Number(p.YH_LAG_DAYS || 4);
    if (!Number.isInteger(lag) || lag < 4 || lag > 30) throw new Error('YH_LAG_DAYSは4〜30。');
    const exclusionDate = p.YH_EXCLUSION_DATE || '2026-11-07';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(exclusionDate) || shift(exclusionDate, 0) !== exclusionDate) throw new Error('除外設定日の形式が不正。');
    const gaTimezone = p.YH_GA4_TIMEZONE || TZ;
    const site = 'https://yatsuhigata.com';
    if (![site + '/', 'sc-domain:yatsuhigata.com'].includes(p.YH_GSC_SITE_URL)) {
      throw new Error('GSCは https://yatsuhigata.com/ または sc-domain:yatsuhigata.com を指定してください。');
    }
    return {spreadsheetId: p.YH_SPREADSHEET_ID, propertyId: p.YH_GA4_PROPERTY_ID,
      gscSite: p.YH_GSC_SITE_URL, email: p.YH_ERROR_EMAIL, lag, exclusionDate,
      gaTimezone, site, hostname: 'yatsuhigata.com'};
  }
  function stamp() { return Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd'T'HH:mm:ssXXX"); }
  function shift(date, days) {
    const d = new Date(date + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }
  function periods(end) {
    return [7, 28].reduce((out, n) => out.concat([
      {key: n + 'd_current', start: shift(end, 1 - n), end},
      {key: n + 'd_previous', start: shift(end, 1 - 2 * n), end: shift(end, -n)}
    ]), []);
  }
  function regime(start, end, boundary) {
    if (end < boundary) return 'BEFORE';
    if (start > boundary) return 'AFTER';
    if (start === boundary && end === boundary) return 'TRANSITION_DAY';
    return 'MIXED_WITH_TRANSITION';
  }
  function guard(ctx) {
    if (Date.now() - ctx.started > 270000) throw new Error('実行時間が270秒を超えました。未完了として停止します。');
  }
  function request(url, body, ctx) {
    for (let attempt = 0; attempt < 4; attempt++) {
      guard(ctx);
      const response = UrlFetchApp.fetch(url, {method: 'post', contentType: 'application/json',
        headers: {Authorization: 'Bearer ' + ScriptApp.getOAuthToken()},
        payload: JSON.stringify(body), muteHttpExceptions: true});
      const status = response.getResponseCode();
      if (status >= 200 && status < 300) return JSON.parse(response.getContentText());
      if ((status === 429 || status >= 500) && attempt < 3) {
        Utilities.sleep(1000 * Math.pow(2, attempt));
        continue;
      }
      // レスポンス本文・トークン・クエリをログ/メールへ転記しない。
      throw new Error('API HTTP ' + status + ' (' + (url.includes('searchConsole') || url.includes('webmasters') ? 'Search Console' : 'GA4') +
        ')。401:再認証、403:API有効化/閲覧権限、400:ID/時間帯/指標、429:割当を確認。');
    }
  }
  function gsc(p, dimensions, ctx) {
    const rows = [];
    const url = 'https://www.googleapis.com/webmasters/v3/sites/' + encodeURIComponent(ctx.cfg.gscSite) + '/searchAnalytics/query';
    for (let startRow = 0; ; startRow += 25000) {
      const result = request(url, {startDate: p.start, endDate: p.end, dimensions,
        type: 'web', dataState: 'final', rowLimit: 25000, startRow,
        aggregationType: dimensions.includes('page') ? 'byPage' : 'byProperty'}, ctx);
      const page = result.rows || [];
      rows.push.apply(rows, page);
      if (page.length < 25000) return rows;
      if (rows.length >= 100000) throw new Error('GSC取得が10万行に達しました。分割取得が必要です。');
    }
  }
  function ga(p, dimensions, metrics, ctx) {
    const rows = [], quality = [];
    const url = 'https://analyticsdata.googleapis.com/v1beta/properties/' + ctx.cfg.propertyId + ':runReport';
    let expected;
    for (let offset = 0; ; offset += 10000) {
      const result = request(url, {dateRanges: [{startDate: p.start, endDate: p.end}],
        dimensions: dimensions.map(name => ({name})), metrics: metrics.map(name => ({name})),
        dimensionFilter: {filter: {fieldName: 'hostName', stringFilter: {
          matchType: 'EXACT', value: ctx.cfg.hostname, caseSensitive: false}}},
        limit: '10000', offset: String(offset),
        orderBys: dimensions.map(dimensionName => ({dimension: {dimensionName}})),
        returnPropertyQuota: true}, ctx);
      const metadata = result.metadata || {};
      if (metadata.timeZone !== ctx.cfg.gaTimezone) {
        throw new Error('GA4の時間帯が設定と不一致: API=' + metadata.timeZone + '、設定=' + ctx.cfg.gaTimezone);
      }
      quality.push({metadata, propertyQuota: result.propertyQuota || {}});
      if (expected !== undefined && expected !== Number(result.rowCount || 0)) throw new Error('GA4ページング途中に行数が変化しました。再実行してください。');
      expected = Number(result.rowCount || 0);
      const page = result.rows || [];
      rows.push.apply(rows, page);
      if (rows.length >= expected) return {rows, quality};
      if (!page.length || rows.length >= 100000) throw new Error('GA4ページング未完了または10万行超。');
    }
  }
  function base(ctx, p, timezone, property, date) {
    return [ctx.id, ctx.fetched, p.key, p.start, p.end, timezone, ctx.cfg.site + '/', property,
      property === ctx.cfg.gscSite ? 'NOT_APPLICABLE' : regime(date || p.start, date || p.end, ctx.cfg.exclusionDate)];
  }
  function isoDate(s) { return s ? s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8) : ''; }
  function pageUrl(path, site) { return path && path.startsWith('/') ? site + path : ''; }
  function metricValues(row, names) {
    const out = {};
    names.forEach((name, i) => { out[name] = Number(row.metricValues[i].value); });
    return out;
  }
  function collect(ctx, ps) {
    const out = {gsc: [], ga: [], comparisons: [], summaries: {GSC: {}, GA4: {}}};
    ps.forEach(p => {
      [['total', []], ['daily', ['date']], ['query', ['query']], ['page', ['page']]].forEach(([report, dims]) => {
        const rows = gsc(p, dims, ctx);
        if (report === 'total') out.summaries.GSC[p.key] = rows.length ? rows[0] : {clicks: 0, impressions: 0, ctr: 0, position: 0};
        rows.forEach(r => {
          const keys = {};
          dims.forEach((d, i) => { keys[d] = r.keys[i]; });
          out.gsc.push(base(ctx, p, 'America/Los_Angeles', ctx.cfg.gscSite).concat([
            report, keys.date || '', keys.query || '', keys.page || '',
            r.clicks, r.impressions, r.ctr, r.position,
            JSON.stringify({dataState: 'final', searchType: 'web', topRowsOnly: true,
              aggregationType: dims.includes('page') ? 'byPage' : 'byProperty'})]));
        });
      });
      const gaReports = [['total', [], GA_METRICS], ['daily', ['date'], GA_METRICS],
        ['source', ['sessionSource', 'sessionMedium', 'sessionDefaultChannelGroup'], GA_METRICS],
        ['landing', ['landingPagePlusQueryString'], GA_METRICS],
        ['page', ['pagePathPlusQueryString'], PAGE_METRICS]];
      gaReports.forEach(([report, dims, metrics]) => {
        const result = ga(p, dims, metrics, ctx);
        const quality = JSON.stringify(result.quality);
        ctx.qualities.push({period: p.key, report, rowCount: result.rows.length, quality: result.quality});
        if (report === 'total') out.summaries.GA4[p.key] = result.rows.length ? metricValues(result.rows[0], metrics) :
          GA_METRICS.reduce((a, m) => { a[m] = 0; return a; }, {});
        result.rows.forEach(r => {
          const keys = {};
          dims.forEach((d, i) => { keys[d] = r.dimensionValues[i].value; });
          const vals = metricValues(r, metrics);
          const date = isoDate(keys.date);
          const path = keys.landingPagePlusQueryString || keys.pagePathPlusQueryString || '';
          const perUser = vals.activeUsers > 0 ? vals.userEngagementDuration / vals.activeUsers : '';
          out.ga.push(base(ctx, p, ctx.cfg.gaTimezone, ctx.cfg.propertyId, date).concat([
            report, date, keys.sessionSource || '', keys.sessionMedium || '',
            keys.sessionDefaultChannelGroup || '', keys.landingPagePlusQueryString || '',
            keys.pagePathPlusQueryString || '', pageUrl(path, ctx.cfg.site)
          ], GA_METRICS.map(m => vals[m] === undefined ? '' : vals[m]), [perUser, quality]));
        });
      });
    });
    ['GSC', 'GA4'].forEach(source => [7, 28].forEach(days => {
      const current = ps.find(p => p.key === days + 'd_current');
      const previous = ps.find(p => p.key === days + 'd_previous');
      const a = out.summaries[source][current.key], b = out.summaries[source][previous.key];
      const cr = source === 'GA4' ? regime(current.start, current.end, ctx.cfg.exclusionDate) : 'NOT_APPLICABLE';
      const pr = source === 'GA4' ? regime(previous.start, previous.end, ctx.cfg.exclusionDate) : 'NOT_APPLICABLE';
      const caution = source === 'GA4' && (cr !== pr || cr.includes('TRANSITION') || pr.includes('TRANSITION')) ?
        'EXCLUSION_SETTING_CHANGED_OR_TRANSITION_INCLUDED' : '';
      Object.keys(a).filter(m => m !== 'keys').forEach(metric => {
        const av = Number(a[metric]), bv = Number(b[metric]);
        const rate = metric === 'ctr' || metric === 'engagementRate';
        // データなしの平均順位0は順位を意味しない。比較欄を空にする。
        const unavailable = metric === 'position' && (!a.impressions || !b.impressions);
        out.comparisons.push([ctx.id, ctx.fetched, source, days,
          source === 'GSC' ? 'America/Los_Angeles' : ctx.cfg.gaTimezone,
          current.start, current.end, previous.start, previous.end, metric, av, bv,
          unavailable ? '' : av - bv, unavailable || bv === 0 ? '' : (av - bv) / bv,
          rate ? (av - bv) * 100 : '', cr, pr, caution]);
      });
    }));
    return out;
  }
  function sheet(ss, suffix, headers) {
    const name = PREFIX + suffix;
    let s = ss.getSheetByName(name);
    if (!s) s = ss.insertSheet(name);
    if (s.getMaxColumns() < headers.length) s.insertColumnsAfter(s.getMaxColumns(), headers.length - s.getMaxColumns());
    if (!s.getLastRow()) {
      s.getRange(1, 1, 1, headers.length).setValues([headers]);
      s.setFrozenRows(1);
      s.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#e8eff4');
    } else {
      const actual = s.getRange(1, 1, 1, Math.max(s.getLastColumn(), headers.length)).getValues()[0];
      if (JSON.stringify(actual) !== JSON.stringify(headers)) throw new Error('既存シートの列が不一致: ' + name);
    }
    return s;
  }
  function safeCell(v) { return typeof v === 'string' && /^[=+@-]/.test(v) ? "'" + v : v; }
  function append(s, rows, ctx) {
    for (let i = 0; i < rows.length; i += 1000) {
      guard(ctx);
      const batch = rows.slice(i, i + 1000).map(row => row.map(safeCell));
      const start = s.getLastRow() + 1;
      const extra = start + batch.length - 1 - s.getMaxRows();
      if (extra > 0) s.insertRowsAfter(s.getMaxRows(), extra);
      const range = s.getRange(start, 1, batch.length, batch[0].length);
      // 日付・ID・URLは文字列を維持。数値はsetValuesで数値として保存。
      range.setNumberFormat('General');
      range.setValues(batch);
    }
  }
  function log(ctx, status, message, detail) {
    // 失敗時は時間ガード後でもログを記録する。
    const s = sheet(ctx.ss, 'RUNS', RUN_HEADERS);
    s.appendRow([ctx.id, stamp(), ctx.mode, status, ctx.end || '', safeCell(message), JSON.stringify(detail || {})]);
  }
  function run(mode) {
    const ctx = {id: Utilities.getUuid(), fetched: stamp(), mode, started: Date.now(), qualities: []};
    const lock = LockService.getScriptLock();
    let locked = false;
    try {
      locked = lock.tryLock(1000);
      if (!locked) throw new Error('別の取得処理が実行中です。');
      ctx.cfg = config();
      ctx.ss = SpreadsheetApp.openById(ctx.cfg.spreadsheetId);
      // 各データソースのローカル日付で4日前以前。日付ラベルは合わせても24時間の範囲は異なる。
      const gaEnd = shift(Utilities.formatDate(new Date(), ctx.cfg.gaTimezone, 'yyyy-MM-dd'), -ctx.cfg.lag);
      const scEnd = shift(Utilities.formatDate(new Date(), 'America/Los_Angeles', 'yyyy-MM-dd'), -ctx.cfg.lag);
      const candidate = gaEnd < scEnd ? gaEnd : scEnd;
      log(ctx, 'STARTED', '取得開始', {gaCandidateEnd: gaEnd, gscCandidateEnd: scEnd});
      const available = gsc({start: shift(candidate, -13), end: candidate}, ['date'], ctx);
      if (!available.length) throw new Error('GSCの確定済み日別データが過去14日間にありません。権限・プロパティ・データ有無を確認してください。');
      ctx.end = available.map(r => r.keys[0]).sort().pop();
      const ps = periods(ctx.end);
      const data = collect(ctx, ps);
      const targets = [
        [sheet(ctx.ss, 'GSC', GSC_HEADERS), data.gsc],
        [sheet(ctx.ss, 'GA4', GA_HEADERS), data.ga],
        [sheet(ctx.ss, 'COMPARISONS', COMP_HEADERS), data.comparisons]
      ];
      targets.forEach(([s, rows]) => append(s, rows, ctx));
      SpreadsheetApp.flush();
      log(ctx, 'SUCCESS', '全レポート保存完了', {periods: ps, exclusionSettingDate: ctx.cfg.exclusionDate,
        rows: {gsc: data.gsc.length, ga4: data.ga.length, comparisons: data.comparisons.length},
        ga4Quality: ctx.qualities, candidateEnd: candidate,
        gscLatestObservedFinalDate: ctx.end, gscTopRowsOnly: true,
        note: 'GA4は遅延を考慮したスナップショット。以後の補正の可能性あり。'});
      console.log('SUCCESS run_id=' + ctx.id + ' / ' + ctx.ss.getUrl());
      return ctx.id;
    } catch (e) {
      const message = String(e.message || e).slice(0, 1500);
      console.error('FAILED run_id=' + ctx.id + ' ' + message);
      if (ctx.ss) {
        try { log(ctx, 'FAILED', message, {note: 'このrun_idのデータは集計から除外。再実行は新しいrun_idで追記。'}); }
        catch (loggingError) { console.error('失敗ログを書き込めませんでした。'); }
      }
      const email = PropertiesService.getScriptProperties().getProperty('YH_ERROR_EMAIL');
      if (email) {
        try {
          MailApp.sendEmail({to: email, subject: '【谷津干潟ナビ】アクセス解析取得エラー',
            body: '実行ID: ' + ctx.id + '\n取得日時: ' + ctx.fetched + '\n実行種別: ' + mode +
              '\nエラー: ' + message + '\n\nApps Scriptの「実行数」とYH_RUNSを確認してください。' +
              '\nSUCCESS以外のrun_idは比較・集計に使用しないでください。'});
        } catch (mailError) { console.error('通知メール送信に失敗しました。Apps Script標準の失敗通知も確認してください。'); }
      } else { console.error('YH_ERROR_EMAIL未設定のため通知メールを送れません。'); }
      throw e;
    } finally { if (locked) lock.releaseLock(); }
  }
  function installTrigger() {
    config();
    // このアカウントが作成した、同じ関数のトリガーだけを置き換える。
    ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'yatsuAnalyticsWeekly')
      .forEach(t => ScriptApp.deleteTrigger(t));
    const t = ScriptApp.newTrigger('yatsuAnalyticsWeekly').timeBased().everyWeeks(1)
      .onWeekDay(ScriptApp.WeekDay.SATURDAY).atHour(8).nearMinute(0).inTimezone(TZ).create();
    console.log('土曜日08:00頃 JST: trigger_id=' + t.getUniqueId());
    return t.getUniqueId();
  }
  return {run, installTrigger};
})();
