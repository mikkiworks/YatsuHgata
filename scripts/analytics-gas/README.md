# 谷津干潟ナビ：週次アクセス解析をGASで蓄積する

既存のGoogle Apps Script（V8）へ `AnalyticsCollector.gs` を追加するためのコードです。
GSC・GA4から読み取り、指定したGoogleスプレッドシートへ履歴を追記します。
Node.js、CMS、サービスアカウント、外部ライブラリー、APIキーは運用に不要です。
このフォルダーはサイト公開用ではありません。現在はコードと手順の作成のみで、Googleアカウントでの設定・実行・トリガー作成は未実施です。

## 1. 用意したファイル

- `AnalyticsCollector.gs`：取得・比較・保存・エラーメール・週次トリガー作成。
- `appsscript.example.json`：必要なOAuthスコープの例。既存マニフェストにマージする。
- `test-analytics.cjs`：ローカルでのモック検証。GASに追加する必要はない。

## 2. ユーザー自身が行う操作：権限とGoogle Cloud

1. 実行に使うGoogleアカウントを1つ決める。週次トリガーも、そのアカウントで作成する。
2. そのアカウントに次の権限があることを確認する。
   - Search Console：対象プロパティの閲覧権限（所有者またはフルユーザーを推奨）。
   - GA4：対象プロパティの閲覧者以上。
   - 保存先スプレッドシート：編集権限。
3. 空のGoogleスプレッドシートを用意し、URLの `/d/` と `/edit` の間のIDを控える。
   既存ファイルも使えるが、`YH_` で始まる専用タブが追加されるため、解析専用ファイルを推奨。
4. GA4管理画面の「プロパティの詳細」等で、**数字のプロパティID**とレポートのタイムゾーンを確認する。
   `G-1NTGB4XW62` はウェブの測定IDなので、このAPIでは使用しない。
   タイムゾーンは通常 `Asia/Tokyo` を想定。異なる場合は後述の設定に実際の値を入れる。
   この導入のために既存プロパティのタイムゾーンを変更する必要はない。
5. Search Consoleのプロパティを確認する。登録されていて閲覧できる方を使う。
   - URLプレフィックス：`https://yatsuhigata.com/`
   - ドメインプロパティ：`sc-domain:yatsuhigata.com`
   ドメインプロパティの場合は他サブドメイン・HTTP等もGSCの対象になり得る。GA4側は `yatsuhigata.com` の完全一致で絞る。
6. 既存GASの「プロジェクトの設定」→「Google Cloud Platform（GCP）プロジェクト」を確認する。
   既に標準Cloudプロジェクトに紐付いている場合はそのプロジェクトを使用する。
   デフォルトプロジェクトでAPIを管理できない場合は、自分で標準Cloudプロジェクトを作り、その**プロジェクト番号**をGASに設定する。
   既存プロジェクトの関連付け変更は既存処理の再認証にも影響するので、元の設定と用途を確認してから行う。
7. 同じCloudプロジェクトの「APIとサービス」→「ライブラリ」で次を有効化する。
   - **Google Search Console API**（`searchconsole.googleapis.com`）
   - **Google Analytics Data API**（`analyticsdata.googleapis.com`）
   GA4 Admin APIや旧Universal Analytics APIは不要。
8. 必要に応じ、Google Auth Platform（OAuth同意画面）のアプリ名・サポートメール・対象ユーザーを設定する。
   外部アプリをテスト状態で使う場合は自分をテストユーザーに追加する。
   **週次の継続運用では「外部・テスト中」のままにしないことを検討する。** このスコープではテスト状態の認可が7日で失効し、再承認が必要になる場合がある。
   組織アカウントで利用可能なら内部向け、個人アカウントなら公開ステータスと必要な認証手順を確認する。
   不特定多数へ配布する場合のGoogleの検証要否は別途確認する。

OAuthクライアントID・クライアントシークレット・リフレッシュトークンをコードやスプレッドシートへコピーする必要はない。
実行ユーザーの承認をGASが管理し、`ScriptApp.getOAuthToken()` で実行時にアクセストークンを取得する。
高度なGoogleサービスの追加も不要（UrlFetchAppでREST APIを呼ぶ方式）。Webアプリとしてのデプロイも不要。

## 3. ユーザー自身が行う操作：既存GASへの追加

1. 既存GASプロジェクトで新しいスクリプトファイル `AnalyticsCollector` を作り、`.gs` の全文を貼り付ける。
   既存コードを置換しない。`YatsuAnalytics` と `yatsuAnalytics...` が既に存在しないことを確認する。
2. 「プロジェクトの設定」でタイムゾーンを `Asia/Tokyo` にする。
   既存処理が別の時間帯に依存している場合はその設定を維持してよい。今回のコードは日時とトリガーの時間帯を明示している。
3. 「appsscript.json マニフェスト ファイルをエディタで表示する」をオンにする。
4. `appsscript.example.json` を参考に、必要な `oauthScopes` を既存スコープへ追加する。
   **既存のスコープ・dependencies・その他の設定は削除しない。** 重複するスコープは1件にまとめる。
   ランタイムはV8が必要。既存の `@OnlyCurrentDoc` 指定などで権限を制限している場合は、その指定との整合も確認する。
5. 「プロジェクトの設定」→「スクリプト プロパティ」で次を登録する。

| プロパティ | 必須 | 値 |
|---|---|---|
| `YH_SPREADSHEET_ID` | 必須 | 保存先スプレッドシートのID |
| `YH_GA4_PROPERTY_ID` | 必須 | 数字のGA4プロパティID |
| `YH_GSC_SITE_URL` | 必須 | `https://yatsuhigata.com/` または `sc-domain:yatsuhigata.com` |
| `YH_ERROR_EMAIL` | 必須 | 自分の通知先メールアドレス1件 |
| `YH_GA4_TIMEZONE` | 任意 | GA4の実際の時間帯。既定 `Asia/Tokyo` |
| `YH_LAG_DAYS` | 任意 | 既定 `4`。4〜30の整数 |
| `YH_EXCLUSION_DATE` | 任意 | 既定 `2026-11-07` |

これらは識別子・運用設定で、OAuthの秘密情報ではない。編集権限のある人はスクリプトプロパティを参照できる。
GSCとGA4のAPI権限は読み取り専用。スプレッドシート書き込み・メール送信・トリガー管理の権限も初回承認時に要求する。

## 4. 手動テストと週次トリガー

1. 関数一覧で **`yatsuAnalyticsManualTest`** を選択し、実行する。
2. Googleの認証画面で、自分が管理するこのスクリプトの内容と権限を確認して承認する。
3. 実行ログに `SUCCESS run_id=...` が出て、保存先に4つのタブが追加されることを確認する。
   手動テストでも本番同様に取得・追記する。既存の履歴は削除しない。
4. `YH_RUNS` に同じ `run_id` の `STARTED` と `SUCCESS` があることを確認する。
   GA4管理画面でも同じ期間・時間帯・ホスト条件で数値を照合する。
5. エラーメールを確認する場合は、`YH_GA4_PROPERTY_ID` の元の値を控え、値を一時的に `invalid-test` にして手動テストする。
   設定検証でAPIを呼ぶ前に失敗し、通知先へメールが送られる。**確認後は必ず元の値に戻し、再度成功を確認する。**
   この設定エラーは保存先を開く前なので `YH_RUNS` には残らず、GAS実行履歴とメールで確認する。
6. 成功を確認したアカウントで **`yatsuAnalyticsInstallTrigger`** を1回実行する。
   毎週土曜日08:00頃（日本時間）の `yatsuAnalyticsWeekly` トリガーを作る。
   同じアカウントが作成した同じ関数のトリガーだけを置換する。他の関数のトリガーは変更しない。
7. GAS左側「トリガー」で関数名・週次・土曜日を確認し、失敗通知も有効にする。
   複数アカウントで作成すると重複するため、作成者は1人にする。

`nearMinute(0)` のため目安は08:00の前後15分。Googleの実行状況による遅れもあり、08:00ちょうどは保証されない。
UIから作る場合は「トリガーを追加」→ `yatsuAnalyticsWeekly` →「時間主導型」→「週ベースのタイマー」→「土曜日」→「午前8時〜9時」。
UIの時間帯はプロジェクト設定に依存するため `Asia/Tokyo` を確認する。このUI設定と作成関数は**どちらか一方**を使用する。
解除は「トリガー」で該当関数のトリガーを削除する。

## 5. 集計期間と確定遅延

- 当日・昨日は取得しない。GSC/GA4それぞれの時間帯で4日前を候補にし、早い日付を共通の終了日候補にする。
- GSCは `dataState: final` のみ取得する。終了日候補までの14日間で、実際に日別行が返る最も新しい日を共通終了日Eとする。
  未確定日のほか、直近に検索表示がない場合にも終了日が前へずれる。これは「最新の観測済み確定日」であり、欠測日の確定を証明するものではない。
  14日間に行がなければ、空データの成功とせずエラー通知する。
- 期間の両端は**含む**。
  - `7d_current`：E−6〜E / `7d_previous`：E−13〜E−7
  - `28d_current`：E−27〜E / `28d_previous`：E−55〜E−28
- 例：2026-11-07 08:00 JSTは太平洋時間で11月6日。既定の候補終了日は11月2日。
  GSCがその日まで返れば、7日間は10月27日〜11月2日、前7日間は10月20日〜26日となる。
- GA4は4日以上空けるが、将来の補正までなくなる保証はない。同じ過去期間を再取得した場合も別のスナップショットとして残る。
- GSCの日付は `America/Los_Angeles`、GA4はAPIが返すプロパティの時間帯。
  同じ日付ラベルでも同じ24時間ではない。両者の差を直接「計測漏れ」と判断しない。
  GA4の実際の時間帯が設定値と異なる場合は、誤った期間比較を防ぐため停止する。

## 6. 保存されるタブと見方

| タブ | 内容 |
|---|---|
| `YH_RUNS` | 実行ID、取得日時、手動/週次、STARTED/SUCCESS/FAILED、終了日、件数・品質情報 |
| `YH_GSC` | `report` が total / daily / query / page。クリック・表示・CTR・平均順位 |
| `YH_GA4` | `report` が total / daily / source / landing / page。各レポートの指標 |
| `YH_COMPARISONS` | ソース別・7日/28日別・指標別の今回値、前期間値、差分、増減率、率のポイント差 |

両データタブに `run_id`、`fetched_at_jst`、`period_key`、開始日・終了日、時間帯、対象サイト・プロパティを保存。
日別は `data_date`、ページ別とランディング別は `page_url` を保存する。サイト全体・クエリ・流入元の集計は特定ページを表さないためURL欄は空。
GA4のURLはホスト完全一致の条件下で、HTTPSのサイトURLとAPIのパスを結合した値。`(not set)` はURLに変換せず元の次元欄に残す。
日付・パス・検索語などの文字列は維持し、指標は数値で保存する。数式と解釈される文字列はエスケープする。

GA4のユーザー数は `totalUsers`、アクティブユーザーは `activeUsers` を別々に保存。
流入元はセッション基準の source / medium / channel（初回獲得元ではない）。
エンゲージメントは `engagedSessions`、`engagementRate`、`averageSessionDuration`、`userEngagementDuration`、
および `userEngagementDuration / activeUsers`（アクティブユーザーあたりの秒数）を保存。
ページ別はPV（`screenPageViews`）・アクティブユーザー・エンゲージメント秒数に限定し、セッション指標の列は空にする。
秒数は秒単位、CTRとエンゲージメント率と増減率は0〜1の小数。必要に応じシートでパーセント表示にする。
前期間0の増減率は空欄。率のポイント差は `(今回−前回)×100`。平均掲載順位は小さくなるほど改善で、表示なしの順位比較は空欄。

**履歴を読む際のルール：**

1. `YH_RUNS` に `SUCCESS` がある `run_id` のみを使う。書き込み途中の失敗はトランザクションではないため、一部行が残ることがある。
2. 1つの `run_id` と `period_key` と `report` に絞る。手動テストや重複期間、サイト合計と内訳を足し合わせない。
3. 比較表は各期間の **totalレポートを直接取得した値** を使う。日別ユーザー数やページ別ユーザー数の合計から期間ユーザー数を作らない。
4. GSCのクエリ一覧は匿名化・API制約により全件取得を保証しない。クエリ合計とサイト合計は一致しないことがある。
   ページ集計はbyPage、サイト/日付/クエリはbyPropertyのため、ページ内訳とサイト合計にも違いが出る。
5. GA4の `quality_json` と実行ログの品質情報に、しきい値・サンプリング・(other)等のメタデータと割当情報を保存。
   `subjectToThresholding`、`samplingMetadatas`、`dataLossFromOtherRow` がある場合、全データの完全な内訳と解釈しない。
6. 日別で行が返らなかった日は自動でゼロ補完しない。期間totalが空なら比較用は0とするが、欠測・権限・計測開始日も確認する。

## 7. 2026-11-07の本人アクセス除外

GA4の `exclusion_regime` と比較表に次を保存する。

- `BEFORE`：全期間が11月6日以前。
- `TRANSITION_DAY`：11月7日だけの日別行。
- `AFTER`：全期間が11月8日以降。
- `MIXED_WITH_TRANSITION`：11月7日を含む期間。

比較期間で区分が異なる場合、または移行日を含む場合は `comparison_caution` に注意フラグを入れる。
実装日は11月7日だが、実際の除外は各ブラウザで `?analytics_off=1` を開いて登録した後から。
`AFTER` は**除外設定導入後**を示すラベルで、本人の全端末が除外済みと証明するものではない。
登録が別日なら、運用開始前に `YH_EXCLUSION_DATE` を実際に比較の境界にしたい日に合わせる。
過去の本人アクセスをAPIから識別・削除・補正するものではない。
GSCにはこのGA4の計測除外は適用されないので `NOT_APPLICABLE` として保存する。

## 8. エラー・実行制限・運用

- 429/5xxは1・2・4秒待って最大4回試行。400/401/403は即停止。
- OAuthトークンや生のAPIエラー本文をメールへ転記しない。
- 失敗は `YH_RUNS` へ追記し、`YH_ERROR_EMAIL` へ実行IDと要約を通知する。
  設定不備・シート権限不足ではログ自体を保存できない場合がある。
- 失敗した実行は新しい `run_id` で再実行する。過去の行は上書きも削除もしない。
- 同時実行はScriptLockで防ぐ。重複起動はメール通知の対象。
- 270秒でコードから停止を試みる。GASの強制終了・Google障害・メール割当超過・認証失効時などはコードからのメールを保証できない。
  GAS標準のトリガー失敗通知と「実行数」も併用する。
- GSCは25,000行、GA4は10,000行ごとにページング。1レポート10万行を目安に停止し、黙って切り捨てない。
  GSCそのものの上位行制限・匿名化はページングでは解消しない。
- スプレッドシートの容量・GAS/APIの割当には上限がある。履歴の増加に応じ、年別の保存先切り替えなどで対処する。
  シートヘッダーの変更はコードと不一致になるため停止する。既存タブのヘッダーは編集しない。

## 9. 検証と参考資料

ローカルのモックテスト：`node scripts/analytics-gas/test-analytics.cjs`。
実API・GASトリガー・メール送信はユーザーの認証が必要なので、上記の手動テストで最終確認する。

- [Search Console API：query、確定済みデータ・ページング・行制限](https://developers.google.com/webmaster-tools/v1/searchanalytics/query?hl=en)
- [GA4 Data API：runReport](https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/properties/runReport)
- [GA4：次元と指標の定義](https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema)
- [GA4：データの鮮度](https://support.google.com/analytics/answer/11198161?hl=en)
- [GAS：Googleサービスの承認](https://developers.google.com/apps-script/guides/services/authorization)
- [GAS：Cloudプロジェクト](https://developers.google.com/apps-script/guides/cloud-platform-projects)
- [GAS：getOAuthToken](https://developers.google.com/apps-script/reference/script/script-app#getoauthtoken)
- [OAuth：認可の失効（外部テスト状態の7日間を含む）](https://developers.google.com/identity/protocols/oauth2#expiration)
- [GAS：トリガー・時刻の誤差](https://developers.google.com/apps-script/reference/script/clock-trigger-builder)
- [GAS：インストール型トリガーと失敗通知](https://developers.google.com/apps-script/guides/triggers/installable)
- [GAS：割当と実行時間](https://developers.google.com/apps-script/guides/services/quotas)
