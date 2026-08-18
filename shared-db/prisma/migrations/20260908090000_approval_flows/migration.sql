-- 承認フロー定義 + 依頼スナップショット + 期間限定メンバー
--
-- 背景: 承認は 2 段固定でハードコードされていた。approval_groups.type
-- （FIRST / SECOND / WORKFLOW_CHANGE）がグループの識別子であると同時に
-- 承認のルーティングキーになっていて、段数を業務側で変えられなかった。
--
-- これ以後、ルーティングキーは approval_flow_steps.group_id に一本化する。
-- どの書類種別が何段の承認を通るかは承認設定（MS0B）で編集する。
--
-- ★ 追加のみ・削除なし ★
--   approval_groups.type / approval_requests.step / APPROVAL_GROUP_TYPE /
--   APPROVAL_STEP は残したまま。全呼び出し側の移行後に別マイグレーション
--   （20260910090000_approval_legacy_cleanup）で落とす。
--   本マイグレーションは既存の挙動をそのままフロー定義として seed するので、
--   適用直後の承認の振る舞いは変わらない。

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. 承認モード + フロー定義テーブル
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TYPE "app"."APPROVAL_MODE" AS ENUM ('ANY', 'ALL');

CREATE TABLE "app"."approval_flows" (
  "target_type" TEXT NOT NULL,
  "updated_by"  UUID,
  "updated_at"  TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

  CONSTRAINT "approval_flows_pkey" PRIMARY KEY ("target_type"),
  CONSTRAINT "approval_flows_target_type_check" CHECK ("target_type" IN (
    'work_orders', 'order_acceptances', 'material_purchase_orders', 'purchase_requests'
  ))
);

ALTER TABLE "app"."approval_flows"
  ADD CONSTRAINT "approval_flows_updated_by_fkey"
  FOREIGN KEY ("updated_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "app"."approval_flow_steps" (
  "id"          SERIAL NOT NULL,
  "target_type" TEXT NOT NULL,
  "step_no"     INTEGER NOT NULL,
  "name"        JSONB NOT NULL,
  "group_id"    INTEGER NOT NULL,
  "mode"        "app"."APPROVAL_MODE" NOT NULL DEFAULT 'ANY',

  CONSTRAINT "approval_flow_steps_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "approval_flow_steps_step_no_check" CHECK ("step_no" >= 1)
);

CREATE UNIQUE INDEX "approval_flow_steps_target_type_step_no_key"
  ON "app"."approval_flow_steps" ("target_type", "step_no");
CREATE INDEX "approval_flow_steps_group_id_idx"
  ON "app"."approval_flow_steps" ("group_id");

ALTER TABLE "app"."approval_flow_steps"
  ADD CONSTRAINT "approval_flow_steps_target_type_fkey"
  FOREIGN KEY ("target_type") REFERENCES "app"."approval_flows"("target_type") ON DELETE CASCADE ON UPDATE CASCADE;

-- Restrict: フローで使用中のグループは削除できない（アプリ側で日本語メッセージに変換）
ALTER TABLE "app"."approval_flow_steps"
  ADD CONSTRAINT "approval_flow_steps_group_id_fkey"
  FOREIGN KEY ("group_id") REFERENCES "app"."approval_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. 今の挙動をそのままフロー定義として seed
--    指示書 = 第一承認 → 第二承認 / 他 3 種別 = 第一承認のみ（すべて ANY）
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_first  int;
  v_second int;
  v_dupes  int;
BEGIN
  SELECT id INTO v_first  FROM app.approval_groups WHERE type = 'FIRST'  AND is_active ORDER BY id LIMIT 1;
  SELECT id INTO v_second FROM app.approval_groups WHERE type = 'SECOND' AND is_active ORDER BY id LIMIT 1;

  -- 同 type のグループが複数あると、採用されなかった側のメンバーは承認権を失う。
  -- 自動では決められないので監査ログに警告を残し、人が突き合わせる。
  SELECT count(*) INTO v_dupes
  FROM (
    SELECT type FROM app.approval_groups WHERE type IN ('FIRST','SECOND') AND is_active
    GROUP BY type HAVING count(*) > 1
  ) d;
  IF v_dupes > 0 THEN
    INSERT INTO app.audit_logs (user_id, action, table_name, record_id, after_data, created_at)
    VALUES (NULL, 'UPDATE', 'approval_flows', 'migration',
            jsonb_build_object('note',
              '承認フロー移行: 同一 type の有効な承認グループが複数見つかりました。'
              '各書類のフロー（承認設定 MS0B）で使用するグループを確認してください。'),
            now());
  END IF;

  -- 有効なグループが 1 つも無い環境でも壊れないように作る
  IF v_first IS NULL THEN
    INSERT INTO app.approval_groups (type, name, is_active)
    VALUES ('FIRST', jsonb_build_object('ja', '第一承認グループ', 'en', 'First approval group'), true)
    RETURNING id INTO v_first;
  END IF;
  IF v_second IS NULL THEN
    INSERT INTO app.approval_groups (type, name, is_active)
    VALUES ('SECOND', jsonb_build_object('ja', '第二承認グループ', 'en', 'Second approval group'), true)
    RETURNING id INTO v_second;
  END IF;

  INSERT INTO app.approval_flows (target_type, updated_at)
  VALUES ('work_orders', now()), ('order_acceptances', now()),
         ('material_purchase_orders', now()), ('purchase_requests', now())
  ON CONFLICT (target_type) DO NOTHING;

  INSERT INTO app.approval_flow_steps (target_type, step_no, name, group_id, mode) VALUES
    ('work_orders',              1, jsonb_build_object('ja', '第一承認', 'en', 'First approval'),  v_first,  'ANY'),
    ('work_orders',              2, jsonb_build_object('ja', '第二承認', 'en', 'Second approval'), v_second, 'ANY'),
    ('order_acceptances',        1, jsonb_build_object('ja', '第一承認', 'en', 'First approval'),  v_first,  'ANY'),
    ('material_purchase_orders', 1, jsonb_build_object('ja', '第一承認', 'en', 'First approval'),  v_first,  'ANY'),
    ('purchase_requests',        1, jsonb_build_object('ja', '第一承認', 'en', 'First approval'),  v_first,  'ANY')
  ON CONFLICT (target_type, step_no) DO NOTHING;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. 期間限定メンバー
--    常任 = 両方 NULL / 期間限定 = 両方に日時。片側だけは禁止。
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "app"."approval_group_members"
  ADD COLUMN "valid_from"  TIMESTAMPTZ(6),
  ADD COLUMN "valid_until" TIMESTAMPTZ(6),
  ADD COLUMN "note"        TEXT;

ALTER TABLE "app"."approval_group_members"
  ADD CONSTRAINT "approval_group_members_validity_check" CHECK (
    ("valid_from" IS NULL) = ("valid_until" IS NULL)
    AND ("valid_until" IS NULL OR "valid_until" > "valid_from")
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. 依頼行にスナップショット列を足して既存行を backfill
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "app"."approval_requests"
  ADD COLUMN "step_no"       INTEGER,
  ADD COLUMN "step_count"    INTEGER,
  ADD COLUMN "group_id"      INTEGER,
  ADD COLUMN "mode"          "app"."APPROVAL_MODE" NOT NULL DEFAULT 'ANY',
  ADD COLUMN "flow_snapshot" JSONB;

-- 旧 step は NOT NULL だった。新規行は step_no を使うので NULL 可にする。
ALTER TABLE "app"."approval_requests" ALTER COLUMN "step" DROP NOT NULL;

UPDATE "app"."approval_requests" r
SET "step_no"    = CASE r."step"::text WHEN 'FIRST' THEN 1 ELSE 2 END,
    "step_count" = CASE r."target_type" WHEN 'work_orders' THEN 2 ELSE 1 END
WHERE r."step_no" IS NULL;

UPDATE "app"."approval_requests" r
SET "group_id" = s."group_id"
FROM "app"."approval_flow_steps" s
WHERE s."target_type" = r."target_type" AND s."step_no" = r."step_no"
  AND r."group_id" IS NULL;

UPDATE "app"."approval_requests" r
SET "flow_snapshot" = snap.steps
FROM (
  SELECT s."target_type",
         jsonb_agg(
           jsonb_build_object(
             'stepNo',    s."step_no",
             'name',      s."name",
             'groupId',   s."group_id",
             'groupName', g."name",
             'mode',      s."mode"::text
           ) ORDER BY s."step_no"
         ) AS steps
  FROM "app"."approval_flow_steps" s
  JOIN "app"."approval_groups" g ON g."id" = s."group_id"
  GROUP BY s."target_type"
) snap
WHERE snap."target_type" = r."target_type" AND r."flow_snapshot" IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. 進行中の書類ぶんの依頼行を backfill
--    旧実装は依頼行が無い書類を行ワークフロー列から合成して PD03 に出していた
--    （legacy backfill）。ここで実体を作ることでその分岐を消せる。
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO "app"."approval_requests"
  ("target_type", "target_id", "step_no", "step_count", "group_id", "mode", "flow_snapshot",
   "status", "requested_by", "requested_at")
SELECT 'work_orders', w."work_order_number"::text,
       CASE w."approval_status"::text WHEN 'PENDING_2ND' THEN 2 WHEN 'APPROVED_1ST' THEN 2 ELSE 1 END,
       2,
       (SELECT s."group_id" FROM "app"."approval_flow_steps" s
         WHERE s."target_type" = 'work_orders'
           AND s."step_no" = CASE w."approval_status"::text WHEN 'PENDING_2ND' THEN 2 WHEN 'APPROVED_1ST' THEN 2 ELSE 1 END),
       'ANY',
       (SELECT jsonb_agg(jsonb_build_object('stepNo', s."step_no", 'name', s."name",
                                            'groupId', s."group_id", 'groupName', g."name",
                                            'mode', s."mode"::text) ORDER BY s."step_no")
          FROM "app"."approval_flow_steps" s
          JOIN "app"."approval_groups" g ON g."id" = s."group_id"
         WHERE s."target_type" = 'work_orders'),
       'PENDING', w."requested_1st_by", COALESCE(w."requested_1st_at", now())
FROM "app"."work_orders" w
WHERE w."approval_status"::text IN ('PENDING_1ST', 'APPROVED_1ST', 'PENDING_2ND')
  AND NOT EXISTS (
    SELECT 1 FROM "app"."approval_requests" r
     WHERE r."target_type" = 'work_orders' AND r."target_id" = w."work_order_number"::text
       AND r."status" = 'PENDING');

INSERT INTO "app"."approval_requests"
  ("target_type", "target_id", "step_no", "step_count", "group_id", "mode", "flow_snapshot",
   "status", "requested_by", "requested_at")
SELECT 'material_purchase_orders', p."po_number", 1, 1,
       (SELECT s."group_id" FROM "app"."approval_flow_steps" s
         WHERE s."target_type" = 'material_purchase_orders' AND s."step_no" = 1),
       'ANY',
       (SELECT jsonb_agg(jsonb_build_object('stepNo', s."step_no", 'name', s."name",
                                            'groupId', s."group_id", 'groupName', g."name",
                                            'mode', s."mode"::text) ORDER BY s."step_no")
          FROM "app"."approval_flow_steps" s
          JOIN "app"."approval_groups" g ON g."id" = s."group_id"
         WHERE s."target_type" = 'material_purchase_orders'),
       'PENDING', p."requested_by", COALESCE(p."requested_at", now())
FROM "app"."material_purchase_orders" p
WHERE p."status"::text = 'REQUESTED'
  AND NOT EXISTS (
    SELECT 1 FROM "app"."approval_requests" r
     WHERE r."target_type" = 'material_purchase_orders' AND r."target_id" = p."po_number"
       AND r."status" = 'PENDING');

INSERT INTO "app"."approval_requests"
  ("target_type", "target_id", "step_no", "step_count", "group_id", "mode", "flow_snapshot",
   "status", "requested_by", "requested_at")
SELECT 'purchase_requests', q."request_number", 1, 1,
       (SELECT s."group_id" FROM "app"."approval_flow_steps" s
         WHERE s."target_type" = 'purchase_requests' AND s."step_no" = 1),
       'ANY',
       (SELECT jsonb_agg(jsonb_build_object('stepNo', s."step_no", 'name', s."name",
                                            'groupId', s."group_id", 'groupName', g."name",
                                            'mode', s."mode"::text) ORDER BY s."step_no")
          FROM "app"."approval_flow_steps" s
          JOIN "app"."approval_groups" g ON g."id" = s."group_id"
         WHERE s."target_type" = 'purchase_requests'),
       'PENDING', q."requested_by", COALESCE(q."requested_at", now())
FROM "app"."purchase_requests" q
WHERE q."status"::text = 'REQUESTED'
  AND NOT EXISTS (
    SELECT 1 FROM "app"."approval_requests" r
     WHERE r."target_type" = 'purchase_requests' AND r."target_id" = q."request_number"
       AND r."status" = 'PENDING');

INSERT INTO "app"."approval_requests"
  ("target_type", "target_id", "step_no", "step_count", "group_id", "mode", "flow_snapshot",
   "status", "requested_by", "requested_at")
SELECT 'order_acceptances',
       'ORD-' || a."year_month" || '-' || lpad(a."seq"::text, 5, '0'), 1, 1,
       (SELECT s."group_id" FROM "app"."approval_flow_steps" s
         WHERE s."target_type" = 'order_acceptances' AND s."step_no" = 1),
       'ANY',
       (SELECT jsonb_agg(jsonb_build_object('stepNo', s."step_no", 'name', s."name",
                                            'groupId', s."group_id", 'groupName', g."name",
                                            'mode', s."mode"::text) ORDER BY s."step_no")
          FROM "app"."approval_flow_steps" s
          JOIN "app"."approval_groups" g ON g."id" = s."group_id"
         WHERE s."target_type" = 'order_acceptances'),
       'PENDING', a."created_by", now()
FROM "app"."order_acceptances" a
WHERE a."status"::text = 'REQUESTED'
  AND NOT EXISTS (
    SELECT 1 FROM "app"."approval_requests" r
     WHERE r."target_type" = 'order_acceptances'
       AND r."target_id" = 'ORD-' || a."year_month" || '-' || lpad(a."seq"::text, 5, '0')
       AND r."status" = 'PENDING');

-- 全行が埋まったので NOT NULL 化 + FK
ALTER TABLE "app"."approval_requests"
  ALTER COLUMN "step_no"       SET NOT NULL,
  ALTER COLUMN "step_count"    SET NOT NULL,
  ALTER COLUMN "flow_snapshot" SET NOT NULL;

ALTER TABLE "app"."approval_requests"
  ADD CONSTRAINT "approval_requests_group_id_fkey"
  FOREIGN KEY ("group_id") REFERENCES "app"."approval_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. 承認枠（依頼時点で「この段で承認しうる人」）
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE "app"."approval_request_approvers" (
  "approval_request_id" UUID NOT NULL,
  "user_id"             UUID NOT NULL,
  "acted_at"            TIMESTAMPTZ(6),
  "acted_by"            UUID,

  CONSTRAINT "approval_request_approvers_pkey" PRIMARY KEY ("approval_request_id", "user_id")
);

ALTER TABLE "app"."approval_request_approvers"
  ADD CONSTRAINT "approval_request_approvers_approval_request_id_fkey"
  FOREIGN KEY ("approval_request_id") REFERENCES "app"."approval_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app"."approval_request_approvers"
  ADD CONSTRAINT "approval_request_approvers_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "app"."approval_request_approvers"
  ADD CONSTRAINT "approval_request_approvers_acted_by_fkey"
  FOREIGN KEY ("acted_by") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 進行中の依頼に、そのグループの実効メンバーを枠として張る
INSERT INTO "app"."approval_request_approvers" ("approval_request_id", "user_id")
SELECT r."id", m."user_id"
FROM "app"."approval_requests" r
JOIN "app"."approval_group_members" m ON m."group_id" = r."group_id"
JOIN "app"."approval_groups" g ON g."id" = m."group_id"
WHERE r."status" = 'PENDING'
  AND m."is_active" AND g."is_active"
  AND (m."valid_from"  IS NULL OR m."valid_from"  <= now())
  AND (m."valid_until" IS NULL OR m."valid_until" >= now())
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. 部分 unique index の張り替え
--    段は直列なので「1 書類につき PENDING は 1 行」を構造で保証する。
--    段 N を閉じるのと段 N+1 を作るのは同一トランザクション。
-- ─────────────────────────────────────────────────────────────────────────────
DROP INDEX IF EXISTS "app"."approval_requests_pending_unique";
CREATE UNIQUE INDEX "approval_requests_pending_unique"
  ON "app"."approval_requests" ("target_type", "target_id")
  WHERE "status" = 'PENDING';
