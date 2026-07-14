-- CreateEnum
CREATE TYPE "app"."PROCESS_CATEGORY" AS ENUM ('MATERIAL_PREP', 'MACHINING', 'COATING', 'INSPECTION', 'APPROVAL', 'SHIPPING');
-- CreateEnum
CREATE TYPE "app"."PROCESS_EXECUTION" AS ENUM ('INTERNAL', 'INTERNAL_OR_OUTSOURCE');
-- CreateEnum
CREATE TYPE "app"."DEPENDENCY_RELATION" AS ENUM ('AND', 'OR');
-- CreateEnum
CREATE TYPE "app"."APPROVAL_GROUP_TYPE" AS ENUM ('FIRST', 'SECOND', 'WORKFLOW_CHANGE');
-- CreateTable
CREATE TABLE "app"."factories" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "name_kana" TEXT,
    "country_code" VARCHAR(2),
    "postal_code" TEXT,
    "address" JSONB,
    "phone" TEXT,
    "email" TEXT,
    "contact_person" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "factories_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "app"."process_step_catalog" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "category" "app"."PROCESS_CATEGORY" NOT NULL,
    "execution_location" "app"."PROCESS_EXECUTION" NOT NULL,
    "is_sync_capable" BOOLEAN NOT NULL DEFAULT false,
    "is_inspection" BOOLEAN NOT NULL DEFAULT false,
    "is_approval_step" BOOLEAN NOT NULL DEFAULT false,
    "approval_min_rank" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    CONSTRAINT "process_step_catalog_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "app"."process_step_use_dependencies" (
    "step_id" INTEGER NOT NULL,
    "depends_on_step_id" INTEGER NOT NULL,
    "relation" "app"."DEPENDENCY_RELATION" NOT NULL DEFAULT 'AND',
    "is_negation" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    CONSTRAINT "process_step_use_dependencies_pkey" PRIMARY KEY ("step_id","depends_on_step_id")
);
-- CreateTable
CREATE TABLE "app"."process_step_exec_dependencies" (
    "step_id" INTEGER NOT NULL,
    "depends_on_step_id" INTEGER NOT NULL,
    "relation" "app"."DEPENDENCY_RELATION" NOT NULL DEFAULT 'AND',
    "notes" TEXT,
    CONSTRAINT "process_step_exec_dependencies_pkey" PRIMARY KEY ("step_id","depends_on_step_id")
);
-- CreateTable
CREATE TABLE "app"."inspection_templates" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "related_process_step_id" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "inspection_templates_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "app"."inspection_template_items" (
    "id" SERIAL NOT NULL,
    "template_id" INTEGER NOT NULL,
    "item_name" JSONB NOT NULL,
    "unit" TEXT,
    "tolerance_min" DECIMAL(12,4),
    "tolerance_max" DECIMAL(12,4),
    "is_required" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "inspection_template_items_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "app"."defect_types" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "defect_types_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "app"."approval_groups" (
    "id" SERIAL NOT NULL,
    "type" "app"."APPROVAL_GROUP_TYPE" NOT NULL,
    "name" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "approval_groups_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "app"."approval_group_members" (
    "group_id" INTEGER NOT NULL,
    "user_id" UUID NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "approval_group_members_pkey" PRIMARY KEY ("group_id","user_id")
);
-- CreateIndex
CREATE UNIQUE INDEX "factories_code_key" ON "app"."factories"("code");
-- CreateIndex
CREATE UNIQUE INDEX "process_step_catalog_code_key" ON "app"."process_step_catalog"("code");
-- CreateIndex
CREATE UNIQUE INDEX "inspection_templates_code_key" ON "app"."inspection_templates"("code");
-- CreateIndex
CREATE INDEX "inspection_template_items_template_id_sort_order_idx" ON "app"."inspection_template_items"("template_id", "sort_order");
-- CreateIndex
CREATE UNIQUE INDEX "defect_types_code_key" ON "app"."defect_types"("code");
-- AddForeignKey
ALTER TABLE "app"."process_step_use_dependencies" ADD CONSTRAINT "process_step_use_dependencies_step_id_fkey" FOREIGN KEY ("step_id") REFERENCES "app"."process_step_catalog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "app"."process_step_use_dependencies" ADD CONSTRAINT "process_step_use_dependencies_depends_on_step_id_fkey" FOREIGN KEY ("depends_on_step_id") REFERENCES "app"."process_step_catalog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "app"."process_step_exec_dependencies" ADD CONSTRAINT "process_step_exec_dependencies_step_id_fkey" FOREIGN KEY ("step_id") REFERENCES "app"."process_step_catalog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "app"."process_step_exec_dependencies" ADD CONSTRAINT "process_step_exec_dependencies_depends_on_step_id_fkey" FOREIGN KEY ("depends_on_step_id") REFERENCES "app"."process_step_catalog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "app"."inspection_templates" ADD CONSTRAINT "inspection_templates_related_process_step_id_fkey" FOREIGN KEY ("related_process_step_id") REFERENCES "app"."process_step_catalog"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "app"."inspection_template_items" ADD CONSTRAINT "inspection_template_items_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "app"."inspection_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "app"."approval_group_members" ADD CONSTRAINT "approval_group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "app"."approval_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "app"."approval_group_members" ADD CONSTRAINT "approval_group_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================================
-- Seed: CKK 実工程カタログ（_docs/manufacturing_details.md）+ 不良種類 + 工場。
-- 冪等（ON CONFLICT DO NOTHING）。マスタは migration 内で投入する
-- （精度: 20260707000000_material_numbering_masters の前例に従う）。
--
-- 依存の表現規約:
--   - OR エッジ群 = 1 グループ「いずれか存在/完了」
--   - AND エッジ = すべて存在/完了
--   - is_negation = 排他（! 溝 vs 刃裏）
--   - 素材属性由来の条件（素材が研磨・定尺 等）はエッジにせず、依存先工程が
--     ワークフローに無ければ空真として扱う（エンジン側規約）
-- ============================================================================

INSERT INTO "app"."process_step_catalog"
  ("code", "name", "category", "execution_location", "is_sync_capable", "is_inspection", "is_approval_step", "approval_min_rank", "sort_order", "notes")
VALUES
  ('MATERIAL_ISSUE',                  '{"ja":"素材出し（在庫）","en":"Material issue (stock)"}',                'MATERIAL_PREP', 'INTERNAL',              false, false, false, NULL,   10, '在庫の移動'),
  ('SEMI_FINISHED_ISSUE',             '{"ja":"半製品出し（在庫）","en":"Semi-finished issue (stock)"}',         'MATERIAL_PREP', 'INTERNAL',              false, false, false, NULL,   20, '在庫の移動。半製品にリブ母材を含む'),
  ('MATERIAL_HANDOFF',                '{"ja":"素材受渡し（受注先）","en":"Material handoff (customer)"}',        'MATERIAL_PREP', 'INTERNAL',              false, false, false, NULL,   30, NULL),
  ('PRODUCT_HANDOFF',                 '{"ja":"製品受渡し（受注先）","en":"Product handoff (customer)"}',         'MATERIAL_PREP', 'INTERNAL',              false, false, false, NULL,   40, NULL),
  ('CUTTING',                         '{"ja":"切断","en":"Cutting"}',                                            'MATERIAL_PREP', 'INTERNAL',              false, false, false, NULL,   50, '複数回あり'),
  ('CENTERLESS',                      '{"ja":"センタレス","en":"Centerless grinding"}',                          'MATERIAL_PREP', 'INTERNAL_OR_OUTSOURCE', false, false, false, NULL,   60, '外注時：依頼日・入荷予定日・入荷日を管理'),
  ('CYLINDER_MACHINING',              '{"ja":"円筒加工","en":"Cylindrical machining"}',                          'MACHINING',     'INTERNAL',              false, false, false, NULL,   70, NULL),
  ('CYLINDER_INSPECTION',             '{"ja":"円筒加工検査","en":"Cylindrical machining inspection"}',           'INSPECTION',    'INTERNAL',              false, true,  false, NULL,   80, '検査表の完成確認（製作）'),
  ('CYLINDER_INSPECTION_APPROVAL',    '{"ja":"円筒加工検査承認","en":"Cylindrical inspection approval"}',        'APPROVAL',      'INTERNAL',              false, false, true,  '係長', 90, '係長以上が承認'),
  ('LENGTH_ADJUST',                   '{"ja":"全長合わせ","en":"Length adjustment"}',                            'MATERIAL_PREP', 'INTERNAL',              false, false, false, NULL,  100, '素材が研磨の場合は前工程不要（空真）'),
  ('CHAMFER',                         '{"ja":"C面","en":"Chamfer"}',                                             'MATERIAL_PREP', 'INTERNAL',              false, false, false, NULL,  110, '角取り'),
  ('MARKING',                         '{"ja":"マーキング","en":"Marking"}',                                      'MACHINING',     'INTERNAL',              false, false, false, NULL,  120, NULL),
  ('STEP_MACHINING',                  '{"ja":"段加工","en":"Step machining"}',                                   'MACHINING',     'INTERNAL',              true,  false, false, NULL,  130, '他工程と同時実施・同時記録可'),
  ('STEP_INSPECTION',                 '{"ja":"段加工検査","en":"Step machining inspection"}',                    'INSPECTION',    'INTERNAL',              false, true,  false, NULL,  140, '検査表の完成確認（段加工）'),
  ('STEP_INSPECTION_APPROVAL',        '{"ja":"段加工検査承認","en":"Step inspection approval"}',                 'APPROVAL',      'INTERNAL',              false, false, true,  '係長', 150, '係長以上が承認'),
  ('TANG',                            '{"ja":"タング","en":"Tang"}',                                             'MACHINING',     'INTERNAL',              false, false, false, NULL,  160, NULL),
  ('OIL_GROOVE',                      '{"ja":"油溝","en":"Oil groove"}',                                         'MACHINING',     'INTERNAL',              false, false, false, NULL,  170, NULL),
  ('FLUTE',                           '{"ja":"溝（製作）","en":"Flute (fabrication)"}',                          'MACHINING',     'INTERNAL',              true,  false, false, NULL,  180, '他工程と同時実施・同時記録可。刃裏と排他'),
  ('BLADE_BACK',                      '{"ja":"刃裏（製作）","en":"Blade back (fabrication)"}',                   'MACHINING',     'INTERNAL',              true,  false, false, NULL,  190, '他工程と同時実施・同時記録可。溝と排他'),
  ('OD_FAB',                          '{"ja":"外周（製作）","en":"OD (fabrication)"}',                           'MACHINING',     'INTERNAL',              true,  false, false, NULL,  200, '他工程と同時実施・同時記録可'),
  ('TIP_FAB',                         '{"ja":"先端（製作）","en":"Tip (fabrication)"}',                          'MACHINING',     'INTERNAL',              true,  false, false, NULL,  210, '他工程と同時実施・同時記録可'),
  ('HONING',                          '{"ja":"ホーニング","en":"Honing"}',                                       'MACHINING',     'INTERNAL',              false, false, false, NULL,  220, '製作検査の前後いずれかで実施'),
  ('FAB_INSPECTION',                  '{"ja":"製作検査","en":"Fabrication inspection"}',                         'INSPECTION',    'INTERNAL',              false, true,  false, NULL,  230, '検査表の完成確認（製作）'),
  ('FAB_INSPECTION_APPROVAL',         '{"ja":"製作検査承認","en":"Fabrication inspection approval"}',            'APPROVAL',      'INTERNAL',              false, false, true,  '係長', 240, '係長以上が承認'),
  ('POST_CUTTING',                    '{"ja":"切断（後加工）","en":"Cutting (post-process)"}',                   'MACHINING',     'INTERNAL',              true,  false, false, NULL,  250, 'ある場合とない場合がある'),
  ('POST_CHAMFER',                    '{"ja":"C面（後加工）","en":"Chamfer (post-process)"}',                    'MACHINING',     'INTERNAL',              true,  false, false, NULL,  260, 'ある場合とない場合がある'),
  ('POST_END_FACE',                   '{"ja":"端面（後加工）","en":"End face (post-process)"}',                  'MACHINING',     'INTERNAL',              true,  false, false, NULL,  270, 'ある場合とない場合がある'),
  ('CUSTOMER_INSPECTION_1',           '{"ja":"客先向け検査１（加工後）","en":"Customer inspection 1 (post-machining)"}', 'INSPECTION', 'INTERNAL',        false, true,  false, NULL,  280, '検査表の完成確認（客先向け１）'),
  ('CUSTOMER_INSPECTION_1_APPROVAL',  '{"ja":"客先向け検査１承認（加工後）","en":"Customer inspection 1 approval"}',    'APPROVAL',   'INTERNAL',        false, false, true,  '係長', 290, '係長以上が承認'),
  ('NECK_RELIEF',                     '{"ja":"首逃し","en":"Neck relief"}',                                      'MACHINING',     'INTERNAL',              true,  false, false, NULL,  300, '段加工と同時実施・記録する場合あり'),
  ('NECK_RELIEF_INSPECTION',          '{"ja":"首逃し検査","en":"Neck relief inspection"}',                       'INSPECTION',    'INTERNAL',              false, true,  false, NULL,  310, '検査表の完成確認（製作）'),
  ('NECK_RELIEF_INSPECTION_APPROVAL', '{"ja":"首逃し検査承認","en":"Neck relief inspection approval"}',          'APPROVAL',      'INTERNAL',              false, false, true,  '係長', 320, '係長以上が承認'),
  ('LD',                              '{"ja":"LD","en":"LD"}',                                                   'MACHINING',     'INTERNAL',              false, false, false, NULL,  330, NULL),
  ('LD_INSPECTION',                   '{"ja":"LD検査","en":"LD inspection"}',                                    'INSPECTION',    'INTERNAL',              false, true,  false, NULL,  340, '写真撮影の有無を確認'),
  ('SMAP',                            '{"ja":"SMAP","en":"SMAP"}',                                               'MACHINING',     'INTERNAL',              false, false, false, NULL,  350, '複数回あり'),
  ('COATING',                         '{"ja":"コーティング","en":"Coating"}',                                    'COATING',       'INTERNAL_OR_OUTSOURCE', false, false, false, NULL,  360, '外注時：依頼日・入荷予定日・入荷日を管理'),
  ('POST_SMAP',                       '{"ja":"後SMAP","en":"Post-SMAP"}',                                        'MACHINING',     'INTERNAL',              false, false, false, NULL,  370, NULL),
  ('CUSTOMER_INSPECTION_2',           '{"ja":"客先向け検査２（コーティング後）","en":"Customer inspection 2 (post-coating)"}', 'INSPECTION', 'INTERNAL', false, true,  false, NULL,  380, '検査表の完成確認（客先向け２）'),
  ('CUSTOMER_INSPECTION_2_APPROVAL',  '{"ja":"客先向け検査２承認（コーティング後）","en":"Customer inspection 2 approval"}',   'APPROVAL',   'INTERNAL', false, false, true,  '係長', 390, '係長以上が承認'),
  ('PRE_SHIP_INSPECTION',             '{"ja":"出荷前検査","en":"Pre-shipment inspection"}',                      'INSPECTION',    'INTERNAL',              false, true,  false, NULL,  400, '全工程完了後。再研磨・在庫で検査済みの場合は省略可'),
  ('SHIPPING',                        '{"ja":"出荷","en":"Shipping"}',                                           'SHIPPING',      'INTERNAL',              false, false, false, NULL,  410, '梱包→納品書作成→送り状→出荷→送り状控え保管')
ON CONFLICT ("code") DO NOTHING;

-- 使用依存（ワークフローに含めてよい条件 = 依存先が「存在」すること）
INSERT INTO "app"."process_step_use_dependencies" ("step_id", "depends_on_step_id", "relation", "is_negation", "notes")
SELECT s."id", d."id", v.rel::"app"."DEPENDENCY_RELATION", v.neg, v.note
FROM (VALUES
  -- 素材手配 = 素材出し or 素材受渡し
  ('CUTTING',            'MATERIAL_ISSUE',               'OR',  false, '素材手配'),
  ('CUTTING',            'MATERIAL_HANDOFF',             'OR',  false, '素材手配'),
  ('CENTERLESS',         'MATERIAL_ISSUE',               'OR',  false, '素材手配'),
  ('CENTERLESS',         'MATERIAL_HANDOFF',             'OR',  false, '素材手配'),
  ('CYLINDER_MACHINING', 'MATERIAL_ISSUE',               'OR',  false, '素材手配'),
  ('CYLINDER_MACHINING', 'MATERIAL_HANDOFF',             'OR',  false, '素材手配'),
  ('CYLINDER_MACHINING', 'CYLINDER_INSPECTION',          'AND', false, '検査必須'),
  ('CYLINDER_MACHINING', 'CYLINDER_INSPECTION_APPROVAL', 'AND', false, '検査承認必須'),
  ('CYLINDER_INSPECTION','CYLINDER_MACHINING',           'AND', false, NULL),
  ('CYLINDER_INSPECTION_APPROVAL','CYLINDER_INSPECTION', 'AND', false, NULL),
  ('LENGTH_ADJUST',      'CENTERLESS',                   'OR',  false, 'センタレス or 円筒加工検査承認 or 素材が研磨'),
  ('LENGTH_ADJUST',      'CYLINDER_INSPECTION_APPROVAL', 'OR',  false, 'センタレス or 円筒加工検査承認 or 素材が研磨'),
  ('CHAMFER',            'LENGTH_ADJUST',                'AND', false, NULL),
  -- 素材準備済み = 素材が（研磨・定尺）or 全長合わせ（属性側は空真）
  ('MARKING',            'LENGTH_ADJUST',                'OR',  false, '素材準備済み'),
  ('STEP_MACHINING',     'LENGTH_ADJUST',                'OR',  false, '素材準備済み'),
  ('STEP_MACHINING',     'STEP_INSPECTION',              'AND', false, '検査必須'),
  ('STEP_MACHINING',     'STEP_INSPECTION_APPROVAL',     'AND', false, '検査承認必須'),
  ('STEP_INSPECTION',    'STEP_MACHINING',               'AND', false, NULL),
  ('STEP_INSPECTION',    'STEP_INSPECTION_APPROVAL',     'AND', false, NULL),
  ('STEP_INSPECTION_APPROVAL','STEP_INSPECTION',         'AND', false, NULL),
  ('TANG',               'LENGTH_ADJUST',                'OR',  false, '素材準備済み'),
  ('OIL_GROOVE',         'LENGTH_ADJUST',                'OR',  false, '素材準備済み'),
  ('FLUTE',              'LENGTH_ADJUST',                'OR',  false, '素材準備済み'),
  ('FLUTE',              'FAB_INSPECTION',               'AND', false, '検査必須'),
  ('FLUTE',              'FAB_INSPECTION_APPROVAL',      'AND', false, '検査承認必須'),
  ('FLUTE',              'BLADE_BACK',                   'AND', true,  '排他: 刃裏（製作）と併用不可'),
  ('BLADE_BACK',         'LENGTH_ADJUST',                'OR',  false, '素材準備済み'),
  ('BLADE_BACK',         'FAB_INSPECTION',               'AND', false, '検査必須'),
  ('BLADE_BACK',         'FAB_INSPECTION_APPROVAL',      'AND', false, '検査承認必須'),
  ('BLADE_BACK',         'FLUTE',                        'AND', true,  '排他: 溝（製作）と併用不可'),
  ('OD_FAB',             'LENGTH_ADJUST',                'OR',  false, '素材準備済み'),
  ('OD_FAB',             'FAB_INSPECTION',               'AND', false, '検査必須'),
  ('OD_FAB',             'FAB_INSPECTION_APPROVAL',      'AND', false, '検査承認必須'),
  ('TIP_FAB',            'LENGTH_ADJUST',                'OR',  false, '素材準備済み'),
  ('TIP_FAB',            'FAB_INSPECTION',               'AND', false, '検査必須'),
  ('TIP_FAB',            'FAB_INSPECTION_APPROVAL',      'AND', false, '検査承認必須'),
  ('HONING',             'TIP_FAB',                      'AND', false, NULL),
  ('FAB_INSPECTION',     'FLUTE',                        'OR',  false, '製作工程のいずれか'),
  ('FAB_INSPECTION',     'BLADE_BACK',                   'OR',  false, '製作工程のいずれか'),
  ('FAB_INSPECTION',     'OD_FAB',                       'OR',  false, '製作工程のいずれか'),
  ('FAB_INSPECTION',     'TIP_FAB',                      'OR',  false, '製作工程のいずれか'),
  ('FAB_INSPECTION',     'FAB_INSPECTION_APPROVAL',      'AND', false, '検査承認必須'),
  ('FAB_INSPECTION_APPROVAL','FAB_INSPECTION',           'AND', false, NULL),
  ('CUSTOMER_INSPECTION_1','FAB_INSPECTION_APPROVAL',    'AND', false, NULL),
  ('CUSTOMER_INSPECTION_1','CUSTOMER_INSPECTION_1_APPROVAL','AND', false, '検査承認必須'),
  ('CUSTOMER_INSPECTION_1_APPROVAL','CUSTOMER_INSPECTION_1','AND', false, NULL),
  ('NECK_RELIEF',        'MATERIAL_ISSUE',               'OR',  false, '素材手配'),
  ('NECK_RELIEF',        'MATERIAL_HANDOFF',             'OR',  false, '素材手配'),
  ('NECK_RELIEF',        'NECK_RELIEF_INSPECTION',       'AND', false, '検査必須'),
  ('NECK_RELIEF',        'NECK_RELIEF_INSPECTION_APPROVAL','AND', false, '検査承認必須'),
  ('NECK_RELIEF_INSPECTION','NECK_RELIEF',               'AND', false, NULL),
  ('NECK_RELIEF_INSPECTION_APPROVAL','NECK_RELIEF_INSPECTION','AND', false, NULL),
  ('LD',                 'FAB_INSPECTION_APPROVAL',      'OR',  false, '製作検査承認 or 製品受渡し'),
  ('LD',                 'PRODUCT_HANDOFF',              'OR',  false, '製作検査承認 or 製品受渡し'),
  ('LD',                 'LD_INSPECTION',                'AND', false, '検査必須'),
  ('LD_INSPECTION',      'LD',                           'AND', false, NULL),
  ('SMAP',               'FAB_INSPECTION_APPROVAL',      'AND', false, NULL),
  ('COATING',            'FAB_INSPECTION_APPROVAL',      'OR',  false, '製作検査承認 or 製品受渡し'),
  ('COATING',            'PRODUCT_HANDOFF',              'OR',  false, '製作検査承認 or 製品受渡し'),
  ('POST_SMAP',          'COATING',                      'OR',  false, 'コーティング or LD'),
  ('POST_SMAP',          'LD',                           'OR',  false, 'コーティング or LD'),
  ('CUSTOMER_INSPECTION_2','COATING',                    'AND', false, NULL),
  ('CUSTOMER_INSPECTION_2','CUSTOMER_INSPECTION_2_APPROVAL','AND', false, '検査承認必須'),
  ('CUSTOMER_INSPECTION_2_APPROVAL','CUSTOMER_INSPECTION_2','AND', false, NULL)
) AS v(step_code, dep_code, rel, neg, note)
JOIN "app"."process_step_catalog" s ON s."code" = v.step_code
JOIN "app"."process_step_catalog" d ON d."code" = v.dep_code
ON CONFLICT ("step_id", "depends_on_step_id") DO NOTHING;

-- 実行依存（開始してよい条件 = 依存先が「完了」していること。不在は空真）
INSERT INTO "app"."process_step_exec_dependencies" ("step_id", "depends_on_step_id", "relation", "notes")
SELECT s."id", d."id", v.rel::"app"."DEPENDENCY_RELATION", v.note
FROM (VALUES
  ('CUTTING',            'MATERIAL_ISSUE',               'OR',  '素材手配の完了'),
  ('CUTTING',            'MATERIAL_HANDOFF',             'OR',  '素材手配の完了'),
  ('CENTERLESS',         'MATERIAL_ISSUE',               'OR',  '素材手配の完了'),
  ('CENTERLESS',         'MATERIAL_HANDOFF',             'OR',  '素材手配の完了'),
  ('CYLINDER_MACHINING', 'MATERIAL_ISSUE',               'OR',  '素材手配の完了'),
  ('CYLINDER_MACHINING', 'MATERIAL_HANDOFF',             'OR',  '素材手配の完了'),
  ('CYLINDER_INSPECTION','CYLINDER_MACHINING',           'AND', '円筒加工の完了'),
  ('CYLINDER_INSPECTION_APPROVAL','CYLINDER_INSPECTION', 'AND', '円筒加工検査の完了'),
  ('LENGTH_ADJUST',      'CENTERLESS',                   'OR',  'いずれかの完了（素材が研磨は空真）'),
  ('LENGTH_ADJUST',      'CYLINDER_INSPECTION_APPROVAL', 'OR',  'いずれかの完了（素材が研磨は空真）'),
  ('CHAMFER',            'LENGTH_ADJUST',                'AND', '全長合わせの完了'),
  ('MARKING',            'LENGTH_ADJUST',                'OR',  '素材準備済み'),
  ('MARKING',            'CYLINDER_INSPECTION_APPROVAL', 'AND', '円筒検査承認'),
  ('STEP_MACHINING',     'LENGTH_ADJUST',                'OR',  '素材準備済み'),
  ('STEP_MACHINING',     'CYLINDER_INSPECTION_APPROVAL', 'AND', '円筒検査承認'),
  ('STEP_INSPECTION',    'STEP_MACHINING',               'AND', '段加工の完了'),
  ('STEP_INSPECTION_APPROVAL','STEP_INSPECTION',         'AND', '段加工検査の完了'),
  ('TANG',               'LENGTH_ADJUST',                'OR',  '素材準備済み'),
  ('OIL_GROOVE',         'LENGTH_ADJUST',                'OR',  '素材準備済み'),
  ('FLUTE',              'LENGTH_ADJUST',                'OR',  '素材準備済み'),
  ('FLUTE',              'CYLINDER_INSPECTION_APPROVAL', 'AND', '円筒検査承認'),
  ('BLADE_BACK',         'LENGTH_ADJUST',                'OR',  '素材準備済み'),
  ('BLADE_BACK',         'CYLINDER_INSPECTION_APPROVAL', 'AND', '円筒検査承認'),
  ('OD_FAB',             'LENGTH_ADJUST',                'OR',  '素材準備済み'),
  ('OD_FAB',             'FLUTE',                        'AND', '溝の完了'),
  ('OD_FAB',             'CYLINDER_INSPECTION_APPROVAL', 'AND', '円筒検査承認'),
  ('TIP_FAB',            'LENGTH_ADJUST',                'OR',  '素材準備済み'),
  ('TIP_FAB',            'FLUTE',                        'AND', '溝の完了'),
  ('TIP_FAB',            'CYLINDER_INSPECTION_APPROVAL', 'AND', '円筒検査承認'),
  ('HONING',             'TIP_FAB',                      'AND', '先端の完了'),
  ('FAB_INSPECTION',     'FLUTE',                        'AND', '製作完了（存在する製作工程すべて）'),
  ('FAB_INSPECTION',     'BLADE_BACK',                   'AND', '製作完了（存在する製作工程すべて）'),
  ('FAB_INSPECTION',     'OD_FAB',                       'AND', '製作完了（存在する製作工程すべて）'),
  ('FAB_INSPECTION',     'TIP_FAB',                      'AND', '製作完了（存在する製作工程すべて）'),
  ('FAB_INSPECTION',     'HONING',                       'AND', '製作完了（存在する製作工程すべて）'),
  ('FAB_INSPECTION_APPROVAL','FAB_INSPECTION',           'AND', '製作検査の完了'),
  ('CUSTOMER_INSPECTION_1','FAB_INSPECTION_APPROVAL',    'AND', '製作検査承認の完了'),
  ('CUSTOMER_INSPECTION_1_APPROVAL','CUSTOMER_INSPECTION_1','AND', '客先向け検査１の完了'),
  ('NECK_RELIEF',        'MATERIAL_ISSUE',               'OR',  '素材手配の完了'),
  ('NECK_RELIEF',        'MATERIAL_HANDOFF',             'OR',  '素材手配の完了'),
  ('NECK_RELIEF_INSPECTION','NECK_RELIEF',               'AND', '首逃しの完了'),
  ('NECK_RELIEF_INSPECTION_APPROVAL','NECK_RELIEF_INSPECTION','AND', '首逃し検査の完了'),
  ('LD',                 'FAB_INSPECTION_APPROVAL',      'AND', '製作検査承認の完了（受渡しフローでは空真）'),
  ('LD_INSPECTION',      'LD',                           'AND', 'LDの完了'),
  ('SMAP',               'FAB_INSPECTION_APPROVAL',      'AND', 'すべて完了'),
  ('SMAP',               'COATING',                      'AND', 'すべて完了'),
  ('SMAP',               'LD',                           'AND', 'すべて完了'),
  ('COATING',            'FAB_INSPECTION_APPROVAL',      'AND', '製作検査承認の完了（受渡しフローでは空真）'),
  ('POST_SMAP',          'FAB_INSPECTION_APPROVAL',      'AND', '製作検査承認'),
  ('POST_SMAP',          'COATING',                      'OR',  'コーティング or LD の完了'),
  ('POST_SMAP',          'LD',                           'OR',  'コーティング or LD の完了'),
  ('CUSTOMER_INSPECTION_2','COATING',                    'AND', 'コーティングの完了'),
  ('CUSTOMER_INSPECTION_2_APPROVAL','CUSTOMER_INSPECTION_2','AND', '客先向け検査２の完了'),
  ('SHIPPING',           'PRE_SHIP_INSPECTION',          'AND', '出荷前検査の完了（省略時は空真）')
) AS v(step_code, dep_code, rel, note)
JOIN "app"."process_step_catalog" s ON s."code" = v.step_code
JOIN "app"."process_step_catalog" d ON d."code" = v.dep_code
ON CONFLICT ("step_id", "depends_on_step_id") DO NOTHING;

-- 不良種類（スターター）
INSERT INTO "app"."defect_types" ("code", "name", "sort_order")
VALUES
  ('DIMENSION', '{"ja":"寸法不良","en":"Dimensional defect"}', 10),
  ('SCRATCH',   '{"ja":"キズ","en":"Scratch"}',                20),
  ('CHIP',      '{"ja":"欠け","en":"Chipping"}',               30),
  ('BREAKAGE',  '{"ja":"折損","en":"Breakage"}',               40),
  ('COATING',   '{"ja":"コーティング不良","en":"Coating defect"}', 50),
  ('OTHER',     '{"ja":"その他","en":"Other"}',                90)
ON CONFLICT ("code") DO NOTHING;

-- 工場（本社）
INSERT INTO "app"."factories" ("code", "name", "country_code", "is_active", "updated_at")
VALUES ('F01', '{"ja":"本社工場","en":"Main factory"}', 'JP', true, now())
ON CONFLICT ("code") DO NOTHING;
