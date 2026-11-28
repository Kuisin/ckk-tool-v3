-- general-demo-seed.sql — 一般カテゴリ（CM02 フォーム / CM03 社内文書）の
-- マニュアル撮影用デモデータ。
--
-- tools/docs-screenshots のローカル一時 DB に流す（orchestrate.ts SEED_FILES_POST）。
-- 本番には入れない（中身は架空）。
--
-- 冪等: 全行固定 UUID（'df' プレフィックス）/ 固定日付 + ON CONFLICT。
-- now() を使わない（docs:verify で撮り直しても同じ画像になるように）。
-- 作成者は demo_shot（撮影ユーザー）— 一覧は「自分が作った / 共有された」
-- ものだけを出すので、作成者にしておけば共有設定なしで一覧に並ぶ。
--
-- 中身:
--   フォーム（CM02）
--     DEMOFRM1 社員食堂アンケート（アンケート・公開中・回答 3 件 — 集計タブ用）
--     DEMOFRM2 備品購入申請（申請・報告・公開中・回答なし。全員に「回答」で共有 —
--              demo1 の未処理一覧「未回答のフォーム」に出る）
--   社内文書（CM03）
--     DOC-202607-00001 出荷前チェックの手順（公開中）
--     DOC-202607-00002 旧 梱包手順（アーカイブ — 片付けた文書の見え方）

BEGIN;

-- ── フォーム ────────────────────────────────────────────────────────────────
INSERT INTO app.forms (id, code, title, description, kind, status,
  respondent_visibility, current_version, record_seq, approval_enabled,
  allow_multiple, created_by, updated_by, created_at, updated_at)
VALUES
  ('df000000-0000-4000-8000-000000000001'::uuid, 'DEMOFRM1', '社員食堂アンケート',
   '食堂のメニューと営業時間についてご意見をお聞かせください。',
   'SURVEY'::app."FormKind", 'PUBLISHED'::app."FormStatus", 'SHOWN'::app."RespondentVisibility",
   1, 3, false, false,
   'a0b1c2d3-0000-4000-8000-000000005107'::uuid, 'a0b1c2d3-0000-4000-8000-000000005107'::uuid,
   '2026-07-10T09:00:00+09', '2026-07-10T09:30:00+09'),
  ('df000000-0000-4000-8000-000000000002'::uuid, 'DEMOFRM2', '備品購入申請',
   '業務で使う備品の購入を申請します。',
   'REQUEST'::app."FormKind", 'PUBLISHED'::app."FormStatus", 'SHOWN'::app."RespondentVisibility",
   1, 0, false, true,
   'a0b1c2d3-0000-4000-8000-000000005107'::uuid, 'a0b1c2d3-0000-4000-8000-000000005107'::uuid,
   '2026-07-12T10:00:00+09', '2026-07-12T10:15:00+09')
ON CONFLICT (id) DO NOTHING;

INSERT INTO app.form_versions (id, form_id, version, schema, sections, published_at, published_by)
VALUES
  ('df010000-0000-4000-8000-000000000001'::uuid, 'df000000-0000-4000-8000-000000000001'::uuid, 1,
   '[
     {"key": "satisfaction", "label": {"ja": "満足度", "en": "Satisfaction"}, "type": "select", "required": true, "order": 0,
      "options": [
        {"value": "good", "label": {"ja": "満足", "en": "Satisfied"}},
        {"value": "fair", "label": {"ja": "ふつう", "en": "Neutral"}},
        {"value": "poor", "label": {"ja": "不満", "en": "Dissatisfied"}}]},
     {"key": "visits", "label": {"ja": "週に何回利用しますか", "en": "Visits per week"}, "type": "number", "required": false, "order": 1, "min": 0, "max": 7},
     {"key": "comment", "label": {"ja": "ご意見", "en": "Comments"}, "type": "textarea", "required": false, "order": 2}
   ]'::jsonb, '[]'::jsonb,
   '2026-07-10T09:30:00+09', 'a0b1c2d3-0000-4000-8000-000000005107'::uuid),
  ('df010000-0000-4000-8000-000000000002'::uuid, 'df000000-0000-4000-8000-000000000002'::uuid, 1,
   '[
     {"key": "item", "label": {"ja": "品名", "en": "Item"}, "type": "text", "required": true, "order": 0, "isTitle": true},
     {"key": "quantity", "label": {"ja": "数量", "en": "Quantity"}, "type": "number", "required": true, "order": 1, "min": 1},
     {"key": "neededBy", "label": {"ja": "希望納期", "en": "Needed by"}, "type": "date", "required": false, "order": 2},
     {"key": "reason", "label": {"ja": "理由", "en": "Reason"}, "type": "textarea", "required": true, "order": 3}
   ]'::jsonb, '[]'::jsonb,
   '2026-07-12T10:15:00+09', 'a0b1c2d3-0000-4000-8000-000000005107'::uuid)
ON CONFLICT (form_id, version) DO NOTHING;

INSERT INTO app.form_responses (id, response_number, record_no, form_id, version, status,
  answers, plain_text, submitted_by, submitted_at, created_at, updated_at)
VALUES
  ('df020000-0000-4000-8000-000000000001'::uuid, 'FRM-202607-00001', 1,
   'df000000-0000-4000-8000-000000000001'::uuid, 1, 'SUBMITTED'::app."FormResponseStatus",
   '{"satisfaction": "good", "visits": 5, "comment": "日替わり定食の量がちょうどよいです。"}'::jsonb,
   '満足度: 満足 週に何回利用しますか: 5 ご意見: 日替わり定食の量がちょうどよいです。',
   'a0b1c2d3-0000-4000-8000-000000005107'::uuid,
   '2026-07-13T12:40:00+09', '2026-07-13T12:38:00+09', '2026-07-13T12:40:00+09'),
  ('df020000-0000-4000-8000-000000000002'::uuid, 'FRM-202607-00002', 2,
   'df000000-0000-4000-8000-000000000001'::uuid, 1, 'SUBMITTED'::app."FormResponseStatus",
   '{"satisfaction": "fair", "visits": 3, "comment": "営業時間を 14 時まで延ばしてほしいです。"}'::jsonb,
   '満足度: ふつう 週に何回利用しますか: 3 ご意見: 営業時間を 14 時まで延ばしてほしいです。',
   (SELECT id FROM app.users WHERE username = 'demo2'),
   '2026-07-14T12:10:00+09', '2026-07-14T12:05:00+09', '2026-07-14T12:10:00+09'),
  ('df020000-0000-4000-8000-000000000003'::uuid, 'FRM-202607-00003', 3,
   'df000000-0000-4000-8000-000000000001'::uuid, 1, 'SUBMITTED'::app."FormResponseStatus",
   '{"satisfaction": "good", "visits": 4}'::jsonb,
   '満足度: 満足 週に何回利用しますか: 4',
   (SELECT id FROM app.users WHERE username = 'demo3'),
   '2026-07-15T12:20:00+09', '2026-07-15T12:18:00+09', '2026-07-15T12:20:00+09')
ON CONFLICT (id) DO NOTHING;

-- 共有: アンケートは全員が回答、申請は全員が回答（demo1 の未処理一覧に出る）
INSERT INTO app.share_grants (id, owner_type, owner_id, subject_type, subject_id, level,
  created_by, created_at)
VALUES
  ('df030000-0000-4000-8000-000000000001'::uuid, 'forms', 'DEMOFRM1',
   'EVERYONE'::app."ShareSubjectType", NULL, 'RESPOND'::app."ShareLevel",
   'a0b1c2d3-0000-4000-8000-000000005107'::uuid, '2026-07-10T09:30:00+09'),
  ('df030000-0000-4000-8000-000000000002'::uuid, 'forms', 'DEMOFRM2',
   'EVERYONE'::app."ShareSubjectType", NULL, 'RESPOND'::app."ShareLevel",
   'a0b1c2d3-0000-4000-8000-000000005107'::uuid, '2026-07-12T10:15:00+09')
ON CONFLICT (id) DO NOTHING;

-- ── 社内文書 ────────────────────────────────────────────────────────────────
INSERT INTO app.internal_pages (id, page_number, title, summary, folder, status,
  approval_required, published_revision, created_by, updated_by, created_at, updated_at)
VALUES
  ('df100000-0000-4000-8000-000000000001'::uuid, 'DOC-202607-00001', '出荷前チェックの手順',
   '出荷前検査で確認する項目と順番', '手順書/出荷',
   'PUBLISHED'::app."InternalPageStatus", false, 2,
   'a0b1c2d3-0000-4000-8000-000000005107'::uuid, 'a0b1c2d3-0000-4000-8000-000000005107'::uuid,
   '2026-07-08T09:00:00+09', '2026-07-08T10:00:00+09'),
  ('df100000-0000-4000-8000-000000000002'::uuid, 'DOC-202607-00002', '旧 梱包手順',
   '2026 年 7 月に「出荷前チェックの手順」へ統合', '手順書/出荷',
   'ARCHIVED'::app."InternalPageStatus", false, 2,
   'a0b1c2d3-0000-4000-8000-000000005107'::uuid, 'a0b1c2d3-0000-4000-8000-000000005107'::uuid,
   '2026-06-01T09:00:00+09', '2026-07-08T10:30:00+09')
ON CONFLICT (id) DO NOTHING;

INSERT INTO app.internal_page_revisions (id, page_id, revision, title, body, note, action,
  added_lines, removed_lines, edited_by, edited_at)
VALUES
  ('df110000-0000-4000-8000-000000000001'::uuid, 'df100000-0000-4000-8000-000000000001'::uuid, 1,
   '出荷前チェックの手順', '', NULL, 'CREATE'::app."InternalPageRevisionAction", 0, 0,
   'a0b1c2d3-0000-4000-8000-000000005107'::uuid, '2026-07-08T09:00:00+09'),
  ('df110000-0000-4000-8000-000000000002'::uuid, 'df100000-0000-4000-8000-000000000001'::uuid, 2,
   '出荷前チェックの手順',
   E'## 目的\n\n出荷する製品に間違いがないかを、梱包の前に確かめます。\n\n## 手順\n\n1. 図面・ラベル・膜厚・寸法を指示書と照らし合わせる\n2. φ0.6 以下は保護キャップが付いているか確かめる\n3. 完成本数を数えて指示書と合わせる\n4. 共有端末の「最終検査・出荷前確認」に記録する\n\n> 不良を見つけたら出荷せず、出荷時不良内容確認者印の欄に内容を書いてください。',
   '初版', 'PUBLISH'::app."InternalPageRevisionAction", 13, 0,
   'a0b1c2d3-0000-4000-8000-000000005107'::uuid, '2026-07-08T10:00:00+09'),
  ('df110000-0000-4000-8000-000000000003'::uuid, 'df100000-0000-4000-8000-000000000002'::uuid, 1,
   '旧 梱包手順', '', NULL, 'CREATE'::app."InternalPageRevisionAction", 0, 0,
   'a0b1c2d3-0000-4000-8000-000000005107'::uuid, '2026-06-01T09:00:00+09'),
  ('df110000-0000-4000-8000-000000000004'::uuid, 'df100000-0000-4000-8000-000000000002'::uuid, 2,
   '旧 梱包手順',
   E'## 梱包\n\n1. 製品をケースに入れる\n2. 緩衝材を詰める\n3. 納品書を同梱する',
   '初版', 'PUBLISH'::app."InternalPageRevisionAction", 5, 0,
   'a0b1c2d3-0000-4000-8000-000000005107'::uuid, '2026-06-01T10:00:00+09')
ON CONFLICT (page_id, revision) DO NOTHING;

-- 共有: 全員が読める + demo1（管理者）が編集できる — アーカイブの操作は
-- 「社内文書の更新権限 + 作成者か編集の共有先」にしか出ないため、撮影は demo1 で行う。
INSERT INTO app.share_grants (id, owner_type, owner_id, subject_type, subject_id, level,
  created_by, created_at)
VALUES
  ('df130000-0000-4000-8000-000000000001'::uuid, 'internal_pages', 'DOC-202607-00001',
   'EVERYONE'::app."ShareSubjectType", NULL, 'READ'::app."ShareLevel",
   'a0b1c2d3-0000-4000-8000-000000005107'::uuid, '2026-07-08T10:00:00+09'),
  ('df130000-0000-4000-8000-000000000002'::uuid, 'internal_pages', 'DOC-202607-00001',
   'USER'::app."ShareSubjectType", (SELECT id::text FROM app.users WHERE username = 'demo1'),
   'EDIT'::app."ShareLevel",
   'a0b1c2d3-0000-4000-8000-000000005107'::uuid, '2026-07-08T10:00:00+09'),
  ('df130000-0000-4000-8000-000000000003'::uuid, 'internal_pages', 'DOC-202607-00002',
   'EVERYONE'::app."ShareSubjectType", NULL, 'READ'::app."ShareLevel",
   'a0b1c2d3-0000-4000-8000-000000005107'::uuid, '2026-06-01T10:00:00+09'),
  ('df130000-0000-4000-8000-000000000004'::uuid, 'internal_pages', 'DOC-202607-00002',
   'USER'::app."ShareSubjectType", (SELECT id::text FROM app.users WHERE username = 'demo1'),
   'EDIT'::app."ShareLevel",
   'a0b1c2d3-0000-4000-8000-000000005107'::uuid, '2026-06-01T10:00:00+09')
ON CONFLICT (id) DO NOTHING;

COMMIT;
