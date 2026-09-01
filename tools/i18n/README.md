# i18n の移行道具

英語・中国語対応を**少しずつ・後戻りなく**進めるための道具。用語と翻訳規則の正は
`_specs/i18n-glossary.md`（読まずに文言を書かないこと）。ここに書くのは作業のやり方だけ。

## 用語を足すとき（先にこれ）

**訳語を思い付きで決めない。** 手順は用語集 §2.11 のとおりで、順番が要点:

1. **`_specs/i18n-glossary.md` §3 を引く。** 節が 20 個あるので、`grep` は
   コードだけでなく**語そのもの**で引く。実際にここを飛ばして「無い」と判断し、
   既にあった行を二重に足したうえ、決定済みの訳
   （取引先ポータル = 客户门户）を別の訳で上書きした事故がある。
2. 無ければ §3 の該当表に 1 行足す。判断が要るものは §5「未決」に上げ、
   **決まるまで使わない**。
3. そのうえで `messages/*.json`（3 言語同時）か `Record<Locale, string>` に書く。
   表とコードは**同じコミット**で直す。
4. `node tools/i18n/i18n-glossary-check.mjs` を通す（CI でも走る）。

同じ ja に 2 通りの訳を当てないのが用語集の芯なので、その 1 点だけは機械が見る。

## なぜ「全部訳す」を条件にしないのか

対象は約 11,000 箇所・600 ファイルある。一度に終わらないのは分かっているし、
終わっていなくても**壊れない** — 移していない画面は日本語のまま動く
（`src/i18n/request.ts` の設計どおり）。

なので CI が見るのは残数ではなく **後戻り**だけ。`baseline.json` より増えたら落ちる。
減ったときは「下げられます」と言うだけで落とさない — 別の作業をしている人の PR を、
無関係な baseline 更新で止めないため。

## 使う

```bash
# いま何件残っているか（baseline と比較。CI が実行するのはこれ）
node tools/i18n/i18n-scan.mjs

# どこに残っているか
node tools/i18n/i18n-scan.mjs --list
node tools/i18n/i18n-scan.mjs --list --app web --area components/sales
node tools/i18n/i18n-scan.mjs --list --limit 100

# 移行を進めた後、基準を下げる（同じコミットに含める）
node tools/i18n/i18n-scan.mjs --update-baseline

# 用語集そのものの検査（訳の割れ・重複・空セル）
node tools/i18n/i18n-glossary-check.mjs
```

`pnpm i18n:scan` / `pnpm i18n:glossary` / `pnpm i18n:baseline` でも同じ
（`coolify/apps/nextjs-web`）。CI は前 2 つを毎 PR で走らせる。

## 文言をどこに置くか — 2 通りある

この製品には i18n の置き場が 2 つあり、**どちらを使うかは文言の性質で決まる**。
新しく足すときに迷ったら下の表を見ること。

| 文言の性質 | 置き場 | 読み方 |
|---|---|---|
| 画面の枠・ボタン・見出し・通知（値に属さない） | `messages/{ja,en,zh}.json` | `useTranslations("ns")` / `await getTranslations("ns")` |
| **値**に属するラベル（enum・状態・権限・アプリ名） | 値の隣の `Record<Locale, string>` | `xxxLabel(value, locale)` |

後者を next-intl に寄せない理由は `lib/enum-labels.ts` の冒頭に書いてある —
**訳をその enum 値の隣に置く**ためで、2 ファイルに割れると片方だけ直る。
既存の例: `enum-labels.ts` / `permission-labels.ts` / `privileged-operations.ts` /
`StatusBadge.tsx`。

### messages/*.json の約束

- **キーは ja が正。** `ja.json` に無いキーはビルドで落ちる（`src/global.d.ts` が
  `typeof ja` から型を作る）。ja → en → zh の順で足す。
- 3 言語でキー集合が完全に一致し、空文字を置かない。
  `lib/user-preferences-core.test.ts` が検査する。
- 名前空間は**画面ではなく意味**で切る（`common` / `shell` / ドメイン）。
  同じ語を画面ごとに複製しない。
- **文を連結しない。** `t("saved") + name` は語順が言語で変わって必ず壊れる。
  1 文 = 1 キー + 変数（`"{name} を追加しました"`）。

## 日本語のまま残したいとき

画面に出ない日本語（開発者向けコメント・ログ・内部キー）は数えていないので、
そのままでよい。それでも検出されてしまう 1 行には `// i18n-ignore` を付ける。
直前の行に書いても効く。

```ts
// i18n-ignore — 監査ログの内部キー。画面には出ない
const AUDIT_KEY = "承認";
```

**「まだ訳していないから」で ignore を付けないこと。** 残数が見えなくなり、
この道具の意味が無くなる。

## 数えないもの

`lib/scan.mjs` の `EXCLUDED` が正。要約すると:

- コメント（ja が原文 — glossary §1）
- `ja:` / `en:` / `zh:` の値（原文とその訳）
- 日本語のオブジェクトキー（単位 `本:` のような**値**）
- テスト（期待値であって画面ではない）
- `design-preview` の複製、キオスクの辞書 `lib/i18n/messages/`

`admintools` は対象外 — 社内運用ツールで、日本語のみで運用すると決めた。
