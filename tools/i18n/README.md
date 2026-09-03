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
3. そのうえで `messages/*.json`（3 言語同時）へ書く。表とコードは
   **同じコミット**で直す。
4. `node tools/i18n/i18n-glossary-check.mjs` を通す（CI でも走る）。

同じ ja に 2 通りの訳を当てないのが用語集の芯なので、その 1 点だけは機械が見る。

## 文言をどこに置くか — 2 通りある（2026-09-01 に 3 通りから整理）

置き場は 2 つあり、**どれを使うかは文言の性質で決まる**。

| 文言の性質 | 置き場 | 読み方 |
|---|---|---|
| 画面の文言（変数の有無を問わない） | `messages/{ja,en,zh}.json` | `useTranslations("ns")` / `await getTranslations("ns")` |
| **値**に属するラベル（enum・状態・権限・アプリ名） | `messages/*.json` の `enum` / `status` / `permission` / `privilegedOp` / `pdf` 名前空間 | `xxxLabel(value, locale)`（内部は `lib/messages.ts` が `next-intl` の `createTranslator` に委譲） |

以前あった**3 つ目の層**（ja を鍵にした平らな決まり文句辞書、`src/lib/ui-text.ts` /
`useTr()` / `getTr()` / `data/translations/*.json`）は退役した。理由と経緯:

- 鍵に ja の原文をそのまま使う設計は、`.` を含む文（`直径は 0.1〜99.9mm…`）が
  next-intl の `t("a.b")`（`.` を入れ子の区切りとして読む）と噛み合わず、
  next-intl を「本物」として使い切れなかった。
- 6,000 件を超える呼び出しを、鍵の生成（ファイルパス→名前空間 / 英訳→
  leaf キー）→ `messages/*.json` への統合 → 呼び出し側の書き換え、という
  一括移行で本物の next-intl 鍵へ移した（`tools/i18n-unify/` 一式）。
- 静的な鍵しか引けない next-intl の制約上、`tr(result.error)` のように
  **実行時の文字列**を渡していた箇所（約 190 件、ほぼ `ActionResult.error`）は
  鍵に変換できない——`tr(...)` を剥がして生の文字列をそのまま表示する形に
  倒した（訳されないが、存在しない鍵の診断文字列よりまし）。この分は
  サーバー側で結果を返す前に訳す設計へ変える、という別の作業が残っている。

2 つ目（値に属するラベル）を `useTranslations()` に寄せない理由は
`lib/enum-labels.ts` の冒頭に書いてある — **訳をその enum 値の隣に置く**
ためで、React フックの外（Server Action・PDF テンプレート・モジュール直下の
定数）から明示 `locale` 引数で呼べる関数が要る。次の口が対象:
`enum-labels.ts` / `status-map.ts` / `permission-labels.ts` /
`privileged-operations.ts` / `pdf-labels.ts`。内部の文字列解決・ICU 展開は
`lib/messages.ts` が `next-intl` の `createTranslator`（`use-intl/core` の
re-export）に委譲する——独自の木読みは持たない。

### messages/*.json の約束

- **キーは ja が正。** ja → en → zh の順で足す。3 言語でキー集合が完全に
  一致し、空文字を置かない（`lib/user-preferences-core.test.ts` が検査）。
- 鍵が 5,700 件を超えた時点で next-intl の型付け
  （`AppConfig["Messages"]`）が TypeScript の複雑さの上限に触れるため、
  `src/global.d.ts` は型検査をあきらめている——代わりに
  **`tools/i18n-unify/verify-keys.mjs`** が全ての `tr(literal)` 呼び出しの
  鍵を実行時に検査する（`pnpm i18n:keys`、CI でも走る）。
- 名前空間は**画面ではなく意味**で切る（`common` / `shell` / ドメイン）。
  同じ語を画面ごとに複製しない。
- **文を連結しない。** `t("saved") + name` は語順が言語で変わって必ず壊れる。
  1 文 = 1 キー + 変数（`"{name} を追加しました"`）。
- **ICU が壊れる `{...}` を混ぜない。** `createTranslator` は文字列を
  ICU MessageFormat として解釈するので、`^[A-Z]{2}-d{4}$` のような
  正規表現の例文をそのまま入れると実行時に例外になる（実際に起きた）。
  `{name}` の形（識別子 1 つ）だけが安全——`src/lib/messages.test.ts` の
  「ICU 互換性（退行防止）」がこれを機械で見る。

## いまどこまで進んでいるか

- **画面の文言はほぼ包み終わっている。** 5,800 件超を本物の next-intl 鍵に
  通した（`tools/i18n-unify/`）。
- **残っている日本語 = 未翻訳ではない、が「後から訳せる」設計はもう無い。**
  ja 鍵の辞書を退役したので、包まれていない生の日本語（`lib/*.ts` の
  エラーメッセージ、`field-help.ts` の説明文など）は表示側で `tr()` を通しても
  訳されない——包む作業そのものが要る。`i18n-scan.mjs` が「まだ包まれて
  いない箇所」の内訳を出す。

## なぜ「0 でなければ失敗」にしないのか

対象は数千文字列で、1 回の作業では終わらない。全消しを条件にすると CI は
初日から赤のままになって**赤いのが当たり前になり誰も見なくなる**。見たいのは
残数そのものではなく**後戻り**なので、`baseline.json` より増えたときだけ落とす。
減ったときは「下げられます」と言うだけで落とさない — 別の作業をしている人の
PR を、無関係な baseline 更新で止めないため。

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

# 入れ子の tr(tr(...)) を 1 段へ畳む（掃除道具。当てたら必ず tsc を通すこと）
node tools/i18n/i18n-dedupe-nested.mjs --dry
node tools/i18n/i18n-dedupe-nested.mjs

# tr() の鍵が messages/ja.json に実在するか
node tools/i18n-unify/verify-keys.mjs
```

`pnpm i18n:scan` / `pnpm i18n:glossary` / `pnpm i18n:keys` / `pnpm i18n:baseline`
でも同じ（`coolify/apps/nextjs-web`）。CI は `i18n:scan` / `i18n:glossary` /
`i18n:keys` を毎 PR で走らせる。

### 新しい画面文言を本物の next-intl 鍵で包むとき

`i18n-scan.mjs --list` で見つけた生の日本語リテラルを `tr()` へ包むのは、
いまは `tools/i18n-unify/` の一括パイプラインの役目
（`generate-keys.mjs` → `rewrite-call-sites.mjs`）。小さな範囲を手で直す
だけなら、`messages/ja.json` に鍵を 1 つ足して呼び出し側で
`useTranslations()`/`getTranslations()` を直接使えばよい——鍵は
「ファイルの意味を表す名前空間 + 英訳ベースの leaf キー」の形（例:
`settings.itemDefEditForm.aRegularExpressionConstrainingTheInput`）。

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
