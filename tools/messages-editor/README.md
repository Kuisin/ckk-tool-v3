# messages editor

`coolify/apps/nextjs-web/messages/{ja,en,zh}.json`（next-intl のカタログ）を
ブラウザから直接編集する、ローカル専用のミニ道具。3 言語を列に並べ、名前空間
（`common` / `shell` / …）は折りたためるグループとして出す。

## 使う

```bash
pnpm messages:editor
# または
node tools/messages-editor/server.mjs
```

`http://localhost:5178` を開く。別のディレクトリ・ポートを見せたいとき:

```bash
node tools/messages-editor/server.mjs --dir path/to/messages --port 5999
```

## できること

- **編集**: セルを直接書き換えると、フォーカスを外した時点で 3 ファイルへ
  即座に書き戻す（右上の状態表示が 保存中… → 保存しました に変わる）。
- **折りたたみ**: 名前空間の行の ▼/▶ をクリック。「すべて開く」「すべて畳む」
  もある。
- **絞り込み**: 上部の検索欄はキー名・どの言語の値にもマッチする。名前空間
  そのものがマッチしたときは配下を丸ごと表示する。
- **追加・削除**: 名前空間の行にある「＋鍵」「＋組」でその場に足す（キー名は
  next-intl の慣習に合わせて英数字の lowerCamelCase のみ許可）。× で削除
  （名前空間ごと消すと配下の鍵も全部消えるので確認が入る）。
- **警告**: 上部に「ja にはあるが en に無い」「値が空」の件数を出す。
  `lib/user-preferences-core.test.ja` が CI で見ている不変条件
  （3 言語のキー集合が完全一致・空文字を置かない）と同じもので、保存する前に
  気づけるようにしてある。
- 他言語だけにあって ja に無いキーも「他言語のみ」の印付きで出す（消し忘れの
  発見用）。

## 仕組み

- `server.mjs` — 依存ライブラリ無しの Node 標準 `http` サーバー。
  `GET /api/tree` で 3 ファイルを 1 本の木にして返し、`POST /api/save` で
  木を受け取って 3 ファイルへ書き戻す。**ja が正** — 木の並び順は常に
  `ja.json` を基準にする。
- `public/` — ビルド不要の素の HTML/CSS/JS。フレームワークは入れていない
  （`_specs/techstack.md` の依存方針。この規模でライブラリを足す理由が無い）。

## 対象を変えたいとき

`messages/*.json` 専用に作ってある（次の理由でこの形が前提）:

- ネストしたオブジェクト（名前空間 → キー → 文字列）を 1 本の木として扱う。
- ロケールは `<dir>/*.json` のファイル名から自動検出する。

`tools/i18n/data/translations/*.json`（ja 鍵の辞書 — フラットな
`{ 日本語: [en, zh] }` の配列形）や `lib/enum-labels.ts` 等の
`Record<Locale, string>`（TypeScript）は形が違うので、この道具では扱えない。
