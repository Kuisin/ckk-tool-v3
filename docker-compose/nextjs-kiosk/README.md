# nextjs-kiosk — 共有キオスク端末アプリ

拠点フロアの共有タブレット用アプリ。従業員は **QR カード + PIN** でログインする
（AD パスワード入力なし）。管理（カード発行・端末有効化・フロアマップ）は
**nextjs-web の設定アプリ**（SY08 QRカード管理 / SY09 端末管理）で行う。

## 認証の仕組み

独立した 2 つの信頼（Cookie は生トークン、DB は SHA-256 のみ）:

| Cookie | 意味 | 期限 |
|---|---|---|
| `kiosk_device` | この端末は信頼済みキオスク（`kiosk_devices` ACTIVE 行） | 30日 |
| `kiosk_session` | この人がサインイン中（`kiosk_sessions` → `app.users`） | 8h ハード + 5分アイドル |

- **端末登録（profile-first）**: 管理者が SY09 で**端末プロファイル**を作成
  （オープン = リンク待ち）。タブレットの `/setup` が**リンクコード
  （12桁・10分）を QR + テキストで表示**し、管理者が SY09 の「端末をリンク」で
  スキャン or 入力 — **オープンなプロファイルにのみ**リンクできる。
  管理者は**リンク済みプロファイルのみ有効化**でき、有効化で端末の
  ポーリングが 30日トークンを受け取る。**リンク解除**（SY09）で
  トークン・セッション・アテステーション鍵を破棄してプロファイルを
  オープンに戻せる（端末交換・再リンク用。名前/拠点/マップピンは維持）。
- **ログイン**: `/login` で QR スキャン → `POST /api/qr/access`。
  PIN は必須（初回スキャンで設定）。**3日以内に使用があればスキャンのみ**、
  空くと PIN 再入力。5回失敗で 15分ロック。
- **アイドル**: 操作イベント → 30s スロットルで `POST /api/kiosk/activity`。
  残り 3分でカウントダウン表示 → 0 で自動ログアウト。

## WebSocket（端末プレゼンス）

`/api/kiosk/ws`（カスタムサーバー `src/server.ts` が upgrade を処理）:

- **device** クライアント: 端末（`kiosk_device` Cookie で認証）。接続中 =
  オンライン。未接続でも直近 5分の活動があればオンライン扱い。
- **monitor** クライアント: nextjs-web 管理 UI。`KIOSK_WS_SECRET` の HMAC
  短命トークン（`?token=`）で認証。接続時 snapshot、以後 device_status を受信。

Next のルートからは `src/lib/ws-bridge.ts`（globalThis 経由）で通知する。

## 開発

```bash
pnpm install --frozen-lockfile
pnpm db:sync-schema && pnpm db:generate   # shared-db スキーマ同期
pnpm dev                                   # UI 開発（WS なしでも動く）
pnpm build:server && NODE_ENV=development node dist/src/server.js  # WS 込み
pnpm test / pnpm lint
```

カメラ（getUserMedia）は `http://localhost` では TLS 不要。実端末での確認は
デプロイ後に `https://ckk-kiosk-dev.kai-lab.net`（LAN TLS 済み）で行う。

## 工程実行アプリ（`/steps`）

現場作業者向けの業務アプリ。できることは意図的に 4 つだけ —
**自分の担当工程を見る / 開始 / 一時停止・再開 / 完了**。
検査記録・不良記録・分岐追加・中断（PENDING へ戻す）・巻き戻しは
nextjs-web の管理画面に残す。

- **割り当て** = `app.work_order_step_plans.user_id`（担当者）。一覧はそこに
  「自分がロック保持中」「自分が作業した進行中の工程」を足した和集合を出す
  （計画行だけだと昨日始めて終わっていない工程が迷子になるため）。
- **一時停止はステータスではない。** `STEP_STATUS` に `PAUSED` は足さず、
  ロック解放（`session_locked_by → NULL`）+ 作業実績行を閉じることで表現する。
  ⇒ 一時停止中 = `IN_PROGRESS AND session_locked_by IS NULL`。再開は
  ロックを取り直して新しい `work_order_step_actuals` 行を開く（1 作業セッション
  = 1 行 ⇒ 休憩を挟んだ累計作業時間がそのまま出る）。この設計により
  nextjs-web 側のロジック（`isWorkOrderComplete` / `computeWipByStep` /
  巻き戻しガード / 実績・検査記録の `IN_PROGRESS` ガード）を一切変更していない。
- **数量**は工程マスタの `quantity_tracking` に従う。`NONE` は数量を聞かず
  パススルー、`FLOW` は 受入/良品/不良、`INSPECTION` は同じ数式でラベルだけ
  検査数/合格/不合格。
- **書き込みは全てキオスク内で完結**（`src/lib/step-execution.ts` +
  `POST /api/kiosk/steps/[stepId]`）。nextjs-web の内部 API は叩かない。
  門は 4 段: セッション → `authz.hasPermission("work_order","UPDATE")` →
  行レベルの割り当て（`canOperateStep`: 自分の計画 / 自分のロック /
  **未計画** — 下記 指示書スキャン の運用判断）→ 業務ルール。

## 指示書スキャンアプリ（`/wo-scan`）

紙の指示書の QR（統一フォーマット `CKK:WO:<指示書番号>` — 指示書の帳票・
検査表 PDF に印字済み、`qr-payload.ts`）をスキャンして、その指示書の
**全工程**を工程順で見る・進める画面。QR が読めない紙のフォールバックとして
番号の手入力欄もある。工程をタップすると工程実行と同じ実行画面
（`/steps/[stepId]?from=wo` — 戻り先が指示書ビューになる）へ進む。

- **行レベルゲートの拡張（運用判断）**: 未計画の工程（`work_order_step_plans`
  が 1 行も無い工程）は `work_order` 権限保持者に開放する — 紙の指示書を持つ
  作業者が計画なしのアドホック作業を進められるようにするため。**誰かに計画
  された工程はその担当者だけ**が操作できる（従来どおり）。この規則は表示
  （`steps.ts getMyStep` / `getWorkOrderOverview`）と書き込み
  （`step-execution.ts canOperateStep`）で同一。
- スキャン自体は認可要素ではない（QR の中身は連番で推測可能）— 認可は常に
  セッション + RBAC + 行レベルゲートで判定する。

### twin file（逐語コピー）

最終工程の完了は在庫を動かすため、業務ルールは nextjs-web から**逐語コピー**
して持っている。ドリフトすると在庫の二重計上・素材消費の欠落に直結するので、
`src/lib/twin-files.test.ts` が 1 バイトの差でも落ちる門番になっている。

| コピー | 原本 |
|---|---|
| `src/lib/workflow-core.ts`（+ `.test.ts`） | `nextjs-web/src/lib/workflow-core.ts` |
| `src/lib/inventory.ts` | `nextjs-web/src/lib/inventory.ts` |

原本を変更したら `pnpm twin:sync` で同期し直し、両側をレビューすること。
（`src/lib/audit.ts` はコピーではなく、同じエクスポート形でキオスクの actor を
返す実装。`runWithActor()` でリクエストごとに actor を束ねる。）

### 前提: 現場作業者のロール

`shared-db/sql/roles-seed.sql` で `work_order` を持つのは `production` /
`quality` / `*_manager` のみ。現場作業者には `work_order` の READ + UPDATE を
持つロールを用意して割り当てないと、ランチャーにアプリが出ない。

## E2E スモーク（手動チェックリスト）

1. 管理者: SY09 で端末プロファイル作成（名前・拠点）→ 「リンク待ち」
2. タブレット: `/setup` にリンクコード + QR 表示 / 管理者: SY09 の
   「端末をリンク」でスキャン or 入力（オープンなプロファイルのみ選択可）→
   タブレットが「有効化待ち」へ / 管理者: LINKED の行だけに出る「有効化」→
   タブレットが `/login` へ（リンク解除 → プロファイルがオープンに戻り、
   タブレットは新しいコードを再表示することも確認）
3. 管理者: SY08 でカード発行 → ユーザー割当 → 印刷
4. 初回スキャン → PIN 設定 → ランチャー表示
5. ログアウト → 再スキャン → PIN なしで即ログイン
6. `UPDATE app.kiosk_cards SET last_used_at = now() - interval '4 days' ...` → スキャン → PIN 要求
7. PIN 5回失敗 → 15分ロック → SY08 でロック解除
8. 5分放置 → 自動ログアウト
9. SY09 で端末取り消し → タブレットが `/device-error`
10. SY09 の端末一覧・フロアマップでオンライン表示が数秒で追従（WS）

### 工程実行

11. nextjs-web: 承認済み指示書の工程に、テストユーザーを担当者とする**作業計画**
    を追加（工程詳細 → 計画/実績）→ タブレットのランチャーに「工程実行」が出る
12. `/steps` に該当工程が「開始可」で並ぶ（前工程未完了なら「前工程待ち」）
13. 受入数を確認して**開始** → `work_order_steps` が `IN_PROGRESS` +
    `session_locked_by` = 自分、`work_order_step_actuals` に開始行が 1 行できる
14. **一時停止** → `session_locked_by` が NULL、実績行の `ended_at` が埋まる。
    一覧では「一時停止中」表示
15. **別のタブレット / 別ユーザーで再開** → ロックが移り、実績行がもう 1 行増える
    （累計作業時間 = 2 行の合算で、休憩時間は含まれないこと）
16. `FLOW` 工程を**完了** — 良品 + 不良合計 ≠ 受入数 のときは完了ボタンが
    押せないこと。`INSPECTION` 工程はラベルが 検査数/合格/不合格 になること。
    `quantity_tracking = NONE` の工程は数量を聞かれず即完了できること
17. **最終工程をキオスクから完了** → 指示書が `COMPLETED` になり、
    `inventory_transactions` に完成品入庫が**ちょうど 1 件**（二重計上なし）。
    半製品を出した場合は半製品入庫も、素材予約は RELEASE + OUT されること
    ⚠ ここが唯一実在庫を動かす経路 — リリース前に必ず確認する
18. 他人の工程 URL を直叩き → 404（割り当てゲート）。`work_order` 権限の無い
    ユーザーではランチャーにアプリが出ず、`/steps` は `/` へリダイレクト
19. **検査記録**: 検査工程（`is_inspection`）を開始 → 実行画面に指示書の
    検査表テンプレートが出る。必須項目の実測値が空だと保存できないこと。
    1 項目でも「不合格」で保存 → 記録一覧に FAIL、全合格なら PASS。
    保存後 nextjs-web の工程実行画面にも同じ記録が見えること（承認は web のみ）
20. **不良記録**: 任意の工程で作業中に「不良を記録」→ 種類 + 内容で保存 →
    記録一覧に出る。内容が空の行は保存対象にならないこと。
    完了済みの工程では記録フォームが出ない（既存記録の表示のみ）

### 指示書スキャン

21. ランチャーに「指示書スキャン」が出る（`work_order` READ 保持者のみ）→
    指示書帳票の QR をスキャン → その指示書の全工程が工程順で並ぶ。
    カード QR など指示書以外の QR は警告音 + 「指示書の QR コードではありません」
22. 番号の手入力でも同じ画面が開く。存在しない番号は「見つかりません」+
    再スキャン導線（404 にしない）
23. **未計画の工程**（作業計画なし）が「開始可」で開ける — 開始 → 完了まで
    工程実行と同じ動作。**他人に計画された工程**は「他の担当者の工程です」で
    開けず、URL 直叩き（`/steps/[stepId]`）も 404、API 直叩きも 403
24. 実行画面の戻るボタンが「指示書へ」になり、完了後も指示書ビューへ戻る。
    下書き/承認待ち/完了/キャンセルの指示書では警告が出て工程を開けない

## デプロイ

Coolify（`nextjs-kiosk-dev` :3006 / `nextjs-kiosk-main` :3007、
`docker-compose/coolify/README.md`）。公開: `ckk-kiosk-dev.kai-lab.net` /
`ckk-kiosk.kai-lab.net`（cloudflared + nginx-proxy、WS upgrade 対応）。

`public/apk/` は Android ラッパー APK（+ `version.json`）の公開配布パス。
`/apk/*` は proxy のリダイレクト対象外（未登録タブレットが Cookie なしで
ダウンロードする）。更新は `android-kiosk/tools/release-apk.sh` →
コミット → デプロイ（`android-kiosk/README.md`「配布」参照）。
