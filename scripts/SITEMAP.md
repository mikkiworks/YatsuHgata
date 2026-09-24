# サイトマップの更新

ページを追加したら、`scripts/site-config.mjs` の `pages` にファイルとナビゲーション区分を追加します。

次のコマンドで `sitemap.xml` を再生成し、サイト全体を検証します。

```sh
node scripts/generate-sitemap.mjs
node scripts/verify-site.mjs
```

`noindex` を指定したページはサイトマップから自動的に除外されます。`lastmod` は実際の公開更新日を正確に管理できる運用になるまで付与しません。
