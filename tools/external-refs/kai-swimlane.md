## 必須構文

```
@kai-swimlane
・・・
@end
```
@行の間の文字列が処理されます

## セクション

```
/page/
/title/
/role/
/block/
/prop/
/line/
```

6つのセクションに分けて記述します。

## ページ

```
/page/
description: タイトル下に表示する説明;
header-left: 左ヘッダー;
header-center: 中央ヘッダー;
header-right: 右ヘッダー;
footer-left: 左フッター;
footer-center: 中央フッター;
footer-right: 右フッター;
```

図全体のヘッダー・フッター（左・中央・右）と、タイトル直下の説明文を設定します。各行は `;` で終えます。複数行は `` ``` `` フェンスでも書けます。

```
description: ```
1行目
2行目
```;
```

## タイトル

```
/title/
Sample text
```

図のタイトル。

## 役割(レーン)

```
/role/

<role01>
label: 営業;
text-color: #0066cc;
background-color: #e6f2ff;
icon: #user;
```

<roleId> の下にプロパティ。label / text-color / background-color / icon。各行は `;` で終えます。

## ブロック(再利用デザイン)

```
/block/

<block01>
background-color: #ffe0b3;
text-color: #6b2a00;
border-color: #aa5500;
shape: hex;
icon: #zap;
```

再利用可能なステップのスタイル定義。shape: rect / rounded / hex / ellipse / cloud / note / subroutine。プロパティ行は `;` で終えます。

## プロップ(再利用ドキュメント)

```
/prop/

<RQ>
label: 申請書;
side: right;

<LG>
label: 承認ログ;
side: left;
background-color: #f1f5f9;
border-color: #64748b;
text-color: #0f172a;
title: 監査用に保存される承認履歴;
max-chars: 10;
```

ステップに紐づける再利用可能なドキュメント定義。プロパティ行は `;` で終えます。

- `label` — チップに表示する短い名前
- `side` — `left` / `right`（省略時 `right`）
- `background-color` — チップの塗り
- `border-color` — チップの枠線
- `text-color` — ラベル文字色
- `title` または `hint` — ホバー時の説明（SVG の `<title>`。未指定時は `label` などにフォールバック）
- `max-chars` — 表示名の最大文字数（正の整数。省略時は 9）

## アイコン (icon)

```
icon: #check;
icon: #alert-triangle;
icon: ★;
icon: 🔥;
```

`#` 付きで [Lucide アイコン名](https://lucide.dev/icons/) を指定(例: `#check`, `#star`, `#mail`, `#lock`, `#zap`, `#circle-check`, `#alert-triangle`, `#database`, `#cloud`, `#settings`, `#user`, `#file-text`, `#send`, `#rocket`, `#shield-check` など 100+ 種)。`#` 無しは絵文字・文字としてそのまま表示。

## ステップ

1 行目にレーンと本文。`[roleId: 本文]`。行末に `<blockId>` を付けると `/block/` のデザインが当たります。

次の行以降（必ず直後のステップにだけ効く）:

- `label: 名前;` — 左カラム用の表示名
- `desc: 説明;` — 左カラム用の小さめ説明（複数行は `` ``` `` フェンス）
- `skip;` — 段階番号を付けない（見出し用）
- `props: A,B,C;` — `/prop/` のドキュメントをステップ下部の左右に表示

```
[role02: ここに手続きを入れる]
label: Step name;
desc: 左カラムに表示される説明;
desc: ```
1行目
2行目
```;
props: A,B;

[role02: ここに次のステップ] <block02>
props: C;
```

## 分岐(split & merge)

分岐内の行は必須ではありませんが、可読性のため先頭に半角スペース2つのインデントを推奨します。

```
if (条件) is (成功 ) than #blue
  [role01: 成功処理] <block02>
elseif (失敗) than #gray
  [role02: エラー] <block03>
endif

if (○○有無) is (あり) than
  [role01: 成功処理] <block02>
elseif (なし) than
  [role02: エラー] <block03>
endif

if (再試行) is (する) than
  [role01: 項目を処理] <block02>
  [loop]
elseif (しない) than
  [role01: 完了] <block03>
endif
```

if〜endif で分岐。各ステップ行は上記と同じく `[roleId: 本文]` 形式。`than` の後ろに `#色名` を付けると条件ブロック色を指定できます。
色指定がない場合は現在のテーマ既定色を使います。使える色：blue, green, red, orange, purple, gray, black

分岐ケースの末尾に `[loop]` を置くと、そのケースはマージへ進まず同じ if の条件ダイヤモンドへ戻る矢印を描きます（`if` の外では使えません）。直前のステップから矢印が出ます。ステップが無いケースではケース位置から戻ります。

---

## role

レーン ID は `role_` + 役割名（英語）にします。例: `role_applicant` = 申請者。図ごとに ID を増やしても構いません。

### 申請者

申請・起票を行う担当者のレーン。

```
<role_applicant>
label: 申請者;
text-color: #1e293b;
background-color: #ffffff;
```

### 承認者

上長や承認権限者のレーン。

```
<role_approver>
label: 承認者;
text-color: #166534;
background-color: #f0fdf4;
```

### 経理・財務

経理確認・支払処理などのレーン。

```
<role_accounting>
label: 経理;
text-color: #1e40af;
background-color: #eff6ff;
icon: #database;
```

### 人事

採用・労務など人事部門のレーン。

```
<role_hr>
label: 人事;
text-color: #6b21a8;
background-color: #faf5ff;
icon: #user;
```

### システム

自動処理・バッチ・API 連携などのレーン。

```
<role_system>
label: システム;
text-color: #3730a3;
background-color: #eef2ff;
icon: #database;
```

### 法務・コンプライアンス

契約審査・コンプラ確認のレーン。

```
<role_legal>
label: 法務;
text-color: #5b21b6;
background-color: #f5f3ff;
icon: #shield-check;
```

### 取引先・顧客

社外の相手方を表すレーン。

```
<role_partner>
label: 取引先;
text-color: #92400e;
background-color: #fffbeb;
icon: #mail;
```

## block

※ **形状**で操作の種類を区別し、**色**で意味を区別します。

| 形状 | 用途 |
|------|------|
| `rounded` | ユーザー操作（申請・承認・却下・通常業務など） |
| `rect` | システム操作（自動処理・通知送信など） |
| `hex` | 条件分岐内のステップ（`if`〜`endif` のケース） |

### 通常処理

グレー — 一般的な業務ステップ。

```kai-swimlane-parts
/block/

<block_neutral>
background-color: #f8fafc;
text-color: #334155;
border-color: #64748b;
shape: rounded;
```

### 申請・起票

ブルー — 申請・登録・起票。

```kai-swimlane-parts
/block/

<block_apply>
background-color: #dbeafe;
text-color: #1e40af;
border-color: #2563eb;
shape: rounded;
icon: #zap;
```

### 承認

グリーン — 承認・検印・完了。

```kai-swimlane-parts
/block/

<block_approve>
background-color: #dcfce7;
text-color: #166534;
border-color: #16a34a;
shape: rounded;
icon: #circle-check;
```

### 条件分岐

バイオレット — `if` / `elseif` / `else` 内のステップに付与（六角形）。

```kai-swimlane-parts
/block/

<block_condition>
background-color: #f3e8ff;
text-color: #6b21a8;
border-color: #9333ea;
shape: subroutine;
icon: #git-branch;
```

### システム処理

インディゴ — 自動処理・連携（矩形）。

```kai-swimlane-parts
/block/

<block_system>
background-color: #e0e7ff;
text-color: #3730a3;
border-color: #4f46e5;
shape: rect;
icon: #database;
```

### 通知・連絡

スカイ — システムからのメール・通知（矩形）。

```kai-swimlane-parts
/block/

<block_notify>
background-color: #e0f2fe;
text-color: #075985;
border-color: #0284c7;
shape: rect;
icon: #send;
```

### 却下・エラー

レッド — 却下・差し戻し・例外。

```kai-swimlane-parts
/block/

<block_reject>
background-color: #fee2e2;
text-color: #991b1b;
border-color: #dc2626;
shape: hex;
icon: #alert-triangle;
```

### 待機・保留

ジンク — 保留・待ち・未着手。

```kai-swimlane-parts
/block/

<block_wait>
background-color: #f4f4f5;
text-color: #52525b;
border-color: #71717a;
shape: hex;
icon: #clock;
```

### メモ・補足

アンバー — 注記・メモ・参考情報。

```kai-swimlane-parts
/block/

<block_memo>
background-color: #fef3c7;
text-color: #92400e;
border-color: #d97706;
shape: note;
icon: #file-text;
```

## prop

※ ID は意味が分かる英語名。`/line/` では `props: REQ_DOC, RECEIPT;` のように指定します。

### 申請書

ステップに紐づける申請書類チップ（右側表示）。

```kai-swimlane-parts
/prop/

<REQ_DOC>
label: 申請書;
side: right;
title: 会社所定フォーマットの申請書;
```

### 承認ログ

承認・差し戻しの記録を左側に表示。

```kai-swimlane-parts
/prop/

<APPR_LOG>
label: 承認ログ;
side: left;
background-color: #f8fafc;
border-color: #64748b;
text-color: #334155;
title: 誰がいつ承認・差し戻ししたかの記録;
```

### 領収書・証憑

領収書や証憑ファイル。`hint` でホバー説明を付けられます。

```kai-swimlane-parts
/prop/

<RECEIPT>
label: 領収書;
side: left;
background-color: #f8fafc;
border-color: #94a3b8;
text-color: #334155;
hint: 金額・日付が読める画像またはPDF;
```

### 契約書

契約書・合意書の参照チップ。

```kai-swimlane-parts
/prop/

<CONTRACT>
label: 契約書;
side: right;
background-color: #faf5ff;
border-color: #a855f7;
text-color: #6b21a8;
title: 締結済み契約の写しまたは電子契約ID;
```

### 通知メール

送信メール・通知の記録チップ。

```kai-swimlane-parts
/prop/

<NOTIFY>
label: 通知メール;
side: right;
background-color: #f0f9ff;
border-color: #0284c7;
text-color: #075985;
title: 申請者・関係者への自動通知;
```

### 台帳・マスタ

参照用の台帳・マスタデータ。

```kai-swimlane-parts
/prop/

<MASTER>
label: 台帳;
side: left;
background-color: #f0fdf4;
border-color: #16a34a;
text-color: #166534;
title: 参照用マスタ・台帳データ;
```

### 監査証跡

操作ログ・監査用の証跡チップ。

```kai-swimlane-parts
/prop/

<AUDIT>
label: 監査証跡;
side: left;
background-color: #fff7ed;
border-color: #ea580c;
text-color: #9a3412;
title: 操作者・日時・変更内容を記録したログ;
```

### 表示名の省略

`max-chars` でチップ表示を短く切り詰めます。

```kai-swimlane-parts
/prop/

<LABEL_SHORT>
label: 長い名称の文書;
side: right;
max-chars: 6;
title: 表示は6文字まで。ホバーで全文;
```

## set

### 経費申請

経費の申請から承認・通知まで。統一ブロック色と分かりやすい prop 名の例です。

```kai-swimlane
@kai-swimlane

/title/
経費申請フロー

/role/

<role_category>
label: 区分;
text-color: #444444;
background-color: #f5f5f4;

<role_system>
label: システム;
text-color: #3730a3;
background-color: #eef2ff;
icon: #database;

<role_applicant>
label: 申請者;
text-color: #1e293b;
background-color: #ffffff;

<role_approver>
label: 承認者;
text-color: #166534;
background-color: #f0fdf4;

/block/

<block_apply>
background-color: #dbeafe;
text-color: #1e40af;
border-color: #2563eb;
shape: rounded;
icon: #zap;

<block_approve>
background-color: #dcfce7;
text-color: #166534;
border-color: #16a34a;
shape: rounded;
icon: #circle-check;

<block_system>
background-color: #e0e7ff;
text-color: #3730a3;
border-color: #4f46e5;
shape: rect;
icon: #database;

/prop/

<REQ_DOC>
label: 経費申請書;
side: right;
max-chars: 8;

<APPR_LOG>
label: 承認ログ;
side: left;
background-color: #f8fafc;
border-color: #64748b;
text-color: #334155;

<NOTIFY>
label: 通知メール;
side: right;
background-color: #f0f9ff;
border-color: #0284c7;
text-color: #075985;

<RECEIPT>
label: 領収書;
side: left;
background-color: #f8fafc;
border-color: #94a3b8;
text-color: #334155;
hint: 金額・日付が読める画像またはPDF;

/line/

[role_category: 申請開始]
skip;

[role_applicant: 領収書を添付して申請] <block_apply>
label: 申請入力;
props: REQ_DOC,RECEIPT;

[role_system: 申請を受け付ける] <block_system>
props: APPR_LOG;

[role_approver: 承認する] <block_approve>
props: APPR_LOG;

[role_applicant: 結果を確認]
props: NOTIFY;

@end
```

### 稟議・承認

金額条件による分岐と差し戻しの例。

```kai-swimlane
@kai-swimlane

/title/
稟議・承認フロー

/role/

<role_category>
label: 区分;
text-color: #444444;
background-color: #f5f5f4;

<role_applicant>
label: 申請者;
text-color: #1e293b;
background-color: #ffffff;

<role_approver>
label: 承認者;
text-color: #166534;
background-color: #f0fdf4;

<role_accounting>
label: 経理;
text-color: #1e40af;
background-color: #eff6ff;

/block/

<block_apply>
background-color: #dbeafe;
text-color: #1e40af;
border-color: #2563eb;
shape: rounded;
icon: #zap;

<block_approve>
background-color: #dcfce7;
text-color: #166534;
border-color: #16a34a;
shape: rounded;
icon: #circle-check;

<block_reject>
background-color: #fee2e2;
text-color: #991b1b;
border-color: #dc2626;
shape: rounded;
icon: #alert-triangle;

<block_condition>
background-color: #f3e8ff;
text-color: #6b21a8;
border-color: #9333ea;
shape: hex;
icon: #git-branch;

/prop/

<REQ_DOC>
label: 稟議書;
side: right;

<APPR_LOG>
label: 承認ログ;
side: left;
background-color: #f8fafc;
border-color: #64748b;
text-color: #334155;

/line/

[role_category: 稟議]
skip;

[role_applicant: 稟議書を起票] <block_apply>
props: REQ_DOC;

[role_approver: 承認] <block_approve>
props: APPR_LOG;

if (金額) is (上限超) than
  [role_accounting: 経理確認] <block_condition>
elseif (以内) than
  [role_approver: 承認完了] <block_condition>
else
  [role_applicant: 差し戻し] <block_condition>
endif

@end
```

### 採用・人事

応募からオファー・入社手続きまで。

```kai-swimlane
@kai-swimlane

/title/
採用・人事フロー

/role/

<role_category>
label: 区分;
text-color: #444444;
background-color: #f5f5f4;

<role_hr>
label: 人事;
text-color: #6b21a8;
background-color: #faf5ff;

<role_approver>
label: 採用担当;
text-color: #166534;
background-color: #f0fdf4;

<role_system>
label: システム;
text-color: #3730a3;
background-color: #eef2ff;

/block/

<block_notify>
background-color: #e0f2fe;
text-color: #075985;
border-color: #0284c7;
shape: rect;
icon: #send;

<block_approve>
background-color: #dcfce7;
text-color: #166534;
border-color: #16a34a;
shape: rounded;
icon: #circle-check;

/prop/

<RESUME>
label: 履歴書;
side: right;
title: 応募時に提出された履歴書;

<OFFER>
label: オファー;
side: right;
background-color: #f0fdf4;
border-color: #16a34a;
text-color: #166534;
title: 内定通知・条件提示書;

/line/

[role_category: 採用]
skip;

[role_hr: 応募受付]
props: RESUME;

[role_approver: 面接・選考] <block_approve>

[role_system: オファー送付] <block_notify>
props: OFFER;

[role_hr: 入社手続き] <block_approve>

@end
```
