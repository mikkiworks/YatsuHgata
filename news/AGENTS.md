# 最新情報の記事追加・更新

ユーザーがURLを渡したら、これまでどおり元ページを確認して記事を作成する。イベントはカレンダーも同時に更新する。

- イベント記事の `article.content` に `data-event-start="YYYY-MM-DD"` と `data-event-end="YYYY-MM-DD"` を付ける。単日開催は同じ日付。
- 期間開催の休館日・非開催日は `data-event-exclude="YYYY-MM-DD,YYYY-MM-DD"` で明示する。申し込み開始日や記事の公開日を開催日に使わない。非連続日程は開始・終了と除外日で実際の実施日のみにする。
- 開催日未定の催しは、日付を推測して登録しない。日程を確認してからイベントとして一覧へ掲載する。
- 一覧のイベントラベル、終了日、記事の開催日を揃える。
- 一覧・記事を編集後 `node scripts/build-events.mjs` で `assets/data/events.json` を更新し、生成ファイルもデプロイ対象に含める。
- `node scripts/verify-site.mjs` と `git diff --check` で検証する。記事末尾の戻るボタンには `subpage__next--back` を付ける。

- 期間開催・応募受付は日付の件数には含めず、カレンダー下部の別枠に表示される。複数日にまたがるが特定日開催として日付に載せる場合は `data-event-calendar="dates"` を明示する（例：2日間の観察会）。
