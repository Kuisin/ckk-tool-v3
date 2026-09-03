# swimlane — マニュアル用フロー図（kai-swimlane DSL → SVG）

マニュアル（`coolify/apps/nextjs-web/content/manual/`）のプロセス編に載せる
スイムレーン図を、kai-swimlane DSL から静的 SVG として生成するツール。
生成物はコミットする（実行時依存なし — マニュアルは生成済み SVG を
通常の画像として参照するだけ）。

## 構成

- `vendor/` — レンダリングエンジン。**[Kuisin/swimlane-cloud](https://github.com/Kuisin/swimlane-cloud)
  の `packages/diagram-converter/src` を無改変でコピーしたもの**（MIT、`LICENSE` 参照）。
  - 取得元コミット: `baba3ad16c7adee8a036a65aef3258d105fdf4b1`
  - 依存ゼロ・純 ESM・DOM 不使用。`textToSvg(dsl, { themeKey }) -> { svg, errors }`
  - 更新手順: 上流の `packages/diagram-converter/src` から `*.test.js` を除く全
    `.js` を同じ相対パスで上書きし、この README のコミット SHA を書き換える。
    **vendor/ 内のファイルは原則編集しない**（差分を上流と同一に保つ）。
  - **ローカルパッチ（1 件・要上流反映）**: `render-pure/block-icon.js`
    `renderLucideIcon` — `Array#join` が `el()` の Raw ブランドを落とし、
    アイコンの `<path>` がエスケープされて空白になるバグを `join()` ヘルパで修正。
    上流に取り込んだら次回同期でパッチを外す。
- `diagrams/*.txt` — 図の DSL ソース（コミット対象）。文法は swimlane-cloud の
  `dsl-rule.md`（旧版: このリポジトリの `tools/external-refs/kai-swimlane.md`）。
- `build-diagrams.mjs` — `diagrams/*.txt` → `content/manual/assets/diagrams/<名前>.svg`
- `preview.mjs` — 書きながら見るための開発用サーバー（**何も書き出さない**）

## 使い方

```bash
node tools/swimlane/build-diagrams.mjs   # リポジトリのどこからでも可（スクリプト位置基準）
```

- 出力先: `coolify/apps/nextjs-web/content/manual/assets/diagrams/`（コミットする）
- DSL にエラーがあれば一覧を表示して exit 1（部分出力はしない）
- 生成 SVG に `viewBox` / `width` / `height` が無ければ exit 1
  （fumadocs の remark-image → next/image 静的 import が寸法を要求するため）

## 図を書いている間のプレビュー

```bash
node tools/swimlane/preview.mjs           # http://127.0.0.1:4321/
node tools/swimlane/preview.mjs --port 5000
```

`diagrams/` を監視して、`.txt` を保存した瞬間に描き直す。**マニュアルが読む SVG は
従来どおりコミット済みの生成物**で、このサーバーはファイルを一切書かない — 変えたのは
「直す → ビルド → コミット → 画面で確認」の往復だけ。

`build-diagrams.mjs` と違って**エラーで終了しない**。書いている途中の DSL はほとんどの
時間が構文エラーなので、エラーは画面上部に出して次の保存を待つ。判定は同じものを使うので、
`viewBox` 欠落のようにビルドだけが落ちる状態もここで見える。

図が固まったら `build-diagrams.mjs` を実行して、生成 SVG をコミットすること —
プレビューを見ただけではマニュアルの画像は変わらない。

**生成された SVG を直接編集しない。** 文言を直すときも触るのは `diagrams/*.txt` の方で、
次のビルドが上書きする。実際に一度ずれた — 2026-08-30 の用語統一（試算 → 価格試算）が
SVG 側にだけ当たっていて、DSL は旧語のまま残っていた。あの状態で誰かが
`build-diagrams.mjs` を走らせれば、用語の決定が黙って巻き戻る。ずれているかどうかは
プレビューと画面を見比べれば判る（プレビューは常に DSL を描くため）。

## 図を書くときのルール（マニュアル向け）

- 用語は `_specs/design.md` §17 に従う（**注文請書 / 注文明細** — 「受注書」
  「注文受諾書」は使わない。`_docs/business_flow.md` は旧称のままなので注意）。
- ラベル・desc にシステム内部（ライブラリ名・番号フォーマット・コンテナ名）を
  書かない — 利用者に見える結果だけを書く。
- レーン・ブロック・prop の配色規約は `_docs/business_flow.md` の凡例
  （/role/・kai-swimlane-parts ブロック）から借用する。
