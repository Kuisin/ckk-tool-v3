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

## いまどこまで進んでいるか

- **対訳（ja→en/zh）は完成している。** 5,342 語。`i18n-todo.mjs` の「まだ訳して
  いない語」は 0。
- **画面の文言はほぼ包み終わっている。** 330 ファイル・約 6,000 箇所を
  `tr()` に通した。
- **残っている日本語 = 未翻訳ではない。** ja を鍵にしているので、`lib/*.ts` や
  `actions.ts` が日本語のまま文言を返しても、表示側が `tr()` を通せば訳される。
  `i18n-scan.mjs` はその内訳を出す（「辞書にある」/「辞書にも無い」）。

残っている仕事は 2 つだけ:

1. **テンプレート断片 約 1,000 箇所** — `${}` を挟む文。ja 鍵では持てないので
   （語順が言語で変わる。用語集 §2.6）、next-intl の変数付きキーへ移す。
   `node tools/i18n/i18n-todo.mjs --templates` で場所が出る。
2. **`lib/field-help.ts` 462 箇所** — マニュアルから生成しているので、
   直すのは `content/manual/**` の側（`coolify/apps/nextjs-web/CLAUDE.md`）。
   マニュアル本体の翻訳と同じ仕事になる。

## なぜ「全部訳す」を CI の条件にしないのか

上の 2 つが残っているうちは 0 にならないし、0 を条件にすると CI は赤のままに
なって**赤いのが当たり前になり誰も見なくなる**。見たいのは残数そのものではなく
**後戻り**なので、`baseline.json` より増えたときだけ落とす。減ったときは
「下げられます」と言うだけで落とさない — 別の作業をしている人の PR を、
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

# まだ訳していない語を並べる / 次の N 語を出す / ICU 行きの断片を見る
node tools/i18n/i18n-todo.mjs
node tools/i18n/i18n-todo.mjs --next 200
node tools/i18n/i18n-todo.mjs --templates

# 辞書を書き出す（data/*.json → src/lib/ui-dictionary/{en,zh}.ts）
node tools/i18n/build-dictionary.mjs

# tr() の鍵が辞書にあるか（抜けは日本語のまま出るのでここでしか捕まらない）
node tools/i18n/i18n-verify-keys.mjs

# 辞書にある語を tr() へ包む（--dry で下見。当てたら必ず tsc を通すこと）
node tools/i18n/i18n-codemod.mjs --dry --area components/sales
node tools/i18n/i18n-codemod.mjs --area components/sales
```

`pnpm i18n:scan` / `pnpm i18n:glossary` / `pnpm i18n:baseline` でも同じ
（`coolify/apps/nextjs-web`）。CI は前 2 つを毎 PR で走らせる。

## 文言をどこに置くか — 3 通りある

置き場は 3 つあり、**どれを使うかは文言の性質で決まる**。
新しく足すときに迷ったら下の表を見ること。

| 文言の性質 | 置き場 | 読み方 |
|---|---|---|
| **変数を含む文**（`{name} を追加しました`） | `messages/{ja,en,zh}.json` | `useTranslations("ns")` / `await getTranslations("ns")` |
| **値**に属するラベル（enum・状態・権限・アプリ名） | 値の隣の `Record<Locale, string>` | `xxxLabel(value, locale)` |
| それ以外の画面文言（変数の無い決まり文句） | `data/translations/*.json`（ja が鍵） | `useTr()` / `await getTr()` |

3 つ目が今回足した層で、仕組みと「なぜ ja を鍵にするのか」は
`src/lib/ui-text.ts` の冒頭に書いてある。要点だけ言うと、**6,000 個のキー名を
発明せずに済み、同じ日本語に 2 つの訳が付く余地が構造的に無くなる**から。
辞書に無ければ日本語のまま返すので、抜けが画面を壊すこともない。

2 つ目（値に属するラベル）を next-intl に寄せない理由は `lib/enum-labels.ts` の
冒頭に書いてある — **訳をその enum 値の隣に置く**ためで、2 ファイルに割れると
片方だけ直る。既存の例: `enum-labels.ts` / `permission-labels.ts` /
`privileged-operations.ts` / `StatusBadge.tsx`。

なお 3 つ目は「**後から訳せる**」のが効く。`lib/*.ts` や `actions.ts` は
日本語のまま文言を返してよく、表示する画面が `tr()` を通せば訳される。
おかげでサーバー側の全関数に locale を引き回さずに済んでいる。

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
