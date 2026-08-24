-- baseline-seed.sql — 初期データ（旧 migration に埋まっていた DML の抽出）
--
-- 99 本の migration を 1 本のベースラインへ潰した際、migration 内に書かれていた
-- INSERT（採番マスタ / 材種・素材（Excel 由来）/ 工程マスタ / 承認フロー /
-- 検査テンプレ / 通貨 / system ユーザー 等）をここへ移した。
--
-- **新規 DB の初期化時に 1 回だけ流す**。冪等ではないので既存 DB に流さないこと。
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f sql/baseline-seed.sql
--
-- FK の順序を気にせず流せるよう、セッション中だけトリガ（FK 検査）を止める。
-- superuser 専用 — migration/プロビジョニングは postgres で流すので問題ない。
BEGIN;
SET session_replication_role = replica;

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.9
-- Dumped by pg_dump version 18.4

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: approval_groups; Type: TABLE DATA; Schema: app; Owner: postgres
--

INSERT INTO app.approval_groups VALUES (1, '{"en": "First approval group", "ja": "第一承認グループ"}', true);
INSERT INTO app.approval_groups VALUES (2, '{"en": "Second approval group", "ja": "第二承認グループ"}', true);


--
-- Data for Name: employee_directory; Type: TABLE DATA; Schema: directory; Owner: postgres
--



--
-- Data for Name: users; Type: TABLE DATA; Schema: app; Owner: postgres
--

INSERT INTO app.users VALUES ('00000000-0000-0000-0000-000000000000', 'SYSTEM', NULL, 'system', 'システム', NULL, true, NULL, '2026-08-24 09:19:51.439601+00', '2026-08-24 09:19:51.439601+00', NULL, 'ja', NULL, NULL, 'YYYY/MM/DD', '24h', 'Asia/Tokyo');


--
-- Data for Name: approval_delegates; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: approval_flows; Type: TABLE DATA; Schema: app; Owner: postgres
--

INSERT INTO app.approval_flows VALUES ('work_orders', NULL, '2026-08-24 09:19:52.505685+00', 'PRE');
INSERT INTO app.approval_flows VALUES ('order_acceptances', NULL, '2026-08-24 09:19:52.505685+00', 'PRE');
INSERT INTO app.approval_flows VALUES ('material_purchase_orders', NULL, '2026-08-24 09:19:52.505685+00', 'PRE');
INSERT INTO app.approval_flows VALUES ('purchase_requests', NULL, '2026-08-24 09:19:52.505685+00', 'PRE');
INSERT INTO app.approval_flows VALUES ('work_order_flow_changes', NULL, '2026-08-24 09:19:52.5434+00', 'PRE');
INSERT INTO app.approval_flows VALUES ('order_acceptance_cancel_requests', NULL, '2026-08-24 09:19:52.575477+00', 'PRE');


--
-- Data for Name: approval_flow_rules; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: approval_flow_rule_steps; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: approval_flow_steps; Type: TABLE DATA; Schema: app; Owner: postgres
--

INSERT INTO app.approval_flow_steps VALUES (1, 'work_orders', 1, '{"en": "First approval", "ja": "第一承認"}', 1, 'ANY');
INSERT INTO app.approval_flow_steps VALUES (2, 'work_orders', 2, '{"en": "Second approval", "ja": "第二承認"}', 2, 'ANY');
INSERT INTO app.approval_flow_steps VALUES (3, 'order_acceptances', 1, '{"en": "First approval", "ja": "第一承認"}', 1, 'ANY');
INSERT INTO app.approval_flow_steps VALUES (4, 'material_purchase_orders', 1, '{"en": "First approval", "ja": "第一承認"}', 1, 'ANY');
INSERT INTO app.approval_flow_steps VALUES (5, 'purchase_requests', 1, '{"en": "First approval", "ja": "第一承認"}', 1, 'ANY');


--
-- Data for Name: approval_group_members; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: approval_requests; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: approval_records; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: approval_request_approvers; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: files; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: regions; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: plants; Type: TABLE DATA; Schema: app; Owner: postgres
--

INSERT INTO app.plants VALUES (1, 'F01', '{"en": "Main factory", "ja": "本社工場"}', NULL, 'JP', NULL, NULL, NULL, NULL, NULL, true, NULL, '2026-08-24 09:19:51.573232+00', '2026-08-24 09:19:51.573232+00', NULL);


--
-- Data for Name: kiosk_floor_maps; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: work_location_groups; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: work_locations; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: kiosk_devices; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: audit_logs; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: business_partners; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: billing_closings; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: bp_contacts; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: bp_customer_attrs; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: bp_end_user_attrs; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: bp_role_assignments; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: bp_sales_reps; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: bp_vendor_attrs; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: currencies; Type: TABLE DATA; Schema: app; Owner: postgres
--

INSERT INTO app.currencies VALUES ('JPY', '{"en": "Japanese Yen", "ja": "日本円"}', 100.000000, true, 0, '2026-08-24 09:19:52.565666+00', '2026-08-24 09:19:52.5687+00');
INSERT INTO app.currencies VALUES ('USD', '{"en": "US Dollar", "ja": "米ドル"}', 0.666667, true, 1, '2026-08-24 09:19:52.565666+00', '2026-08-24 09:19:52.5687+00');
INSERT INTO app.currencies VALUES ('EUR', '{"en": "Euro", "ja": "ユーロ"}', 0.617284, true, 2, '2026-08-24 09:19:52.565666+00', '2026-08-24 09:19:52.5687+00');
INSERT INTO app.currencies VALUES ('CNY', '{"en": "Chinese Yuan", "ja": "中国人民元"}', 4.761905, true, 3, '2026-08-24 09:19:52.565666+00', '2026-08-24 09:19:52.5687+00');
INSERT INTO app.currencies VALUES ('THB', '{"en": "Thai Baht", "ja": "タイバーツ"}', 23.255814, true, 4, '2026-08-24 09:19:52.565666+00', '2026-08-24 09:19:52.5687+00');
INSERT INTO app.currencies VALUES ('VND', '{"en": "Vietnamese Dong", "ja": "ベトナムドン"}', 17543.859649, true, 5, '2026-08-24 09:19:52.565666+00', '2026-08-24 09:19:52.5687+00');


--
-- Data for Name: defect_types; Type: TABLE DATA; Schema: app; Owner: postgres
--

INSERT INTO app.defect_types VALUES (1, 'DIMENSION', '{"en": "Dimensional defect", "ja": "寸法不良"}', true, 10);
INSERT INTO app.defect_types VALUES (2, 'SCRATCH', '{"en": "Scratch", "ja": "キズ"}', true, 20);
INSERT INTO app.defect_types VALUES (3, 'CHIP', '{"en": "Chipping", "ja": "欠け"}', true, 30);
INSERT INTO app.defect_types VALUES (4, 'BREAKAGE', '{"en": "Breakage", "ja": "折損"}', true, 40);
INSERT INTO app.defect_types VALUES (5, 'COATING', '{"en": "Coating defect", "ja": "コーティング不良"}', true, 50);
INSERT INTO app.defect_types VALUES (6, 'OTHER', '{"en": "Other", "ja": "その他"}', true, 90);


--
-- Data for Name: material_diameters; Type: TABLE DATA; Schema: app; Owner: postgres
--

INSERT INTO app.material_diameters VALUES ('010', 1.000, '{"en": "φ1.0", "ja": "φ1.0"}', true, '2026-08-24 09:19:51.792969+00', '2026-08-24 09:19:51.792969+00');
INSERT INTO app.material_diameters VALUES ('015', 1.500, '{"en": "φ1.5", "ja": "φ1.5"}', true, '2026-08-24 09:19:51.793275+00', '2026-08-24 09:19:51.793275+00');
INSERT INTO app.material_diameters VALUES ('016', 1.550, '{"en": "φ1.55", "ja": "φ1.55"}', true, '2026-08-24 09:19:51.793522+00', '2026-08-24 09:19:51.793522+00');
INSERT INTO app.material_diameters VALUES ('017', 1.700, '{"en": "φ1.7", "ja": "φ1.7"}', true, '2026-08-24 09:19:51.793754+00', '2026-08-24 09:19:51.793754+00');
INSERT INTO app.material_diameters VALUES ('020', 2.000, '{"en": "φ2.0", "ja": "φ2.0"}', true, '2026-08-24 09:19:51.793977+00', '2026-08-24 09:19:51.793977+00');
INSERT INTO app.material_diameters VALUES ('025', 2.500, '{"en": "φ2.5", "ja": "φ2.5"}', true, '2026-08-24 09:19:51.794207+00', '2026-08-24 09:19:51.794207+00');
INSERT INTO app.material_diameters VALUES ('030', 3.000, '{"en": "φ3.0", "ja": "φ3.0"}', true, '2026-08-24 09:19:51.794429+00', '2026-08-24 09:19:51.794429+00');
INSERT INTO app.material_diameters VALUES ('035', 3.500, '{"en": "φ3.5", "ja": "φ3.5"}', true, '2026-08-24 09:19:51.794639+00', '2026-08-24 09:19:51.794639+00');
INSERT INTO app.material_diameters VALUES ('040', 4.000, '{"en": "φ4.0", "ja": "φ4.0"}', true, '2026-08-24 09:19:51.794858+00', '2026-08-24 09:19:51.794858+00');
INSERT INTO app.material_diameters VALUES ('045', 4.500, '{"en": "φ4.5", "ja": "φ4.5"}', true, '2026-08-24 09:19:51.795117+00', '2026-08-24 09:19:51.795117+00');
INSERT INTO app.material_diameters VALUES ('050', 5.000, '{"en": "φ5.0", "ja": "φ5.0"}', true, '2026-08-24 09:19:51.795383+00', '2026-08-24 09:19:51.795383+00');
INSERT INTO app.material_diameters VALUES ('055', 5.500, '{"en": "φ5.5", "ja": "φ5.5"}', true, '2026-08-24 09:19:51.795606+00', '2026-08-24 09:19:51.795606+00');
INSERT INTO app.material_diameters VALUES ('060', 6.000, '{"en": "φ6.0", "ja": "φ6.0"}', true, '2026-08-24 09:19:51.795803+00', '2026-08-24 09:19:51.795803+00');
INSERT INTO app.material_diameters VALUES ('064', 6.350, '{"en": "φ6.35", "ja": "φ6.35"}', true, '2026-08-24 09:19:51.796064+00', '2026-08-24 09:19:51.796064+00');
INSERT INTO app.material_diameters VALUES ('065', 6.500, '{"en": "φ6.5", "ja": "φ6.5"}', true, '2026-08-24 09:19:51.796292+00', '2026-08-24 09:19:51.796292+00');
INSERT INTO app.material_diameters VALUES ('070', 7.000, '{"en": "φ7.0", "ja": "φ7.0"}', true, '2026-08-24 09:19:51.796503+00', '2026-08-24 09:19:51.796503+00');
INSERT INTO app.material_diameters VALUES ('075', 7.500, '{"en": "φ7.5", "ja": "φ7.5"}', true, '2026-08-24 09:19:51.796792+00', '2026-08-24 09:19:51.796792+00');
INSERT INTO app.material_diameters VALUES ('080', 8.000, '{"en": "φ8.0", "ja": "φ8.0"}', true, '2026-08-24 09:19:51.797081+00', '2026-08-24 09:19:51.797081+00');
INSERT INTO app.material_diameters VALUES ('085', 8.500, '{"en": "φ8.5", "ja": "φ8.5"}', true, '2026-08-24 09:19:51.797321+00', '2026-08-24 09:19:51.797321+00');
INSERT INTO app.material_diameters VALUES ('090', 9.000, '{"en": "φ9.0", "ja": "φ9.0"}', true, '2026-08-24 09:19:51.797532+00', '2026-08-24 09:19:51.797532+00');
INSERT INTO app.material_diameters VALUES ('095', 9.500, '{"en": "φ9.5", "ja": "φ9.5"}', true, '2026-08-24 09:19:51.797747+00', '2026-08-24 09:19:51.797747+00');
INSERT INTO app.material_diameters VALUES ('100', 10.000, '{"en": "φ10.0", "ja": "φ10.0"}', true, '2026-08-24 09:19:51.797958+00', '2026-08-24 09:19:51.797958+00');
INSERT INTO app.material_diameters VALUES ('105', 10.500, '{"en": "φ10.5", "ja": "φ10.5"}', true, '2026-08-24 09:19:51.798192+00', '2026-08-24 09:19:51.798192+00');
INSERT INTO app.material_diameters VALUES ('110', 11.000, '{"en": "φ11.0", "ja": "φ11.0"}', true, '2026-08-24 09:19:51.798416+00', '2026-08-24 09:19:51.798416+00');
INSERT INTO app.material_diameters VALUES ('115', 11.500, '{"en": "φ11.5", "ja": "φ11.5"}', true, '2026-08-24 09:19:51.798625+00', '2026-08-24 09:19:51.798625+00');
INSERT INTO app.material_diameters VALUES ('120', 12.000, '{"en": "φ12.0", "ja": "φ12.0"}', true, '2026-08-24 09:19:51.798844+00', '2026-08-24 09:19:51.798844+00');
INSERT INTO app.material_diameters VALUES ('125', 12.500, '{"en": "φ12.5", "ja": "φ12.5"}', true, '2026-08-24 09:19:51.799074+00', '2026-08-24 09:19:51.799074+00');
INSERT INTO app.material_diameters VALUES ('127', 12.700, '{"en": "φ12.7", "ja": "φ12.7"}', true, '2026-08-24 09:19:51.799305+00', '2026-08-24 09:19:51.799305+00');
INSERT INTO app.material_diameters VALUES ('130', 13.000, '{"en": "φ13.0", "ja": "φ13.0"}', true, '2026-08-24 09:19:51.79952+00', '2026-08-24 09:19:51.79952+00');
INSERT INTO app.material_diameters VALUES ('135', 13.500, '{"en": "φ13.5", "ja": "φ13.5"}', true, '2026-08-24 09:19:51.799742+00', '2026-08-24 09:19:51.799742+00');
INSERT INTO app.material_diameters VALUES ('140', 14.000, '{"en": "φ14.0", "ja": "φ14.0"}', true, '2026-08-24 09:19:51.799953+00', '2026-08-24 09:19:51.799953+00');
INSERT INTO app.material_diameters VALUES ('145', 14.500, '{"en": "φ14.5", "ja": "φ14.5"}', true, '2026-08-24 09:19:51.800168+00', '2026-08-24 09:19:51.800168+00');
INSERT INTO app.material_diameters VALUES ('150', 15.000, '{"en": "φ15.0", "ja": "φ15.0"}', true, '2026-08-24 09:19:51.800453+00', '2026-08-24 09:19:51.800453+00');
INSERT INTO app.material_diameters VALUES ('155', 15.500, '{"en": "φ15.5", "ja": "φ15.5"}', true, '2026-08-24 09:19:51.800676+00', '2026-08-24 09:19:51.800676+00');
INSERT INTO app.material_diameters VALUES ('160', 16.000, '{"en": "φ16.0", "ja": "φ16.0"}', true, '2026-08-24 09:19:51.800917+00', '2026-08-24 09:19:51.800917+00');
INSERT INTO app.material_diameters VALUES ('165', 16.500, '{"en": "φ16.5", "ja": "φ16.5"}', true, '2026-08-24 09:19:51.801155+00', '2026-08-24 09:19:51.801155+00');
INSERT INTO app.material_diameters VALUES ('170', 17.000, '{"en": "φ17.0", "ja": "φ17.0"}', true, '2026-08-24 09:19:51.801394+00', '2026-08-24 09:19:51.801394+00');
INSERT INTO app.material_diameters VALUES ('175', 17.500, '{"en": "φ17.5", "ja": "φ17.5"}', true, '2026-08-24 09:19:51.801612+00', '2026-08-24 09:19:51.801612+00');
INSERT INTO app.material_diameters VALUES ('180', 18.000, '{"en": "φ18.0", "ja": "φ18.0"}', true, '2026-08-24 09:19:51.801836+00', '2026-08-24 09:19:51.801836+00');
INSERT INTO app.material_diameters VALUES ('185', 18.500, '{"en": "φ18.5", "ja": "φ18.5"}', true, '2026-08-24 09:19:51.802097+00', '2026-08-24 09:19:51.802097+00');
INSERT INTO app.material_diameters VALUES ('190', 19.000, '{"en": "φ19.0", "ja": "φ19.0"}', true, '2026-08-24 09:19:51.802316+00', '2026-08-24 09:19:51.802316+00');
INSERT INTO app.material_diameters VALUES ('195', 19.500, '{"en": "φ19.5", "ja": "φ19.5"}', true, '2026-08-24 09:19:51.802539+00', '2026-08-24 09:19:51.802539+00');
INSERT INTO app.material_diameters VALUES ('200', 20.000, '{"en": "φ20.0", "ja": "φ20.0"}', true, '2026-08-24 09:19:51.802776+00', '2026-08-24 09:19:51.802776+00');
INSERT INTO app.material_diameters VALUES ('205', 20.500, '{"en": "φ20.5", "ja": "φ20.5"}', true, '2026-08-24 09:19:51.803019+00', '2026-08-24 09:19:51.803019+00');
INSERT INTO app.material_diameters VALUES ('210', 21.000, '{"en": "φ21.0", "ja": "φ21.0"}', true, '2026-08-24 09:19:51.803247+00', '2026-08-24 09:19:51.803247+00');
INSERT INTO app.material_diameters VALUES ('215', 21.500, '{"en": "φ21.5", "ja": "φ21.5"}', true, '2026-08-24 09:19:51.80348+00', '2026-08-24 09:19:51.80348+00');
INSERT INTO app.material_diameters VALUES ('220', 22.000, '{"en": "φ22.0", "ja": "φ22.0"}', true, '2026-08-24 09:19:51.803755+00', '2026-08-24 09:19:51.803755+00');
INSERT INTO app.material_diameters VALUES ('225', 22.500, '{"en": "φ22.5", "ja": "φ22.5"}', true, '2026-08-24 09:19:51.80399+00', '2026-08-24 09:19:51.80399+00');
INSERT INTO app.material_diameters VALUES ('230', 23.000, '{"en": "φ23.0", "ja": "φ23.0"}', true, '2026-08-24 09:19:51.8042+00', '2026-08-24 09:19:51.8042+00');
INSERT INTO app.material_diameters VALUES ('235', 23.500, '{"en": "φ23.5", "ja": "φ23.5"}', true, '2026-08-24 09:19:51.804423+00', '2026-08-24 09:19:51.804423+00');
INSERT INTO app.material_diameters VALUES ('240', 24.000, '{"en": "φ24.0", "ja": "φ24.0"}', true, '2026-08-24 09:19:51.804657+00', '2026-08-24 09:19:51.804657+00');
INSERT INTO app.material_diameters VALUES ('250', 25.000, '{"en": "φ25.0", "ja": "φ25.0"}', true, '2026-08-24 09:19:51.804916+00', '2026-08-24 09:19:51.804916+00');
INSERT INTO app.material_diameters VALUES ('255', 25.500, '{"en": "φ25.5", "ja": "φ25.5"}', true, '2026-08-24 09:19:51.805138+00', '2026-08-24 09:19:51.805138+00');
INSERT INTO app.material_diameters VALUES ('260', 26.000, '{"en": "φ26.0", "ja": "φ26.0"}', true, '2026-08-24 09:19:51.805353+00', '2026-08-24 09:19:51.805353+00');
INSERT INTO app.material_diameters VALUES ('270', 27.000, '{"en": "φ27.0", "ja": "φ27.0"}', true, '2026-08-24 09:19:51.80555+00', '2026-08-24 09:19:51.80555+00');
INSERT INTO app.material_diameters VALUES ('280', 28.000, '{"en": "φ28.0", "ja": "φ28.0"}', true, '2026-08-24 09:19:51.805764+00', '2026-08-24 09:19:51.805764+00');
INSERT INTO app.material_diameters VALUES ('290', 29.000, '{"en": "φ29.0", "ja": "φ29.0"}', true, '2026-08-24 09:19:51.806004+00', '2026-08-24 09:19:51.806004+00');
INSERT INTO app.material_diameters VALUES ('300', 30.000, '{"en": "φ30.0", "ja": "φ30.0"}', true, '2026-08-24 09:19:51.806283+00', '2026-08-24 09:19:51.806283+00');
INSERT INTO app.material_diameters VALUES ('310', 31.000, '{"en": "φ31.0", "ja": "φ31.0"}', true, '2026-08-24 09:19:51.806664+00', '2026-08-24 09:19:51.806664+00');
INSERT INTO app.material_diameters VALUES ('320', 32.000, '{"en": "φ32.0", "ja": "φ32.0"}', true, '2026-08-24 09:19:51.806931+00', '2026-08-24 09:19:51.806931+00');
INSERT INTO app.material_diameters VALUES ('330', 33.000, '{"en": "φ33.0", "ja": "φ33.0"}', true, '2026-08-24 09:19:51.807233+00', '2026-08-24 09:19:51.807233+00');
INSERT INTO app.material_diameters VALUES ('340', 34.000, '{"en": "φ34.0", "ja": "φ34.0"}', true, '2026-08-24 09:19:51.807543+00', '2026-08-24 09:19:51.807543+00');
INSERT INTO app.material_diameters VALUES ('350', 35.000, '{"en": "φ35.0", "ja": "φ35.0"}', true, '2026-08-24 09:19:51.807882+00', '2026-08-24 09:19:51.807882+00');
INSERT INTO app.material_diameters VALUES ('360', 36.000, '{"en": "φ36.0", "ja": "φ36.0"}', true, '2026-08-24 09:19:51.808158+00', '2026-08-24 09:19:51.808158+00');
INSERT INTO app.material_diameters VALUES ('380', 38.000, '{"en": "φ38.0", "ja": "φ38.0"}', true, '2026-08-24 09:19:51.808426+00', '2026-08-24 09:19:51.808426+00');
INSERT INTO app.material_diameters VALUES ('400', 40.000, '{"en": "φ40.0", "ja": "φ40.0"}', true, '2026-08-24 09:19:51.808719+00', '2026-08-24 09:19:51.808719+00');
INSERT INTO app.material_diameters VALUES ('420', 42.000, '{"en": "φ42.0", "ja": "φ42.0"}', true, '2026-08-24 09:19:51.809009+00', '2026-08-24 09:19:51.809009+00');
INSERT INTO app.material_diameters VALUES ('460', 46.000, '{"en": "φ46.0", "ja": "φ46.0"}', true, '2026-08-24 09:19:51.809247+00', '2026-08-24 09:19:51.809247+00');


--
-- Data for Name: material_length_variants; Type: TABLE DATA; Schema: app; Owner: postgres
--

INSERT INTO app.material_length_variants VALUES ('310', 310.000, NULL, '{"en": "310mm", "ja": "310mm"}', NULL, true, '2026-08-24 09:19:51.809576+00', '2026-08-24 09:19:51.809576+00');
INSERT INTO app.material_length_variants VALUES ('330', 330.000, NULL, '{"en": "330mm", "ja": "330mm"}', NULL, true, '2026-08-24 09:19:51.810025+00', '2026-08-24 09:19:51.810025+00');


--
-- Data for Name: material_manufacturers; Type: TABLE DATA; Schema: app; Owner: postgres
--

INSERT INTO app.material_manufacturers VALUES ('A', '{"en": "AXIS", "ja": "アクシス"}', true, '2026-08-24 09:19:51.786552+00', '2026-08-24 09:19:51.786552+00');
INSERT INTO app.material_manufacturers VALUES ('B', '{"en": "AFC", "ja": "AFC"}', true, '2026-08-24 09:19:51.787151+00', '2026-08-24 09:19:51.787151+00');
INSERT INTO app.material_manufacturers VALUES ('C', '{"en": "Nippon Kinsagi", "ja": "日本金鷺"}', true, '2026-08-24 09:19:51.787401+00', '2026-08-24 09:19:51.787401+00');
INSERT INTO app.material_manufacturers VALUES ('D', '{"en": "Ceratizit", "ja": "セラティジット"}', true, '2026-08-24 09:19:51.787625+00', '2026-08-24 09:19:51.787625+00');
INSERT INTO app.material_manufacturers VALUES ('E', '{"en": "Nippon Tokushu Gokin", "ja": "日本特殊合金"}', true, '2026-08-24 09:19:51.78786+00', '2026-08-24 09:19:51.78786+00');


--
-- Data for Name: material_manufacturer_grades; Type: TABLE DATA; Schema: app; Owner: postgres
--

INSERT INTO app.material_manufacturer_grades VALUES ('B', '01', '{"en": "K10UF", "ja": "K10UF"}', true, '2026-08-24 09:19:51.789735+00', '2026-08-24 09:19:51.789735+00');
INSERT INTO app.material_manufacturer_grades VALUES ('B', '02', '{"en": "K20CF", "ja": "K20CF"}', true, '2026-08-24 09:19:51.790106+00', '2026-08-24 09:19:51.790106+00');
INSERT INTO app.material_manufacturer_grades VALUES ('B', '03', '{"en": "K34EF", "ja": "K34EF"}', true, '2026-08-24 09:19:51.790384+00', '2026-08-24 09:19:51.790384+00');
INSERT INTO app.material_manufacturer_grades VALUES ('B', '04', '{"en": "K40UF", "ja": "K40UF"}', true, '2026-08-24 09:19:51.790654+00', '2026-08-24 09:19:51.790654+00');
INSERT INTO app.material_manufacturer_grades VALUES ('B', '05', '{"en": "K44EF", "ja": "K44EF"}', true, '2026-08-24 09:19:51.790886+00', '2026-08-24 09:19:51.790886+00');
INSERT INTO app.material_manufacturer_grades VALUES ('B', '06', '{"en": "K45EF", "ja": "K45EF"}', true, '2026-08-24 09:19:51.791117+00', '2026-08-24 09:19:51.791117+00');
INSERT INTO app.material_manufacturer_grades VALUES ('A', '01', '{"en": "AF308", "ja": "AF308"}', true, '2026-08-24 09:19:51.791347+00', '2026-08-24 09:19:51.791347+00');
INSERT INTO app.material_manufacturer_grades VALUES ('A', '02', '{"en": "AF510", "ja": "AF510"}', true, '2026-08-24 09:19:51.791607+00', '2026-08-24 09:19:51.791607+00');
INSERT INTO app.material_manufacturer_grades VALUES ('A', '03', '{"en": "AF805", "ja": "AF805"}', true, '2026-08-24 09:19:51.791833+00', '2026-08-24 09:19:51.791833+00');
INSERT INTO app.material_manufacturer_grades VALUES ('D', '01', '{"en": "CTS12D", "ja": "CTS12D"}', true, '2026-08-24 09:19:51.792046+00', '2026-08-24 09:19:51.792046+00');
INSERT INTO app.material_manufacturer_grades VALUES ('D', '02', '{"en": "CTS20D", "ja": "CTS20D"}', true, '2026-08-24 09:19:51.792279+00', '2026-08-24 09:19:51.792279+00');
INSERT INTO app.material_manufacturer_grades VALUES ('E', '01', '{"en": "SH10", "ja": "SH10"}', true, '2026-08-24 09:19:51.792497+00', '2026-08-24 09:19:51.792497+00');
INSERT INTO app.material_manufacturer_grades VALUES ('C', '01', '{"en": "GU20F", "ja": "GU20F"}', true, '2026-08-24 09:19:51.792741+00', '2026-08-24 09:19:51.792741+00');


--
-- Data for Name: material_shapes; Type: TABLE DATA; Schema: app; Owner: postgres
--

INSERT INTO app.material_shapes VALUES ('A', '{"en": "Standard", "ja": "通常"}', true, '2026-08-24 09:19:51.788076+00', '2026-08-24 09:19:51.788076+00');
INSERT INTO app.material_shapes VALUES ('B', '{"en": "OH", "ja": "OH"}', true, '2026-08-24 09:19:51.788362+00', '2026-08-24 09:19:51.788362+00');
INSERT INTO app.material_shapes VALUES ('C', '{"en": "Cylinder", "ja": "円筒"}', true, '2026-08-24 09:19:51.788603+00', '2026-08-24 09:19:51.788603+00');


--
-- Data for Name: material_surface_finishes; Type: TABLE DATA; Schema: app; Owner: postgres
--

INSERT INTO app.material_surface_finishes VALUES ('A', '{"en": "Black skin", "ja": "黒皮"}', true, '2026-08-24 09:19:51.789256+00', '2026-08-24 09:19:51.789256+00');
INSERT INTO app.material_surface_finishes VALUES ('B', '{"en": "Polished", "ja": "研磨"}', true, '2026-08-24 09:19:51.78953+00', '2026-08-24 09:19:51.78953+00');


--
-- Data for Name: material_types; Type: TABLE DATA; Schema: app; Owner: postgres
--

INSERT INTO app.material_types VALUES ('{"en": "K10UF", "ja": "K10UF"}', NULL, true, '2026-08-24 09:19:51.810312+00', '2026-08-24 09:19:51.810312+00', '01', '0001', 'B', 'A', 1, 'B01A0001', NULL);
INSERT INTO app.material_types VALUES ('{"en": "K20CF", "ja": "K20CF"}', NULL, true, '2026-08-24 09:19:51.810864+00', '2026-08-24 09:19:51.810864+00', '02', '0001', 'B', 'A', 2, 'B02A0001', NULL);
INSERT INTO app.material_types VALUES ('{"en": "K34EF", "ja": "K34EF"}', NULL, true, '2026-08-24 09:19:51.81116+00', '2026-08-24 09:19:51.81116+00', '03', '0001', 'B', 'A', 3, 'B03A0001', NULL);
INSERT INTO app.material_types VALUES ('{"en": "K40UF", "ja": "K40UF"}', NULL, true, '2026-08-24 09:19:51.811428+00', '2026-08-24 09:19:51.811428+00', '04', '0001', 'B', 'A', 4, 'B04A0001', NULL);
INSERT INTO app.material_types VALUES ('{"en": "K44EF", "ja": "K44EF"}', NULL, true, '2026-08-24 09:19:51.811682+00', '2026-08-24 09:19:51.811682+00', '05', '0001', 'B', 'A', 5, 'B05A0001', NULL);
INSERT INTO app.material_types VALUES ('{"en": "K45EF", "ja": "K45EF"}', NULL, true, '2026-08-24 09:19:51.811942+00', '2026-08-24 09:19:51.811942+00', '06', '0001', 'B', 'A', 6, 'B06A0001', NULL);
INSERT INTO app.material_types VALUES ('{"en": "AF308", "ja": "AF308"}', NULL, true, '2026-08-24 09:19:51.812234+00', '2026-08-24 09:19:51.812234+00', '01', '0001', 'A', 'A', 7, 'A01A0001', NULL);
INSERT INTO app.material_types VALUES ('{"en": "AF510", "ja": "AF510"}', NULL, true, '2026-08-24 09:19:51.8125+00', '2026-08-24 09:19:51.8125+00', '02', '0001', 'A', 'A', 8, 'A02A0001', NULL);
INSERT INTO app.material_types VALUES ('{"en": "AF805", "ja": "AF805"}', NULL, true, '2026-08-24 09:19:51.812773+00', '2026-08-24 09:19:51.812773+00', '03', '0001', 'A', 'A', 9, 'A03A0001', NULL);
INSERT INTO app.material_types VALUES ('{"en": "CTS12D", "ja": "CTS12D"}', NULL, true, '2026-08-24 09:19:51.813039+00', '2026-08-24 09:19:51.813039+00', '01', '0001', 'D', 'A', 10, 'D01A0001', NULL);
INSERT INTO app.material_types VALUES ('{"en": "CTS20D", "ja": "CTS20D"}', NULL, true, '2026-08-24 09:19:51.813282+00', '2026-08-24 09:19:51.813282+00', '02', '0001', 'D', 'A', 11, 'D02A0001', NULL);
INSERT INTO app.material_types VALUES ('{"en": "SH10", "ja": "SH10"}', NULL, true, '2026-08-24 09:19:51.813524+00', '2026-08-24 09:19:51.813524+00', '01', '0001', 'E', 'A', 12, 'E01A0001', NULL);
INSERT INTO app.material_types VALUES ('{"en": "GU20F", "ja": "GU20F"}', NULL, true, '2026-08-24 09:19:51.813793+00', '2026-08-24 09:19:51.813793+00', '01', '0001', 'C', 'A', 13, 'C01A0001', NULL);


--
-- Data for Name: materials; Type: TABLE DATA; Schema: app; Owner: postgres
--

INSERT INTO app.materials VALUES ('A02A0001-A250-310', '{"en": "AF510 Black skin φ25.0x310", "ja": "AF510 黒皮 φ25.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.81405+00', '2026-08-24 09:19:51.81405+00', '250', 25.000, 'A0', 310.000, '310', NULL, NULL, 'A', 8, 1, '{}');
INSERT INTO app.materials VALUES ('A02A0001-A200-310', '{"en": "AF510 Black skin φ20.0x310", "ja": "AF510 黒皮 φ20.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.814614+00', '2026-08-24 09:19:51.814614+00', '200', 20.000, 'A0', 310.000, '310', NULL, NULL, 'A', 8, 2, '{}');
INSERT INTO app.materials VALUES ('A02A0001-A190-310', '{"en": "AF510 Black skin φ19.0x310", "ja": "AF510 黒皮 φ19.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.814933+00', '2026-08-24 09:19:51.814933+00', '190', 19.000, 'A0', 310.000, '310', NULL, NULL, 'A', 8, 3, '{}');
INSERT INTO app.materials VALUES ('A02A0001-A180-310', '{"en": "AF510 Black skin φ18.0x310", "ja": "AF510 黒皮 φ18.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.815229+00', '2026-08-24 09:19:51.815229+00', '180', 18.000, 'A0', 310.000, '310', NULL, NULL, 'A', 8, 4, '{}');
INSERT INTO app.materials VALUES ('A02A0001-A170-310', '{"en": "AF510 Black skin φ17.0x310", "ja": "AF510 黒皮 φ17.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.815568+00', '2026-08-24 09:19:51.815568+00', '170', 17.000, 'A0', 310.000, '310', NULL, NULL, 'A', 8, 5, '{}');
INSERT INTO app.materials VALUES ('A02A0001-A160-310', '{"en": "AF510 Black skin φ16.0x310", "ja": "AF510 黒皮 φ16.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.815914+00', '2026-08-24 09:19:51.815914+00', '160', 16.000, 'A0', 310.000, '310', NULL, NULL, 'A', 8, 6, '{}');
INSERT INTO app.materials VALUES ('A02A0001-A150-310', '{"en": "AF510 Black skin φ15.0x310", "ja": "AF510 黒皮 φ15.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.816254+00', '2026-08-24 09:19:51.816254+00', '150', 15.000, 'A0', 310.000, '310', NULL, NULL, 'A', 8, 7, '{}');
INSERT INTO app.materials VALUES ('A02A0001-A140-310', '{"en": "AF510 Black skin φ14.0x310", "ja": "AF510 黒皮 φ14.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.816604+00', '2026-08-24 09:19:51.816604+00', '140', 14.000, 'A0', 310.000, '310', NULL, NULL, 'A', 8, 8, '{}');
INSERT INTO app.materials VALUES ('A02A0001-A130-310', '{"en": "AF510 Black skin φ13.0x310", "ja": "AF510 黒皮 φ13.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.816899+00', '2026-08-24 09:19:51.816899+00', '130', 13.000, 'A0', 310.000, '310', NULL, NULL, 'A', 8, 9, '{}');
INSERT INTO app.materials VALUES ('A02A0001-A120-310', '{"en": "AF510 Black skin φ12.0x310", "ja": "AF510 黒皮 φ12.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.817201+00', '2026-08-24 09:19:51.817201+00', '120', 12.000, 'A0', 310.000, '310', NULL, NULL, 'A', 8, 10, '{}');
INSERT INTO app.materials VALUES ('A02A0001-A110-310', '{"en": "AF510 Black skin φ11.0x310", "ja": "AF510 黒皮 φ11.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.817493+00', '2026-08-24 09:19:51.817493+00', '110', 11.000, 'A0', 310.000, '310', NULL, NULL, 'A', 8, 11, '{}');
INSERT INTO app.materials VALUES ('A02A0001-A100-310', '{"en": "AF510 Black skin φ10.0x310", "ja": "AF510 黒皮 φ10.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.817793+00', '2026-08-24 09:19:51.817793+00', '100', 10.000, 'A0', 310.000, '310', NULL, NULL, 'A', 8, 12, '{}');
INSERT INTO app.materials VALUES ('A02A0001-A090-310', '{"en": "AF510 Black skin φ9.0x310", "ja": "AF510 黒皮 φ9.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.818171+00', '2026-08-24 09:19:51.818171+00', '090', 9.000, 'A0', 310.000, '310', NULL, NULL, 'A', 8, 13, '{}');
INSERT INTO app.materials VALUES ('A02A0001-A080-310', '{"en": "AF510 Black skin φ8.0x310", "ja": "AF510 黒皮 φ8.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.818476+00', '2026-08-24 09:19:51.818476+00', '080', 8.000, 'A0', 310.000, '310', NULL, NULL, 'A', 8, 14, '{}');
INSERT INTO app.materials VALUES ('A02A0001-A070-310', '{"en": "AF510 Black skin φ7.0x310", "ja": "AF510 黒皮 φ7.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.818761+00', '2026-08-24 09:19:51.818761+00', '070', 7.000, 'A0', 310.000, '310', NULL, NULL, 'A', 8, 15, '{}');
INSERT INTO app.materials VALUES ('A02A0001-A060-310', '{"en": "AF510 Black skin φ6.0x310", "ja": "AF510 黒皮 φ6.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.819089+00', '2026-08-24 09:19:51.819089+00', '060', 6.000, 'A0', 310.000, '310', NULL, NULL, 'A', 8, 16, '{}');
INSERT INTO app.materials VALUES ('A02A0001-A050-310', '{"en": "AF510 Black skin φ5.0x310", "ja": "AF510 黒皮 φ5.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.819357+00', '2026-08-24 09:19:51.819357+00', '050', 5.000, 'A0', 310.000, '310', NULL, NULL, 'A', 8, 17, '{}');
INSERT INTO app.materials VALUES ('A02A0001-A040-310', '{"en": "AF510 Black skin φ4.0x310", "ja": "AF510 黒皮 φ4.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.819619+00', '2026-08-24 09:19:51.819619+00', '040', 4.000, 'A0', 310.000, '310', NULL, NULL, 'A', 8, 18, '{}');
INSERT INTO app.materials VALUES ('A02A0001-A030-310', '{"en": "AF510 Black skin φ3.0x310", "ja": "AF510 黒皮 φ3.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.819904+00', '2026-08-24 09:19:51.819904+00', '030', 3.000, 'A0', 310.000, '310', NULL, NULL, 'A', 8, 19, '{}');
INSERT INTO app.materials VALUES ('A02A0001-A020-310', '{"en": "AF510 Black skin φ2.0x310", "ja": "AF510 黒皮 φ2.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.820171+00', '2026-08-24 09:19:51.820171+00', '020', 2.000, 'A0', 310.000, '310', NULL, NULL, 'A', 8, 20, '{}');
INSERT INTO app.materials VALUES ('A02A0001-A010-310', '{"en": "AF510 Black skin φ1.0x310", "ja": "AF510 黒皮 φ1.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.820454+00', '2026-08-24 09:19:51.820454+00', '010', 1.000, 'A0', 310.000, '310', NULL, NULL, 'A', 8, 21, '{}');
INSERT INTO app.materials VALUES ('A03A0001-A250-310', '{"en": "AF805 Black skin φ25.0x310", "ja": "AF805 黒皮 φ25.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.820816+00', '2026-08-24 09:19:51.820816+00', '250', 25.000, 'A0', 310.000, '310', NULL, NULL, 'A', 9, 22, '{}');
INSERT INTO app.materials VALUES ('A03A0001-A200-310', '{"en": "AF805 Black skin φ20.0x310", "ja": "AF805 黒皮 φ20.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.82113+00', '2026-08-24 09:19:51.82113+00', '200', 20.000, 'A0', 310.000, '310', NULL, NULL, 'A', 9, 23, '{}');
INSERT INTO app.materials VALUES ('A03A0001-A190-310', '{"en": "AF805 Black skin φ19.0x310", "ja": "AF805 黒皮 φ19.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.821407+00', '2026-08-24 09:19:51.821407+00', '190', 19.000, 'A0', 310.000, '310', NULL, NULL, 'A', 9, 24, '{}');
INSERT INTO app.materials VALUES ('A03A0001-A180-310', '{"en": "AF805 Black skin φ18.0x310", "ja": "AF805 黒皮 φ18.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.821681+00', '2026-08-24 09:19:51.821681+00', '180', 18.000, 'A0', 310.000, '310', NULL, NULL, 'A', 9, 25, '{}');
INSERT INTO app.materials VALUES ('A03A0001-A170-310', '{"en": "AF805 Black skin φ17.0x310", "ja": "AF805 黒皮 φ17.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.821952+00', '2026-08-24 09:19:51.821952+00', '170', 17.000, 'A0', 310.000, '310', NULL, NULL, 'A', 9, 26, '{}');
INSERT INTO app.materials VALUES ('A03A0001-A160-310', '{"en": "AF805 Black skin φ16.0x310", "ja": "AF805 黒皮 φ16.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.822244+00', '2026-08-24 09:19:51.822244+00', '160', 16.000, 'A0', 310.000, '310', NULL, NULL, 'A', 9, 27, '{}');
INSERT INTO app.materials VALUES ('A03A0001-A150-310', '{"en": "AF805 Black skin φ15.0x310", "ja": "AF805 黒皮 φ15.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.822523+00', '2026-08-24 09:19:51.822523+00', '150', 15.000, 'A0', 310.000, '310', NULL, NULL, 'A', 9, 28, '{}');
INSERT INTO app.materials VALUES ('A03A0001-A140-310', '{"en": "AF805 Black skin φ14.0x310", "ja": "AF805 黒皮 φ14.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.82279+00', '2026-08-24 09:19:51.82279+00', '140', 14.000, 'A0', 310.000, '310', NULL, NULL, 'A', 9, 29, '{}');
INSERT INTO app.materials VALUES ('A03A0001-A130-310', '{"en": "AF805 Black skin φ13.0x310", "ja": "AF805 黒皮 φ13.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.823086+00', '2026-08-24 09:19:51.823086+00', '130', 13.000, 'A0', 310.000, '310', NULL, NULL, 'A', 9, 30, '{}');
INSERT INTO app.materials VALUES ('A03A0001-A120-310', '{"en": "AF805 Black skin φ12.0x310", "ja": "AF805 黒皮 φ12.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.823355+00', '2026-08-24 09:19:51.823355+00', '120', 12.000, 'A0', 310.000, '310', NULL, NULL, 'A', 9, 31, '{}');
INSERT INTO app.materials VALUES ('A03A0001-A110-310', '{"en": "AF805 Black skin φ11.0x310", "ja": "AF805 黒皮 φ11.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.82362+00', '2026-08-24 09:19:51.82362+00', '110', 11.000, 'A0', 310.000, '310', NULL, NULL, 'A', 9, 32, '{}');
INSERT INTO app.materials VALUES ('A03A0001-A100-310', '{"en": "AF805 Black skin φ10.0x310", "ja": "AF805 黒皮 φ10.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.823886+00', '2026-08-24 09:19:51.823886+00', '100', 10.000, 'A0', 310.000, '310', NULL, NULL, 'A', 9, 33, '{}');
INSERT INTO app.materials VALUES ('A03A0001-A090-310', '{"en": "AF805 Black skin φ9.0x310", "ja": "AF805 黒皮 φ9.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.824232+00', '2026-08-24 09:19:51.824232+00', '090', 9.000, 'A0', 310.000, '310', NULL, NULL, 'A', 9, 34, '{}');
INSERT INTO app.materials VALUES ('A03A0001-A080-310', '{"en": "AF805 Black skin φ8.0x310", "ja": "AF805 黒皮 φ8.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.824503+00', '2026-08-24 09:19:51.824503+00', '080', 8.000, 'A0', 310.000, '310', NULL, NULL, 'A', 9, 35, '{}');
INSERT INTO app.materials VALUES ('A03A0001-A070-310', '{"en": "AF805 Black skin φ7.0x310", "ja": "AF805 黒皮 φ7.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.82478+00', '2026-08-24 09:19:51.82478+00', '070', 7.000, 'A0', 310.000, '310', NULL, NULL, 'A', 9, 36, '{}');
INSERT INTO app.materials VALUES ('A03A0001-A060-310', '{"en": "AF805 Black skin φ6.0x310", "ja": "AF805 黒皮 φ6.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.825054+00', '2026-08-24 09:19:51.825054+00', '060', 6.000, 'A0', 310.000, '310', NULL, NULL, 'A', 9, 37, '{}');
INSERT INTO app.materials VALUES ('A03A0001-A050-310', '{"en": "AF805 Black skin φ5.0x310", "ja": "AF805 黒皮 φ5.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.825316+00', '2026-08-24 09:19:51.825316+00', '050', 5.000, 'A0', 310.000, '310', NULL, NULL, 'A', 9, 38, '{}');
INSERT INTO app.materials VALUES ('A03A0001-A040-310', '{"en": "AF805 Black skin φ4.0x310", "ja": "AF805 黒皮 φ4.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.825591+00', '2026-08-24 09:19:51.825591+00', '040', 4.000, 'A0', 310.000, '310', NULL, NULL, 'A', 9, 39, '{}');
INSERT INTO app.materials VALUES ('A03A0001-A030-310', '{"en": "AF805 Black skin φ3.0x310", "ja": "AF805 黒皮 φ3.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.825865+00', '2026-08-24 09:19:51.825865+00', '030', 3.000, 'A0', 310.000, '310', NULL, NULL, 'A', 9, 40, '{}');
INSERT INTO app.materials VALUES ('A03A0001-A020-310', '{"en": "AF805 Black skin φ2.0x310", "ja": "AF805 黒皮 φ2.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.826144+00', '2026-08-24 09:19:51.826144+00', '020', 2.000, 'A0', 310.000, '310', NULL, NULL, 'A', 9, 41, '{}');
INSERT INTO app.materials VALUES ('A03A0001-A010-310', '{"en": "AF805 Black skin φ1.0x310", "ja": "AF805 黒皮 φ1.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.826407+00', '2026-08-24 09:19:51.826407+00', '010', 1.000, 'A0', 310.000, '310', NULL, NULL, 'A', 9, 42, '{}');
INSERT INTO app.materials VALUES ('A01A0001-A250-310', '{"en": "AF308 Black skin φ25.0x310", "ja": "AF308 黒皮 φ25.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.826701+00', '2026-08-24 09:19:51.826701+00', '250', 25.000, 'A0', 310.000, '310', NULL, NULL, 'A', 7, 43, '{}');
INSERT INTO app.materials VALUES ('A01A0001-A200-310', '{"en": "AF308 Black skin φ20.0x310", "ja": "AF308 黒皮 φ20.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.826971+00', '2026-08-24 09:19:51.826971+00', '200', 20.000, 'A0', 310.000, '310', NULL, NULL, 'A', 7, 44, '{}');
INSERT INTO app.materials VALUES ('A01A0001-A190-310', '{"en": "AF308 Black skin φ19.0x310", "ja": "AF308 黒皮 φ19.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.827243+00', '2026-08-24 09:19:51.827243+00', '190', 19.000, 'A0', 310.000, '310', NULL, NULL, 'A', 7, 45, '{}');
INSERT INTO app.materials VALUES ('A01A0001-A180-310', '{"en": "AF308 Black skin φ18.0x310", "ja": "AF308 黒皮 φ18.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.827503+00', '2026-08-24 09:19:51.827503+00', '180', 18.000, 'A0', 310.000, '310', NULL, NULL, 'A', 7, 46, '{}');
INSERT INTO app.materials VALUES ('A01A0001-A170-310', '{"en": "AF308 Black skin φ17.0x310", "ja": "AF308 黒皮 φ17.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.827786+00', '2026-08-24 09:19:51.827786+00', '170', 17.000, 'A0', 310.000, '310', NULL, NULL, 'A', 7, 47, '{}');
INSERT INTO app.materials VALUES ('A01A0001-A160-310', '{"en": "AF308 Black skin φ16.0x310", "ja": "AF308 黒皮 φ16.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.828087+00', '2026-08-24 09:19:51.828087+00', '160', 16.000, 'A0', 310.000, '310', NULL, NULL, 'A', 7, 48, '{}');
INSERT INTO app.materials VALUES ('A01A0001-A150-310', '{"en": "AF308 Black skin φ15.0x310", "ja": "AF308 黒皮 φ15.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.828402+00', '2026-08-24 09:19:51.828402+00', '150', 15.000, 'A0', 310.000, '310', NULL, NULL, 'A', 7, 49, '{}');
INSERT INTO app.materials VALUES ('A01A0001-A140-310', '{"en": "AF308 Black skin φ14.0x310", "ja": "AF308 黒皮 φ14.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.82868+00', '2026-08-24 09:19:51.82868+00', '140', 14.000, 'A0', 310.000, '310', NULL, NULL, 'A', 7, 50, '{}');
INSERT INTO app.materials VALUES ('A01A0001-A130-310', '{"en": "AF308 Black skin φ13.0x310", "ja": "AF308 黒皮 φ13.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.828955+00', '2026-08-24 09:19:51.828955+00', '130', 13.000, 'A0', 310.000, '310', NULL, NULL, 'A', 7, 51, '{}');
INSERT INTO app.materials VALUES ('A01A0001-A120-310', '{"en": "AF308 Black skin φ12.0x310", "ja": "AF308 黒皮 φ12.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.829236+00', '2026-08-24 09:19:51.829236+00', '120', 12.000, 'A0', 310.000, '310', NULL, NULL, 'A', 7, 52, '{}');
INSERT INTO app.materials VALUES ('A01A0001-A110-310', '{"en": "AF308 Black skin φ11.0x310", "ja": "AF308 黒皮 φ11.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.829511+00', '2026-08-24 09:19:51.829511+00', '110', 11.000, 'A0', 310.000, '310', NULL, NULL, 'A', 7, 53, '{}');
INSERT INTO app.materials VALUES ('A01A0001-A100-310', '{"en": "AF308 Black skin φ10.0x310", "ja": "AF308 黒皮 φ10.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.829797+00', '2026-08-24 09:19:51.829797+00', '100', 10.000, 'A0', 310.000, '310', NULL, NULL, 'A', 7, 54, '{}');
INSERT INTO app.materials VALUES ('A01A0001-A090-310', '{"en": "AF308 Black skin φ9.0x310", "ja": "AF308 黒皮 φ9.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.830089+00', '2026-08-24 09:19:51.830089+00', '090', 9.000, 'A0', 310.000, '310', NULL, NULL, 'A', 7, 55, '{}');
INSERT INTO app.materials VALUES ('A01A0001-A080-310', '{"en": "AF308 Black skin φ8.0x310", "ja": "AF308 黒皮 φ8.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.830394+00', '2026-08-24 09:19:51.830394+00', '080', 8.000, 'A0', 310.000, '310', NULL, NULL, 'A', 7, 56, '{}');
INSERT INTO app.materials VALUES ('A01A0001-A070-310', '{"en": "AF308 Black skin φ7.0x310", "ja": "AF308 黒皮 φ7.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.83067+00', '2026-08-24 09:19:51.83067+00', '070', 7.000, 'A0', 310.000, '310', NULL, NULL, 'A', 7, 57, '{}');
INSERT INTO app.materials VALUES ('A01A0001-A060-310', '{"en": "AF308 Black skin φ6.0x310", "ja": "AF308 黒皮 φ6.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.830932+00', '2026-08-24 09:19:51.830932+00', '060', 6.000, 'A0', 310.000, '310', NULL, NULL, 'A', 7, 58, '{}');
INSERT INTO app.materials VALUES ('A01A0001-A050-310', '{"en": "AF308 Black skin φ5.0x310", "ja": "AF308 黒皮 φ5.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.831223+00', '2026-08-24 09:19:51.831223+00', '050', 5.000, 'A0', 310.000, '310', NULL, NULL, 'A', 7, 59, '{}');
INSERT INTO app.materials VALUES ('A01A0001-A040-310', '{"en": "AF308 Black skin φ4.0x310", "ja": "AF308 黒皮 φ4.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.831528+00', '2026-08-24 09:19:51.831528+00', '040', 4.000, 'A0', 310.000, '310', NULL, NULL, 'A', 7, 60, '{}');
INSERT INTO app.materials VALUES ('A01A0001-A030-310', '{"en": "AF308 Black skin φ3.0x310", "ja": "AF308 黒皮 φ3.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.831834+00', '2026-08-24 09:19:51.831834+00', '030', 3.000, 'A0', 310.000, '310', NULL, NULL, 'A', 7, 61, '{}');
INSERT INTO app.materials VALUES ('A01A0001-A020-310', '{"en": "AF308 Black skin φ2.0x310", "ja": "AF308 黒皮 φ2.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.832111+00', '2026-08-24 09:19:51.832111+00', '020', 2.000, 'A0', 310.000, '310', NULL, NULL, 'A', 7, 62, '{}');
INSERT INTO app.materials VALUES ('A01A0001-A010-310', '{"en": "AF308 Black skin φ1.0x310", "ja": "AF308 黒皮 φ1.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.832359+00', '2026-08-24 09:19:51.832359+00', '010', 1.000, 'A0', 310.000, '310', NULL, NULL, 'A', 7, 63, '{}');
INSERT INTO app.materials VALUES ('B04A0001-B350-310', '{"en": "K40UF Polished φ35.0x310", "ja": "K40UF 研磨 φ35.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.832623+00', '2026-08-24 09:19:51.832623+00', '350', 35.000, 'A0', 310.000, '310', NULL, NULL, 'B', 4, 64, '{}');
INSERT INTO app.materials VALUES ('B04A0001-B340-310', '{"en": "K40UF Polished φ34.0x310", "ja": "K40UF 研磨 φ34.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.832888+00', '2026-08-24 09:19:51.832888+00', '340', 34.000, 'A0', 310.000, '310', NULL, NULL, 'B', 4, 65, '{}');
INSERT INTO app.materials VALUES ('B04A0001-B330-310', '{"en": "K40UF Polished φ33.0x310", "ja": "K40UF 研磨 φ33.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.83315+00', '2026-08-24 09:19:51.83315+00', '330', 33.000, 'A0', 310.000, '310', NULL, NULL, 'B', 4, 66, '{}');
INSERT INTO app.materials VALUES ('B04A0001-B320-310', '{"en": "K40UF Polished φ32.0x310", "ja": "K40UF 研磨 φ32.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.833424+00', '2026-08-24 09:19:51.833424+00', '320', 32.000, 'A0', 310.000, '310', NULL, NULL, 'B', 4, 67, '{}');
INSERT INTO app.materials VALUES ('B04A0001-B310-310', '{"en": "K40UF Polished φ31.0x310", "ja": "K40UF 研磨 φ31.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.833682+00', '2026-08-24 09:19:51.833682+00', '310', 31.000, 'A0', 310.000, '310', NULL, NULL, 'B', 4, 68, '{}');
INSERT INTO app.materials VALUES ('B04A0001-B300-310', '{"en": "K40UF Polished φ30.0x310", "ja": "K40UF 研磨 φ30.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.833938+00', '2026-08-24 09:19:51.833938+00', '300', 30.000, 'A0', 310.000, '310', NULL, NULL, 'B', 4, 69, '{}');
INSERT INTO app.materials VALUES ('B04A0001-B290-310', '{"en": "K40UF Polished φ29.0x310", "ja": "K40UF 研磨 φ29.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.834219+00', '2026-08-24 09:19:51.834219+00', '290', 29.000, 'A0', 310.000, '310', NULL, NULL, 'B', 4, 70, '{}');
INSERT INTO app.materials VALUES ('B04A0001-B280-310', '{"en": "K40UF Polished φ28.0x310", "ja": "K40UF 研磨 φ28.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.834482+00', '2026-08-24 09:19:51.834482+00', '280', 28.000, 'A0', 310.000, '310', NULL, NULL, 'B', 4, 71, '{}');
INSERT INTO app.materials VALUES ('B04A0001-B270-310', '{"en": "K40UF Polished φ27.0x310", "ja": "K40UF 研磨 φ27.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.834747+00', '2026-08-24 09:19:51.834747+00', '270', 27.000, 'A0', 310.000, '310', NULL, NULL, 'B', 4, 72, '{}');
INSERT INTO app.materials VALUES ('B04A0001-B260-310', '{"en": "K40UF Polished φ26.0x310", "ja": "K40UF 研磨 φ26.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.835026+00', '2026-08-24 09:19:51.835026+00', '260', 26.000, 'A0', 310.000, '310', NULL, NULL, 'B', 4, 73, '{}');
INSERT INTO app.materials VALUES ('B04A0001-B250-310', '{"en": "K40UF Polished φ25.0x310", "ja": "K40UF 研磨 φ25.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.835288+00', '2026-08-24 09:19:51.835288+00', '250', 25.000, 'A0', 310.000, '310', NULL, NULL, 'B', 4, 74, '{}');
INSERT INTO app.materials VALUES ('B04A0001-B240-310', '{"en": "K40UF Polished φ24.0x310", "ja": "K40UF 研磨 φ24.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.835585+00', '2026-08-24 09:19:51.835585+00', '240', 24.000, 'A0', 310.000, '310', NULL, NULL, 'B', 4, 75, '{}');
INSERT INTO app.materials VALUES ('B04A0001-B230-310', '{"en": "K40UF Polished φ23.0x310", "ja": "K40UF 研磨 φ23.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.835898+00', '2026-08-24 09:19:51.835898+00', '230', 23.000, 'A0', 310.000, '310', NULL, NULL, 'B', 4, 76, '{}');
INSERT INTO app.materials VALUES ('B04A0001-B220-310', '{"en": "K40UF Polished φ22.0x310", "ja": "K40UF 研磨 φ22.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.836163+00', '2026-08-24 09:19:51.836163+00', '220', 22.000, 'A0', 310.000, '310', NULL, NULL, 'B', 4, 77, '{}');
INSERT INTO app.materials VALUES ('B04A0001-B210-310', '{"en": "K40UF Polished φ21.0x310", "ja": "K40UF 研磨 φ21.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.836485+00', '2026-08-24 09:19:51.836485+00', '210', 21.000, 'A0', 310.000, '310', NULL, NULL, 'B', 4, 78, '{}');
INSERT INTO app.materials VALUES ('B04A0001-B200-310', '{"en": "K40UF Polished φ20.0x310", "ja": "K40UF 研磨 φ20.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.836764+00', '2026-08-24 09:19:51.836764+00', '200', 20.000, 'A0', 310.000, '310', NULL, NULL, 'B', 4, 79, '{}');
INSERT INTO app.materials VALUES ('B04A0001-B190-310', '{"en": "K40UF Polished φ19.0x310", "ja": "K40UF 研磨 φ19.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.837049+00', '2026-08-24 09:19:51.837049+00', '190', 19.000, 'A0', 310.000, '310', NULL, NULL, 'B', 4, 80, '{}');
INSERT INTO app.materials VALUES ('B04A0001-B180-310', '{"en": "K40UF Polished φ18.0x310", "ja": "K40UF 研磨 φ18.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.837364+00', '2026-08-24 09:19:51.837364+00', '180', 18.000, 'A0', 310.000, '310', NULL, NULL, 'B', 4, 81, '{}');
INSERT INTO app.materials VALUES ('B04A0001-B170-310', '{"en": "K40UF Polished φ17.0x310", "ja": "K40UF 研磨 φ17.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.837654+00', '2026-08-24 09:19:51.837654+00', '170', 17.000, 'A0', 310.000, '310', NULL, NULL, 'B', 4, 82, '{}');
INSERT INTO app.materials VALUES ('B04A0001-B160-310', '{"en": "K40UF Polished φ16.0x310", "ja": "K40UF 研磨 φ16.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.837918+00', '2026-08-24 09:19:51.837918+00', '160', 16.000, 'A0', 310.000, '310', NULL, NULL, 'B', 4, 83, '{}');
INSERT INTO app.materials VALUES ('B04A0001-B155-310', '{"en": "K40UF Polished φ15.5x310", "ja": "K40UF 研磨 φ15.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.838188+00', '2026-08-24 09:19:51.838188+00', '155', 15.500, 'A0', 310.000, '310', NULL, NULL, 'B', 4, 84, '{}');
INSERT INTO app.materials VALUES ('B04A0001-B150-310', '{"en": "K40UF Polished φ15.0x310", "ja": "K40UF 研磨 φ15.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.838462+00', '2026-08-24 09:19:51.838462+00', '150', 15.000, 'A0', 310.000, '310', NULL, NULL, 'B', 4, 85, '{}');
INSERT INTO app.materials VALUES ('B04A0001-B145-310', '{"en": "K40UF Polished φ14.5x310", "ja": "K40UF 研磨 φ14.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.838787+00', '2026-08-24 09:19:51.838787+00', '145', 14.500, 'A0', 310.000, '310', NULL, NULL, 'B', 4, 86, '{}');
INSERT INTO app.materials VALUES ('B04A0001-B140-310', '{"en": "K40UF Polished φ14.0x310", "ja": "K40UF 研磨 φ14.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.839073+00', '2026-08-24 09:19:51.839073+00', '140', 14.000, 'A0', 310.000, '310', NULL, NULL, 'B', 4, 87, '{}');
INSERT INTO app.materials VALUES ('B04A0001-B135-310', '{"en": "K40UF Polished φ13.5x310", "ja": "K40UF 研磨 φ13.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.839352+00', '2026-08-24 09:19:51.839352+00', '135', 13.500, 'A0', 310.000, '310', NULL, NULL, 'B', 4, 88, '{}');
INSERT INTO app.materials VALUES ('B04A0001-B130-310', '{"en": "K40UF Polished φ13.0x310", "ja": "K40UF 研磨 φ13.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.839639+00', '2026-08-24 09:19:51.839639+00', '130', 13.000, 'A0', 310.000, '310', NULL, NULL, 'B', 4, 89, '{}');
INSERT INTO app.materials VALUES ('B04A0001-B125-310', '{"en": "K40UF Polished φ12.5x310", "ja": "K40UF 研磨 φ12.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.839959+00', '2026-08-24 09:19:51.839959+00', '125', 12.500, 'A0', 310.000, '310', NULL, NULL, 'B', 4, 90, '{}');
INSERT INTO app.materials VALUES ('B04A0001-B120-310', '{"en": "K40UF Polished φ12.0x310", "ja": "K40UF 研磨 φ12.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.840248+00', '2026-08-24 09:19:51.840248+00', '120', 12.000, 'A0', 310.000, '310', NULL, NULL, 'B', 4, 91, '{}');
INSERT INTO app.materials VALUES ('B04A0001-B115-310', '{"en": "K40UF Polished φ11.5x310", "ja": "K40UF 研磨 φ11.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.840528+00', '2026-08-24 09:19:51.840528+00', '115', 11.500, 'A0', 310.000, '310', NULL, NULL, 'B', 4, 92, '{}');
INSERT INTO app.materials VALUES ('B04A0001-B110-310', '{"en": "K40UF Polished φ11.0x310", "ja": "K40UF 研磨 φ11.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.840795+00', '2026-08-24 09:19:51.840795+00', '110', 11.000, 'A0', 310.000, '310', NULL, NULL, 'B', 4, 93, '{}');
INSERT INTO app.materials VALUES ('B04A0001-B105-310', '{"en": "K40UF Polished φ10.5x310", "ja": "K40UF 研磨 φ10.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.841116+00', '2026-08-24 09:19:51.841116+00', '105', 10.500, 'A0', 310.000, '310', NULL, NULL, 'B', 4, 94, '{}');
INSERT INTO app.materials VALUES ('B04A0001-B100-310', '{"en": "K40UF Polished φ10.0x310", "ja": "K40UF 研磨 φ10.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.84142+00', '2026-08-24 09:19:51.84142+00', '100', 10.000, 'A0', 310.000, '310', NULL, NULL, 'B', 4, 95, '{}');
INSERT INTO app.materials VALUES ('B04A0001-B095-310', '{"en": "K40UF Polished φ9.5x310", "ja": "K40UF 研磨 φ9.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.841682+00', '2026-08-24 09:19:51.841682+00', '095', 9.500, 'A0', 310.000, '310', NULL, NULL, 'B', 4, 96, '{}');
INSERT INTO app.materials VALUES ('B04A0001-B090-310', '{"en": "K40UF Polished φ9.0x310", "ja": "K40UF 研磨 φ9.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.841936+00', '2026-08-24 09:19:51.841936+00', '090', 9.000, 'A0', 310.000, '310', NULL, NULL, 'B', 4, 97, '{}');
INSERT INTO app.materials VALUES ('B04A0001-B085-310', '{"en": "K40UF Polished φ8.5x310", "ja": "K40UF 研磨 φ8.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.842242+00', '2026-08-24 09:19:51.842242+00', '085', 8.500, 'A0', 310.000, '310', NULL, NULL, 'B', 4, 98, '{}');
INSERT INTO app.materials VALUES ('B04A0001-B080-310', '{"en": "K40UF Polished φ8.0x310", "ja": "K40UF 研磨 φ8.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.842502+00', '2026-08-24 09:19:51.842502+00', '080', 8.000, 'A0', 310.000, '310', NULL, NULL, 'B', 4, 99, '{}');
INSERT INTO app.materials VALUES ('B04A0001-B075-310', '{"en": "K40UF Polished φ7.5x310", "ja": "K40UF 研磨 φ7.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.842785+00', '2026-08-24 09:19:51.842785+00', '075', 7.500, 'A0', 310.000, '310', NULL, NULL, 'B', 4, 100, '{}');
INSERT INTO app.materials VALUES ('B04A0001-B070-310', '{"en": "K40UF Polished φ7.0x310", "ja": "K40UF 研磨 φ7.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.843107+00', '2026-08-24 09:19:51.843107+00', '070', 7.000, 'A0', 310.000, '310', NULL, NULL, 'B', 4, 101, '{}');
INSERT INTO app.materials VALUES ('B04A0001-B065-310', '{"en": "K40UF Polished φ6.5x310", "ja": "K40UF 研磨 φ6.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.843379+00', '2026-08-24 09:19:51.843379+00', '065', 6.500, 'A0', 310.000, '310', NULL, NULL, 'B', 4, 102, '{}');
INSERT INTO app.materials VALUES ('B04A0001-B060-310', '{"en": "K40UF Polished φ6.0x310", "ja": "K40UF 研磨 φ6.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.843661+00', '2026-08-24 09:19:51.843661+00', '060', 6.000, 'A0', 310.000, '310', NULL, NULL, 'B', 4, 103, '{}');
INSERT INTO app.materials VALUES ('B04A0001-B055-310', '{"en": "K40UF Polished φ5.5x310", "ja": "K40UF 研磨 φ5.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.843939+00', '2026-08-24 09:19:51.843939+00', '055', 5.500, 'A0', 310.000, '310', NULL, NULL, 'B', 4, 104, '{}');
INSERT INTO app.materials VALUES ('B04A0001-B050-310', '{"en": "K40UF Polished φ5.0x310", "ja": "K40UF 研磨 φ5.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.844255+00', '2026-08-24 09:19:51.844255+00', '050', 5.000, 'A0', 310.000, '310', NULL, NULL, 'B', 4, 105, '{}');
INSERT INTO app.materials VALUES ('B04A0001-B045-310', '{"en": "K40UF Polished φ4.5x310", "ja": "K40UF 研磨 φ4.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.844533+00', '2026-08-24 09:19:51.844533+00', '045', 4.500, 'A0', 310.000, '310', NULL, NULL, 'B', 4, 106, '{}');
INSERT INTO app.materials VALUES ('B04A0001-B040-310', '{"en": "K40UF Polished φ4.0x310", "ja": "K40UF 研磨 φ4.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.844862+00', '2026-08-24 09:19:51.844862+00', '040', 4.000, 'A0', 310.000, '310', NULL, NULL, 'B', 4, 107, '{}');
INSERT INTO app.materials VALUES ('B04A0001-B035-310', '{"en": "K40UF Polished φ3.5x310", "ja": "K40UF 研磨 φ3.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.845115+00', '2026-08-24 09:19:51.845115+00', '035', 3.500, 'A0', 310.000, '310', NULL, NULL, 'B', 4, 108, '{}');
INSERT INTO app.materials VALUES ('B04A0001-B030-310', '{"en": "K40UF Polished φ3.0x310", "ja": "K40UF 研磨 φ3.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.845388+00', '2026-08-24 09:19:51.845388+00', '030', 3.000, 'A0', 310.000, '310', NULL, NULL, 'B', 4, 109, '{}');
INSERT INTO app.materials VALUES ('B04A0001-B025-310', '{"en": "K40UF Polished φ2.5x310", "ja": "K40UF 研磨 φ2.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.845663+00', '2026-08-24 09:19:51.845663+00', '025', 2.500, 'A0', 310.000, '310', NULL, NULL, 'B', 4, 110, '{}');
INSERT INTO app.materials VALUES ('B04A0001-B020-310', '{"en": "K40UF Polished φ2.0x310", "ja": "K40UF 研磨 φ2.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.845934+00', '2026-08-24 09:19:51.845934+00', '020', 2.000, 'A0', 310.000, '310', NULL, NULL, 'B', 4, 111, '{}');
INSERT INTO app.materials VALUES ('B04A0001-B015-310', '{"en": "K40UF Polished φ1.5x310", "ja": "K40UF 研磨 φ1.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.846214+00', '2026-08-24 09:19:51.846214+00', '015', 1.500, 'A0', 310.000, '310', NULL, NULL, 'B', 4, 112, '{}');
INSERT INTO app.materials VALUES ('B04A0001-B010-310', '{"en": "K40UF Polished φ1.0x310", "ja": "K40UF 研磨 φ1.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.846494+00', '2026-08-24 09:19:51.846494+00', '010', 1.000, 'A0', 310.000, '310', NULL, NULL, 'B', 4, 113, '{}');
INSERT INTO app.materials VALUES ('B01A0001-B350-310', '{"en": "K10UF Polished φ35.0x310", "ja": "K10UF 研磨 φ35.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.846775+00', '2026-08-24 09:19:51.846775+00', '350', 35.000, 'A0', 310.000, '310', NULL, NULL, 'B', 1, 114, '{}');
INSERT INTO app.materials VALUES ('B01A0001-B340-310', '{"en": "K10UF Polished φ34.0x310", "ja": "K10UF 研磨 φ34.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.847091+00', '2026-08-24 09:19:51.847091+00', '340', 34.000, 'A0', 310.000, '310', NULL, NULL, 'B', 1, 115, '{}');
INSERT INTO app.materials VALUES ('B01A0001-B330-310', '{"en": "K10UF Polished φ33.0x310", "ja": "K10UF 研磨 φ33.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.847405+00', '2026-08-24 09:19:51.847405+00', '330', 33.000, 'A0', 310.000, '310', NULL, NULL, 'B', 1, 116, '{}');
INSERT INTO app.materials VALUES ('B01A0001-B320-310', '{"en": "K10UF Polished φ32.0x310", "ja": "K10UF 研磨 φ32.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.84767+00', '2026-08-24 09:19:51.84767+00', '320', 32.000, 'A0', 310.000, '310', NULL, NULL, 'B', 1, 117, '{}');
INSERT INTO app.materials VALUES ('B01A0001-B310-310', '{"en": "K10UF Polished φ31.0x310", "ja": "K10UF 研磨 φ31.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.847956+00', '2026-08-24 09:19:51.847956+00', '310', 31.000, 'A0', 310.000, '310', NULL, NULL, 'B', 1, 118, '{}');
INSERT INTO app.materials VALUES ('B01A0001-B300-310', '{"en": "K10UF Polished φ30.0x310", "ja": "K10UF 研磨 φ30.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.848238+00', '2026-08-24 09:19:51.848238+00', '300', 30.000, 'A0', 310.000, '310', NULL, NULL, 'B', 1, 119, '{}');
INSERT INTO app.materials VALUES ('B01A0001-B290-310', '{"en": "K10UF Polished φ29.0x310", "ja": "K10UF 研磨 φ29.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.848514+00', '2026-08-24 09:19:51.848514+00', '290', 29.000, 'A0', 310.000, '310', NULL, NULL, 'B', 1, 120, '{}');
INSERT INTO app.materials VALUES ('B01A0001-B280-310', '{"en": "K10UF Polished φ28.0x310", "ja": "K10UF 研磨 φ28.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.848797+00', '2026-08-24 09:19:51.848797+00', '280', 28.000, 'A0', 310.000, '310', NULL, NULL, 'B', 1, 121, '{}');
INSERT INTO app.materials VALUES ('B01A0001-B270-310', '{"en": "K10UF Polished φ27.0x310", "ja": "K10UF 研磨 φ27.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.849175+00', '2026-08-24 09:19:51.849175+00', '270', 27.000, 'A0', 310.000, '310', NULL, NULL, 'B', 1, 122, '{}');
INSERT INTO app.materials VALUES ('B01A0001-B260-310', '{"en": "K10UF Polished φ26.0x310", "ja": "K10UF 研磨 φ26.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.849461+00', '2026-08-24 09:19:51.849461+00', '260', 26.000, 'A0', 310.000, '310', NULL, NULL, 'B', 1, 123, '{}');
INSERT INTO app.materials VALUES ('B01A0001-B250-310', '{"en": "K10UF Polished φ25.0x310", "ja": "K10UF 研磨 φ25.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.84976+00', '2026-08-24 09:19:51.84976+00', '250', 25.000, 'A0', 310.000, '310', NULL, NULL, 'B', 1, 124, '{}');
INSERT INTO app.materials VALUES ('B01A0001-B240-310', '{"en": "K10UF Polished φ24.0x310", "ja": "K10UF 研磨 φ24.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.850076+00', '2026-08-24 09:19:51.850076+00', '240', 24.000, 'A0', 310.000, '310', NULL, NULL, 'B', 1, 125, '{}');
INSERT INTO app.materials VALUES ('B01A0001-B230-310', '{"en": "K10UF Polished φ23.0x310", "ja": "K10UF 研磨 φ23.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.850355+00', '2026-08-24 09:19:51.850355+00', '230', 23.000, 'A0', 310.000, '310', NULL, NULL, 'B', 1, 126, '{}');
INSERT INTO app.materials VALUES ('B01A0001-B220-310', '{"en": "K10UF Polished φ22.0x310", "ja": "K10UF 研磨 φ22.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.850637+00', '2026-08-24 09:19:51.850637+00', '220', 22.000, 'A0', 310.000, '310', NULL, NULL, 'B', 1, 127, '{}');
INSERT INTO app.materials VALUES ('B01A0001-B210-310', '{"en": "K10UF Polished φ21.0x310", "ja": "K10UF 研磨 φ21.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.850905+00', '2026-08-24 09:19:51.850905+00', '210', 21.000, 'A0', 310.000, '310', NULL, NULL, 'B', 1, 128, '{}');
INSERT INTO app.materials VALUES ('B01A0001-B200-310', '{"en": "K10UF Polished φ20.0x310", "ja": "K10UF 研磨 φ20.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.851161+00', '2026-08-24 09:19:51.851161+00', '200', 20.000, 'A0', 310.000, '310', NULL, NULL, 'B', 1, 129, '{}');
INSERT INTO app.materials VALUES ('B01A0001-B190-310', '{"en": "K10UF Polished φ19.0x310", "ja": "K10UF 研磨 φ19.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.851428+00', '2026-08-24 09:19:51.851428+00', '190', 19.000, 'A0', 310.000, '310', NULL, NULL, 'B', 1, 130, '{}');
INSERT INTO app.materials VALUES ('B01A0001-B180-310', '{"en": "K10UF Polished φ18.0x310", "ja": "K10UF 研磨 φ18.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.851704+00', '2026-08-24 09:19:51.851704+00', '180', 18.000, 'A0', 310.000, '310', NULL, NULL, 'B', 1, 131, '{}');
INSERT INTO app.materials VALUES ('B01A0001-B170-310', '{"en": "K10UF Polished φ17.0x310", "ja": "K10UF 研磨 φ17.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.851974+00', '2026-08-24 09:19:51.851974+00', '170', 17.000, 'A0', 310.000, '310', NULL, NULL, 'B', 1, 132, '{}');
INSERT INTO app.materials VALUES ('B01A0001-B160-310', '{"en": "K10UF Polished φ16.0x310", "ja": "K10UF 研磨 φ16.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.852235+00', '2026-08-24 09:19:51.852235+00', '160', 16.000, 'A0', 310.000, '310', NULL, NULL, 'B', 1, 133, '{}');
INSERT INTO app.materials VALUES ('B01A0001-B155-310', '{"en": "K10UF Polished φ15.5x310", "ja": "K10UF 研磨 φ15.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.852507+00', '2026-08-24 09:19:51.852507+00', '155', 15.500, 'A0', 310.000, '310', NULL, NULL, 'B', 1, 134, '{}');
INSERT INTO app.materials VALUES ('B01A0001-B150-310', '{"en": "K10UF Polished φ15.0x310", "ja": "K10UF 研磨 φ15.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.852817+00', '2026-08-24 09:19:51.852817+00', '150', 15.000, 'A0', 310.000, '310', NULL, NULL, 'B', 1, 135, '{}');
INSERT INTO app.materials VALUES ('B01A0001-B145-310', '{"en": "K10UF Polished φ14.5x310", "ja": "K10UF 研磨 φ14.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.853109+00', '2026-08-24 09:19:51.853109+00', '145', 14.500, 'A0', 310.000, '310', NULL, NULL, 'B', 1, 136, '{}');
INSERT INTO app.materials VALUES ('B01A0001-B140-310', '{"en": "K10UF Polished φ14.0x310", "ja": "K10UF 研磨 φ14.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.853382+00', '2026-08-24 09:19:51.853382+00', '140', 14.000, 'A0', 310.000, '310', NULL, NULL, 'B', 1, 137, '{}');
INSERT INTO app.materials VALUES ('B01A0001-B135-310', '{"en": "K10UF Polished φ13.5x310", "ja": "K10UF 研磨 φ13.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.853652+00', '2026-08-24 09:19:51.853652+00', '135', 13.500, 'A0', 310.000, '310', NULL, NULL, 'B', 1, 138, '{}');
INSERT INTO app.materials VALUES ('B01A0001-B130-310', '{"en": "K10UF Polished φ13.0x310", "ja": "K10UF 研磨 φ13.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.853926+00', '2026-08-24 09:19:51.853926+00', '130', 13.000, 'A0', 310.000, '310', NULL, NULL, 'B', 1, 139, '{}');
INSERT INTO app.materials VALUES ('B01A0001-B125-310', '{"en": "K10UF Polished φ12.5x310", "ja": "K10UF 研磨 φ12.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.854208+00', '2026-08-24 09:19:51.854208+00', '125', 12.500, 'A0', 310.000, '310', NULL, NULL, 'B', 1, 140, '{}');
INSERT INTO app.materials VALUES ('B01A0001-B120-310', '{"en": "K10UF Polished φ12.0x310", "ja": "K10UF 研磨 φ12.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.854475+00', '2026-08-24 09:19:51.854475+00', '120', 12.000, 'A0', 310.000, '310', NULL, NULL, 'B', 1, 141, '{}');
INSERT INTO app.materials VALUES ('B01A0001-B115-310', '{"en": "K10UF Polished φ11.5x310", "ja": "K10UF 研磨 φ11.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.854754+00', '2026-08-24 09:19:51.854754+00', '115', 11.500, 'A0', 310.000, '310', NULL, NULL, 'B', 1, 142, '{}');
INSERT INTO app.materials VALUES ('B01A0001-B110-310', '{"en": "K10UF Polished φ11.0x310", "ja": "K10UF 研磨 φ11.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.855053+00', '2026-08-24 09:19:51.855053+00', '110', 11.000, 'A0', 310.000, '310', NULL, NULL, 'B', 1, 143, '{}');
INSERT INTO app.materials VALUES ('B01A0001-B105-310', '{"en": "K10UF Polished φ10.5x310", "ja": "K10UF 研磨 φ10.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.855319+00', '2026-08-24 09:19:51.855319+00', '105', 10.500, 'A0', 310.000, '310', NULL, NULL, 'B', 1, 144, '{}');
INSERT INTO app.materials VALUES ('B01A0001-B100-310', '{"en": "K10UF Polished φ10.0x310", "ja": "K10UF 研磨 φ10.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.855682+00', '2026-08-24 09:19:51.855682+00', '100', 10.000, 'A0', 310.000, '310', NULL, NULL, 'B', 1, 145, '{}');
INSERT INTO app.materials VALUES ('B01A0001-B095-310', '{"en": "K10UF Polished φ9.5x310", "ja": "K10UF 研磨 φ9.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.855954+00', '2026-08-24 09:19:51.855954+00', '095', 9.500, 'A0', 310.000, '310', NULL, NULL, 'B', 1, 146, '{}');
INSERT INTO app.materials VALUES ('B01A0001-B090-310', '{"en": "K10UF Polished φ9.0x310", "ja": "K10UF 研磨 φ9.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.856247+00', '2026-08-24 09:19:51.856247+00', '090', 9.000, 'A0', 310.000, '310', NULL, NULL, 'B', 1, 147, '{}');
INSERT INTO app.materials VALUES ('B01A0001-B085-310', '{"en": "K10UF Polished φ8.5x310", "ja": "K10UF 研磨 φ8.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.856538+00', '2026-08-24 09:19:51.856538+00', '085', 8.500, 'A0', 310.000, '310', NULL, NULL, 'B', 1, 148, '{}');
INSERT INTO app.materials VALUES ('B01A0001-B080-310', '{"en": "K10UF Polished φ8.0x310", "ja": "K10UF 研磨 φ8.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.856794+00', '2026-08-24 09:19:51.856794+00', '080', 8.000, 'A0', 310.000, '310', NULL, NULL, 'B', 1, 149, '{}');
INSERT INTO app.materials VALUES ('B01A0001-B075-310', '{"en": "K10UF Polished φ7.5x310", "ja": "K10UF 研磨 φ7.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.857083+00', '2026-08-24 09:19:51.857083+00', '075', 7.500, 'A0', 310.000, '310', NULL, NULL, 'B', 1, 150, '{}');
INSERT INTO app.materials VALUES ('B01A0001-B070-310', '{"en": "K10UF Polished φ7.0x310", "ja": "K10UF 研磨 φ7.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.857345+00', '2026-08-24 09:19:51.857345+00', '070', 7.000, 'A0', 310.000, '310', NULL, NULL, 'B', 1, 151, '{}');
INSERT INTO app.materials VALUES ('B01A0001-B065-310', '{"en": "K10UF Polished φ6.5x310", "ja": "K10UF 研磨 φ6.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.857595+00', '2026-08-24 09:19:51.857595+00', '065', 6.500, 'A0', 310.000, '310', NULL, NULL, 'B', 1, 152, '{}');
INSERT INTO app.materials VALUES ('B01A0001-B060-310', '{"en": "K10UF Polished φ6.0x310", "ja": "K10UF 研磨 φ6.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.857854+00', '2026-08-24 09:19:51.857854+00', '060', 6.000, 'A0', 310.000, '310', NULL, NULL, 'B', 1, 153, '{}');
INSERT INTO app.materials VALUES ('B01A0001-B055-310', '{"en": "K10UF Polished φ5.5x310", "ja": "K10UF 研磨 φ5.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.858217+00', '2026-08-24 09:19:51.858217+00', '055', 5.500, 'A0', 310.000, '310', NULL, NULL, 'B', 1, 154, '{}');
INSERT INTO app.materials VALUES ('B01A0001-B050-310', '{"en": "K10UF Polished φ5.0x310", "ja": "K10UF 研磨 φ5.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.858497+00', '2026-08-24 09:19:51.858497+00', '050', 5.000, 'A0', 310.000, '310', NULL, NULL, 'B', 1, 155, '{}');
INSERT INTO app.materials VALUES ('B01A0001-B045-310', '{"en": "K10UF Polished φ4.5x310", "ja": "K10UF 研磨 φ4.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.858782+00', '2026-08-24 09:19:51.858782+00', '045', 4.500, 'A0', 310.000, '310', NULL, NULL, 'B', 1, 156, '{}');
INSERT INTO app.materials VALUES ('B01A0001-B040-310', '{"en": "K10UF Polished φ4.0x310", "ja": "K10UF 研磨 φ4.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.859086+00', '2026-08-24 09:19:51.859086+00', '040', 4.000, 'A0', 310.000, '310', NULL, NULL, 'B', 1, 157, '{}');
INSERT INTO app.materials VALUES ('B01A0001-B035-310', '{"en": "K10UF Polished φ3.5x310", "ja": "K10UF 研磨 φ3.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.859386+00', '2026-08-24 09:19:51.859386+00', '035', 3.500, 'A0', 310.000, '310', NULL, NULL, 'B', 1, 158, '{}');
INSERT INTO app.materials VALUES ('B01A0001-B030-310', '{"en": "K10UF Polished φ3.0x310", "ja": "K10UF 研磨 φ3.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.859696+00', '2026-08-24 09:19:51.859696+00', '030', 3.000, 'A0', 310.000, '310', NULL, NULL, 'B', 1, 159, '{}');
INSERT INTO app.materials VALUES ('B01A0001-B025-310', '{"en": "K10UF Polished φ2.5x310", "ja": "K10UF 研磨 φ2.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.859974+00', '2026-08-24 09:19:51.859974+00', '025', 2.500, 'A0', 310.000, '310', NULL, NULL, 'B', 1, 160, '{}');
INSERT INTO app.materials VALUES ('B01A0001-B020-310', '{"en": "K10UF Polished φ2.0x310", "ja": "K10UF 研磨 φ2.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.860262+00', '2026-08-24 09:19:51.860262+00', '020', 2.000, 'A0', 310.000, '310', NULL, NULL, 'B', 1, 161, '{}');
INSERT INTO app.materials VALUES ('B01A0001-B015-310', '{"en": "K10UF Polished φ1.5x310", "ja": "K10UF 研磨 φ1.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.860556+00', '2026-08-24 09:19:51.860556+00', '015', 1.500, 'A0', 310.000, '310', NULL, NULL, 'B', 1, 162, '{}');
INSERT INTO app.materials VALUES ('B01A0001-B010-310', '{"en": "K10UF Polished φ1.0x310", "ja": "K10UF 研磨 φ1.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.860848+00', '2026-08-24 09:19:51.860848+00', '010', 1.000, 'A0', 310.000, '310', NULL, NULL, 'B', 1, 163, '{}');
INSERT INTO app.materials VALUES ('B02A0001-B350-310', '{"en": "K20CF Polished φ35.0x310", "ja": "K20CF 研磨 φ35.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.861117+00', '2026-08-24 09:19:51.861117+00', '350', 35.000, 'A0', 310.000, '310', NULL, NULL, 'B', 2, 164, '{}');
INSERT INTO app.materials VALUES ('B02A0001-B340-310', '{"en": "K20CF Polished φ34.0x310", "ja": "K20CF 研磨 φ34.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.8614+00', '2026-08-24 09:19:51.8614+00', '340', 34.000, 'A0', 310.000, '310', NULL, NULL, 'B', 2, 165, '{}');
INSERT INTO app.materials VALUES ('B02A0001-B330-310', '{"en": "K20CF Polished φ33.0x310", "ja": "K20CF 研磨 φ33.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.861675+00', '2026-08-24 09:19:51.861675+00', '330', 33.000, 'A0', 310.000, '310', NULL, NULL, 'B', 2, 166, '{}');
INSERT INTO app.materials VALUES ('B02A0001-B320-310', '{"en": "K20CF Polished φ32.0x310", "ja": "K20CF 研磨 φ32.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.861963+00', '2026-08-24 09:19:51.861963+00', '320', 32.000, 'A0', 310.000, '310', NULL, NULL, 'B', 2, 167, '{}');
INSERT INTO app.materials VALUES ('B02A0001-B310-310', '{"en": "K20CF Polished φ31.0x310", "ja": "K20CF 研磨 φ31.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.862251+00', '2026-08-24 09:19:51.862251+00', '310', 31.000, 'A0', 310.000, '310', NULL, NULL, 'B', 2, 168, '{}');
INSERT INTO app.materials VALUES ('B02A0001-B300-310', '{"en": "K20CF Polished φ30.0x310", "ja": "K20CF 研磨 φ30.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.862542+00', '2026-08-24 09:19:51.862542+00', '300', 30.000, 'A0', 310.000, '310', NULL, NULL, 'B', 2, 169, '{}');
INSERT INTO app.materials VALUES ('B02A0001-B290-310', '{"en": "K20CF Polished φ29.0x310", "ja": "K20CF 研磨 φ29.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.862902+00', '2026-08-24 09:19:51.862902+00', '290', 29.000, 'A0', 310.000, '310', NULL, NULL, 'B', 2, 170, '{}');
INSERT INTO app.materials VALUES ('B02A0001-B280-310', '{"en": "K20CF Polished φ28.0x310", "ja": "K20CF 研磨 φ28.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.863192+00', '2026-08-24 09:19:51.863192+00', '280', 28.000, 'A0', 310.000, '310', NULL, NULL, 'B', 2, 171, '{}');
INSERT INTO app.materials VALUES ('B02A0001-B270-310', '{"en": "K20CF Polished φ27.0x310", "ja": "K20CF 研磨 φ27.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.863522+00', '2026-08-24 09:19:51.863522+00', '270', 27.000, 'A0', 310.000, '310', NULL, NULL, 'B', 2, 172, '{}');
INSERT INTO app.materials VALUES ('B02A0001-B260-310', '{"en": "K20CF Polished φ26.0x310", "ja": "K20CF 研磨 φ26.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.863833+00', '2026-08-24 09:19:51.863833+00', '260', 26.000, 'A0', 310.000, '310', NULL, NULL, 'B', 2, 173, '{}');
INSERT INTO app.materials VALUES ('B02A0001-B250-310', '{"en": "K20CF Polished φ25.0x310", "ja": "K20CF 研磨 φ25.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.864148+00', '2026-08-24 09:19:51.864148+00', '250', 25.000, 'A0', 310.000, '310', NULL, NULL, 'B', 2, 174, '{}');
INSERT INTO app.materials VALUES ('B02A0001-B240-310', '{"en": "K20CF Polished φ24.0x310", "ja": "K20CF 研磨 φ24.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.864445+00', '2026-08-24 09:19:51.864445+00', '240', 24.000, 'A0', 310.000, '310', NULL, NULL, 'B', 2, 175, '{}');
INSERT INTO app.materials VALUES ('B02A0001-B230-310', '{"en": "K20CF Polished φ23.0x310", "ja": "K20CF 研磨 φ23.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.864762+00', '2026-08-24 09:19:51.864762+00', '230', 23.000, 'A0', 310.000, '310', NULL, NULL, 'B', 2, 176, '{}');
INSERT INTO app.materials VALUES ('B02A0001-B220-310', '{"en": "K20CF Polished φ22.0x310", "ja": "K20CF 研磨 φ22.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.865122+00', '2026-08-24 09:19:51.865122+00', '220', 22.000, 'A0', 310.000, '310', NULL, NULL, 'B', 2, 177, '{}');
INSERT INTO app.materials VALUES ('B02A0001-B210-310', '{"en": "K20CF Polished φ21.0x310", "ja": "K20CF 研磨 φ21.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.865424+00', '2026-08-24 09:19:51.865424+00', '210', 21.000, 'A0', 310.000, '310', NULL, NULL, 'B', 2, 178, '{}');
INSERT INTO app.materials VALUES ('B02A0001-B200-310', '{"en": "K20CF Polished φ20.0x310", "ja": "K20CF 研磨 φ20.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.8657+00', '2026-08-24 09:19:51.8657+00', '200', 20.000, 'A0', 310.000, '310', NULL, NULL, 'B', 2, 179, '{}');
INSERT INTO app.materials VALUES ('B02A0001-B190-310', '{"en": "K20CF Polished φ19.0x310", "ja": "K20CF 研磨 φ19.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.865977+00', '2026-08-24 09:19:51.865977+00', '190', 19.000, 'A0', 310.000, '310', NULL, NULL, 'B', 2, 180, '{}');
INSERT INTO app.materials VALUES ('B02A0001-B180-310', '{"en": "K20CF Polished φ18.0x310", "ja": "K20CF 研磨 φ18.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.86634+00', '2026-08-24 09:19:51.86634+00', '180', 18.000, 'A0', 310.000, '310', NULL, NULL, 'B', 2, 181, '{}');
INSERT INTO app.materials VALUES ('B02A0001-B170-310', '{"en": "K20CF Polished φ17.0x310", "ja": "K20CF 研磨 φ17.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.866599+00', '2026-08-24 09:19:51.866599+00', '170', 17.000, 'A0', 310.000, '310', NULL, NULL, 'B', 2, 182, '{}');
INSERT INTO app.materials VALUES ('B02A0001-B160-310', '{"en": "K20CF Polished φ16.0x310", "ja": "K20CF 研磨 φ16.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.866865+00', '2026-08-24 09:19:51.866865+00', '160', 16.000, 'A0', 310.000, '310', NULL, NULL, 'B', 2, 183, '{}');
INSERT INTO app.materials VALUES ('B02A0001-B155-310', '{"en": "K20CF Polished φ15.5x310", "ja": "K20CF 研磨 φ15.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.867143+00', '2026-08-24 09:19:51.867143+00', '155', 15.500, 'A0', 310.000, '310', NULL, NULL, 'B', 2, 184, '{}');
INSERT INTO app.materials VALUES ('B02A0001-B150-310', '{"en": "K20CF Polished φ15.0x310", "ja": "K20CF 研磨 φ15.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.867416+00', '2026-08-24 09:19:51.867416+00', '150', 15.000, 'A0', 310.000, '310', NULL, NULL, 'B', 2, 185, '{}');
INSERT INTO app.materials VALUES ('B02A0001-B145-310', '{"en": "K20CF Polished φ14.5x310", "ja": "K20CF 研磨 φ14.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.867698+00', '2026-08-24 09:19:51.867698+00', '145', 14.500, 'A0', 310.000, '310', NULL, NULL, 'B', 2, 186, '{}');
INSERT INTO app.materials VALUES ('B02A0001-B140-310', '{"en": "K20CF Polished φ14.0x310", "ja": "K20CF 研磨 φ14.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.867963+00', '2026-08-24 09:19:51.867963+00', '140', 14.000, 'A0', 310.000, '310', NULL, NULL, 'B', 2, 187, '{}');
INSERT INTO app.materials VALUES ('B02A0001-B135-310', '{"en": "K20CF Polished φ13.5x310", "ja": "K20CF 研磨 φ13.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.868247+00', '2026-08-24 09:19:51.868247+00', '135', 13.500, 'A0', 310.000, '310', NULL, NULL, 'B', 2, 188, '{}');
INSERT INTO app.materials VALUES ('B02A0001-B130-310', '{"en": "K20CF Polished φ13.0x310", "ja": "K20CF 研磨 φ13.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.86856+00', '2026-08-24 09:19:51.86856+00', '130', 13.000, 'A0', 310.000, '310', NULL, NULL, 'B', 2, 189, '{}');
INSERT INTO app.materials VALUES ('B02A0001-B125-310', '{"en": "K20CF Polished φ12.5x310", "ja": "K20CF 研磨 φ12.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.868884+00', '2026-08-24 09:19:51.868884+00', '125', 12.500, 'A0', 310.000, '310', NULL, NULL, 'B', 2, 190, '{}');
INSERT INTO app.materials VALUES ('B02A0001-B120-310', '{"en": "K20CF Polished φ12.0x310", "ja": "K20CF 研磨 φ12.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.869154+00', '2026-08-24 09:19:51.869154+00', '120', 12.000, 'A0', 310.000, '310', NULL, NULL, 'B', 2, 191, '{}');
INSERT INTO app.materials VALUES ('B02A0001-B115-310', '{"en": "K20CF Polished φ11.5x310", "ja": "K20CF 研磨 φ11.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.869437+00', '2026-08-24 09:19:51.869437+00', '115', 11.500, 'A0', 310.000, '310', NULL, NULL, 'B', 2, 192, '{}');
INSERT INTO app.materials VALUES ('B02A0001-B110-310', '{"en": "K20CF Polished φ11.0x310", "ja": "K20CF 研磨 φ11.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.86975+00', '2026-08-24 09:19:51.86975+00', '110', 11.000, 'A0', 310.000, '310', NULL, NULL, 'B', 2, 193, '{}');
INSERT INTO app.materials VALUES ('B02A0001-B105-310', '{"en": "K20CF Polished φ10.5x310", "ja": "K20CF 研磨 φ10.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.870043+00', '2026-08-24 09:19:51.870043+00', '105', 10.500, 'A0', 310.000, '310', NULL, NULL, 'B', 2, 194, '{}');
INSERT INTO app.materials VALUES ('B02A0001-B100-310', '{"en": "K20CF Polished φ10.0x310", "ja": "K20CF 研磨 φ10.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.870309+00', '2026-08-24 09:19:51.870309+00', '100', 10.000, 'A0', 310.000, '310', NULL, NULL, 'B', 2, 195, '{}');
INSERT INTO app.materials VALUES ('B02A0001-B095-310', '{"en": "K20CF Polished φ9.5x310", "ja": "K20CF 研磨 φ9.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.870599+00', '2026-08-24 09:19:51.870599+00', '095', 9.500, 'A0', 310.000, '310', NULL, NULL, 'B', 2, 196, '{}');
INSERT INTO app.materials VALUES ('B02A0001-B090-310', '{"en": "K20CF Polished φ9.0x310", "ja": "K20CF 研磨 φ9.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.870873+00', '2026-08-24 09:19:51.870873+00', '090', 9.000, 'A0', 310.000, '310', NULL, NULL, 'B', 2, 197, '{}');
INSERT INTO app.materials VALUES ('B02A0001-B085-310', '{"en": "K20CF Polished φ8.5x310", "ja": "K20CF 研磨 φ8.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.871147+00', '2026-08-24 09:19:51.871147+00', '085', 8.500, 'A0', 310.000, '310', NULL, NULL, 'B', 2, 198, '{}');
INSERT INTO app.materials VALUES ('B02A0001-B080-310', '{"en": "K20CF Polished φ8.0x310", "ja": "K20CF 研磨 φ8.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.871453+00', '2026-08-24 09:19:51.871453+00', '080', 8.000, 'A0', 310.000, '310', NULL, NULL, 'B', 2, 199, '{}');
INSERT INTO app.materials VALUES ('B02A0001-B075-310', '{"en": "K20CF Polished φ7.5x310", "ja": "K20CF 研磨 φ7.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.871742+00', '2026-08-24 09:19:51.871742+00', '075', 7.500, 'A0', 310.000, '310', NULL, NULL, 'B', 2, 200, '{}');
INSERT INTO app.materials VALUES ('B02A0001-B070-310', '{"en": "K20CF Polished φ7.0x310", "ja": "K20CF 研磨 φ7.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.872027+00', '2026-08-24 09:19:51.872027+00', '070', 7.000, 'A0', 310.000, '310', NULL, NULL, 'B', 2, 201, '{}');
INSERT INTO app.materials VALUES ('B02A0001-B065-310', '{"en": "K20CF Polished φ6.5x310", "ja": "K20CF 研磨 φ6.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.872328+00', '2026-08-24 09:19:51.872328+00', '065', 6.500, 'A0', 310.000, '310', NULL, NULL, 'B', 2, 202, '{}');
INSERT INTO app.materials VALUES ('B02A0001-B060-310', '{"en": "K20CF Polished φ6.0x310", "ja": "K20CF 研磨 φ6.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.872626+00', '2026-08-24 09:19:51.872626+00', '060', 6.000, 'A0', 310.000, '310', NULL, NULL, 'B', 2, 203, '{}');
INSERT INTO app.materials VALUES ('B02A0001-B055-310', '{"en": "K20CF Polished φ5.5x310", "ja": "K20CF 研磨 φ5.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.872886+00', '2026-08-24 09:19:51.872886+00', '055', 5.500, 'A0', 310.000, '310', NULL, NULL, 'B', 2, 204, '{}');
INSERT INTO app.materials VALUES ('B02A0001-B050-310', '{"en": "K20CF Polished φ5.0x310", "ja": "K20CF 研磨 φ5.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.873153+00', '2026-08-24 09:19:51.873153+00', '050', 5.000, 'A0', 310.000, '310', NULL, NULL, 'B', 2, 205, '{}');
INSERT INTO app.materials VALUES ('B02A0001-B045-310', '{"en": "K20CF Polished φ4.5x310", "ja": "K20CF 研磨 φ4.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.873424+00', '2026-08-24 09:19:51.873424+00', '045', 4.500, 'A0', 310.000, '310', NULL, NULL, 'B', 2, 206, '{}');
INSERT INTO app.materials VALUES ('B02A0001-B040-310', '{"en": "K20CF Polished φ4.0x310", "ja": "K20CF 研磨 φ4.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.873684+00', '2026-08-24 09:19:51.873684+00', '040', 4.000, 'A0', 310.000, '310', NULL, NULL, 'B', 2, 207, '{}');
INSERT INTO app.materials VALUES ('B02A0001-B035-310', '{"en": "K20CF Polished φ3.5x310", "ja": "K20CF 研磨 φ3.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.873951+00', '2026-08-24 09:19:51.873951+00', '035', 3.500, 'A0', 310.000, '310', NULL, NULL, 'B', 2, 208, '{}');
INSERT INTO app.materials VALUES ('B02A0001-B030-310', '{"en": "K20CF Polished φ3.0x310", "ja": "K20CF 研磨 φ3.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.874232+00', '2026-08-24 09:19:51.874232+00', '030', 3.000, 'A0', 310.000, '310', NULL, NULL, 'B', 2, 209, '{}');
INSERT INTO app.materials VALUES ('B02A0001-B025-310', '{"en": "K20CF Polished φ2.5x310", "ja": "K20CF 研磨 φ2.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.874484+00', '2026-08-24 09:19:51.874484+00', '025', 2.500, 'A0', 310.000, '310', NULL, NULL, 'B', 2, 210, '{}');
INSERT INTO app.materials VALUES ('B02A0001-B020-310', '{"en": "K20CF Polished φ2.0x310", "ja": "K20CF 研磨 φ2.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.874745+00', '2026-08-24 09:19:51.874745+00', '020', 2.000, 'A0', 310.000, '310', NULL, NULL, 'B', 2, 211, '{}');
INSERT INTO app.materials VALUES ('B02A0001-B015-310', '{"en": "K20CF Polished φ1.5x310", "ja": "K20CF 研磨 φ1.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.875015+00', '2026-08-24 09:19:51.875015+00', '015', 1.500, 'A0', 310.000, '310', NULL, NULL, 'B', 2, 212, '{}');
INSERT INTO app.materials VALUES ('B02A0001-B010-310', '{"en": "K20CF Polished φ1.0x310", "ja": "K20CF 研磨 φ1.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.875272+00', '2026-08-24 09:19:51.875272+00', '010', 1.000, 'A0', 310.000, '310', NULL, NULL, 'B', 2, 213, '{}');
INSERT INTO app.materials VALUES ('B05A0001-B350-310', '{"en": "K44EF Polished φ35.0x310", "ja": "K44EF 研磨 φ35.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.875559+00', '2026-08-24 09:19:51.875559+00', '350', 35.000, 'A0', 310.000, '310', NULL, NULL, 'B', 5, 214, '{}');
INSERT INTO app.materials VALUES ('B05A0001-B340-310', '{"en": "K44EF Polished φ34.0x310", "ja": "K44EF 研磨 φ34.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.875813+00', '2026-08-24 09:19:51.875813+00', '340', 34.000, 'A0', 310.000, '310', NULL, NULL, 'B', 5, 215, '{}');
INSERT INTO app.materials VALUES ('B05A0001-B330-310', '{"en": "K44EF Polished φ33.0x310", "ja": "K44EF 研磨 φ33.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.876092+00', '2026-08-24 09:19:51.876092+00', '330', 33.000, 'A0', 310.000, '310', NULL, NULL, 'B', 5, 216, '{}');
INSERT INTO app.materials VALUES ('B05A0001-B320-310', '{"en": "K44EF Polished φ32.0x310", "ja": "K44EF 研磨 φ32.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.876374+00', '2026-08-24 09:19:51.876374+00', '320', 32.000, 'A0', 310.000, '310', NULL, NULL, 'B', 5, 217, '{}');
INSERT INTO app.materials VALUES ('B05A0001-B310-310', '{"en": "K44EF Polished φ31.0x310", "ja": "K44EF 研磨 φ31.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.876656+00', '2026-08-24 09:19:51.876656+00', '310', 31.000, 'A0', 310.000, '310', NULL, NULL, 'B', 5, 218, '{}');
INSERT INTO app.materials VALUES ('B05A0001-B300-310', '{"en": "K44EF Polished φ30.0x310", "ja": "K44EF 研磨 φ30.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.876923+00', '2026-08-24 09:19:51.876923+00', '300', 30.000, 'A0', 310.000, '310', NULL, NULL, 'B', 5, 219, '{}');
INSERT INTO app.materials VALUES ('B05A0001-B290-310', '{"en": "K44EF Polished φ29.0x310", "ja": "K44EF 研磨 φ29.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.877168+00', '2026-08-24 09:19:51.877168+00', '290', 29.000, 'A0', 310.000, '310', NULL, NULL, 'B', 5, 220, '{}');
INSERT INTO app.materials VALUES ('B05A0001-B280-310', '{"en": "K44EF Polished φ28.0x310", "ja": "K44EF 研磨 φ28.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.877419+00', '2026-08-24 09:19:51.877419+00', '280', 28.000, 'A0', 310.000, '310', NULL, NULL, 'B', 5, 221, '{}');
INSERT INTO app.materials VALUES ('B05A0001-B270-310', '{"en": "K44EF Polished φ27.0x310", "ja": "K44EF 研磨 φ27.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.877691+00', '2026-08-24 09:19:51.877691+00', '270', 27.000, 'A0', 310.000, '310', NULL, NULL, 'B', 5, 222, '{}');
INSERT INTO app.materials VALUES ('B05A0001-B260-310', '{"en": "K44EF Polished φ26.0x310", "ja": "K44EF 研磨 φ26.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.877964+00', '2026-08-24 09:19:51.877964+00', '260', 26.000, 'A0', 310.000, '310', NULL, NULL, 'B', 5, 223, '{}');
INSERT INTO app.materials VALUES ('B05A0001-B250-310', '{"en": "K44EF Polished φ25.0x310", "ja": "K44EF 研磨 φ25.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.87822+00', '2026-08-24 09:19:51.87822+00', '250', 25.000, 'A0', 310.000, '310', NULL, NULL, 'B', 5, 224, '{}');
INSERT INTO app.materials VALUES ('B05A0001-B240-310', '{"en": "K44EF Polished φ24.0x310", "ja": "K44EF 研磨 φ24.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.878489+00', '2026-08-24 09:19:51.878489+00', '240', 24.000, 'A0', 310.000, '310', NULL, NULL, 'B', 5, 225, '{}');
INSERT INTO app.materials VALUES ('B05A0001-B230-310', '{"en": "K44EF Polished φ23.0x310", "ja": "K44EF 研磨 φ23.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.878748+00', '2026-08-24 09:19:51.878748+00', '230', 23.000, 'A0', 310.000, '310', NULL, NULL, 'B', 5, 226, '{}');
INSERT INTO app.materials VALUES ('B05A0001-B220-310', '{"en": "K44EF Polished φ22.0x310", "ja": "K44EF 研磨 φ22.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.879017+00', '2026-08-24 09:19:51.879017+00', '220', 22.000, 'A0', 310.000, '310', NULL, NULL, 'B', 5, 227, '{}');
INSERT INTO app.materials VALUES ('B05A0001-B210-310', '{"en": "K44EF Polished φ21.0x310", "ja": "K44EF 研磨 φ21.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.879314+00', '2026-08-24 09:19:51.879314+00', '210', 21.000, 'A0', 310.000, '310', NULL, NULL, 'B', 5, 228, '{}');
INSERT INTO app.materials VALUES ('B05A0001-B200-310', '{"en": "K44EF Polished φ20.0x310", "ja": "K44EF 研磨 φ20.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.879588+00', '2026-08-24 09:19:51.879588+00', '200', 20.000, 'A0', 310.000, '310', NULL, NULL, 'B', 5, 229, '{}');
INSERT INTO app.materials VALUES ('B05A0001-B190-310', '{"en": "K44EF Polished φ19.0x310", "ja": "K44EF 研磨 φ19.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.879872+00', '2026-08-24 09:19:51.879872+00', '190', 19.000, 'A0', 310.000, '310', NULL, NULL, 'B', 5, 230, '{}');
INSERT INTO app.materials VALUES ('B05A0001-B180-310', '{"en": "K44EF Polished φ18.0x310", "ja": "K44EF 研磨 φ18.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.880161+00', '2026-08-24 09:19:51.880161+00', '180', 18.000, 'A0', 310.000, '310', NULL, NULL, 'B', 5, 231, '{}');
INSERT INTO app.materials VALUES ('B05A0001-B170-310', '{"en": "K44EF Polished φ17.0x310", "ja": "K44EF 研磨 φ17.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.880433+00', '2026-08-24 09:19:51.880433+00', '170', 17.000, 'A0', 310.000, '310', NULL, NULL, 'B', 5, 232, '{}');
INSERT INTO app.materials VALUES ('B05A0001-B160-310', '{"en": "K44EF Polished φ16.0x310", "ja": "K44EF 研磨 φ16.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.880688+00', '2026-08-24 09:19:51.880688+00', '160', 16.000, 'A0', 310.000, '310', NULL, NULL, 'B', 5, 233, '{}');
INSERT INTO app.materials VALUES ('B05A0001-B155-310', '{"en": "K44EF Polished φ15.5x310", "ja": "K44EF 研磨 φ15.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.880943+00', '2026-08-24 09:19:51.880943+00', '155', 15.500, 'A0', 310.000, '310', NULL, NULL, 'B', 5, 234, '{}');
INSERT INTO app.materials VALUES ('B05A0001-B150-310', '{"en": "K44EF Polished φ15.0x310", "ja": "K44EF 研磨 φ15.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.881203+00', '2026-08-24 09:19:51.881203+00', '150', 15.000, 'A0', 310.000, '310', NULL, NULL, 'B', 5, 235, '{}');
INSERT INTO app.materials VALUES ('B05A0001-B145-310', '{"en": "K44EF Polished φ14.5x310", "ja": "K44EF 研磨 φ14.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.881454+00', '2026-08-24 09:19:51.881454+00', '145', 14.500, 'A0', 310.000, '310', NULL, NULL, 'B', 5, 236, '{}');
INSERT INTO app.materials VALUES ('B05A0001-B140-310', '{"en": "K44EF Polished φ14.0x310", "ja": "K44EF 研磨 φ14.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.881726+00', '2026-08-24 09:19:51.881726+00', '140', 14.000, 'A0', 310.000, '310', NULL, NULL, 'B', 5, 237, '{}');
INSERT INTO app.materials VALUES ('B05A0001-B135-310', '{"en": "K44EF Polished φ13.5x310", "ja": "K44EF 研磨 φ13.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.881978+00', '2026-08-24 09:19:51.881978+00', '135', 13.500, 'A0', 310.000, '310', NULL, NULL, 'B', 5, 238, '{}');
INSERT INTO app.materials VALUES ('B05A0001-B130-310', '{"en": "K44EF Polished φ13.0x310", "ja": "K44EF 研磨 φ13.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.882254+00', '2026-08-24 09:19:51.882254+00', '130', 13.000, 'A0', 310.000, '310', NULL, NULL, 'B', 5, 239, '{}');
INSERT INTO app.materials VALUES ('B05A0001-B125-310', '{"en": "K44EF Polished φ12.5x310", "ja": "K44EF 研磨 φ12.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.882621+00', '2026-08-24 09:19:51.882621+00', '125', 12.500, 'A0', 310.000, '310', NULL, NULL, 'B', 5, 240, '{}');
INSERT INTO app.materials VALUES ('B05A0001-B120-310', '{"en": "K44EF Polished φ12.0x310", "ja": "K44EF 研磨 φ12.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.882902+00', '2026-08-24 09:19:51.882902+00', '120', 12.000, 'A0', 310.000, '310', NULL, NULL, 'B', 5, 241, '{}');
INSERT INTO app.materials VALUES ('B05A0001-B115-310', '{"en": "K44EF Polished φ11.5x310", "ja": "K44EF 研磨 φ11.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.88316+00', '2026-08-24 09:19:51.88316+00', '115', 11.500, 'A0', 310.000, '310', NULL, NULL, 'B', 5, 242, '{}');
INSERT INTO app.materials VALUES ('B05A0001-B110-310', '{"en": "K44EF Polished φ11.0x310", "ja": "K44EF 研磨 φ11.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.883415+00', '2026-08-24 09:19:51.883415+00', '110', 11.000, 'A0', 310.000, '310', NULL, NULL, 'B', 5, 243, '{}');
INSERT INTO app.materials VALUES ('B05A0001-B105-310', '{"en": "K44EF Polished φ10.5x310", "ja": "K44EF 研磨 φ10.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.883679+00', '2026-08-24 09:19:51.883679+00', '105', 10.500, 'A0', 310.000, '310', NULL, NULL, 'B', 5, 244, '{}');
INSERT INTO app.materials VALUES ('B05A0001-B100-310', '{"en": "K44EF Polished φ10.0x310", "ja": "K44EF 研磨 φ10.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.883939+00', '2026-08-24 09:19:51.883939+00', '100', 10.000, 'A0', 310.000, '310', NULL, NULL, 'B', 5, 245, '{}');
INSERT INTO app.materials VALUES ('B05A0001-B095-310', '{"en": "K44EF Polished φ9.5x310", "ja": "K44EF 研磨 φ9.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.884188+00', '2026-08-24 09:19:51.884188+00', '095', 9.500, 'A0', 310.000, '310', NULL, NULL, 'B', 5, 246, '{}');
INSERT INTO app.materials VALUES ('B05A0001-B090-310', '{"en": "K44EF Polished φ9.0x310", "ja": "K44EF 研磨 φ9.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.884465+00', '2026-08-24 09:19:51.884465+00', '090', 9.000, 'A0', 310.000, '310', NULL, NULL, 'B', 5, 247, '{}');
INSERT INTO app.materials VALUES ('B05A0001-B085-310', '{"en": "K44EF Polished φ8.5x310", "ja": "K44EF 研磨 φ8.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.884736+00', '2026-08-24 09:19:51.884736+00', '085', 8.500, 'A0', 310.000, '310', NULL, NULL, 'B', 5, 248, '{}');
INSERT INTO app.materials VALUES ('B05A0001-B080-310', '{"en": "K44EF Polished φ8.0x310", "ja": "K44EF 研磨 φ8.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.884999+00', '2026-08-24 09:19:51.884999+00', '080', 8.000, 'A0', 310.000, '310', NULL, NULL, 'B', 5, 249, '{}');
INSERT INTO app.materials VALUES ('B05A0001-B075-310', '{"en": "K44EF Polished φ7.5x310", "ja": "K44EF 研磨 φ7.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.885256+00', '2026-08-24 09:19:51.885256+00', '075', 7.500, 'A0', 310.000, '310', NULL, NULL, 'B', 5, 250, '{}');
INSERT INTO app.materials VALUES ('B05A0001-B070-310', '{"en": "K44EF Polished φ7.0x310", "ja": "K44EF 研磨 φ7.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.885505+00', '2026-08-24 09:19:51.885505+00', '070', 7.000, 'A0', 310.000, '310', NULL, NULL, 'B', 5, 251, '{}');
INSERT INTO app.materials VALUES ('B05A0001-B065-310', '{"en": "K44EF Polished φ6.5x310", "ja": "K44EF 研磨 φ6.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.885761+00', '2026-08-24 09:19:51.885761+00', '065', 6.500, 'A0', 310.000, '310', NULL, NULL, 'B', 5, 252, '{}');
INSERT INTO app.materials VALUES ('B05A0001-B060-310', '{"en": "K44EF Polished φ6.0x310", "ja": "K44EF 研磨 φ6.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.886048+00', '2026-08-24 09:19:51.886048+00', '060', 6.000, 'A0', 310.000, '310', NULL, NULL, 'B', 5, 253, '{}');
INSERT INTO app.materials VALUES ('B05A0001-B055-310', '{"en": "K44EF Polished φ5.5x310", "ja": "K44EF 研磨 φ5.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.886314+00', '2026-08-24 09:19:51.886314+00', '055', 5.500, 'A0', 310.000, '310', NULL, NULL, 'B', 5, 254, '{}');
INSERT INTO app.materials VALUES ('B05A0001-B050-310', '{"en": "K44EF Polished φ5.0x310", "ja": "K44EF 研磨 φ5.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.886578+00', '2026-08-24 09:19:51.886578+00', '050', 5.000, 'A0', 310.000, '310', NULL, NULL, 'B', 5, 255, '{}');
INSERT INTO app.materials VALUES ('B05A0001-B045-310', '{"en": "K44EF Polished φ4.5x310", "ja": "K44EF 研磨 φ4.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.886831+00', '2026-08-24 09:19:51.886831+00', '045', 4.500, 'A0', 310.000, '310', NULL, NULL, 'B', 5, 256, '{}');
INSERT INTO app.materials VALUES ('B05A0001-B040-310', '{"en": "K44EF Polished φ4.0x310", "ja": "K44EF 研磨 φ4.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.8871+00', '2026-08-24 09:19:51.8871+00', '040', 4.000, 'A0', 310.000, '310', NULL, NULL, 'B', 5, 257, '{}');
INSERT INTO app.materials VALUES ('B05A0001-B035-310', '{"en": "K44EF Polished φ3.5x310", "ja": "K44EF 研磨 φ3.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.88743+00', '2026-08-24 09:19:51.88743+00', '035', 3.500, 'A0', 310.000, '310', NULL, NULL, 'B', 5, 258, '{}');
INSERT INTO app.materials VALUES ('B05A0001-B030-310', '{"en": "K44EF Polished φ3.0x310", "ja": "K44EF 研磨 φ3.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.887691+00', '2026-08-24 09:19:51.887691+00', '030', 3.000, 'A0', 310.000, '310', NULL, NULL, 'B', 5, 259, '{}');
INSERT INTO app.materials VALUES ('B05A0001-B025-310', '{"en": "K44EF Polished φ2.5x310", "ja": "K44EF 研磨 φ2.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.887962+00', '2026-08-24 09:19:51.887962+00', '025', 2.500, 'A0', 310.000, '310', NULL, NULL, 'B', 5, 260, '{}');
INSERT INTO app.materials VALUES ('B05A0001-B020-310', '{"en": "K44EF Polished φ2.0x310", "ja": "K44EF 研磨 φ2.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.888229+00', '2026-08-24 09:19:51.888229+00', '020', 2.000, 'A0', 310.000, '310', NULL, NULL, 'B', 5, 261, '{}');
INSERT INTO app.materials VALUES ('B05A0001-B015-310', '{"en": "K44EF Polished φ1.5x310", "ja": "K44EF 研磨 φ1.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.8885+00', '2026-08-24 09:19:51.8885+00', '015', 1.500, 'A0', 310.000, '310', NULL, NULL, 'B', 5, 262, '{}');
INSERT INTO app.materials VALUES ('B05A0001-B010-310', '{"en": "K44EF Polished φ1.0x310", "ja": "K44EF 研磨 φ1.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.888766+00', '2026-08-24 09:19:51.888766+00', '010', 1.000, 'A0', 310.000, '310', NULL, NULL, 'B', 5, 263, '{}');
INSERT INTO app.materials VALUES ('B03A0001-B350-310', '{"en": "K34EF Polished φ35.0x310", "ja": "K34EF 研磨 φ35.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.88905+00', '2026-08-24 09:19:51.88905+00', '350', 35.000, 'A0', 310.000, '310', NULL, NULL, 'B', 3, 264, '{}');
INSERT INTO app.materials VALUES ('B03A0001-B340-310', '{"en": "K34EF Polished φ34.0x310", "ja": "K34EF 研磨 φ34.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.889317+00', '2026-08-24 09:19:51.889317+00', '340', 34.000, 'A0', 310.000, '310', NULL, NULL, 'B', 3, 265, '{}');
INSERT INTO app.materials VALUES ('B03A0001-B330-310', '{"en": "K34EF Polished φ33.0x310", "ja": "K34EF 研磨 φ33.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.889588+00', '2026-08-24 09:19:51.889588+00', '330', 33.000, 'A0', 310.000, '310', NULL, NULL, 'B', 3, 266, '{}');
INSERT INTO app.materials VALUES ('B03A0001-B320-310', '{"en": "K34EF Polished φ32.0x310", "ja": "K34EF 研磨 φ32.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.889851+00', '2026-08-24 09:19:51.889851+00', '320', 32.000, 'A0', 310.000, '310', NULL, NULL, 'B', 3, 267, '{}');
INSERT INTO app.materials VALUES ('B03A0001-B310-310', '{"en": "K34EF Polished φ31.0x310", "ja": "K34EF 研磨 φ31.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.890188+00', '2026-08-24 09:19:51.890188+00', '310', 31.000, 'A0', 310.000, '310', NULL, NULL, 'B', 3, 268, '{}');
INSERT INTO app.materials VALUES ('B03A0001-B300-310', '{"en": "K34EF Polished φ30.0x310", "ja": "K34EF 研磨 φ30.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.890506+00', '2026-08-24 09:19:51.890506+00', '300', 30.000, 'A0', 310.000, '310', NULL, NULL, 'B', 3, 269, '{}');
INSERT INTO app.materials VALUES ('B03A0001-B290-310', '{"en": "K34EF Polished φ29.0x310", "ja": "K34EF 研磨 φ29.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.890804+00', '2026-08-24 09:19:51.890804+00', '290', 29.000, 'A0', 310.000, '310', NULL, NULL, 'B', 3, 270, '{}');
INSERT INTO app.materials VALUES ('B03A0001-B280-310', '{"en": "K34EF Polished φ28.0x310", "ja": "K34EF 研磨 φ28.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.891067+00', '2026-08-24 09:19:51.891067+00', '280', 28.000, 'A0', 310.000, '310', NULL, NULL, 'B', 3, 271, '{}');
INSERT INTO app.materials VALUES ('B03A0001-B270-310', '{"en": "K34EF Polished φ27.0x310", "ja": "K34EF 研磨 φ27.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.891329+00', '2026-08-24 09:19:51.891329+00', '270', 27.000, 'A0', 310.000, '310', NULL, NULL, 'B', 3, 272, '{}');
INSERT INTO app.materials VALUES ('B03A0001-B260-310', '{"en": "K34EF Polished φ26.0x310", "ja": "K34EF 研磨 φ26.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.89159+00', '2026-08-24 09:19:51.89159+00', '260', 26.000, 'A0', 310.000, '310', NULL, NULL, 'B', 3, 273, '{}');
INSERT INTO app.materials VALUES ('B03A0001-B250-310', '{"en": "K34EF Polished φ25.0x310", "ja": "K34EF 研磨 φ25.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.891858+00', '2026-08-24 09:19:51.891858+00', '250', 25.000, 'A0', 310.000, '310', NULL, NULL, 'B', 3, 274, '{}');
INSERT INTO app.materials VALUES ('B03A0001-B240-310', '{"en": "K34EF Polished φ24.0x310", "ja": "K34EF 研磨 φ24.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.89213+00', '2026-08-24 09:19:51.89213+00', '240', 24.000, 'A0', 310.000, '310', NULL, NULL, 'B', 3, 275, '{}');
INSERT INTO app.materials VALUES ('B03A0001-B230-310', '{"en": "K34EF Polished φ23.0x310", "ja": "K34EF 研磨 φ23.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.892408+00', '2026-08-24 09:19:51.892408+00', '230', 23.000, 'A0', 310.000, '310', NULL, NULL, 'B', 3, 276, '{}');
INSERT INTO app.materials VALUES ('B03A0001-B220-310', '{"en": "K34EF Polished φ22.0x310", "ja": "K34EF 研磨 φ22.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.892699+00', '2026-08-24 09:19:51.892699+00', '220', 22.000, 'A0', 310.000, '310', NULL, NULL, 'B', 3, 277, '{}');
INSERT INTO app.materials VALUES ('B03A0001-B210-310', '{"en": "K34EF Polished φ21.0x310", "ja": "K34EF 研磨 φ21.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.893004+00', '2026-08-24 09:19:51.893004+00', '210', 21.000, 'A0', 310.000, '310', NULL, NULL, 'B', 3, 278, '{}');
INSERT INTO app.materials VALUES ('B03A0001-B200-310', '{"en": "K34EF Polished φ20.0x310", "ja": "K34EF 研磨 φ20.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.893269+00', '2026-08-24 09:19:51.893269+00', '200', 20.000, 'A0', 310.000, '310', NULL, NULL, 'B', 3, 279, '{}');
INSERT INTO app.materials VALUES ('B03A0001-B190-310', '{"en": "K34EF Polished φ19.0x310", "ja": "K34EF 研磨 φ19.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.893557+00', '2026-08-24 09:19:51.893557+00', '190', 19.000, 'A0', 310.000, '310', NULL, NULL, 'B', 3, 280, '{}');
INSERT INTO app.materials VALUES ('B03A0001-B180-310', '{"en": "K34EF Polished φ18.0x310", "ja": "K34EF 研磨 φ18.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.893825+00', '2026-08-24 09:19:51.893825+00', '180', 18.000, 'A0', 310.000, '310', NULL, NULL, 'B', 3, 281, '{}');
INSERT INTO app.materials VALUES ('B03A0001-B170-310', '{"en": "K34EF Polished φ17.0x310", "ja": "K34EF 研磨 φ17.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.894113+00', '2026-08-24 09:19:51.894113+00', '170', 17.000, 'A0', 310.000, '310', NULL, NULL, 'B', 3, 282, '{}');
INSERT INTO app.materials VALUES ('B03A0001-B160-310', '{"en": "K34EF Polished φ16.0x310", "ja": "K34EF 研磨 φ16.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.894404+00', '2026-08-24 09:19:51.894404+00', '160', 16.000, 'A0', 310.000, '310', NULL, NULL, 'B', 3, 283, '{}');
INSERT INTO app.materials VALUES ('B03A0001-B155-310', '{"en": "K34EF Polished φ15.5x310", "ja": "K34EF 研磨 φ15.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.894665+00', '2026-08-24 09:19:51.894665+00', '155', 15.500, 'A0', 310.000, '310', NULL, NULL, 'B', 3, 284, '{}');
INSERT INTO app.materials VALUES ('B03A0001-B150-310', '{"en": "K34EF Polished φ15.0x310", "ja": "K34EF 研磨 φ15.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.894953+00', '2026-08-24 09:19:51.894953+00', '150', 15.000, 'A0', 310.000, '310', NULL, NULL, 'B', 3, 285, '{}');
INSERT INTO app.materials VALUES ('B03A0001-B145-310', '{"en": "K34EF Polished φ14.5x310", "ja": "K34EF 研磨 φ14.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.895308+00', '2026-08-24 09:19:51.895308+00', '145', 14.500, 'A0', 310.000, '310', NULL, NULL, 'B', 3, 286, '{}');
INSERT INTO app.materials VALUES ('B03A0001-B140-310', '{"en": "K34EF Polished φ14.0x310", "ja": "K34EF 研磨 φ14.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.895656+00', '2026-08-24 09:19:51.895656+00', '140', 14.000, 'A0', 310.000, '310', NULL, NULL, 'B', 3, 287, '{}');
INSERT INTO app.materials VALUES ('B03A0001-B135-310', '{"en": "K34EF Polished φ13.5x310", "ja": "K34EF 研磨 φ13.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.895914+00', '2026-08-24 09:19:51.895914+00', '135', 13.500, 'A0', 310.000, '310', NULL, NULL, 'B', 3, 288, '{}');
INSERT INTO app.materials VALUES ('B03A0001-B130-310', '{"en": "K34EF Polished φ13.0x310", "ja": "K34EF 研磨 φ13.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.896187+00', '2026-08-24 09:19:51.896187+00', '130', 13.000, 'A0', 310.000, '310', NULL, NULL, 'B', 3, 289, '{}');
INSERT INTO app.materials VALUES ('B03A0001-B125-310', '{"en": "K34EF Polished φ12.5x310", "ja": "K34EF 研磨 φ12.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.896487+00', '2026-08-24 09:19:51.896487+00', '125', 12.500, 'A0', 310.000, '310', NULL, NULL, 'B', 3, 290, '{}');
INSERT INTO app.materials VALUES ('B03A0001-B120-310', '{"en": "K34EF Polished φ12.0x310", "ja": "K34EF 研磨 φ12.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.896788+00', '2026-08-24 09:19:51.896788+00', '120', 12.000, 'A0', 310.000, '310', NULL, NULL, 'B', 3, 291, '{}');
INSERT INTO app.materials VALUES ('B03A0001-B115-310', '{"en": "K34EF Polished φ11.5x310", "ja": "K34EF 研磨 φ11.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.897117+00', '2026-08-24 09:19:51.897117+00', '115', 11.500, 'A0', 310.000, '310', NULL, NULL, 'B', 3, 292, '{}');
INSERT INTO app.materials VALUES ('B03A0001-B110-310', '{"en": "K34EF Polished φ11.0x310", "ja": "K34EF 研磨 φ11.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.897426+00', '2026-08-24 09:19:51.897426+00', '110', 11.000, 'A0', 310.000, '310', NULL, NULL, 'B', 3, 293, '{}');
INSERT INTO app.materials VALUES ('B03A0001-B105-310', '{"en": "K34EF Polished φ10.5x310", "ja": "K34EF 研磨 φ10.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.89771+00', '2026-08-24 09:19:51.89771+00', '105', 10.500, 'A0', 310.000, '310', NULL, NULL, 'B', 3, 294, '{}');
INSERT INTO app.materials VALUES ('B03A0001-B100-310', '{"en": "K34EF Polished φ10.0x310", "ja": "K34EF 研磨 φ10.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.897995+00', '2026-08-24 09:19:51.897995+00', '100', 10.000, 'A0', 310.000, '310', NULL, NULL, 'B', 3, 295, '{}');
INSERT INTO app.materials VALUES ('B03A0001-B095-310', '{"en": "K34EF Polished φ9.5x310", "ja": "K34EF 研磨 φ9.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.898284+00', '2026-08-24 09:19:51.898284+00', '095', 9.500, 'A0', 310.000, '310', NULL, NULL, 'B', 3, 296, '{}');
INSERT INTO app.materials VALUES ('B03A0001-B090-310', '{"en": "K34EF Polished φ9.0x310", "ja": "K34EF 研磨 φ9.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.898564+00', '2026-08-24 09:19:51.898564+00', '090', 9.000, 'A0', 310.000, '310', NULL, NULL, 'B', 3, 297, '{}');
INSERT INTO app.materials VALUES ('B03A0001-B085-310', '{"en": "K34EF Polished φ8.5x310", "ja": "K34EF 研磨 φ8.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.898832+00', '2026-08-24 09:19:51.898832+00', '085', 8.500, 'A0', 310.000, '310', NULL, NULL, 'B', 3, 298, '{}');
INSERT INTO app.materials VALUES ('B03A0001-B080-310', '{"en": "K34EF Polished φ8.0x310", "ja": "K34EF 研磨 φ8.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.899119+00', '2026-08-24 09:19:51.899119+00', '080', 8.000, 'A0', 310.000, '310', NULL, NULL, 'B', 3, 299, '{}');
INSERT INTO app.materials VALUES ('B03A0001-B075-310', '{"en": "K34EF Polished φ7.5x310", "ja": "K34EF 研磨 φ7.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.899384+00', '2026-08-24 09:19:51.899384+00', '075', 7.500, 'A0', 310.000, '310', NULL, NULL, 'B', 3, 300, '{}');
INSERT INTO app.materials VALUES ('B03A0001-B070-310', '{"en": "K34EF Polished φ7.0x310", "ja": "K34EF 研磨 φ7.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.899647+00', '2026-08-24 09:19:51.899647+00', '070', 7.000, 'A0', 310.000, '310', NULL, NULL, 'B', 3, 301, '{}');
INSERT INTO app.materials VALUES ('B03A0001-B065-310', '{"en": "K34EF Polished φ6.5x310", "ja": "K34EF 研磨 φ6.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.899911+00', '2026-08-24 09:19:51.899911+00', '065', 6.500, 'A0', 310.000, '310', NULL, NULL, 'B', 3, 302, '{}');
INSERT INTO app.materials VALUES ('B03A0001-B060-310', '{"en": "K34EF Polished φ6.0x310", "ja": "K34EF 研磨 φ6.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.900176+00', '2026-08-24 09:19:51.900176+00', '060', 6.000, 'A0', 310.000, '310', NULL, NULL, 'B', 3, 303, '{}');
INSERT INTO app.materials VALUES ('B03A0001-B055-310', '{"en": "K34EF Polished φ5.5x310", "ja": "K34EF 研磨 φ5.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.900447+00', '2026-08-24 09:19:51.900447+00', '055', 5.500, 'A0', 310.000, '310', NULL, NULL, 'B', 3, 304, '{}');
INSERT INTO app.materials VALUES ('B03A0001-B050-310', '{"en": "K34EF Polished φ5.0x310", "ja": "K34EF 研磨 φ5.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.900726+00', '2026-08-24 09:19:51.900726+00', '050', 5.000, 'A0', 310.000, '310', NULL, NULL, 'B', 3, 305, '{}');
INSERT INTO app.materials VALUES ('B03A0001-B045-310', '{"en": "K34EF Polished φ4.5x310", "ja": "K34EF 研磨 φ4.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.901019+00', '2026-08-24 09:19:51.901019+00', '045', 4.500, 'A0', 310.000, '310', NULL, NULL, 'B', 3, 306, '{}');
INSERT INTO app.materials VALUES ('B03A0001-B040-310', '{"en": "K34EF Polished φ4.0x310", "ja": "K34EF 研磨 φ4.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.901297+00', '2026-08-24 09:19:51.901297+00', '040', 4.000, 'A0', 310.000, '310', NULL, NULL, 'B', 3, 307, '{}');
INSERT INTO app.materials VALUES ('B03A0001-B035-310', '{"en": "K34EF Polished φ3.5x310", "ja": "K34EF 研磨 φ3.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.901567+00', '2026-08-24 09:19:51.901567+00', '035', 3.500, 'A0', 310.000, '310', NULL, NULL, 'B', 3, 308, '{}');
INSERT INTO app.materials VALUES ('B03A0001-B030-310', '{"en": "K34EF Polished φ3.0x310", "ja": "K34EF 研磨 φ3.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.901849+00', '2026-08-24 09:19:51.901849+00', '030', 3.000, 'A0', 310.000, '310', NULL, NULL, 'B', 3, 309, '{}');
INSERT INTO app.materials VALUES ('B03A0001-B025-310', '{"en": "K34EF Polished φ2.5x310", "ja": "K34EF 研磨 φ2.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.902114+00', '2026-08-24 09:19:51.902114+00', '025', 2.500, 'A0', 310.000, '310', NULL, NULL, 'B', 3, 310, '{}');
INSERT INTO app.materials VALUES ('B03A0001-B020-310', '{"en": "K34EF Polished φ2.0x310", "ja": "K34EF 研磨 φ2.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.902373+00', '2026-08-24 09:19:51.902373+00', '020', 2.000, 'A0', 310.000, '310', NULL, NULL, 'B', 3, 311, '{}');
INSERT INTO app.materials VALUES ('B03A0001-B015-310', '{"en": "K34EF Polished φ1.5x310", "ja": "K34EF 研磨 φ1.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.902652+00', '2026-08-24 09:19:51.902652+00', '015', 1.500, 'A0', 310.000, '310', NULL, NULL, 'B', 3, 312, '{}');
INSERT INTO app.materials VALUES ('B03A0001-B010-310', '{"en": "K34EF Polished φ1.0x310", "ja": "K34EF 研磨 φ1.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.902962+00', '2026-08-24 09:19:51.902962+00', '010', 1.000, 'A0', 310.000, '310', NULL, NULL, 'B', 3, 313, '{}');
INSERT INTO app.materials VALUES ('B06A0001-B350-310', '{"en": "K45EF Polished φ35.0x310", "ja": "K45EF 研磨 φ35.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.903219+00', '2026-08-24 09:19:51.903219+00', '350', 35.000, 'A0', 310.000, '310', NULL, NULL, 'B', 6, 314, '{}');
INSERT INTO app.materials VALUES ('B06A0001-B340-310', '{"en": "K45EF Polished φ34.0x310", "ja": "K45EF 研磨 φ34.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.903474+00', '2026-08-24 09:19:51.903474+00', '340', 34.000, 'A0', 310.000, '310', NULL, NULL, 'B', 6, 315, '{}');
INSERT INTO app.materials VALUES ('B06A0001-B330-310', '{"en": "K45EF Polished φ33.0x310", "ja": "K45EF 研磨 φ33.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.903722+00', '2026-08-24 09:19:51.903722+00', '330', 33.000, 'A0', 310.000, '310', NULL, NULL, 'B', 6, 316, '{}');
INSERT INTO app.materials VALUES ('B06A0001-B320-310', '{"en": "K45EF Polished φ32.0x310", "ja": "K45EF 研磨 φ32.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.903996+00', '2026-08-24 09:19:51.903996+00', '320', 32.000, 'A0', 310.000, '310', NULL, NULL, 'B', 6, 317, '{}');
INSERT INTO app.materials VALUES ('B06A0001-B310-310', '{"en": "K45EF Polished φ31.0x310", "ja": "K45EF 研磨 φ31.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.904263+00', '2026-08-24 09:19:51.904263+00', '310', 31.000, 'A0', 310.000, '310', NULL, NULL, 'B', 6, 318, '{}');
INSERT INTO app.materials VALUES ('B06A0001-B300-310', '{"en": "K45EF Polished φ30.0x310", "ja": "K45EF 研磨 φ30.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.904519+00', '2026-08-24 09:19:51.904519+00', '300', 30.000, 'A0', 310.000, '310', NULL, NULL, 'B', 6, 319, '{}');
INSERT INTO app.materials VALUES ('B06A0001-B290-310', '{"en": "K45EF Polished φ29.0x310", "ja": "K45EF 研磨 φ29.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.904802+00', '2026-08-24 09:19:51.904802+00', '290', 29.000, 'A0', 310.000, '310', NULL, NULL, 'B', 6, 320, '{}');
INSERT INTO app.materials VALUES ('B06A0001-B280-310', '{"en": "K45EF Polished φ28.0x310", "ja": "K45EF 研磨 φ28.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.905087+00', '2026-08-24 09:19:51.905087+00', '280', 28.000, 'A0', 310.000, '310', NULL, NULL, 'B', 6, 321, '{}');
INSERT INTO app.materials VALUES ('B06A0001-B270-310', '{"en": "K45EF Polished φ27.0x310", "ja": "K45EF 研磨 φ27.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.905346+00', '2026-08-24 09:19:51.905346+00', '270', 27.000, 'A0', 310.000, '310', NULL, NULL, 'B', 6, 322, '{}');
INSERT INTO app.materials VALUES ('B06A0001-B260-310', '{"en": "K45EF Polished φ26.0x310", "ja": "K45EF 研磨 φ26.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.905608+00', '2026-08-24 09:19:51.905608+00', '260', 26.000, 'A0', 310.000, '310', NULL, NULL, 'B', 6, 323, '{}');
INSERT INTO app.materials VALUES ('B06A0001-B250-310', '{"en": "K45EF Polished φ25.0x310", "ja": "K45EF 研磨 φ25.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.905901+00', '2026-08-24 09:19:51.905901+00', '250', 25.000, 'A0', 310.000, '310', NULL, NULL, 'B', 6, 324, '{}');
INSERT INTO app.materials VALUES ('B06A0001-B240-310', '{"en": "K45EF Polished φ24.0x310", "ja": "K45EF 研磨 φ24.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.906181+00', '2026-08-24 09:19:51.906181+00', '240', 24.000, 'A0', 310.000, '310', NULL, NULL, 'B', 6, 325, '{}');
INSERT INTO app.materials VALUES ('B06A0001-B230-310', '{"en": "K45EF Polished φ23.0x310", "ja": "K45EF 研磨 φ23.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.906449+00', '2026-08-24 09:19:51.906449+00', '230', 23.000, 'A0', 310.000, '310', NULL, NULL, 'B', 6, 326, '{}');
INSERT INTO app.materials VALUES ('B06A0001-B220-310', '{"en": "K45EF Polished φ22.0x310", "ja": "K45EF 研磨 φ22.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.906715+00', '2026-08-24 09:19:51.906715+00', '220', 22.000, 'A0', 310.000, '310', NULL, NULL, 'B', 6, 327, '{}');
INSERT INTO app.materials VALUES ('B06A0001-B210-310', '{"en": "K45EF Polished φ21.0x310", "ja": "K45EF 研磨 φ21.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.906989+00', '2026-08-24 09:19:51.906989+00', '210', 21.000, 'A0', 310.000, '310', NULL, NULL, 'B', 6, 328, '{}');
INSERT INTO app.materials VALUES ('B06A0001-B200-310', '{"en": "K45EF Polished φ20.0x310", "ja": "K45EF 研磨 φ20.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.907287+00', '2026-08-24 09:19:51.907287+00', '200', 20.000, 'A0', 310.000, '310', NULL, NULL, 'B', 6, 329, '{}');
INSERT INTO app.materials VALUES ('B06A0001-B190-310', '{"en": "K45EF Polished φ19.0x310", "ja": "K45EF 研磨 φ19.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.907563+00', '2026-08-24 09:19:51.907563+00', '190', 19.000, 'A0', 310.000, '310', NULL, NULL, 'B', 6, 330, '{}');
INSERT INTO app.materials VALUES ('B06A0001-B180-310', '{"en": "K45EF Polished φ18.0x310", "ja": "K45EF 研磨 φ18.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.907824+00', '2026-08-24 09:19:51.907824+00', '180', 18.000, 'A0', 310.000, '310', NULL, NULL, 'B', 6, 331, '{}');
INSERT INTO app.materials VALUES ('B06A0001-B170-310', '{"en": "K45EF Polished φ17.0x310", "ja": "K45EF 研磨 φ17.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.908103+00', '2026-08-24 09:19:51.908103+00', '170', 17.000, 'A0', 310.000, '310', NULL, NULL, 'B', 6, 332, '{}');
INSERT INTO app.materials VALUES ('B06A0001-B160-310', '{"en": "K45EF Polished φ16.0x310", "ja": "K45EF 研磨 φ16.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.908356+00', '2026-08-24 09:19:51.908356+00', '160', 16.000, 'A0', 310.000, '310', NULL, NULL, 'B', 6, 333, '{}');
INSERT INTO app.materials VALUES ('B06A0001-B155-310', '{"en": "K45EF Polished φ15.5x310", "ja": "K45EF 研磨 φ15.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.908652+00', '2026-08-24 09:19:51.908652+00', '155', 15.500, 'A0', 310.000, '310', NULL, NULL, 'B', 6, 334, '{}');
INSERT INTO app.materials VALUES ('B06A0001-B150-310', '{"en": "K45EF Polished φ15.0x310", "ja": "K45EF 研磨 φ15.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.908941+00', '2026-08-24 09:19:51.908941+00', '150', 15.000, 'A0', 310.000, '310', NULL, NULL, 'B', 6, 335, '{}');
INSERT INTO app.materials VALUES ('B06A0001-B145-310', '{"en": "K45EF Polished φ14.5x310", "ja": "K45EF 研磨 φ14.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.909217+00', '2026-08-24 09:19:51.909217+00', '145', 14.500, 'A0', 310.000, '310', NULL, NULL, 'B', 6, 336, '{}');
INSERT INTO app.materials VALUES ('B06A0001-B140-310', '{"en": "K45EF Polished φ14.0x310", "ja": "K45EF 研磨 φ14.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.909508+00', '2026-08-24 09:19:51.909508+00', '140', 14.000, 'A0', 310.000, '310', NULL, NULL, 'B', 6, 337, '{}');
INSERT INTO app.materials VALUES ('B06A0001-B135-310', '{"en": "K45EF Polished φ13.5x310", "ja": "K45EF 研磨 φ13.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.909784+00', '2026-08-24 09:19:51.909784+00', '135', 13.500, 'A0', 310.000, '310', NULL, NULL, 'B', 6, 338, '{}');
INSERT INTO app.materials VALUES ('B06A0001-B130-310', '{"en": "K45EF Polished φ13.0x310", "ja": "K45EF 研磨 φ13.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.910085+00', '2026-08-24 09:19:51.910085+00', '130', 13.000, 'A0', 310.000, '310', NULL, NULL, 'B', 6, 339, '{}');
INSERT INTO app.materials VALUES ('B06A0001-B125-310', '{"en": "K45EF Polished φ12.5x310", "ja": "K45EF 研磨 φ12.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.910354+00', '2026-08-24 09:19:51.910354+00', '125', 12.500, 'A0', 310.000, '310', NULL, NULL, 'B', 6, 340, '{}');
INSERT INTO app.materials VALUES ('B06A0001-B120-310', '{"en": "K45EF Polished φ12.0x310", "ja": "K45EF 研磨 φ12.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.910623+00', '2026-08-24 09:19:51.910623+00', '120', 12.000, 'A0', 310.000, '310', NULL, NULL, 'B', 6, 341, '{}');
INSERT INTO app.materials VALUES ('B06A0001-B115-310', '{"en": "K45EF Polished φ11.5x310", "ja": "K45EF 研磨 φ11.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.910884+00', '2026-08-24 09:19:51.910884+00', '115', 11.500, 'A0', 310.000, '310', NULL, NULL, 'B', 6, 342, '{}');
INSERT INTO app.materials VALUES ('B06A0001-B110-310', '{"en": "K45EF Polished φ11.0x310", "ja": "K45EF 研磨 φ11.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.911152+00', '2026-08-24 09:19:51.911152+00', '110', 11.000, 'A0', 310.000, '310', NULL, NULL, 'B', 6, 343, '{}');
INSERT INTO app.materials VALUES ('B06A0001-B105-310', '{"en": "K45EF Polished φ10.5x310", "ja": "K45EF 研磨 φ10.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.911431+00', '2026-08-24 09:19:51.911431+00', '105', 10.500, 'A0', 310.000, '310', NULL, NULL, 'B', 6, 344, '{}');
INSERT INTO app.materials VALUES ('B06A0001-B100-310', '{"en": "K45EF Polished φ10.0x310", "ja": "K45EF 研磨 φ10.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.911696+00', '2026-08-24 09:19:51.911696+00', '100', 10.000, 'A0', 310.000, '310', NULL, NULL, 'B', 6, 345, '{}');
INSERT INTO app.materials VALUES ('B06A0001-B095-310', '{"en": "K45EF Polished φ9.5x310", "ja": "K45EF 研磨 φ9.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.911982+00', '2026-08-24 09:19:51.911982+00', '095', 9.500, 'A0', 310.000, '310', NULL, NULL, 'B', 6, 346, '{}');
INSERT INTO app.materials VALUES ('B06A0001-B090-310', '{"en": "K45EF Polished φ9.0x310", "ja": "K45EF 研磨 φ9.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.91223+00', '2026-08-24 09:19:51.91223+00', '090', 9.000, 'A0', 310.000, '310', NULL, NULL, 'B', 6, 347, '{}');
INSERT INTO app.materials VALUES ('B06A0001-B085-310', '{"en": "K45EF Polished φ8.5x310", "ja": "K45EF 研磨 φ8.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.912499+00', '2026-08-24 09:19:51.912499+00', '085', 8.500, 'A0', 310.000, '310', NULL, NULL, 'B', 6, 348, '{}');
INSERT INTO app.materials VALUES ('B06A0001-B080-310', '{"en": "K45EF Polished φ8.0x310", "ja": "K45EF 研磨 φ8.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.912769+00', '2026-08-24 09:19:51.912769+00', '080', 8.000, 'A0', 310.000, '310', NULL, NULL, 'B', 6, 349, '{}');
INSERT INTO app.materials VALUES ('B06A0001-B075-310', '{"en": "K45EF Polished φ7.5x310", "ja": "K45EF 研磨 φ7.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.913059+00', '2026-08-24 09:19:51.913059+00', '075', 7.500, 'A0', 310.000, '310', NULL, NULL, 'B', 6, 350, '{}');
INSERT INTO app.materials VALUES ('B06A0001-B070-310', '{"en": "K45EF Polished φ7.0x310", "ja": "K45EF 研磨 φ7.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.913311+00', '2026-08-24 09:19:51.913311+00', '070', 7.000, 'A0', 310.000, '310', NULL, NULL, 'B', 6, 351, '{}');
INSERT INTO app.materials VALUES ('B06A0001-B065-310', '{"en": "K45EF Polished φ6.5x310", "ja": "K45EF 研磨 φ6.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.913578+00', '2026-08-24 09:19:51.913578+00', '065', 6.500, 'A0', 310.000, '310', NULL, NULL, 'B', 6, 352, '{}');
INSERT INTO app.materials VALUES ('B06A0001-B060-310', '{"en": "K45EF Polished φ6.0x310", "ja": "K45EF 研磨 φ6.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.913851+00', '2026-08-24 09:19:51.913851+00', '060', 6.000, 'A0', 310.000, '310', NULL, NULL, 'B', 6, 353, '{}');
INSERT INTO app.materials VALUES ('B06A0001-B055-310', '{"en": "K45EF Polished φ5.5x310", "ja": "K45EF 研磨 φ5.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.914167+00', '2026-08-24 09:19:51.914167+00', '055', 5.500, 'A0', 310.000, '310', NULL, NULL, 'B', 6, 354, '{}');
INSERT INTO app.materials VALUES ('B06A0001-B050-310', '{"en": "K45EF Polished φ5.0x310", "ja": "K45EF 研磨 φ5.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.914492+00', '2026-08-24 09:19:51.914492+00', '050', 5.000, 'A0', 310.000, '310', NULL, NULL, 'B', 6, 355, '{}');
INSERT INTO app.materials VALUES ('B06A0001-B045-310', '{"en": "K45EF Polished φ4.5x310", "ja": "K45EF 研磨 φ4.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.9148+00', '2026-08-24 09:19:51.9148+00', '045', 4.500, 'A0', 310.000, '310', NULL, NULL, 'B', 6, 356, '{}');
INSERT INTO app.materials VALUES ('B06A0001-B040-310', '{"en": "K45EF Polished φ4.0x310", "ja": "K45EF 研磨 φ4.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.915098+00', '2026-08-24 09:19:51.915098+00', '040', 4.000, 'A0', 310.000, '310', NULL, NULL, 'B', 6, 357, '{}');
INSERT INTO app.materials VALUES ('B06A0001-B035-310', '{"en": "K45EF Polished φ3.5x310", "ja": "K45EF 研磨 φ3.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.915372+00', '2026-08-24 09:19:51.915372+00', '035', 3.500, 'A0', 310.000, '310', NULL, NULL, 'B', 6, 358, '{}');
INSERT INTO app.materials VALUES ('B06A0001-B030-310', '{"en": "K45EF Polished φ3.0x310", "ja": "K45EF 研磨 φ3.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.915645+00', '2026-08-24 09:19:51.915645+00', '030', 3.000, 'A0', 310.000, '310', NULL, NULL, 'B', 6, 359, '{}');
INSERT INTO app.materials VALUES ('B06A0001-B025-310', '{"en": "K45EF Polished φ2.5x310", "ja": "K45EF 研磨 φ2.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.91591+00', '2026-08-24 09:19:51.91591+00', '025', 2.500, 'A0', 310.000, '310', NULL, NULL, 'B', 6, 360, '{}');
INSERT INTO app.materials VALUES ('B06A0001-B020-310', '{"en": "K45EF Polished φ2.0x310", "ja": "K45EF 研磨 φ2.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.91617+00', '2026-08-24 09:19:51.91617+00', '020', 2.000, 'A0', 310.000, '310', NULL, NULL, 'B', 6, 361, '{}');
INSERT INTO app.materials VALUES ('B06A0001-B015-310', '{"en": "K45EF Polished φ1.5x310", "ja": "K45EF 研磨 φ1.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.916453+00', '2026-08-24 09:19:51.916453+00', '015', 1.500, 'A0', 310.000, '310', NULL, NULL, 'B', 6, 362, '{}');
INSERT INTO app.materials VALUES ('B06A0001-B010-310', '{"en": "K45EF Polished φ1.0x310", "ja": "K45EF 研磨 φ1.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.916741+00', '2026-08-24 09:19:51.916741+00', '010', 1.000, 'A0', 310.000, '310', NULL, NULL, 'B', 6, 363, '{}');
INSERT INTO app.materials VALUES ('B04A0001-A350-310', '{"en": "K40UF Black skin φ35.0x310", "ja": "K40UF 黒皮 φ35.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.917058+00', '2026-08-24 09:19:51.917058+00', '350', 35.000, 'A0', 310.000, '310', NULL, NULL, 'A', 4, 364, '{}');
INSERT INTO app.materials VALUES ('B04A0001-A340-310', '{"en": "K40UF Black skin φ34.0x310", "ja": "K40UF 黒皮 φ34.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.917343+00', '2026-08-24 09:19:51.917343+00', '340', 34.000, 'A0', 310.000, '310', NULL, NULL, 'A', 4, 365, '{}');
INSERT INTO app.materials VALUES ('B04A0001-A330-310', '{"en": "K40UF Black skin φ33.0x310", "ja": "K40UF 黒皮 φ33.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.91761+00', '2026-08-24 09:19:51.91761+00', '330', 33.000, 'A0', 310.000, '310', NULL, NULL, 'A', 4, 366, '{}');
INSERT INTO app.materials VALUES ('B04A0001-A320-310', '{"en": "K40UF Black skin φ32.0x310", "ja": "K40UF 黒皮 φ32.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.917885+00', '2026-08-24 09:19:51.917885+00', '320', 32.000, 'A0', 310.000, '310', NULL, NULL, 'A', 4, 367, '{}');
INSERT INTO app.materials VALUES ('B04A0001-A310-310', '{"en": "K40UF Black skin φ31.0x310", "ja": "K40UF 黒皮 φ31.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.918245+00', '2026-08-24 09:19:51.918245+00', '310', 31.000, 'A0', 310.000, '310', NULL, NULL, 'A', 4, 368, '{}');
INSERT INTO app.materials VALUES ('B04A0001-A300-310', '{"en": "K40UF Black skin φ30.0x310", "ja": "K40UF 黒皮 φ30.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.918539+00', '2026-08-24 09:19:51.918539+00', '300', 30.000, 'A0', 310.000, '310', NULL, NULL, 'A', 4, 369, '{}');
INSERT INTO app.materials VALUES ('B04A0001-A290-310', '{"en": "K40UF Black skin φ29.0x310", "ja": "K40UF 黒皮 φ29.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.918834+00', '2026-08-24 09:19:51.918834+00', '290', 29.000, 'A0', 310.000, '310', NULL, NULL, 'A', 4, 370, '{}');
INSERT INTO app.materials VALUES ('B04A0001-A280-310', '{"en": "K40UF Black skin φ28.0x310", "ja": "K40UF 黒皮 φ28.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.919156+00', '2026-08-24 09:19:51.919156+00', '280', 28.000, 'A0', 310.000, '310', NULL, NULL, 'A', 4, 371, '{}');
INSERT INTO app.materials VALUES ('B04A0001-A270-310', '{"en": "K40UF Black skin φ27.0x310", "ja": "K40UF 黒皮 φ27.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.919588+00', '2026-08-24 09:19:51.919588+00', '270', 27.000, 'A0', 310.000, '310', NULL, NULL, 'A', 4, 372, '{}');
INSERT INTO app.materials VALUES ('B04A0001-A260-310', '{"en": "K40UF Black skin φ26.0x310", "ja": "K40UF 黒皮 φ26.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.919896+00', '2026-08-24 09:19:51.919896+00', '260', 26.000, 'A0', 310.000, '310', NULL, NULL, 'A', 4, 373, '{}');
INSERT INTO app.materials VALUES ('B04A0001-A255-310', '{"en": "K40UF Black skin φ25.5x310", "ja": "K40UF 黒皮 φ25.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.920225+00', '2026-08-24 09:19:51.920225+00', '255', 25.500, 'A0', 310.000, '310', NULL, NULL, 'A', 4, 374, '{}');
INSERT INTO app.materials VALUES ('B04A0001-A250-310', '{"en": "K40UF Black skin φ25.0x310", "ja": "K40UF 黒皮 φ25.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.920536+00', '2026-08-24 09:19:51.920536+00', '250', 25.000, 'A0', 310.000, '310', NULL, NULL, 'A', 4, 375, '{}');
INSERT INTO app.materials VALUES ('B04A0001-A240-310', '{"en": "K40UF Black skin φ24.0x310", "ja": "K40UF 黒皮 φ24.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.920865+00', '2026-08-24 09:19:51.920865+00', '240', 24.000, 'A0', 310.000, '310', NULL, NULL, 'A', 4, 376, '{}');
INSERT INTO app.materials VALUES ('B04A0001-A235-310', '{"en": "K40UF Black skin φ23.5x310", "ja": "K40UF 黒皮 φ23.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.921209+00', '2026-08-24 09:19:51.921209+00', '235', 23.500, 'A0', 310.000, '310', NULL, NULL, 'A', 4, 377, '{}');
INSERT INTO app.materials VALUES ('B04A0001-A230-310', '{"en": "K40UF Black skin φ23.0x310", "ja": "K40UF 黒皮 φ23.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.921551+00', '2026-08-24 09:19:51.921551+00', '230', 23.000, 'A0', 310.000, '310', NULL, NULL, 'A', 4, 378, '{}');
INSERT INTO app.materials VALUES ('B04A0001-A225-310', '{"en": "K40UF Black skin φ22.5x310", "ja": "K40UF 黒皮 φ22.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.921906+00', '2026-08-24 09:19:51.921906+00', '225', 22.500, 'A0', 310.000, '310', NULL, NULL, 'A', 4, 379, '{}');
INSERT INTO app.materials VALUES ('B04A0001-A220-310', '{"en": "K40UF Black skin φ22.0x310", "ja": "K40UF 黒皮 φ22.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.922293+00', '2026-08-24 09:19:51.922293+00', '220', 22.000, 'A0', 310.000, '310', NULL, NULL, 'A', 4, 380, '{}');
INSERT INTO app.materials VALUES ('B04A0001-A215-310', '{"en": "K40UF Black skin φ21.5x310", "ja": "K40UF 黒皮 φ21.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.922598+00', '2026-08-24 09:19:51.922598+00', '215', 21.500, 'A0', 310.000, '310', NULL, NULL, 'A', 4, 381, '{}');
INSERT INTO app.materials VALUES ('B04A0001-A210-310', '{"en": "K40UF Black skin φ21.0x310", "ja": "K40UF 黒皮 φ21.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.922915+00', '2026-08-24 09:19:51.922915+00', '210', 21.000, 'A0', 310.000, '310', NULL, NULL, 'A', 4, 382, '{}');
INSERT INTO app.materials VALUES ('B04A0001-A205-310', '{"en": "K40UF Black skin φ20.5x310", "ja": "K40UF 黒皮 φ20.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.923263+00', '2026-08-24 09:19:51.923263+00', '205', 20.500, 'A0', 310.000, '310', NULL, NULL, 'A', 4, 383, '{}');
INSERT INTO app.materials VALUES ('B04A0001-A200-310', '{"en": "K40UF Black skin φ20.0x310", "ja": "K40UF 黒皮 φ20.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.923615+00', '2026-08-24 09:19:51.923615+00', '200', 20.000, 'A0', 310.000, '310', NULL, NULL, 'A', 4, 384, '{}');
INSERT INTO app.materials VALUES ('B04A0001-A195-310', '{"en": "K40UF Black skin φ19.5x310", "ja": "K40UF 黒皮 φ19.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.923922+00', '2026-08-24 09:19:51.923922+00', '195', 19.500, 'A0', 310.000, '310', NULL, NULL, 'A', 4, 385, '{}');
INSERT INTO app.materials VALUES ('B04A0001-A190-310', '{"en": "K40UF Black skin φ19.0x310", "ja": "K40UF 黒皮 φ19.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.924285+00', '2026-08-24 09:19:51.924285+00', '190', 19.000, 'A0', 310.000, '310', NULL, NULL, 'A', 4, 386, '{}');
INSERT INTO app.materials VALUES ('B04A0001-A185-310', '{"en": "K40UF Black skin φ18.5x310", "ja": "K40UF 黒皮 φ18.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.924653+00', '2026-08-24 09:19:51.924653+00', '185', 18.500, 'A0', 310.000, '310', NULL, NULL, 'A', 4, 387, '{}');
INSERT INTO app.materials VALUES ('B04A0001-A180-310', '{"en": "K40UF Black skin φ18.0x310", "ja": "K40UF 黒皮 φ18.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.924972+00', '2026-08-24 09:19:51.924972+00', '180', 18.000, 'A0', 310.000, '310', NULL, NULL, 'A', 4, 388, '{}');
INSERT INTO app.materials VALUES ('B04A0001-A175-310', '{"en": "K40UF Black skin φ17.5x310", "ja": "K40UF 黒皮 φ17.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.925296+00', '2026-08-24 09:19:51.925296+00', '175', 17.500, 'A0', 310.000, '310', NULL, NULL, 'A', 4, 389, '{}');
INSERT INTO app.materials VALUES ('B04A0001-A170-310', '{"en": "K40UF Black skin φ17.0x310", "ja": "K40UF 黒皮 φ17.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.925605+00', '2026-08-24 09:19:51.925605+00', '170', 17.000, 'A0', 310.000, '310', NULL, NULL, 'A', 4, 390, '{}');
INSERT INTO app.materials VALUES ('B04A0001-A165-310', '{"en": "K40UF Black skin φ16.5x310", "ja": "K40UF 黒皮 φ16.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.92594+00', '2026-08-24 09:19:51.92594+00', '165', 16.500, 'A0', 310.000, '310', NULL, NULL, 'A', 4, 391, '{}');
INSERT INTO app.materials VALUES ('B04A0001-A160-310', '{"en": "K40UF Black skin φ16.0x310", "ja": "K40UF 黒皮 φ16.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.926252+00', '2026-08-24 09:19:51.926252+00', '160', 16.000, 'A0', 310.000, '310', NULL, NULL, 'A', 4, 392, '{}');
INSERT INTO app.materials VALUES ('B04A0001-A155-310', '{"en": "K40UF Black skin φ15.5x310", "ja": "K40UF 黒皮 φ15.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.926546+00', '2026-08-24 09:19:51.926546+00', '155', 15.500, 'A0', 310.000, '310', NULL, NULL, 'A', 4, 393, '{}');
INSERT INTO app.materials VALUES ('B04A0001-A150-310', '{"en": "K40UF Black skin φ15.0x310", "ja": "K40UF 黒皮 φ15.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.926854+00', '2026-08-24 09:19:51.926854+00', '150', 15.000, 'A0', 310.000, '310', NULL, NULL, 'A', 4, 394, '{}');
INSERT INTO app.materials VALUES ('B04A0001-A145-310', '{"en": "K40UF Black skin φ14.5x310", "ja": "K40UF 黒皮 φ14.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.92716+00', '2026-08-24 09:19:51.92716+00', '145', 14.500, 'A0', 310.000, '310', NULL, NULL, 'A', 4, 395, '{}');
INSERT INTO app.materials VALUES ('B04A0001-A140-310', '{"en": "K40UF Black skin φ14.0x310", "ja": "K40UF 黒皮 φ14.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.927486+00', '2026-08-24 09:19:51.927486+00', '140', 14.000, 'A0', 310.000, '310', NULL, NULL, 'A', 4, 396, '{}');
INSERT INTO app.materials VALUES ('B04A0001-A135-310', '{"en": "K40UF Black skin φ13.5x310", "ja": "K40UF 黒皮 φ13.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.927803+00', '2026-08-24 09:19:51.927803+00', '135', 13.500, 'A0', 310.000, '310', NULL, NULL, 'A', 4, 397, '{}');
INSERT INTO app.materials VALUES ('B04A0001-A130-310', '{"en": "K40UF Black skin φ13.0x310", "ja": "K40UF 黒皮 φ13.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.928132+00', '2026-08-24 09:19:51.928132+00', '130', 13.000, 'A0', 310.000, '310', NULL, NULL, 'A', 4, 398, '{}');
INSERT INTO app.materials VALUES ('B04A0001-A125-310', '{"en": "K40UF Black skin φ12.5x310", "ja": "K40UF 黒皮 φ12.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.928401+00', '2026-08-24 09:19:51.928401+00', '125', 12.500, 'A0', 310.000, '310', NULL, NULL, 'A', 4, 399, '{}');
INSERT INTO app.materials VALUES ('B04A0001-A120-310', '{"en": "K40UF Black skin φ12.0x310", "ja": "K40UF 黒皮 φ12.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.928768+00', '2026-08-24 09:19:51.928768+00', '120', 12.000, 'A0', 310.000, '310', NULL, NULL, 'A', 4, 400, '{}');
INSERT INTO app.materials VALUES ('B04A0001-A115-310', '{"en": "K40UF Black skin φ11.5x310", "ja": "K40UF 黒皮 φ11.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.929068+00', '2026-08-24 09:19:51.929068+00', '115', 11.500, 'A0', 310.000, '310', NULL, NULL, 'A', 4, 401, '{}');
INSERT INTO app.materials VALUES ('B04A0001-A110-310', '{"en": "K40UF Black skin φ11.0x310", "ja": "K40UF 黒皮 φ11.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.92934+00', '2026-08-24 09:19:51.92934+00', '110', 11.000, 'A0', 310.000, '310', NULL, NULL, 'A', 4, 402, '{}');
INSERT INTO app.materials VALUES ('B04A0001-A105-310', '{"en": "K40UF Black skin φ10.5x310", "ja": "K40UF 黒皮 φ10.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.929612+00', '2026-08-24 09:19:51.929612+00', '105', 10.500, 'A0', 310.000, '310', NULL, NULL, 'A', 4, 403, '{}');
INSERT INTO app.materials VALUES ('B04A0001-A100-310', '{"en": "K40UF Black skin φ10.0x310", "ja": "K40UF 黒皮 φ10.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.929886+00', '2026-08-24 09:19:51.929886+00', '100', 10.000, 'A0', 310.000, '310', NULL, NULL, 'A', 4, 404, '{}');
INSERT INTO app.materials VALUES ('B04A0001-A095-310', '{"en": "K40UF Black skin φ9.5x310", "ja": "K40UF 黒皮 φ9.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.930163+00', '2026-08-24 09:19:51.930163+00', '095', 9.500, 'A0', 310.000, '310', NULL, NULL, 'A', 4, 405, '{}');
INSERT INTO app.materials VALUES ('B04A0001-A090-310', '{"en": "K40UF Black skin φ9.0x310", "ja": "K40UF 黒皮 φ9.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.930521+00', '2026-08-24 09:19:51.930521+00', '090', 9.000, 'A0', 310.000, '310', NULL, NULL, 'A', 4, 406, '{}');
INSERT INTO app.materials VALUES ('B04A0001-A085-310', '{"en": "K40UF Black skin φ8.5x310", "ja": "K40UF 黒皮 φ8.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.930949+00', '2026-08-24 09:19:51.930949+00', '085', 8.500, 'A0', 310.000, '310', NULL, NULL, 'A', 4, 407, '{}');
INSERT INTO app.materials VALUES ('B04A0001-A080-310', '{"en": "K40UF Black skin φ8.0x310", "ja": "K40UF 黒皮 φ8.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.931306+00', '2026-08-24 09:19:51.931306+00', '080', 8.000, 'A0', 310.000, '310', NULL, NULL, 'A', 4, 408, '{}');
INSERT INTO app.materials VALUES ('B04A0001-A075-310', '{"en": "K40UF Black skin φ7.5x310", "ja": "K40UF 黒皮 φ7.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.931681+00', '2026-08-24 09:19:51.931681+00', '075', 7.500, 'A0', 310.000, '310', NULL, NULL, 'A', 4, 409, '{}');
INSERT INTO app.materials VALUES ('B04A0001-A070-310', '{"en": "K40UF Black skin φ7.0x310", "ja": "K40UF 黒皮 φ7.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.931981+00', '2026-08-24 09:19:51.931981+00', '070', 7.000, 'A0', 310.000, '310', NULL, NULL, 'A', 4, 410, '{}');
INSERT INTO app.materials VALUES ('B04A0001-A065-310', '{"en": "K40UF Black skin φ6.5x310", "ja": "K40UF 黒皮 φ6.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.932268+00', '2026-08-24 09:19:51.932268+00', '065', 6.500, 'A0', 310.000, '310', NULL, NULL, 'A', 4, 411, '{}');
INSERT INTO app.materials VALUES ('B04A0001-A060-310', '{"en": "K40UF Black skin φ6.0x310", "ja": "K40UF 黒皮 φ6.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.932607+00', '2026-08-24 09:19:51.932607+00', '060', 6.000, 'A0', 310.000, '310', NULL, NULL, 'A', 4, 412, '{}');
INSERT INTO app.materials VALUES ('B04A0001-A055-310', '{"en": "K40UF Black skin φ5.5x310", "ja": "K40UF 黒皮 φ5.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.932907+00', '2026-08-24 09:19:51.932907+00', '055', 5.500, 'A0', 310.000, '310', NULL, NULL, 'A', 4, 413, '{}');
INSERT INTO app.materials VALUES ('B04A0001-A050-310', '{"en": "K40UF Black skin φ5.0x310", "ja": "K40UF 黒皮 φ5.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.933191+00', '2026-08-24 09:19:51.933191+00', '050', 5.000, 'A0', 310.000, '310', NULL, NULL, 'A', 4, 414, '{}');
INSERT INTO app.materials VALUES ('B04A0001-A045-310', '{"en": "K40UF Black skin φ4.5x310", "ja": "K40UF 黒皮 φ4.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.933449+00', '2026-08-24 09:19:51.933449+00', '045', 4.500, 'A0', 310.000, '310', NULL, NULL, 'A', 4, 415, '{}');
INSERT INTO app.materials VALUES ('B04A0001-A040-310', '{"en": "K40UF Black skin φ4.0x310", "ja": "K40UF 黒皮 φ4.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.933703+00', '2026-08-24 09:19:51.933703+00', '040', 4.000, 'A0', 310.000, '310', NULL, NULL, 'A', 4, 416, '{}');
INSERT INTO app.materials VALUES ('B04A0001-A035-310', '{"en": "K40UF Black skin φ3.5x310", "ja": "K40UF 黒皮 φ3.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.934098+00', '2026-08-24 09:19:51.934098+00', '035', 3.500, 'A0', 310.000, '310', NULL, NULL, 'A', 4, 417, '{}');
INSERT INTO app.materials VALUES ('B04A0001-A030-310', '{"en": "K40UF Black skin φ3.0x310", "ja": "K40UF 黒皮 φ3.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.934371+00', '2026-08-24 09:19:51.934371+00', '030', 3.000, 'A0', 310.000, '310', NULL, NULL, 'A', 4, 418, '{}');
INSERT INTO app.materials VALUES ('B04A0001-A025-310', '{"en": "K40UF Black skin φ2.5x310", "ja": "K40UF 黒皮 φ2.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.934708+00', '2026-08-24 09:19:51.934708+00', '025', 2.500, 'A0', 310.000, '310', NULL, NULL, 'A', 4, 419, '{}');
INSERT INTO app.materials VALUES ('B04A0001-A020-310', '{"en": "K40UF Black skin φ2.0x310", "ja": "K40UF 黒皮 φ2.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.935012+00', '2026-08-24 09:19:51.935012+00', '020', 2.000, 'A0', 310.000, '310', NULL, NULL, 'A', 4, 420, '{}');
INSERT INTO app.materials VALUES ('B04A0001-A015-310', '{"en": "K40UF Black skin φ1.5x310", "ja": "K40UF 黒皮 φ1.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.935326+00', '2026-08-24 09:19:51.935326+00', '015', 1.500, 'A0', 310.000, '310', NULL, NULL, 'A', 4, 421, '{}');
INSERT INTO app.materials VALUES ('B04A0001-A010-310', '{"en": "K40UF Black skin φ1.0x310", "ja": "K40UF 黒皮 φ1.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.935671+00', '2026-08-24 09:19:51.935671+00', '010', 1.000, 'A0', 310.000, '310', NULL, NULL, 'A', 4, 422, '{}');
INSERT INTO app.materials VALUES ('B02A0001-A350-310', '{"en": "K20CF Black skin φ35.0x310", "ja": "K20CF 黒皮 φ35.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.936013+00', '2026-08-24 09:19:51.936013+00', '350', 35.000, 'A0', 310.000, '310', NULL, NULL, 'A', 2, 423, '{}');
INSERT INTO app.materials VALUES ('B02A0001-A340-310', '{"en": "K20CF Black skin φ34.0x310", "ja": "K20CF 黒皮 φ34.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.936301+00', '2026-08-24 09:19:51.936301+00', '340', 34.000, 'A0', 310.000, '310', NULL, NULL, 'A', 2, 424, '{}');
INSERT INTO app.materials VALUES ('B02A0001-A330-310', '{"en": "K20CF Black skin φ33.0x310", "ja": "K20CF 黒皮 φ33.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.936574+00', '2026-08-24 09:19:51.936574+00', '330', 33.000, 'A0', 310.000, '310', NULL, NULL, 'A', 2, 425, '{}');
INSERT INTO app.materials VALUES ('B02A0001-A320-310', '{"en": "K20CF Black skin φ32.0x310", "ja": "K20CF 黒皮 φ32.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.93688+00', '2026-08-24 09:19:51.93688+00', '320', 32.000, 'A0', 310.000, '310', NULL, NULL, 'A', 2, 426, '{}');
INSERT INTO app.materials VALUES ('B02A0001-A310-310', '{"en": "K20CF Black skin φ31.0x310", "ja": "K20CF 黒皮 φ31.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.937225+00', '2026-08-24 09:19:51.937225+00', '310', 31.000, 'A0', 310.000, '310', NULL, NULL, 'A', 2, 427, '{}');
INSERT INTO app.materials VALUES ('B02A0001-A300-310', '{"en": "K20CF Black skin φ30.0x310", "ja": "K20CF 黒皮 φ30.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.937502+00', '2026-08-24 09:19:51.937502+00', '300', 30.000, 'A0', 310.000, '310', NULL, NULL, 'A', 2, 428, '{}');
INSERT INTO app.materials VALUES ('B02A0001-A290-310', '{"en": "K20CF Black skin φ29.0x310", "ja": "K20CF 黒皮 φ29.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.937797+00', '2026-08-24 09:19:51.937797+00', '290', 29.000, 'A0', 310.000, '310', NULL, NULL, 'A', 2, 429, '{}');
INSERT INTO app.materials VALUES ('B02A0001-A280-310', '{"en": "K20CF Black skin φ28.0x310", "ja": "K20CF 黒皮 φ28.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.93811+00', '2026-08-24 09:19:51.93811+00', '280', 28.000, 'A0', 310.000, '310', NULL, NULL, 'A', 2, 430, '{}');
INSERT INTO app.materials VALUES ('B02A0001-A270-310', '{"en": "K20CF Black skin φ27.0x310", "ja": "K20CF 黒皮 φ27.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.938482+00', '2026-08-24 09:19:51.938482+00', '270', 27.000, 'A0', 310.000, '310', NULL, NULL, 'A', 2, 431, '{}');
INSERT INTO app.materials VALUES ('B02A0001-A260-310', '{"en": "K20CF Black skin φ26.0x310", "ja": "K20CF 黒皮 φ26.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.938792+00', '2026-08-24 09:19:51.938792+00', '260', 26.000, 'A0', 310.000, '310', NULL, NULL, 'A', 2, 432, '{}');
INSERT INTO app.materials VALUES ('B02A0001-A255-310', '{"en": "K20CF Black skin φ25.5x310", "ja": "K20CF 黒皮 φ25.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.939094+00', '2026-08-24 09:19:51.939094+00', '255', 25.500, 'A0', 310.000, '310', NULL, NULL, 'A', 2, 433, '{}');
INSERT INTO app.materials VALUES ('B02A0001-A250-310', '{"en": "K20CF Black skin φ25.0x310", "ja": "K20CF 黒皮 φ25.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.939481+00', '2026-08-24 09:19:51.939481+00', '250', 25.000, 'A0', 310.000, '310', NULL, NULL, 'A', 2, 434, '{}');
INSERT INTO app.materials VALUES ('B02A0001-A240-310', '{"en": "K20CF Black skin φ24.0x310", "ja": "K20CF 黒皮 φ24.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.939804+00', '2026-08-24 09:19:51.939804+00', '240', 24.000, 'A0', 310.000, '310', NULL, NULL, 'A', 2, 435, '{}');
INSERT INTO app.materials VALUES ('B02A0001-A235-310', '{"en": "K20CF Black skin φ23.5x310", "ja": "K20CF 黒皮 φ23.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.94014+00', '2026-08-24 09:19:51.94014+00', '235', 23.500, 'A0', 310.000, '310', NULL, NULL, 'A', 2, 436, '{}');
INSERT INTO app.materials VALUES ('B02A0001-A230-310', '{"en": "K20CF Black skin φ23.0x310", "ja": "K20CF 黒皮 φ23.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.940439+00', '2026-08-24 09:19:51.940439+00', '230', 23.000, 'A0', 310.000, '310', NULL, NULL, 'A', 2, 437, '{}');
INSERT INTO app.materials VALUES ('B02A0001-A225-310', '{"en": "K20CF Black skin φ22.5x310", "ja": "K20CF 黒皮 φ22.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.940735+00', '2026-08-24 09:19:51.940735+00', '225', 22.500, 'A0', 310.000, '310', NULL, NULL, 'A', 2, 438, '{}');
INSERT INTO app.materials VALUES ('B02A0001-A220-310', '{"en": "K20CF Black skin φ22.0x310", "ja": "K20CF 黒皮 φ22.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.941068+00', '2026-08-24 09:19:51.941068+00', '220', 22.000, 'A0', 310.000, '310', NULL, NULL, 'A', 2, 439, '{}');
INSERT INTO app.materials VALUES ('B02A0001-A215-310', '{"en": "K20CF Black skin φ21.5x310", "ja": "K20CF 黒皮 φ21.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.941344+00', '2026-08-24 09:19:51.941344+00', '215', 21.500, 'A0', 310.000, '310', NULL, NULL, 'A', 2, 440, '{}');
INSERT INTO app.materials VALUES ('B02A0001-A210-310', '{"en": "K20CF Black skin φ21.0x310", "ja": "K20CF 黒皮 φ21.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.941616+00', '2026-08-24 09:19:51.941616+00', '210', 21.000, 'A0', 310.000, '310', NULL, NULL, 'A', 2, 441, '{}');
INSERT INTO app.materials VALUES ('B02A0001-A205-310', '{"en": "K20CF Black skin φ20.5x310", "ja": "K20CF 黒皮 φ20.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.941896+00', '2026-08-24 09:19:51.941896+00', '205', 20.500, 'A0', 310.000, '310', NULL, NULL, 'A', 2, 442, '{}');
INSERT INTO app.materials VALUES ('B02A0001-A200-310', '{"en": "K20CF Black skin φ20.0x310", "ja": "K20CF 黒皮 φ20.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.942192+00', '2026-08-24 09:19:51.942192+00', '200', 20.000, 'A0', 310.000, '310', NULL, NULL, 'A', 2, 443, '{}');
INSERT INTO app.materials VALUES ('B02A0001-A195-310', '{"en": "K20CF Black skin φ19.5x310", "ja": "K20CF 黒皮 φ19.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.942466+00', '2026-08-24 09:19:51.942466+00', '195', 19.500, 'A0', 310.000, '310', NULL, NULL, 'A', 2, 444, '{}');
INSERT INTO app.materials VALUES ('B02A0001-A190-310', '{"en": "K20CF Black skin φ19.0x310", "ja": "K20CF 黒皮 φ19.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.9428+00', '2026-08-24 09:19:51.9428+00', '190', 19.000, 'A0', 310.000, '310', NULL, NULL, 'A', 2, 445, '{}');
INSERT INTO app.materials VALUES ('B02A0001-A185-310', '{"en": "K20CF Black skin φ18.5x310", "ja": "K20CF 黒皮 φ18.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.943099+00', '2026-08-24 09:19:51.943099+00', '185', 18.500, 'A0', 310.000, '310', NULL, NULL, 'A', 2, 446, '{}');
INSERT INTO app.materials VALUES ('B02A0001-A180-310', '{"en": "K20CF Black skin φ18.0x310", "ja": "K20CF 黒皮 φ18.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.943402+00', '2026-08-24 09:19:51.943402+00', '180', 18.000, 'A0', 310.000, '310', NULL, NULL, 'A', 2, 447, '{}');
INSERT INTO app.materials VALUES ('B02A0001-A175-310', '{"en": "K20CF Black skin φ17.5x310", "ja": "K20CF 黒皮 φ17.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.94368+00', '2026-08-24 09:19:51.94368+00', '175', 17.500, 'A0', 310.000, '310', NULL, NULL, 'A', 2, 448, '{}');
INSERT INTO app.materials VALUES ('B02A0001-A170-310', '{"en": "K20CF Black skin φ17.0x310", "ja": "K20CF 黒皮 φ17.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.943972+00', '2026-08-24 09:19:51.943972+00', '170', 17.000, 'A0', 310.000, '310', NULL, NULL, 'A', 2, 449, '{}');
INSERT INTO app.materials VALUES ('B02A0001-A165-310', '{"en": "K20CF Black skin φ16.5x310", "ja": "K20CF 黒皮 φ16.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.944274+00', '2026-08-24 09:19:51.944274+00', '165', 16.500, 'A0', 310.000, '310', NULL, NULL, 'A', 2, 450, '{}');
INSERT INTO app.materials VALUES ('B02A0001-A160-310', '{"en": "K20CF Black skin φ16.0x310", "ja": "K20CF 黒皮 φ16.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.944559+00', '2026-08-24 09:19:51.944559+00', '160', 16.000, 'A0', 310.000, '310', NULL, NULL, 'A', 2, 451, '{}');
INSERT INTO app.materials VALUES ('B02A0001-A155-310', '{"en": "K20CF Black skin φ15.5x310", "ja": "K20CF 黒皮 φ15.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.944832+00', '2026-08-24 09:19:51.944832+00', '155', 15.500, 'A0', 310.000, '310', NULL, NULL, 'A', 2, 452, '{}');
INSERT INTO app.materials VALUES ('B02A0001-A150-310', '{"en": "K20CF Black skin φ15.0x310", "ja": "K20CF 黒皮 φ15.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.945129+00', '2026-08-24 09:19:51.945129+00', '150', 15.000, 'A0', 310.000, '310', NULL, NULL, 'A', 2, 453, '{}');
INSERT INTO app.materials VALUES ('B02A0001-A145-310', '{"en": "K20CF Black skin φ14.5x310", "ja": "K20CF 黒皮 φ14.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.945428+00', '2026-08-24 09:19:51.945428+00', '145', 14.500, 'A0', 310.000, '310', NULL, NULL, 'A', 2, 454, '{}');
INSERT INTO app.materials VALUES ('B02A0001-A140-310', '{"en": "K20CF Black skin φ14.0x310", "ja": "K20CF 黒皮 φ14.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.945694+00', '2026-08-24 09:19:51.945694+00', '140', 14.000, 'A0', 310.000, '310', NULL, NULL, 'A', 2, 455, '{}');
INSERT INTO app.materials VALUES ('B02A0001-A135-310', '{"en": "K20CF Black skin φ13.5x310", "ja": "K20CF 黒皮 φ13.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.945979+00', '2026-08-24 09:19:51.945979+00', '135', 13.500, 'A0', 310.000, '310', NULL, NULL, 'A', 2, 456, '{}');
INSERT INTO app.materials VALUES ('B02A0001-A130-310', '{"en": "K20CF Black skin φ13.0x310", "ja": "K20CF 黒皮 φ13.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.946289+00', '2026-08-24 09:19:51.946289+00', '130', 13.000, 'A0', 310.000, '310', NULL, NULL, 'A', 2, 457, '{}');
INSERT INTO app.materials VALUES ('B02A0001-A125-310', '{"en": "K20CF Black skin φ12.5x310", "ja": "K20CF 黒皮 φ12.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.946627+00', '2026-08-24 09:19:51.946627+00', '125', 12.500, 'A0', 310.000, '310', NULL, NULL, 'A', 2, 458, '{}');
INSERT INTO app.materials VALUES ('B02A0001-A120-310', '{"en": "K20CF Black skin φ12.0x310", "ja": "K20CF 黒皮 φ12.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.946903+00', '2026-08-24 09:19:51.946903+00', '120', 12.000, 'A0', 310.000, '310', NULL, NULL, 'A', 2, 459, '{}');
INSERT INTO app.materials VALUES ('B02A0001-A115-310', '{"en": "K20CF Black skin φ11.5x310", "ja": "K20CF 黒皮 φ11.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.947179+00', '2026-08-24 09:19:51.947179+00', '115', 11.500, 'A0', 310.000, '310', NULL, NULL, 'A', 2, 460, '{}');
INSERT INTO app.materials VALUES ('B02A0001-A110-310', '{"en": "K20CF Black skin φ11.0x310", "ja": "K20CF 黒皮 φ11.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.947463+00', '2026-08-24 09:19:51.947463+00', '110', 11.000, 'A0', 310.000, '310', NULL, NULL, 'A', 2, 461, '{}');
INSERT INTO app.materials VALUES ('B02A0001-A105-310', '{"en": "K20CF Black skin φ10.5x310", "ja": "K20CF 黒皮 φ10.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.947738+00', '2026-08-24 09:19:51.947738+00', '105', 10.500, 'A0', 310.000, '310', NULL, NULL, 'A', 2, 462, '{}');
INSERT INTO app.materials VALUES ('B02A0001-A100-310', '{"en": "K20CF Black skin φ10.0x310", "ja": "K20CF 黒皮 φ10.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.948001+00', '2026-08-24 09:19:51.948001+00', '100', 10.000, 'A0', 310.000, '310', NULL, NULL, 'A', 2, 463, '{}');
INSERT INTO app.materials VALUES ('B02A0001-A095-310', '{"en": "K20CF Black skin φ9.5x310", "ja": "K20CF 黒皮 φ9.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.94827+00', '2026-08-24 09:19:51.94827+00', '095', 9.500, 'A0', 310.000, '310', NULL, NULL, 'A', 2, 464, '{}');
INSERT INTO app.materials VALUES ('B02A0001-A090-310', '{"en": "K20CF Black skin φ9.0x310", "ja": "K20CF 黒皮 φ9.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.948548+00', '2026-08-24 09:19:51.948548+00', '090', 9.000, 'A0', 310.000, '310', NULL, NULL, 'A', 2, 465, '{}');
INSERT INTO app.materials VALUES ('B02A0001-A085-310', '{"en": "K20CF Black skin φ8.5x310", "ja": "K20CF 黒皮 φ8.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.948846+00', '2026-08-24 09:19:51.948846+00', '085', 8.500, 'A0', 310.000, '310', NULL, NULL, 'A', 2, 466, '{}');
INSERT INTO app.materials VALUES ('B02A0001-A080-310', '{"en": "K20CF Black skin φ8.0x310", "ja": "K20CF 黒皮 φ8.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.949134+00', '2026-08-24 09:19:51.949134+00', '080', 8.000, 'A0', 310.000, '310', NULL, NULL, 'A', 2, 467, '{}');
INSERT INTO app.materials VALUES ('B02A0001-A075-310', '{"en": "K20CF Black skin φ7.5x310", "ja": "K20CF 黒皮 φ7.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.949403+00', '2026-08-24 09:19:51.949403+00', '075', 7.500, 'A0', 310.000, '310', NULL, NULL, 'A', 2, 468, '{}');
INSERT INTO app.materials VALUES ('B02A0001-A070-310', '{"en": "K20CF Black skin φ7.0x310", "ja": "K20CF 黒皮 φ7.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.94967+00', '2026-08-24 09:19:51.94967+00', '070', 7.000, 'A0', 310.000, '310', NULL, NULL, 'A', 2, 469, '{}');
INSERT INTO app.materials VALUES ('B02A0001-A065-310', '{"en": "K20CF Black skin φ6.5x310", "ja": "K20CF 黒皮 φ6.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.949935+00', '2026-08-24 09:19:51.949935+00', '065', 6.500, 'A0', 310.000, '310', NULL, NULL, 'A', 2, 470, '{}');
INSERT INTO app.materials VALUES ('B02A0001-A060-310', '{"en": "K20CF Black skin φ6.0x310", "ja": "K20CF 黒皮 φ6.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.950201+00', '2026-08-24 09:19:51.950201+00', '060', 6.000, 'A0', 310.000, '310', NULL, NULL, 'A', 2, 471, '{}');
INSERT INTO app.materials VALUES ('B02A0001-A055-310', '{"en": "K20CF Black skin φ5.5x310", "ja": "K20CF 黒皮 φ5.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.950472+00', '2026-08-24 09:19:51.950472+00', '055', 5.500, 'A0', 310.000, '310', NULL, NULL, 'A', 2, 472, '{}');
INSERT INTO app.materials VALUES ('B02A0001-A050-310', '{"en": "K20CF Black skin φ5.0x310", "ja": "K20CF 黒皮 φ5.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.950742+00', '2026-08-24 09:19:51.950742+00', '050', 5.000, 'A0', 310.000, '310', NULL, NULL, 'A', 2, 473, '{}');
INSERT INTO app.materials VALUES ('B02A0001-A045-310', '{"en": "K20CF Black skin φ4.5x310", "ja": "K20CF 黒皮 φ4.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.951029+00', '2026-08-24 09:19:51.951029+00', '045', 4.500, 'A0', 310.000, '310', NULL, NULL, 'A', 2, 474, '{}');
INSERT INTO app.materials VALUES ('B02A0001-A040-310', '{"en": "K20CF Black skin φ4.0x310", "ja": "K20CF 黒皮 φ4.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.95131+00', '2026-08-24 09:19:51.95131+00', '040', 4.000, 'A0', 310.000, '310', NULL, NULL, 'A', 2, 475, '{}');
INSERT INTO app.materials VALUES ('B02A0001-A035-310', '{"en": "K20CF Black skin φ3.5x310", "ja": "K20CF 黒皮 φ3.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.951585+00', '2026-08-24 09:19:51.951585+00', '035', 3.500, 'A0', 310.000, '310', NULL, NULL, 'A', 2, 476, '{}');
INSERT INTO app.materials VALUES ('B02A0001-A030-310', '{"en": "K20CF Black skin φ3.0x310", "ja": "K20CF 黒皮 φ3.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.951855+00', '2026-08-24 09:19:51.951855+00', '030', 3.000, 'A0', 310.000, '310', NULL, NULL, 'A', 2, 477, '{}');
INSERT INTO app.materials VALUES ('B02A0001-A025-310', '{"en": "K20CF Black skin φ2.5x310", "ja": "K20CF 黒皮 φ2.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.952152+00', '2026-08-24 09:19:51.952152+00', '025', 2.500, 'A0', 310.000, '310', NULL, NULL, 'A', 2, 478, '{}');
INSERT INTO app.materials VALUES ('B02A0001-A020-310', '{"en": "K20CF Black skin φ2.0x310", "ja": "K20CF 黒皮 φ2.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.952407+00', '2026-08-24 09:19:51.952407+00', '020', 2.000, 'A0', 310.000, '310', NULL, NULL, 'A', 2, 479, '{}');
INSERT INTO app.materials VALUES ('B02A0001-A015-310', '{"en": "K20CF Black skin φ1.5x310", "ja": "K20CF 黒皮 φ1.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.952763+00', '2026-08-24 09:19:51.952763+00', '015', 1.500, 'A0', 310.000, '310', NULL, NULL, 'A', 2, 480, '{}');
INSERT INTO app.materials VALUES ('B02A0001-A010-310', '{"en": "K20CF Black skin φ1.0x310", "ja": "K20CF 黒皮 φ1.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.95307+00', '2026-08-24 09:19:51.95307+00', '010', 1.000, 'A0', 310.000, '310', NULL, NULL, 'A', 2, 481, '{}');
INSERT INTO app.materials VALUES ('B01A0001-A350-310', '{"en": "K10UF Black skin φ35.0x310", "ja": "K10UF 黒皮 φ35.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.953345+00', '2026-08-24 09:19:51.953345+00', '350', 35.000, 'A0', 310.000, '310', NULL, NULL, 'A', 1, 482, '{}');
INSERT INTO app.materials VALUES ('B01A0001-A340-310', '{"en": "K10UF Black skin φ34.0x310", "ja": "K10UF 黒皮 φ34.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.953638+00', '2026-08-24 09:19:51.953638+00', '340', 34.000, 'A0', 310.000, '310', NULL, NULL, 'A', 1, 483, '{}');
INSERT INTO app.materials VALUES ('B01A0001-A330-310', '{"en": "K10UF Black skin φ33.0x310", "ja": "K10UF 黒皮 φ33.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.953922+00', '2026-08-24 09:19:51.953922+00', '330', 33.000, 'A0', 310.000, '310', NULL, NULL, 'A', 1, 484, '{}');
INSERT INTO app.materials VALUES ('B01A0001-A320-310', '{"en": "K10UF Black skin φ32.0x310", "ja": "K10UF 黒皮 φ32.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.954261+00', '2026-08-24 09:19:51.954261+00', '320', 32.000, 'A0', 310.000, '310', NULL, NULL, 'A', 1, 485, '{}');
INSERT INTO app.materials VALUES ('B01A0001-A310-310', '{"en": "K10UF Black skin φ31.0x310", "ja": "K10UF 黒皮 φ31.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.954553+00', '2026-08-24 09:19:51.954553+00', '310', 31.000, 'A0', 310.000, '310', NULL, NULL, 'A', 1, 486, '{}');
INSERT INTO app.materials VALUES ('B01A0001-A300-310', '{"en": "K10UF Black skin φ30.0x310", "ja": "K10UF 黒皮 φ30.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.954855+00', '2026-08-24 09:19:51.954855+00', '300', 30.000, 'A0', 310.000, '310', NULL, NULL, 'A', 1, 487, '{}');
INSERT INTO app.materials VALUES ('B01A0001-A290-310', '{"en": "K10UF Black skin φ29.0x310", "ja": "K10UF 黒皮 φ29.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.955223+00', '2026-08-24 09:19:51.955223+00', '290', 29.000, 'A0', 310.000, '310', NULL, NULL, 'A', 1, 488, '{}');
INSERT INTO app.materials VALUES ('B01A0001-A280-310', '{"en": "K10UF Black skin φ28.0x310", "ja": "K10UF 黒皮 φ28.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.955521+00', '2026-08-24 09:19:51.955521+00', '280', 28.000, 'A0', 310.000, '310', NULL, NULL, 'A', 1, 489, '{}');
INSERT INTO app.materials VALUES ('B01A0001-A270-310', '{"en": "K10UF Black skin φ27.0x310", "ja": "K10UF 黒皮 φ27.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.955869+00', '2026-08-24 09:19:51.955869+00', '270', 27.000, 'A0', 310.000, '310', NULL, NULL, 'A', 1, 490, '{}');
INSERT INTO app.materials VALUES ('B01A0001-A260-310', '{"en": "K10UF Black skin φ26.0x310", "ja": "K10UF 黒皮 φ26.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.956177+00', '2026-08-24 09:19:51.956177+00', '260', 26.000, 'A0', 310.000, '310', NULL, NULL, 'A', 1, 491, '{}');
INSERT INTO app.materials VALUES ('B01A0001-A255-310', '{"en": "K10UF Black skin φ25.5x310", "ja": "K10UF 黒皮 φ25.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.956532+00', '2026-08-24 09:19:51.956532+00', '255', 25.500, 'A0', 310.000, '310', NULL, NULL, 'A', 1, 492, '{}');
INSERT INTO app.materials VALUES ('B01A0001-A250-310', '{"en": "K10UF Black skin φ25.0x310", "ja": "K10UF 黒皮 φ25.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.956917+00', '2026-08-24 09:19:51.956917+00', '250', 25.000, 'A0', 310.000, '310', NULL, NULL, 'A', 1, 493, '{}');
INSERT INTO app.materials VALUES ('B01A0001-A240-310', '{"en": "K10UF Black skin φ24.0x310", "ja": "K10UF 黒皮 φ24.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.95725+00', '2026-08-24 09:19:51.95725+00', '240', 24.000, 'A0', 310.000, '310', NULL, NULL, 'A', 1, 494, '{}');
INSERT INTO app.materials VALUES ('B01A0001-A235-310', '{"en": "K10UF Black skin φ23.5x310", "ja": "K10UF 黒皮 φ23.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.957527+00', '2026-08-24 09:19:51.957527+00', '235', 23.500, 'A0', 310.000, '310', NULL, NULL, 'A', 1, 495, '{}');
INSERT INTO app.materials VALUES ('B01A0001-A230-310', '{"en": "K10UF Black skin φ23.0x310", "ja": "K10UF 黒皮 φ23.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.957888+00', '2026-08-24 09:19:51.957888+00', '230', 23.000, 'A0', 310.000, '310', NULL, NULL, 'A', 1, 496, '{}');
INSERT INTO app.materials VALUES ('B01A0001-A225-310', '{"en": "K10UF Black skin φ22.5x310", "ja": "K10UF 黒皮 φ22.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.958156+00', '2026-08-24 09:19:51.958156+00', '225', 22.500, 'A0', 310.000, '310', NULL, NULL, 'A', 1, 497, '{}');
INSERT INTO app.materials VALUES ('B01A0001-A220-310', '{"en": "K10UF Black skin φ22.0x310", "ja": "K10UF 黒皮 φ22.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.95842+00', '2026-08-24 09:19:51.95842+00', '220', 22.000, 'A0', 310.000, '310', NULL, NULL, 'A', 1, 498, '{}');
INSERT INTO app.materials VALUES ('B01A0001-A215-310', '{"en": "K10UF Black skin φ21.5x310", "ja": "K10UF 黒皮 φ21.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.958676+00', '2026-08-24 09:19:51.958676+00', '215', 21.500, 'A0', 310.000, '310', NULL, NULL, 'A', 1, 499, '{}');
INSERT INTO app.materials VALUES ('B01A0001-A210-310', '{"en": "K10UF Black skin φ21.0x310", "ja": "K10UF 黒皮 φ21.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.958931+00', '2026-08-24 09:19:51.958931+00', '210', 21.000, 'A0', 310.000, '310', NULL, NULL, 'A', 1, 500, '{}');
INSERT INTO app.materials VALUES ('B01A0001-A205-310', '{"en": "K10UF Black skin φ20.5x310", "ja": "K10UF 黒皮 φ20.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.959188+00', '2026-08-24 09:19:51.959188+00', '205', 20.500, 'A0', 310.000, '310', NULL, NULL, 'A', 1, 501, '{}');
INSERT INTO app.materials VALUES ('B01A0001-A200-310', '{"en": "K10UF Black skin φ20.0x310", "ja": "K10UF 黒皮 φ20.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.959487+00', '2026-08-24 09:19:51.959487+00', '200', 20.000, 'A0', 310.000, '310', NULL, NULL, 'A', 1, 502, '{}');
INSERT INTO app.materials VALUES ('B01A0001-A195-310', '{"en": "K10UF Black skin φ19.5x310", "ja": "K10UF 黒皮 φ19.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.959757+00', '2026-08-24 09:19:51.959757+00', '195', 19.500, 'A0', 310.000, '310', NULL, NULL, 'A', 1, 503, '{}');
INSERT INTO app.materials VALUES ('B01A0001-A190-310', '{"en": "K10UF Black skin φ19.0x310", "ja": "K10UF 黒皮 φ19.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.960034+00', '2026-08-24 09:19:51.960034+00', '190', 19.000, 'A0', 310.000, '310', NULL, NULL, 'A', 1, 504, '{}');
INSERT INTO app.materials VALUES ('B01A0001-A185-310', '{"en": "K10UF Black skin φ18.5x310", "ja": "K10UF 黒皮 φ18.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.960259+00', '2026-08-24 09:19:51.960259+00', '185', 18.500, 'A0', 310.000, '310', NULL, NULL, 'A', 1, 505, '{}');
INSERT INTO app.materials VALUES ('B01A0001-A180-310', '{"en": "K10UF Black skin φ18.0x310", "ja": "K10UF 黒皮 φ18.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.960508+00', '2026-08-24 09:19:51.960508+00', '180', 18.000, 'A0', 310.000, '310', NULL, NULL, 'A', 1, 506, '{}');
INSERT INTO app.materials VALUES ('B01A0001-A175-310', '{"en": "K10UF Black skin φ17.5x310", "ja": "K10UF 黒皮 φ17.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.960747+00', '2026-08-24 09:19:51.960747+00', '175', 17.500, 'A0', 310.000, '310', NULL, NULL, 'A', 1, 507, '{}');
INSERT INTO app.materials VALUES ('B01A0001-A170-310', '{"en": "K10UF Black skin φ17.0x310", "ja": "K10UF 黒皮 φ17.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.961019+00', '2026-08-24 09:19:51.961019+00', '170', 17.000, 'A0', 310.000, '310', NULL, NULL, 'A', 1, 508, '{}');
INSERT INTO app.materials VALUES ('B01A0001-A165-310', '{"en": "K10UF Black skin φ16.5x310", "ja": "K10UF 黒皮 φ16.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.961246+00', '2026-08-24 09:19:51.961246+00', '165', 16.500, 'A0', 310.000, '310', NULL, NULL, 'A', 1, 509, '{}');
INSERT INTO app.materials VALUES ('B01A0001-A160-310', '{"en": "K10UF Black skin φ16.0x310", "ja": "K10UF 黒皮 φ16.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.961491+00', '2026-08-24 09:19:51.961491+00', '160', 16.000, 'A0', 310.000, '310', NULL, NULL, 'A', 1, 510, '{}');
INSERT INTO app.materials VALUES ('B01A0001-A155-310', '{"en": "K10UF Black skin φ15.5x310", "ja": "K10UF 黒皮 φ15.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.961762+00', '2026-08-24 09:19:51.961762+00', '155', 15.500, 'A0', 310.000, '310', NULL, NULL, 'A', 1, 511, '{}');
INSERT INTO app.materials VALUES ('B01A0001-A150-310', '{"en": "K10UF Black skin φ15.0x310", "ja": "K10UF 黒皮 φ15.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.962047+00', '2026-08-24 09:19:51.962047+00', '150', 15.000, 'A0', 310.000, '310', NULL, NULL, 'A', 1, 512, '{}');
INSERT INTO app.materials VALUES ('B01A0001-A145-310', '{"en": "K10UF Black skin φ14.5x310", "ja": "K10UF 黒皮 φ14.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.962332+00', '2026-08-24 09:19:51.962332+00', '145', 14.500, 'A0', 310.000, '310', NULL, NULL, 'A', 1, 513, '{}');
INSERT INTO app.materials VALUES ('B01A0001-A140-310', '{"en": "K10UF Black skin φ14.0x310", "ja": "K10UF 黒皮 φ14.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.962569+00', '2026-08-24 09:19:51.962569+00', '140', 14.000, 'A0', 310.000, '310', NULL, NULL, 'A', 1, 514, '{}');
INSERT INTO app.materials VALUES ('B01A0001-A135-310', '{"en": "K10UF Black skin φ13.5x310", "ja": "K10UF 黒皮 φ13.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.962811+00', '2026-08-24 09:19:51.962811+00', '135', 13.500, 'A0', 310.000, '310', NULL, NULL, 'A', 1, 515, '{}');
INSERT INTO app.materials VALUES ('B01A0001-A130-310', '{"en": "K10UF Black skin φ13.0x310", "ja": "K10UF 黒皮 φ13.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.963077+00', '2026-08-24 09:19:51.963077+00', '130', 13.000, 'A0', 310.000, '310', NULL, NULL, 'A', 1, 516, '{}');
INSERT INTO app.materials VALUES ('B01A0001-A125-310', '{"en": "K10UF Black skin φ12.5x310", "ja": "K10UF 黒皮 φ12.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.963305+00', '2026-08-24 09:19:51.963305+00', '125', 12.500, 'A0', 310.000, '310', NULL, NULL, 'A', 1, 517, '{}');
INSERT INTO app.materials VALUES ('B01A0001-A120-310', '{"en": "K10UF Black skin φ12.0x310", "ja": "K10UF 黒皮 φ12.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.963566+00', '2026-08-24 09:19:51.963566+00', '120', 12.000, 'A0', 310.000, '310', NULL, NULL, 'A', 1, 518, '{}');
INSERT INTO app.materials VALUES ('B01A0001-A115-310', '{"en": "K10UF Black skin φ11.5x310", "ja": "K10UF 黒皮 φ11.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.963857+00', '2026-08-24 09:19:51.963857+00', '115', 11.500, 'A0', 310.000, '310', NULL, NULL, 'A', 1, 519, '{}');
INSERT INTO app.materials VALUES ('B01A0001-A110-310', '{"en": "K10UF Black skin φ11.0x310", "ja": "K10UF 黒皮 φ11.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.964121+00', '2026-08-24 09:19:51.964121+00', '110', 11.000, 'A0', 310.000, '310', NULL, NULL, 'A', 1, 520, '{}');
INSERT INTO app.materials VALUES ('B01A0001-A105-310', '{"en": "K10UF Black skin φ10.5x310", "ja": "K10UF 黒皮 φ10.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.96436+00', '2026-08-24 09:19:51.96436+00', '105', 10.500, 'A0', 310.000, '310', NULL, NULL, 'A', 1, 521, '{}');
INSERT INTO app.materials VALUES ('B01A0001-A100-310', '{"en": "K10UF Black skin φ10.0x310", "ja": "K10UF 黒皮 φ10.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.964627+00', '2026-08-24 09:19:51.964627+00', '100', 10.000, 'A0', 310.000, '310', NULL, NULL, 'A', 1, 522, '{}');
INSERT INTO app.materials VALUES ('B01A0001-A095-310', '{"en": "K10UF Black skin φ9.5x310", "ja": "K10UF 黒皮 φ9.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.964887+00', '2026-08-24 09:19:51.964887+00', '095', 9.500, 'A0', 310.000, '310', NULL, NULL, 'A', 1, 523, '{}');
INSERT INTO app.materials VALUES ('B01A0001-A090-310', '{"en": "K10UF Black skin φ9.0x310", "ja": "K10UF 黒皮 φ9.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.965168+00', '2026-08-24 09:19:51.965168+00', '090', 9.000, 'A0', 310.000, '310', NULL, NULL, 'A', 1, 524, '{}');
INSERT INTO app.materials VALUES ('B01A0001-A085-310', '{"en": "K10UF Black skin φ8.5x310", "ja": "K10UF 黒皮 φ8.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.965435+00', '2026-08-24 09:19:51.965435+00', '085', 8.500, 'A0', 310.000, '310', NULL, NULL, 'A', 1, 525, '{}');
INSERT INTO app.materials VALUES ('B01A0001-A080-310', '{"en": "K10UF Black skin φ8.0x310", "ja": "K10UF 黒皮 φ8.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.965679+00', '2026-08-24 09:19:51.965679+00', '080', 8.000, 'A0', 310.000, '310', NULL, NULL, 'A', 1, 526, '{}');
INSERT INTO app.materials VALUES ('B01A0001-A075-310', '{"en": "K10UF Black skin φ7.5x310", "ja": "K10UF 黒皮 φ7.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.965923+00', '2026-08-24 09:19:51.965923+00', '075', 7.500, 'A0', 310.000, '310', NULL, NULL, 'A', 1, 527, '{}');
INSERT INTO app.materials VALUES ('B01A0001-A070-310', '{"en": "K10UF Black skin φ7.0x310", "ja": "K10UF 黒皮 φ7.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.966198+00', '2026-08-24 09:19:51.966198+00', '070', 7.000, 'A0', 310.000, '310', NULL, NULL, 'A', 1, 528, '{}');
INSERT INTO app.materials VALUES ('B01A0001-A065-310', '{"en": "K10UF Black skin φ6.5x310", "ja": "K10UF 黒皮 φ6.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.966438+00', '2026-08-24 09:19:51.966438+00', '065', 6.500, 'A0', 310.000, '310', NULL, NULL, 'A', 1, 529, '{}');
INSERT INTO app.materials VALUES ('B01A0001-A060-310', '{"en": "K10UF Black skin φ6.0x310", "ja": "K10UF 黒皮 φ6.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.966686+00', '2026-08-24 09:19:51.966686+00', '060', 6.000, 'A0', 310.000, '310', NULL, NULL, 'A', 1, 530, '{}');
INSERT INTO app.materials VALUES ('B01A0001-A055-310', '{"en": "K10UF Black skin φ5.5x310", "ja": "K10UF 黒皮 φ5.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.966937+00', '2026-08-24 09:19:51.966937+00', '055', 5.500, 'A0', 310.000, '310', NULL, NULL, 'A', 1, 531, '{}');
INSERT INTO app.materials VALUES ('B01A0001-A050-310', '{"en": "K10UF Black skin φ5.0x310", "ja": "K10UF 黒皮 φ5.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.967176+00', '2026-08-24 09:19:51.967176+00', '050', 5.000, 'A0', 310.000, '310', NULL, NULL, 'A', 1, 532, '{}');
INSERT INTO app.materials VALUES ('B01A0001-A045-310', '{"en": "K10UF Black skin φ4.5x310", "ja": "K10UF 黒皮 φ4.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.967438+00', '2026-08-24 09:19:51.967438+00', '045', 4.500, 'A0', 310.000, '310', NULL, NULL, 'A', 1, 533, '{}');
INSERT INTO app.materials VALUES ('B01A0001-A040-310', '{"en": "K10UF Black skin φ4.0x310", "ja": "K10UF 黒皮 φ4.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.967689+00', '2026-08-24 09:19:51.967689+00', '040', 4.000, 'A0', 310.000, '310', NULL, NULL, 'A', 1, 534, '{}');
INSERT INTO app.materials VALUES ('B01A0001-A035-310', '{"en": "K10UF Black skin φ3.5x310", "ja": "K10UF 黒皮 φ3.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.967912+00', '2026-08-24 09:19:51.967912+00', '035', 3.500, 'A0', 310.000, '310', NULL, NULL, 'A', 1, 535, '{}');
INSERT INTO app.materials VALUES ('B01A0001-A030-310', '{"en": "K10UF Black skin φ3.0x310", "ja": "K10UF 黒皮 φ3.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.968193+00', '2026-08-24 09:19:51.968193+00', '030', 3.000, 'A0', 310.000, '310', NULL, NULL, 'A', 1, 536, '{}');
INSERT INTO app.materials VALUES ('B01A0001-A025-310', '{"en": "K10UF Black skin φ2.5x310", "ja": "K10UF 黒皮 φ2.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.968434+00', '2026-08-24 09:19:51.968434+00', '025', 2.500, 'A0', 310.000, '310', NULL, NULL, 'A', 1, 537, '{}');
INSERT INTO app.materials VALUES ('B01A0001-A020-310', '{"en": "K10UF Black skin φ2.0x310", "ja": "K10UF 黒皮 φ2.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.968684+00', '2026-08-24 09:19:51.968684+00', '020', 2.000, 'A0', 310.000, '310', NULL, NULL, 'A', 1, 538, '{}');
INSERT INTO app.materials VALUES ('B01A0001-A015-310', '{"en": "K10UF Black skin φ1.5x310", "ja": "K10UF 黒皮 φ1.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.968939+00', '2026-08-24 09:19:51.968939+00', '015', 1.500, 'A0', 310.000, '310', NULL, NULL, 'A', 1, 539, '{}');
INSERT INTO app.materials VALUES ('B01A0001-A010-310', '{"en": "K10UF Black skin φ1.0x310", "ja": "K10UF 黒皮 φ1.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.969176+00', '2026-08-24 09:19:51.969176+00', '010', 1.000, 'A0', 310.000, '310', NULL, NULL, 'A', 1, 540, '{}');
INSERT INTO app.materials VALUES ('B05A0001-A350-310', '{"en": "K44EF Black skin φ35.0x310", "ja": "K44EF 黒皮 φ35.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.969405+00', '2026-08-24 09:19:51.969405+00', '350', 35.000, 'A0', 310.000, '310', NULL, NULL, 'A', 5, 541, '{}');
INSERT INTO app.materials VALUES ('B05A0001-A340-310', '{"en": "K44EF Black skin φ34.0x310", "ja": "K44EF 黒皮 φ34.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.969623+00', '2026-08-24 09:19:51.969623+00', '340', 34.000, 'A0', 310.000, '310', NULL, NULL, 'A', 5, 542, '{}');
INSERT INTO app.materials VALUES ('B05A0001-A330-310', '{"en": "K44EF Black skin φ33.0x310", "ja": "K44EF 黒皮 φ33.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.96989+00', '2026-08-24 09:19:51.96989+00', '330', 33.000, 'A0', 310.000, '310', NULL, NULL, 'A', 5, 543, '{}');
INSERT INTO app.materials VALUES ('B05A0001-A320-310', '{"en": "K44EF Black skin φ32.0x310", "ja": "K44EF 黒皮 φ32.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.970199+00', '2026-08-24 09:19:51.970199+00', '320', 32.000, 'A0', 310.000, '310', NULL, NULL, 'A', 5, 544, '{}');
INSERT INTO app.materials VALUES ('B05A0001-A310-310', '{"en": "K44EF Black skin φ31.0x310", "ja": "K44EF 黒皮 φ31.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.970447+00', '2026-08-24 09:19:51.970447+00', '310', 31.000, 'A0', 310.000, '310', NULL, NULL, 'A', 5, 545, '{}');
INSERT INTO app.materials VALUES ('B05A0001-A300-310', '{"en": "K44EF Black skin φ30.0x310", "ja": "K44EF 黒皮 φ30.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.970683+00', '2026-08-24 09:19:51.970683+00', '300', 30.000, 'A0', 310.000, '310', NULL, NULL, 'A', 5, 546, '{}');
INSERT INTO app.materials VALUES ('B05A0001-A290-310', '{"en": "K44EF Black skin φ29.0x310", "ja": "K44EF 黒皮 φ29.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.970912+00', '2026-08-24 09:19:51.970912+00', '290', 29.000, 'A0', 310.000, '310', NULL, NULL, 'A', 5, 547, '{}');
INSERT INTO app.materials VALUES ('B05A0001-A280-310', '{"en": "K44EF Black skin φ28.0x310", "ja": "K44EF 黒皮 φ28.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.971127+00', '2026-08-24 09:19:51.971127+00', '280', 28.000, 'A0', 310.000, '310', NULL, NULL, 'A', 5, 548, '{}');
INSERT INTO app.materials VALUES ('B05A0001-A270-310', '{"en": "K44EF Black skin φ27.0x310", "ja": "K44EF 黒皮 φ27.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.97135+00', '2026-08-24 09:19:51.97135+00', '270', 27.000, 'A0', 310.000, '310', NULL, NULL, 'A', 5, 549, '{}');
INSERT INTO app.materials VALUES ('B05A0001-A260-310', '{"en": "K44EF Black skin φ26.0x310", "ja": "K44EF 黒皮 φ26.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.971607+00', '2026-08-24 09:19:51.971607+00', '260', 26.000, 'A0', 310.000, '310', NULL, NULL, 'A', 5, 550, '{}');
INSERT INTO app.materials VALUES ('B05A0001-A255-310', '{"en": "K44EF Black skin φ25.5x310", "ja": "K44EF 黒皮 φ25.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.971864+00', '2026-08-24 09:19:51.971864+00', '255', 25.500, 'A0', 310.000, '310', NULL, NULL, 'A', 5, 551, '{}');
INSERT INTO app.materials VALUES ('B05A0001-A250-310', '{"en": "K44EF Black skin φ25.0x310", "ja": "K44EF 黒皮 φ25.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.972111+00', '2026-08-24 09:19:51.972111+00', '250', 25.000, 'A0', 310.000, '310', NULL, NULL, 'A', 5, 552, '{}');
INSERT INTO app.materials VALUES ('B05A0001-A240-310', '{"en": "K44EF Black skin φ24.0x310", "ja": "K44EF 黒皮 φ24.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.972343+00', '2026-08-24 09:19:51.972343+00', '240', 24.000, 'A0', 310.000, '310', NULL, NULL, 'A', 5, 553, '{}');
INSERT INTO app.materials VALUES ('B05A0001-A235-310', '{"en": "K44EF Black skin φ23.5x310", "ja": "K44EF 黒皮 φ23.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.972578+00', '2026-08-24 09:19:51.972578+00', '235', 23.500, 'A0', 310.000, '310', NULL, NULL, 'A', 5, 554, '{}');
INSERT INTO app.materials VALUES ('B05A0001-A230-310', '{"en": "K44EF Black skin φ23.0x310", "ja": "K44EF 黒皮 φ23.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.972813+00', '2026-08-24 09:19:51.972813+00', '230', 23.000, 'A0', 310.000, '310', NULL, NULL, 'A', 5, 555, '{}');
INSERT INTO app.materials VALUES ('B05A0001-A225-310', '{"en": "K44EF Black skin φ22.5x310", "ja": "K44EF 黒皮 φ22.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.973087+00', '2026-08-24 09:19:51.973087+00', '225', 22.500, 'A0', 310.000, '310', NULL, NULL, 'A', 5, 556, '{}');
INSERT INTO app.materials VALUES ('B05A0001-A220-310', '{"en": "K44EF Black skin φ22.0x310", "ja": "K44EF 黒皮 φ22.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.97332+00', '2026-08-24 09:19:51.97332+00', '220', 22.000, 'A0', 310.000, '310', NULL, NULL, 'A', 5, 557, '{}');
INSERT INTO app.materials VALUES ('B05A0001-A215-310', '{"en": "K44EF Black skin φ21.5x310", "ja": "K44EF 黒皮 φ21.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.973545+00', '2026-08-24 09:19:51.973545+00', '215', 21.500, 'A0', 310.000, '310', NULL, NULL, 'A', 5, 558, '{}');
INSERT INTO app.materials VALUES ('B05A0001-A210-310', '{"en": "K44EF Black skin φ21.0x310", "ja": "K44EF 黒皮 φ21.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.973796+00', '2026-08-24 09:19:51.973796+00', '210', 21.000, 'A0', 310.000, '310', NULL, NULL, 'A', 5, 559, '{}');
INSERT INTO app.materials VALUES ('B05A0001-A205-310', '{"en": "K44EF Black skin φ20.5x310", "ja": "K44EF 黒皮 φ20.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.974064+00', '2026-08-24 09:19:51.974064+00', '205', 20.500, 'A0', 310.000, '310', NULL, NULL, 'A', 5, 560, '{}');
INSERT INTO app.materials VALUES ('B05A0001-A200-310', '{"en": "K44EF Black skin φ20.0x310", "ja": "K44EF 黒皮 φ20.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.97434+00', '2026-08-24 09:19:51.97434+00', '200', 20.000, 'A0', 310.000, '310', NULL, NULL, 'A', 5, 561, '{}');
INSERT INTO app.materials VALUES ('B05A0001-A195-310', '{"en": "K44EF Black skin φ19.5x310", "ja": "K44EF 黒皮 φ19.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.97463+00', '2026-08-24 09:19:51.97463+00', '195', 19.500, 'A0', 310.000, '310', NULL, NULL, 'A', 5, 562, '{}');
INSERT INTO app.materials VALUES ('B05A0001-A190-310', '{"en": "K44EF Black skin φ19.0x310", "ja": "K44EF 黒皮 φ19.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.974881+00', '2026-08-24 09:19:51.974881+00', '190', 19.000, 'A0', 310.000, '310', NULL, NULL, 'A', 5, 563, '{}');
INSERT INTO app.materials VALUES ('B05A0001-A185-310', '{"en": "K44EF Black skin φ18.5x310", "ja": "K44EF 黒皮 φ18.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.97512+00', '2026-08-24 09:19:51.97512+00', '185', 18.500, 'A0', 310.000, '310', NULL, NULL, 'A', 5, 564, '{}');
INSERT INTO app.materials VALUES ('B05A0001-A180-310', '{"en": "K44EF Black skin φ18.0x310", "ja": "K44EF 黒皮 φ18.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.975398+00', '2026-08-24 09:19:51.975398+00', '180', 18.000, 'A0', 310.000, '310', NULL, NULL, 'A', 5, 565, '{}');
INSERT INTO app.materials VALUES ('B05A0001-A175-310', '{"en": "K44EF Black skin φ17.5x310", "ja": "K44EF 黒皮 φ17.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.975632+00', '2026-08-24 09:19:51.975632+00', '175', 17.500, 'A0', 310.000, '310', NULL, NULL, 'A', 5, 566, '{}');
INSERT INTO app.materials VALUES ('B05A0001-A170-310', '{"en": "K44EF Black skin φ17.0x310", "ja": "K44EF 黒皮 φ17.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.975868+00', '2026-08-24 09:19:51.975868+00', '170', 17.000, 'A0', 310.000, '310', NULL, NULL, 'A', 5, 567, '{}');
INSERT INTO app.materials VALUES ('B05A0001-A165-310', '{"en": "K44EF Black skin φ16.5x310", "ja": "K44EF 黒皮 φ16.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.976097+00', '2026-08-24 09:19:51.976097+00', '165', 16.500, 'A0', 310.000, '310', NULL, NULL, 'A', 5, 568, '{}');
INSERT INTO app.materials VALUES ('B05A0001-A160-310', '{"en": "K44EF Black skin φ16.0x310", "ja": "K44EF 黒皮 φ16.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.976376+00', '2026-08-24 09:19:51.976376+00', '160', 16.000, 'A0', 310.000, '310', NULL, NULL, 'A', 5, 569, '{}');
INSERT INTO app.materials VALUES ('B05A0001-A155-310', '{"en": "K44EF Black skin φ15.5x310", "ja": "K44EF 黒皮 φ15.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.976684+00', '2026-08-24 09:19:51.976684+00', '155', 15.500, 'A0', 310.000, '310', NULL, NULL, 'A', 5, 570, '{}');
INSERT INTO app.materials VALUES ('B05A0001-A150-310', '{"en": "K44EF Black skin φ15.0x310", "ja": "K44EF 黒皮 φ15.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.976997+00', '2026-08-24 09:19:51.976997+00', '150', 15.000, 'A0', 310.000, '310', NULL, NULL, 'A', 5, 571, '{}');
INSERT INTO app.materials VALUES ('B05A0001-A145-310', '{"en": "K44EF Black skin φ14.5x310", "ja": "K44EF 黒皮 φ14.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.977242+00', '2026-08-24 09:19:51.977242+00', '145', 14.500, 'A0', 310.000, '310', NULL, NULL, 'A', 5, 572, '{}');
INSERT INTO app.materials VALUES ('B05A0001-A140-310', '{"en": "K44EF Black skin φ14.0x310", "ja": "K44EF 黒皮 φ14.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.977498+00', '2026-08-24 09:19:51.977498+00', '140', 14.000, 'A0', 310.000, '310', NULL, NULL, 'A', 5, 573, '{}');
INSERT INTO app.materials VALUES ('B05A0001-A135-310', '{"en": "K44EF Black skin φ13.5x310", "ja": "K44EF 黒皮 φ13.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.977728+00', '2026-08-24 09:19:51.977728+00', '135', 13.500, 'A0', 310.000, '310', NULL, NULL, 'A', 5, 574, '{}');
INSERT INTO app.materials VALUES ('B05A0001-A130-310', '{"en": "K44EF Black skin φ13.0x310", "ja": "K44EF 黒皮 φ13.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.978002+00', '2026-08-24 09:19:51.978002+00', '130', 13.000, 'A0', 310.000, '310', NULL, NULL, 'A', 5, 575, '{}');
INSERT INTO app.materials VALUES ('B05A0001-A125-310', '{"en": "K44EF Black skin φ12.5x310", "ja": "K44EF 黒皮 φ12.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.97825+00', '2026-08-24 09:19:51.97825+00', '125', 12.500, 'A0', 310.000, '310', NULL, NULL, 'A', 5, 576, '{}');
INSERT INTO app.materials VALUES ('B05A0001-A120-310', '{"en": "K44EF Black skin φ12.0x310", "ja": "K44EF 黒皮 φ12.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.978513+00', '2026-08-24 09:19:51.978513+00', '120', 12.000, 'A0', 310.000, '310', NULL, NULL, 'A', 5, 577, '{}');
INSERT INTO app.materials VALUES ('B05A0001-A115-310', '{"en": "K44EF Black skin φ11.5x310", "ja": "K44EF 黒皮 φ11.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.978724+00', '2026-08-24 09:19:51.978724+00', '115', 11.500, 'A0', 310.000, '310', NULL, NULL, 'A', 5, 578, '{}');
INSERT INTO app.materials VALUES ('B05A0001-A110-310', '{"en": "K44EF Black skin φ11.0x310", "ja": "K44EF 黒皮 φ11.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.978943+00', '2026-08-24 09:19:51.978943+00', '110', 11.000, 'A0', 310.000, '310', NULL, NULL, 'A', 5, 579, '{}');
INSERT INTO app.materials VALUES ('B05A0001-A105-310', '{"en": "K44EF Black skin φ10.5x310", "ja": "K44EF 黒皮 φ10.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.979181+00', '2026-08-24 09:19:51.979181+00', '105', 10.500, 'A0', 310.000, '310', NULL, NULL, 'A', 5, 580, '{}');
INSERT INTO app.materials VALUES ('B05A0001-A100-310', '{"en": "K44EF Black skin φ10.0x310", "ja": "K44EF 黒皮 φ10.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.979444+00', '2026-08-24 09:19:51.979444+00', '100', 10.000, 'A0', 310.000, '310', NULL, NULL, 'A', 5, 581, '{}');
INSERT INTO app.materials VALUES ('B05A0001-A095-310', '{"en": "K44EF Black skin φ9.5x310", "ja": "K44EF 黒皮 φ9.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.979693+00', '2026-08-24 09:19:51.979693+00', '095', 9.500, 'A0', 310.000, '310', NULL, NULL, 'A', 5, 582, '{}');
INSERT INTO app.materials VALUES ('B05A0001-A090-310', '{"en": "K44EF Black skin φ9.0x310", "ja": "K44EF 黒皮 φ9.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.979997+00', '2026-08-24 09:19:51.979997+00', '090', 9.000, 'A0', 310.000, '310', NULL, NULL, 'A', 5, 583, '{}');
INSERT INTO app.materials VALUES ('B05A0001-A085-310', '{"en": "K44EF Black skin φ8.5x310", "ja": "K44EF 黒皮 φ8.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.980243+00', '2026-08-24 09:19:51.980243+00', '085', 8.500, 'A0', 310.000, '310', NULL, NULL, 'A', 5, 584, '{}');
INSERT INTO app.materials VALUES ('B05A0001-A080-310', '{"en": "K44EF Black skin φ8.0x310", "ja": "K44EF 黒皮 φ8.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.980518+00', '2026-08-24 09:19:51.980518+00', '080', 8.000, 'A0', 310.000, '310', NULL, NULL, 'A', 5, 585, '{}');
INSERT INTO app.materials VALUES ('B05A0001-A075-310', '{"en": "K44EF Black skin φ7.5x310", "ja": "K44EF 黒皮 φ7.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.980799+00', '2026-08-24 09:19:51.980799+00', '075', 7.500, 'A0', 310.000, '310', NULL, NULL, 'A', 5, 586, '{}');
INSERT INTO app.materials VALUES ('B05A0001-A070-310', '{"en": "K44EF Black skin φ7.0x310", "ja": "K44EF 黒皮 φ7.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.981078+00', '2026-08-24 09:19:51.981078+00', '070', 7.000, 'A0', 310.000, '310', NULL, NULL, 'A', 5, 587, '{}');
INSERT INTO app.materials VALUES ('B05A0001-A065-310', '{"en": "K44EF Black skin φ6.5x310", "ja": "K44EF 黒皮 φ6.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.981305+00', '2026-08-24 09:19:51.981305+00', '065', 6.500, 'A0', 310.000, '310', NULL, NULL, 'A', 5, 588, '{}');
INSERT INTO app.materials VALUES ('B05A0001-A060-310', '{"en": "K44EF Black skin φ6.0x310", "ja": "K44EF 黒皮 φ6.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.981539+00', '2026-08-24 09:19:51.981539+00', '060', 6.000, 'A0', 310.000, '310', NULL, NULL, 'A', 5, 589, '{}');
INSERT INTO app.materials VALUES ('B05A0001-A055-310', '{"en": "K44EF Black skin φ5.5x310", "ja": "K44EF 黒皮 φ5.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.981786+00', '2026-08-24 09:19:51.981786+00', '055', 5.500, 'A0', 310.000, '310', NULL, NULL, 'A', 5, 590, '{}');
INSERT INTO app.materials VALUES ('B05A0001-A050-310', '{"en": "K44EF Black skin φ5.0x310", "ja": "K44EF 黒皮 φ5.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.982048+00', '2026-08-24 09:19:51.982048+00', '050', 5.000, 'A0', 310.000, '310', NULL, NULL, 'A', 5, 591, '{}');
INSERT INTO app.materials VALUES ('B05A0001-A045-310', '{"en": "K44EF Black skin φ4.5x310", "ja": "K44EF 黒皮 φ4.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.982319+00', '2026-08-24 09:19:51.982319+00', '045', 4.500, 'A0', 310.000, '310', NULL, NULL, 'A', 5, 592, '{}');
INSERT INTO app.materials VALUES ('B05A0001-A040-310', '{"en": "K44EF Black skin φ4.0x310", "ja": "K44EF 黒皮 φ4.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.982559+00', '2026-08-24 09:19:51.982559+00', '040', 4.000, 'A0', 310.000, '310', NULL, NULL, 'A', 5, 593, '{}');
INSERT INTO app.materials VALUES ('B05A0001-A035-310', '{"en": "K44EF Black skin φ3.5x310", "ja": "K44EF 黒皮 φ3.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.982782+00', '2026-08-24 09:19:51.982782+00', '035', 3.500, 'A0', 310.000, '310', NULL, NULL, 'A', 5, 594, '{}');
INSERT INTO app.materials VALUES ('B05A0001-A030-310', '{"en": "K44EF Black skin φ3.0x310", "ja": "K44EF 黒皮 φ3.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.983033+00', '2026-08-24 09:19:51.983033+00', '030', 3.000, 'A0', 310.000, '310', NULL, NULL, 'A', 5, 595, '{}');
INSERT INTO app.materials VALUES ('B05A0001-A025-310', '{"en": "K44EF Black skin φ2.5x310", "ja": "K44EF 黒皮 φ2.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.983276+00', '2026-08-24 09:19:51.983276+00', '025', 2.500, 'A0', 310.000, '310', NULL, NULL, 'A', 5, 596, '{}');
INSERT INTO app.materials VALUES ('B05A0001-A020-310', '{"en": "K44EF Black skin φ2.0x310", "ja": "K44EF 黒皮 φ2.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.983549+00', '2026-08-24 09:19:51.983549+00', '020', 2.000, 'A0', 310.000, '310', NULL, NULL, 'A', 5, 597, '{}');
INSERT INTO app.materials VALUES ('B05A0001-A015-310', '{"en": "K44EF Black skin φ1.5x310", "ja": "K44EF 黒皮 φ1.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.983777+00', '2026-08-24 09:19:51.983777+00', '015', 1.500, 'A0', 310.000, '310', NULL, NULL, 'A', 5, 598, '{}');
INSERT INTO app.materials VALUES ('B05A0001-A010-310', '{"en": "K44EF Black skin φ1.0x310", "ja": "K44EF 黒皮 φ1.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.984041+00', '2026-08-24 09:19:51.984041+00', '010', 1.000, 'A0', 310.000, '310', NULL, NULL, 'A', 5, 599, '{}');
INSERT INTO app.materials VALUES ('B03A0001-A350-310', '{"en": "K34EF Black skin φ35.0x310", "ja": "K34EF 黒皮 φ35.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.984292+00', '2026-08-24 09:19:51.984292+00', '350', 35.000, 'A0', 310.000, '310', NULL, NULL, 'A', 3, 600, '{}');
INSERT INTO app.materials VALUES ('B03A0001-A340-310', '{"en": "K34EF Black skin φ34.0x310", "ja": "K34EF 黒皮 φ34.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.98452+00', '2026-08-24 09:19:51.98452+00', '340', 34.000, 'A0', 310.000, '310', NULL, NULL, 'A', 3, 601, '{}');
INSERT INTO app.materials VALUES ('B03A0001-A330-310', '{"en": "K34EF Black skin φ33.0x310", "ja": "K34EF 黒皮 φ33.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.984754+00', '2026-08-24 09:19:51.984754+00', '330', 33.000, 'A0', 310.000, '310', NULL, NULL, 'A', 3, 602, '{}');
INSERT INTO app.materials VALUES ('B03A0001-A320-310', '{"en": "K34EF Black skin φ32.0x310", "ja": "K34EF 黒皮 φ32.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.985004+00', '2026-08-24 09:19:51.985004+00', '320', 32.000, 'A0', 310.000, '310', NULL, NULL, 'A', 3, 603, '{}');
INSERT INTO app.materials VALUES ('B03A0001-A310-310', '{"en": "K34EF Black skin φ31.0x310", "ja": "K34EF 黒皮 φ31.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.985244+00', '2026-08-24 09:19:51.985244+00', '310', 31.000, 'A0', 310.000, '310', NULL, NULL, 'A', 3, 604, '{}');
INSERT INTO app.materials VALUES ('B03A0001-A300-310', '{"en": "K34EF Black skin φ30.0x310", "ja": "K34EF 黒皮 φ30.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.985486+00', '2026-08-24 09:19:51.985486+00', '300', 30.000, 'A0', 310.000, '310', NULL, NULL, 'A', 3, 605, '{}');
INSERT INTO app.materials VALUES ('B03A0001-A290-310', '{"en": "K34EF Black skin φ29.0x310", "ja": "K34EF 黒皮 φ29.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.985713+00', '2026-08-24 09:19:51.985713+00', '290', 29.000, 'A0', 310.000, '310', NULL, NULL, 'A', 3, 606, '{}');
INSERT INTO app.materials VALUES ('B03A0001-A280-310', '{"en": "K34EF Black skin φ28.0x310", "ja": "K34EF 黒皮 φ28.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.985983+00', '2026-08-24 09:19:51.985983+00', '280', 28.000, 'A0', 310.000, '310', NULL, NULL, 'A', 3, 607, '{}');
INSERT INTO app.materials VALUES ('B03A0001-A270-310', '{"en": "K34EF Black skin φ27.0x310", "ja": "K34EF 黒皮 φ27.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.986271+00', '2026-08-24 09:19:51.986271+00', '270', 27.000, 'A0', 310.000, '310', NULL, NULL, 'A', 3, 608, '{}');
INSERT INTO app.materials VALUES ('B03A0001-A260-310', '{"en": "K34EF Black skin φ26.0x310", "ja": "K34EF 黒皮 φ26.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.986532+00', '2026-08-24 09:19:51.986532+00', '260', 26.000, 'A0', 310.000, '310', NULL, NULL, 'A', 3, 609, '{}');
INSERT INTO app.materials VALUES ('B03A0001-A255-310', '{"en": "K34EF Black skin φ25.5x310", "ja": "K34EF 黒皮 φ25.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.986785+00', '2026-08-24 09:19:51.986785+00', '255', 25.500, 'A0', 310.000, '310', NULL, NULL, 'A', 3, 610, '{}');
INSERT INTO app.materials VALUES ('B03A0001-A250-310', '{"en": "K34EF Black skin φ25.0x310", "ja": "K34EF 黒皮 φ25.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.987028+00', '2026-08-24 09:19:51.987028+00', '250', 25.000, 'A0', 310.000, '310', NULL, NULL, 'A', 3, 611, '{}');
INSERT INTO app.materials VALUES ('B03A0001-A240-310', '{"en": "K34EF Black skin φ24.0x310", "ja": "K34EF 黒皮 φ24.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.987276+00', '2026-08-24 09:19:51.987276+00', '240', 24.000, 'A0', 310.000, '310', NULL, NULL, 'A', 3, 612, '{}');
INSERT INTO app.materials VALUES ('B03A0001-A235-310', '{"en": "K34EF Black skin φ23.5x310", "ja": "K34EF 黒皮 φ23.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.987537+00', '2026-08-24 09:19:51.987537+00', '235', 23.500, 'A0', 310.000, '310', NULL, NULL, 'A', 3, 613, '{}');
INSERT INTO app.materials VALUES ('B03A0001-A230-310', '{"en": "K34EF Black skin φ23.0x310", "ja": "K34EF 黒皮 φ23.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.987756+00', '2026-08-24 09:19:51.987756+00', '230', 23.000, 'A0', 310.000, '310', NULL, NULL, 'A', 3, 614, '{}');
INSERT INTO app.materials VALUES ('B03A0001-A225-310', '{"en": "K34EF Black skin φ22.5x310", "ja": "K34EF 黒皮 φ22.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.987999+00', '2026-08-24 09:19:51.987999+00', '225', 22.500, 'A0', 310.000, '310', NULL, NULL, 'A', 3, 615, '{}');
INSERT INTO app.materials VALUES ('B03A0001-A220-310', '{"en": "K34EF Black skin φ22.0x310", "ja": "K34EF 黒皮 φ22.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.988236+00', '2026-08-24 09:19:51.988236+00', '220', 22.000, 'A0', 310.000, '310', NULL, NULL, 'A', 3, 616, '{}');
INSERT INTO app.materials VALUES ('B03A0001-A215-310', '{"en": "K34EF Black skin φ21.5x310", "ja": "K34EF 黒皮 φ21.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.988468+00', '2026-08-24 09:19:51.988468+00', '215', 21.500, 'A0', 310.000, '310', NULL, NULL, 'A', 3, 617, '{}');
INSERT INTO app.materials VALUES ('B03A0001-A210-310', '{"en": "K34EF Black skin φ21.0x310", "ja": "K34EF 黒皮 φ21.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.988739+00', '2026-08-24 09:19:51.988739+00', '210', 21.000, 'A0', 310.000, '310', NULL, NULL, 'A', 3, 618, '{}');
INSERT INTO app.materials VALUES ('B03A0001-A205-310', '{"en": "K34EF Black skin φ20.5x310", "ja": "K34EF 黒皮 φ20.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.989021+00', '2026-08-24 09:19:51.989021+00', '205', 20.500, 'A0', 310.000, '310', NULL, NULL, 'A', 3, 619, '{}');
INSERT INTO app.materials VALUES ('B03A0001-A200-310', '{"en": "K34EF Black skin φ20.0x310", "ja": "K34EF 黒皮 φ20.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.989268+00', '2026-08-24 09:19:51.989268+00', '200', 20.000, 'A0', 310.000, '310', NULL, NULL, 'A', 3, 620, '{}');
INSERT INTO app.materials VALUES ('B03A0001-A195-310', '{"en": "K34EF Black skin φ19.5x310", "ja": "K34EF 黒皮 φ19.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.9895+00', '2026-08-24 09:19:51.9895+00', '195', 19.500, 'A0', 310.000, '310', NULL, NULL, 'A', 3, 621, '{}');
INSERT INTO app.materials VALUES ('B03A0001-A190-310', '{"en": "K34EF Black skin φ19.0x310", "ja": "K34EF 黒皮 φ19.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.98973+00', '2026-08-24 09:19:51.98973+00', '190', 19.000, 'A0', 310.000, '310', NULL, NULL, 'A', 3, 622, '{}');
INSERT INTO app.materials VALUES ('B03A0001-A185-310', '{"en": "K34EF Black skin φ18.5x310", "ja": "K34EF 黒皮 φ18.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.990026+00', '2026-08-24 09:19:51.990026+00', '185', 18.500, 'A0', 310.000, '310', NULL, NULL, 'A', 3, 623, '{}');
INSERT INTO app.materials VALUES ('B03A0001-A180-310', '{"en": "K34EF Black skin φ18.0x310", "ja": "K34EF 黒皮 φ18.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.990265+00', '2026-08-24 09:19:51.990265+00', '180', 18.000, 'A0', 310.000, '310', NULL, NULL, 'A', 3, 624, '{}');
INSERT INTO app.materials VALUES ('B03A0001-A175-310', '{"en": "K34EF Black skin φ17.5x310", "ja": "K34EF 黒皮 φ17.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.990512+00', '2026-08-24 09:19:51.990512+00', '175', 17.500, 'A0', 310.000, '310', NULL, NULL, 'A', 3, 625, '{}');
INSERT INTO app.materials VALUES ('B03A0001-A170-310', '{"en": "K34EF Black skin φ17.0x310", "ja": "K34EF 黒皮 φ17.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.990747+00', '2026-08-24 09:19:51.990747+00', '170', 17.000, 'A0', 310.000, '310', NULL, NULL, 'A', 3, 626, '{}');
INSERT INTO app.materials VALUES ('B03A0001-A165-310', '{"en": "K34EF Black skin φ16.5x310", "ja": "K34EF 黒皮 φ16.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.991034+00', '2026-08-24 09:19:51.991034+00', '165', 16.500, 'A0', 310.000, '310', NULL, NULL, 'A', 3, 627, '{}');
INSERT INTO app.materials VALUES ('B03A0001-A160-310', '{"en": "K34EF Black skin φ16.0x310", "ja": "K34EF 黒皮 φ16.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.991307+00', '2026-08-24 09:19:51.991307+00', '160', 16.000, 'A0', 310.000, '310', NULL, NULL, 'A', 3, 628, '{}');
INSERT INTO app.materials VALUES ('B03A0001-A155-310', '{"en": "K34EF Black skin φ15.5x310", "ja": "K34EF 黒皮 φ15.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.991553+00', '2026-08-24 09:19:51.991553+00', '155', 15.500, 'A0', 310.000, '310', NULL, NULL, 'A', 3, 629, '{}');
INSERT INTO app.materials VALUES ('B03A0001-A150-310', '{"en": "K34EF Black skin φ15.0x310", "ja": "K34EF 黒皮 φ15.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.991777+00', '2026-08-24 09:19:51.991777+00', '150', 15.000, 'A0', 310.000, '310', NULL, NULL, 'A', 3, 630, '{}');
INSERT INTO app.materials VALUES ('B03A0001-A145-310', '{"en": "K34EF Black skin φ14.5x310", "ja": "K34EF 黒皮 φ14.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.992035+00', '2026-08-24 09:19:51.992035+00', '145', 14.500, 'A0', 310.000, '310', NULL, NULL, 'A', 3, 631, '{}');
INSERT INTO app.materials VALUES ('B03A0001-A140-310', '{"en": "K34EF Black skin φ14.0x310", "ja": "K34EF 黒皮 φ14.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.992253+00', '2026-08-24 09:19:51.992253+00', '140', 14.000, 'A0', 310.000, '310', NULL, NULL, 'A', 3, 632, '{}');
INSERT INTO app.materials VALUES ('B03A0001-A135-310', '{"en": "K34EF Black skin φ13.5x310", "ja": "K34EF 黒皮 φ13.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.992514+00', '2026-08-24 09:19:51.992514+00', '135', 13.500, 'A0', 310.000, '310', NULL, NULL, 'A', 3, 633, '{}');
INSERT INTO app.materials VALUES ('B03A0001-A130-310', '{"en": "K34EF Black skin φ13.0x310", "ja": "K34EF 黒皮 φ13.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.99274+00', '2026-08-24 09:19:51.99274+00', '130', 13.000, 'A0', 310.000, '310', NULL, NULL, 'A', 3, 634, '{}');
INSERT INTO app.materials VALUES ('B03A0001-A125-310', '{"en": "K34EF Black skin φ12.5x310", "ja": "K34EF 黒皮 φ12.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.99299+00', '2026-08-24 09:19:51.99299+00', '125', 12.500, 'A0', 310.000, '310', NULL, NULL, 'A', 3, 635, '{}');
INSERT INTO app.materials VALUES ('B03A0001-A120-310', '{"en": "K34EF Black skin φ12.0x310", "ja": "K34EF 黒皮 φ12.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.993232+00', '2026-08-24 09:19:51.993232+00', '120', 12.000, 'A0', 310.000, '310', NULL, NULL, 'A', 3, 636, '{}');
INSERT INTO app.materials VALUES ('B03A0001-A115-310', '{"en": "K34EF Black skin φ11.5x310", "ja": "K34EF 黒皮 φ11.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.993507+00', '2026-08-24 09:19:51.993507+00', '115', 11.500, 'A0', 310.000, '310', NULL, NULL, 'A', 3, 637, '{}');
INSERT INTO app.materials VALUES ('B03A0001-A110-310', '{"en": "K34EF Black skin φ11.0x310", "ja": "K34EF 黒皮 φ11.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.993733+00', '2026-08-24 09:19:51.993733+00', '110', 11.000, 'A0', 310.000, '310', NULL, NULL, 'A', 3, 638, '{}');
INSERT INTO app.materials VALUES ('B03A0001-A105-310', '{"en": "K34EF Black skin φ10.5x310", "ja": "K34EF 黒皮 φ10.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.993982+00', '2026-08-24 09:19:51.993982+00', '105', 10.500, 'A0', 310.000, '310', NULL, NULL, 'A', 3, 639, '{}');
INSERT INTO app.materials VALUES ('B03A0001-A100-310', '{"en": "K34EF Black skin φ10.0x310", "ja": "K34EF 黒皮 φ10.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.994239+00', '2026-08-24 09:19:51.994239+00', '100', 10.000, 'A0', 310.000, '310', NULL, NULL, 'A', 3, 640, '{}');
INSERT INTO app.materials VALUES ('B03A0001-A095-310', '{"en": "K34EF Black skin φ9.5x310", "ja": "K34EF 黒皮 φ9.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.994505+00', '2026-08-24 09:19:51.994505+00', '095', 9.500, 'A0', 310.000, '310', NULL, NULL, 'A', 3, 641, '{}');
INSERT INTO app.materials VALUES ('B03A0001-A090-310', '{"en": "K34EF Black skin φ9.0x310", "ja": "K34EF 黒皮 φ9.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.994827+00', '2026-08-24 09:19:51.994827+00', '090', 9.000, 'A0', 310.000, '310', NULL, NULL, 'A', 3, 642, '{}');
INSERT INTO app.materials VALUES ('B03A0001-A085-310', '{"en": "K34EF Black skin φ8.5x310", "ja": "K34EF 黒皮 φ8.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.995231+00', '2026-08-24 09:19:51.995231+00', '085', 8.500, 'A0', 310.000, '310', NULL, NULL, 'A', 3, 643, '{}');
INSERT INTO app.materials VALUES ('B03A0001-A080-310', '{"en": "K34EF Black skin φ8.0x310", "ja": "K34EF 黒皮 φ8.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.995546+00', '2026-08-24 09:19:51.995546+00', '080', 8.000, 'A0', 310.000, '310', NULL, NULL, 'A', 3, 644, '{}');
INSERT INTO app.materials VALUES ('B03A0001-A075-310', '{"en": "K34EF Black skin φ7.5x310", "ja": "K34EF 黒皮 φ7.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.995857+00', '2026-08-24 09:19:51.995857+00', '075', 7.500, 'A0', 310.000, '310', NULL, NULL, 'A', 3, 645, '{}');
INSERT INTO app.materials VALUES ('B03A0001-A070-310', '{"en": "K34EF Black skin φ7.0x310", "ja": "K34EF 黒皮 φ7.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.996166+00', '2026-08-24 09:19:51.996166+00', '070', 7.000, 'A0', 310.000, '310', NULL, NULL, 'A', 3, 646, '{}');
INSERT INTO app.materials VALUES ('B03A0001-A065-310', '{"en": "K34EF Black skin φ6.5x310", "ja": "K34EF 黒皮 φ6.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.996446+00', '2026-08-24 09:19:51.996446+00', '065', 6.500, 'A0', 310.000, '310', NULL, NULL, 'A', 3, 647, '{}');
INSERT INTO app.materials VALUES ('B03A0001-A060-310', '{"en": "K34EF Black skin φ6.0x310", "ja": "K34EF 黒皮 φ6.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.996843+00', '2026-08-24 09:19:51.996843+00', '060', 6.000, 'A0', 310.000, '310', NULL, NULL, 'A', 3, 648, '{}');
INSERT INTO app.materials VALUES ('B03A0001-A055-310', '{"en": "K34EF Black skin φ5.5x310", "ja": "K34EF 黒皮 φ5.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.997125+00', '2026-08-24 09:19:51.997125+00', '055', 5.500, 'A0', 310.000, '310', NULL, NULL, 'A', 3, 649, '{}');
INSERT INTO app.materials VALUES ('B03A0001-A050-310', '{"en": "K34EF Black skin φ5.0x310", "ja": "K34EF 黒皮 φ5.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.997394+00', '2026-08-24 09:19:51.997394+00', '050', 5.000, 'A0', 310.000, '310', NULL, NULL, 'A', 3, 650, '{}');
INSERT INTO app.materials VALUES ('B03A0001-A045-310', '{"en": "K34EF Black skin φ4.5x310", "ja": "K34EF 黒皮 φ4.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.997664+00', '2026-08-24 09:19:51.997664+00', '045', 4.500, 'A0', 310.000, '310', NULL, NULL, 'A', 3, 651, '{}');
INSERT INTO app.materials VALUES ('B03A0001-A040-310', '{"en": "K34EF Black skin φ4.0x310", "ja": "K34EF 黒皮 φ4.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.997983+00', '2026-08-24 09:19:51.997983+00', '040', 4.000, 'A0', 310.000, '310', NULL, NULL, 'A', 3, 652, '{}');
INSERT INTO app.materials VALUES ('B03A0001-A035-310', '{"en": "K34EF Black skin φ3.5x310", "ja": "K34EF 黒皮 φ3.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.998298+00', '2026-08-24 09:19:51.998298+00', '035', 3.500, 'A0', 310.000, '310', NULL, NULL, 'A', 3, 653, '{}');
INSERT INTO app.materials VALUES ('B03A0001-A030-310', '{"en": "K34EF Black skin φ3.0x310", "ja": "K34EF 黒皮 φ3.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.998581+00', '2026-08-24 09:19:51.998581+00', '030', 3.000, 'A0', 310.000, '310', NULL, NULL, 'A', 3, 654, '{}');
INSERT INTO app.materials VALUES ('B03A0001-A025-310', '{"en": "K34EF Black skin φ2.5x310", "ja": "K34EF 黒皮 φ2.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.998889+00', '2026-08-24 09:19:51.998889+00', '025', 2.500, 'A0', 310.000, '310', NULL, NULL, 'A', 3, 655, '{}');
INSERT INTO app.materials VALUES ('B03A0001-A020-310', '{"en": "K34EF Black skin φ2.0x310", "ja": "K34EF 黒皮 φ2.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.999197+00', '2026-08-24 09:19:51.999197+00', '020', 2.000, 'A0', 310.000, '310', NULL, NULL, 'A', 3, 656, '{}');
INSERT INTO app.materials VALUES ('B03A0001-A015-310', '{"en": "K34EF Black skin φ1.5x310", "ja": "K34EF 黒皮 φ1.5×310"}', '本', true, NULL, '2026-08-24 09:19:51.999637+00', '2026-08-24 09:19:51.999637+00', '015', 1.500, 'A0', 310.000, '310', NULL, NULL, 'A', 3, 657, '{}');
INSERT INTO app.materials VALUES ('B03A0001-A010-310', '{"en": "K34EF Black skin φ1.0x310", "ja": "K34EF 黒皮 φ1.0×310"}', '本', true, NULL, '2026-08-24 09:19:51.999911+00', '2026-08-24 09:19:51.999911+00', '010', 1.000, 'A0', 310.000, '310', NULL, NULL, 'A', 3, 658, '{}');
INSERT INTO app.materials VALUES ('B06A0001-A350-310', '{"en": "K45EF Black skin φ35.0x310", "ja": "K45EF 黒皮 φ35.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.000191+00', '2026-08-24 09:19:52.000191+00', '350', 35.000, 'A0', 310.000, '310', NULL, NULL, 'A', 6, 659, '{}');
INSERT INTO app.materials VALUES ('B06A0001-A340-310', '{"en": "K45EF Black skin φ34.0x310", "ja": "K45EF 黒皮 φ34.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.000459+00', '2026-08-24 09:19:52.000459+00', '340', 34.000, 'A0', 310.000, '310', NULL, NULL, 'A', 6, 660, '{}');
INSERT INTO app.materials VALUES ('B06A0001-A330-310', '{"en": "K45EF Black skin φ33.0x310", "ja": "K45EF 黒皮 φ33.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.000713+00', '2026-08-24 09:19:52.000713+00', '330', 33.000, 'A0', 310.000, '310', NULL, NULL, 'A', 6, 661, '{}');
INSERT INTO app.materials VALUES ('B06A0001-A320-310', '{"en": "K45EF Black skin φ32.0x310", "ja": "K45EF 黒皮 φ32.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.000996+00', '2026-08-24 09:19:52.000996+00', '320', 32.000, 'A0', 310.000, '310', NULL, NULL, 'A', 6, 662, '{}');
INSERT INTO app.materials VALUES ('B06A0001-A310-310', '{"en": "K45EF Black skin φ31.0x310", "ja": "K45EF 黒皮 φ31.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.001265+00', '2026-08-24 09:19:52.001265+00', '310', 31.000, 'A0', 310.000, '310', NULL, NULL, 'A', 6, 663, '{}');
INSERT INTO app.materials VALUES ('B06A0001-A300-310', '{"en": "K45EF Black skin φ30.0x310", "ja": "K45EF 黒皮 φ30.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.001523+00', '2026-08-24 09:19:52.001523+00', '300', 30.000, 'A0', 310.000, '310', NULL, NULL, 'A', 6, 664, '{}');
INSERT INTO app.materials VALUES ('B06A0001-A290-310', '{"en": "K45EF Black skin φ29.0x310", "ja": "K45EF 黒皮 φ29.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.001786+00', '2026-08-24 09:19:52.001786+00', '290', 29.000, 'A0', 310.000, '310', NULL, NULL, 'A', 6, 665, '{}');
INSERT INTO app.materials VALUES ('B06A0001-A280-310', '{"en": "K45EF Black skin φ28.0x310", "ja": "K45EF 黒皮 φ28.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.00212+00', '2026-08-24 09:19:52.00212+00', '280', 28.000, 'A0', 310.000, '310', NULL, NULL, 'A', 6, 666, '{}');
INSERT INTO app.materials VALUES ('B06A0001-A270-310', '{"en": "K45EF Black skin φ27.0x310", "ja": "K45EF 黒皮 φ27.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.002444+00', '2026-08-24 09:19:52.002444+00', '270', 27.000, 'A0', 310.000, '310', NULL, NULL, 'A', 6, 667, '{}');
INSERT INTO app.materials VALUES ('B06A0001-A260-310', '{"en": "K45EF Black skin φ26.0x310", "ja": "K45EF 黒皮 φ26.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.002716+00', '2026-08-24 09:19:52.002716+00', '260', 26.000, 'A0', 310.000, '310', NULL, NULL, 'A', 6, 668, '{}');
INSERT INTO app.materials VALUES ('B06A0001-A255-310', '{"en": "K45EF Black skin φ25.5x310", "ja": "K45EF 黒皮 φ25.5×310"}', '本', true, NULL, '2026-08-24 09:19:52.002991+00', '2026-08-24 09:19:52.002991+00', '255', 25.500, 'A0', 310.000, '310', NULL, NULL, 'A', 6, 669, '{}');
INSERT INTO app.materials VALUES ('B06A0001-A250-310', '{"en": "K45EF Black skin φ25.0x310", "ja": "K45EF 黒皮 φ25.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.003258+00', '2026-08-24 09:19:52.003258+00', '250', 25.000, 'A0', 310.000, '310', NULL, NULL, 'A', 6, 670, '{}');
INSERT INTO app.materials VALUES ('B06A0001-A240-310', '{"en": "K45EF Black skin φ24.0x310", "ja": "K45EF 黒皮 φ24.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.003514+00', '2026-08-24 09:19:52.003514+00', '240', 24.000, 'A0', 310.000, '310', NULL, NULL, 'A', 6, 671, '{}');
INSERT INTO app.materials VALUES ('B06A0001-A235-310', '{"en": "K45EF Black skin φ23.5x310", "ja": "K45EF 黒皮 φ23.5×310"}', '本', true, NULL, '2026-08-24 09:19:52.003783+00', '2026-08-24 09:19:52.003783+00', '235', 23.500, 'A0', 310.000, '310', NULL, NULL, 'A', 6, 672, '{}');
INSERT INTO app.materials VALUES ('B06A0001-A230-310', '{"en": "K45EF Black skin φ23.0x310", "ja": "K45EF 黒皮 φ23.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.004079+00', '2026-08-24 09:19:52.004079+00', '230', 23.000, 'A0', 310.000, '310', NULL, NULL, 'A', 6, 673, '{}');
INSERT INTO app.materials VALUES ('B06A0001-A225-310', '{"en": "K45EF Black skin φ22.5x310", "ja": "K45EF 黒皮 φ22.5×310"}', '本', true, NULL, '2026-08-24 09:19:52.004349+00', '2026-08-24 09:19:52.004349+00', '225', 22.500, 'A0', 310.000, '310', NULL, NULL, 'A', 6, 674, '{}');
INSERT INTO app.materials VALUES ('B06A0001-A220-310', '{"en": "K45EF Black skin φ22.0x310", "ja": "K45EF 黒皮 φ22.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.00461+00', '2026-08-24 09:19:52.00461+00', '220', 22.000, 'A0', 310.000, '310', NULL, NULL, 'A', 6, 675, '{}');
INSERT INTO app.materials VALUES ('B06A0001-A215-310', '{"en": "K45EF Black skin φ21.5x310", "ja": "K45EF 黒皮 φ21.5×310"}', '本', true, NULL, '2026-08-24 09:19:52.004919+00', '2026-08-24 09:19:52.004919+00', '215', 21.500, 'A0', 310.000, '310', NULL, NULL, 'A', 6, 676, '{}');
INSERT INTO app.materials VALUES ('B06A0001-A210-310', '{"en": "K45EF Black skin φ21.0x310", "ja": "K45EF 黒皮 φ21.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.005209+00', '2026-08-24 09:19:52.005209+00', '210', 21.000, 'A0', 310.000, '310', NULL, NULL, 'A', 6, 677, '{}');
INSERT INTO app.materials VALUES ('B06A0001-A205-310', '{"en": "K45EF Black skin φ20.5x310", "ja": "K45EF 黒皮 φ20.5×310"}', '本', true, NULL, '2026-08-24 09:19:52.005487+00', '2026-08-24 09:19:52.005487+00', '205', 20.500, 'A0', 310.000, '310', NULL, NULL, 'A', 6, 678, '{}');
INSERT INTO app.materials VALUES ('B06A0001-A200-310', '{"en": "K45EF Black skin φ20.0x310", "ja": "K45EF 黒皮 φ20.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.005752+00', '2026-08-24 09:19:52.005752+00', '200', 20.000, 'A0', 310.000, '310', NULL, NULL, 'A', 6, 679, '{}');
INSERT INTO app.materials VALUES ('B06A0001-A195-310', '{"en": "K45EF Black skin φ19.5x310", "ja": "K45EF 黒皮 φ19.5×310"}', '本', true, NULL, '2026-08-24 09:19:52.006055+00', '2026-08-24 09:19:52.006055+00', '195', 19.500, 'A0', 310.000, '310', NULL, NULL, 'A', 6, 680, '{}');
INSERT INTO app.materials VALUES ('B06A0001-A190-310', '{"en": "K45EF Black skin φ19.0x310", "ja": "K45EF 黒皮 φ19.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.006348+00', '2026-08-24 09:19:52.006348+00', '190', 19.000, 'A0', 310.000, '310', NULL, NULL, 'A', 6, 681, '{}');
INSERT INTO app.materials VALUES ('B06A0001-A185-310', '{"en": "K45EF Black skin φ18.5x310", "ja": "K45EF 黒皮 φ18.5×310"}', '本', true, NULL, '2026-08-24 09:19:52.006629+00', '2026-08-24 09:19:52.006629+00', '185', 18.500, 'A0', 310.000, '310', NULL, NULL, 'A', 6, 682, '{}');
INSERT INTO app.materials VALUES ('B06A0001-A180-310', '{"en": "K45EF Black skin φ18.0x310", "ja": "K45EF 黒皮 φ18.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.006889+00', '2026-08-24 09:19:52.006889+00', '180', 18.000, 'A0', 310.000, '310', NULL, NULL, 'A', 6, 683, '{}');
INSERT INTO app.materials VALUES ('B06A0001-A175-310', '{"en": "K45EF Black skin φ17.5x310", "ja": "K45EF 黒皮 φ17.5×310"}', '本', true, NULL, '2026-08-24 09:19:52.007162+00', '2026-08-24 09:19:52.007162+00', '175', 17.500, 'A0', 310.000, '310', NULL, NULL, 'A', 6, 684, '{}');
INSERT INTO app.materials VALUES ('B06A0001-A170-310', '{"en": "K45EF Black skin φ17.0x310", "ja": "K45EF 黒皮 φ17.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.007459+00', '2026-08-24 09:19:52.007459+00', '170', 17.000, 'A0', 310.000, '310', NULL, NULL, 'A', 6, 685, '{}');
INSERT INTO app.materials VALUES ('B06A0001-A165-310', '{"en": "K45EF Black skin φ16.5x310", "ja": "K45EF 黒皮 φ16.5×310"}', '本', true, NULL, '2026-08-24 09:19:52.007746+00', '2026-08-24 09:19:52.007746+00', '165', 16.500, 'A0', 310.000, '310', NULL, NULL, 'A', 6, 686, '{}');
INSERT INTO app.materials VALUES ('B06A0001-A160-310', '{"en": "K45EF Black skin φ16.0x310", "ja": "K45EF 黒皮 φ16.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.008029+00', '2026-08-24 09:19:52.008029+00', '160', 16.000, 'A0', 310.000, '310', NULL, NULL, 'A', 6, 687, '{}');
INSERT INTO app.materials VALUES ('B06A0001-A155-310', '{"en": "K45EF Black skin φ15.5x310", "ja": "K45EF 黒皮 φ15.5×310"}', '本', true, NULL, '2026-08-24 09:19:52.008304+00', '2026-08-24 09:19:52.008304+00', '155', 15.500, 'A0', 310.000, '310', NULL, NULL, 'A', 6, 688, '{}');
INSERT INTO app.materials VALUES ('B06A0001-A150-310', '{"en": "K45EF Black skin φ15.0x310", "ja": "K45EF 黒皮 φ15.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.00862+00', '2026-08-24 09:19:52.00862+00', '150', 15.000, 'A0', 310.000, '310', NULL, NULL, 'A', 6, 689, '{}');
INSERT INTO app.materials VALUES ('B06A0001-A145-310', '{"en": "K45EF Black skin φ14.5x310", "ja": "K45EF 黒皮 φ14.5×310"}', '本', true, NULL, '2026-08-24 09:19:52.008912+00', '2026-08-24 09:19:52.008912+00', '145', 14.500, 'A0', 310.000, '310', NULL, NULL, 'A', 6, 690, '{}');
INSERT INTO app.materials VALUES ('B06A0001-A140-310', '{"en": "K45EF Black skin φ14.0x310", "ja": "K45EF 黒皮 φ14.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.009184+00', '2026-08-24 09:19:52.009184+00', '140', 14.000, 'A0', 310.000, '310', NULL, NULL, 'A', 6, 691, '{}');
INSERT INTO app.materials VALUES ('B06A0001-A135-310', '{"en": "K45EF Black skin φ13.5x310", "ja": "K45EF 黒皮 φ13.5×310"}', '本', true, NULL, '2026-08-24 09:19:52.00945+00', '2026-08-24 09:19:52.00945+00', '135', 13.500, 'A0', 310.000, '310', NULL, NULL, 'A', 6, 692, '{}');
INSERT INTO app.materials VALUES ('B06A0001-A130-310', '{"en": "K45EF Black skin φ13.0x310", "ja": "K45EF 黒皮 φ13.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.00975+00', '2026-08-24 09:19:52.00975+00', '130', 13.000, 'A0', 310.000, '310', NULL, NULL, 'A', 6, 693, '{}');
INSERT INTO app.materials VALUES ('B06A0001-A125-310', '{"en": "K45EF Black skin φ12.5x310", "ja": "K45EF 黒皮 φ12.5×310"}', '本', true, NULL, '2026-08-24 09:19:52.010116+00', '2026-08-24 09:19:52.010116+00', '125', 12.500, 'A0', 310.000, '310', NULL, NULL, 'A', 6, 694, '{}');
INSERT INTO app.materials VALUES ('B06A0001-A120-310', '{"en": "K45EF Black skin φ12.0x310", "ja": "K45EF 黒皮 φ12.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.010411+00', '2026-08-24 09:19:52.010411+00', '120', 12.000, 'A0', 310.000, '310', NULL, NULL, 'A', 6, 695, '{}');
INSERT INTO app.materials VALUES ('B06A0001-A115-310', '{"en": "K45EF Black skin φ11.5x310", "ja": "K45EF 黒皮 φ11.5×310"}', '本', true, NULL, '2026-08-24 09:19:52.010711+00', '2026-08-24 09:19:52.010711+00', '115', 11.500, 'A0', 310.000, '310', NULL, NULL, 'A', 6, 696, '{}');
INSERT INTO app.materials VALUES ('B06A0001-A110-310', '{"en": "K45EF Black skin φ11.0x310", "ja": "K45EF 黒皮 φ11.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.010988+00', '2026-08-24 09:19:52.010988+00', '110', 11.000, 'A0', 310.000, '310', NULL, NULL, 'A', 6, 697, '{}');
INSERT INTO app.materials VALUES ('B06A0001-A105-310', '{"en": "K45EF Black skin φ10.5x310", "ja": "K45EF 黒皮 φ10.5×310"}', '本', true, NULL, '2026-08-24 09:19:52.011259+00', '2026-08-24 09:19:52.011259+00', '105', 10.500, 'A0', 310.000, '310', NULL, NULL, 'A', 6, 698, '{}');
INSERT INTO app.materials VALUES ('B06A0001-A100-310', '{"en": "K45EF Black skin φ10.0x310", "ja": "K45EF 黒皮 φ10.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.01156+00', '2026-08-24 09:19:52.01156+00', '100', 10.000, 'A0', 310.000, '310', NULL, NULL, 'A', 6, 699, '{}');
INSERT INTO app.materials VALUES ('B06A0001-A095-310', '{"en": "K45EF Black skin φ9.5x310", "ja": "K45EF 黒皮 φ9.5×310"}', '本', true, NULL, '2026-08-24 09:19:52.011853+00', '2026-08-24 09:19:52.011853+00', '095', 9.500, 'A0', 310.000, '310', NULL, NULL, 'A', 6, 700, '{}');
INSERT INTO app.materials VALUES ('B06A0001-A090-310', '{"en": "K45EF Black skin φ9.0x310", "ja": "K45EF 黒皮 φ9.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.012138+00', '2026-08-24 09:19:52.012138+00', '090', 9.000, 'A0', 310.000, '310', NULL, NULL, 'A', 6, 701, '{}');
INSERT INTO app.materials VALUES ('B06A0001-A085-310', '{"en": "K45EF Black skin φ8.5x310", "ja": "K45EF 黒皮 φ8.5×310"}', '本', true, NULL, '2026-08-24 09:19:52.012418+00', '2026-08-24 09:19:52.012418+00', '085', 8.500, 'A0', 310.000, '310', NULL, NULL, 'A', 6, 702, '{}');
INSERT INTO app.materials VALUES ('B06A0001-A080-310', '{"en": "K45EF Black skin φ8.0x310", "ja": "K45EF 黒皮 φ8.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.012688+00', '2026-08-24 09:19:52.012688+00', '080', 8.000, 'A0', 310.000, '310', NULL, NULL, 'A', 6, 703, '{}');
INSERT INTO app.materials VALUES ('B06A0001-A075-310', '{"en": "K45EF Black skin φ7.5x310", "ja": "K45EF 黒皮 φ7.5×310"}', '本', true, NULL, '2026-08-24 09:19:52.012999+00', '2026-08-24 09:19:52.012999+00', '075', 7.500, 'A0', 310.000, '310', NULL, NULL, 'A', 6, 704, '{}');
INSERT INTO app.materials VALUES ('B06A0001-A070-310', '{"en": "K45EF Black skin φ7.0x310", "ja": "K45EF 黒皮 φ7.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.013287+00', '2026-08-24 09:19:52.013287+00', '070', 7.000, 'A0', 310.000, '310', NULL, NULL, 'A', 6, 705, '{}');
INSERT INTO app.materials VALUES ('B06A0001-A065-310', '{"en": "K45EF Black skin φ6.5x310", "ja": "K45EF 黒皮 φ6.5×310"}', '本', true, NULL, '2026-08-24 09:19:52.013553+00', '2026-08-24 09:19:52.013553+00', '065', 6.500, 'A0', 310.000, '310', NULL, NULL, 'A', 6, 706, '{}');
INSERT INTO app.materials VALUES ('B06A0001-A060-310', '{"en": "K45EF Black skin φ6.0x310", "ja": "K45EF 黒皮 φ6.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.013825+00', '2026-08-24 09:19:52.013825+00', '060', 6.000, 'A0', 310.000, '310', NULL, NULL, 'A', 6, 707, '{}');
INSERT INTO app.materials VALUES ('B06A0001-A055-310', '{"en": "K45EF Black skin φ5.5x310", "ja": "K45EF 黒皮 φ5.5×310"}', '本', true, NULL, '2026-08-24 09:19:52.01413+00', '2026-08-24 09:19:52.01413+00', '055', 5.500, 'A0', 310.000, '310', NULL, NULL, 'A', 6, 708, '{}');
INSERT INTO app.materials VALUES ('B06A0001-A050-310', '{"en": "K45EF Black skin φ5.0x310", "ja": "K45EF 黒皮 φ5.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.014451+00', '2026-08-24 09:19:52.014451+00', '050', 5.000, 'A0', 310.000, '310', NULL, NULL, 'A', 6, 709, '{}');
INSERT INTO app.materials VALUES ('B06A0001-A045-310', '{"en": "K45EF Black skin φ4.5x310", "ja": "K45EF 黒皮 φ4.5×310"}', '本', true, NULL, '2026-08-24 09:19:52.014719+00', '2026-08-24 09:19:52.014719+00', '045', 4.500, 'A0', 310.000, '310', NULL, NULL, 'A', 6, 710, '{}');
INSERT INTO app.materials VALUES ('B06A0001-A040-310', '{"en": "K45EF Black skin φ4.0x310", "ja": "K45EF 黒皮 φ4.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.014999+00', '2026-08-24 09:19:52.014999+00', '040', 4.000, 'A0', 310.000, '310', NULL, NULL, 'A', 6, 711, '{}');
INSERT INTO app.materials VALUES ('B06A0001-A035-310', '{"en": "K45EF Black skin φ3.5x310", "ja": "K45EF 黒皮 φ3.5×310"}', '本', true, NULL, '2026-08-24 09:19:52.015293+00', '2026-08-24 09:19:52.015293+00', '035', 3.500, 'A0', 310.000, '310', NULL, NULL, 'A', 6, 712, '{}');
INSERT INTO app.materials VALUES ('B06A0001-A030-310', '{"en": "K45EF Black skin φ3.0x310", "ja": "K45EF 黒皮 φ3.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.015617+00', '2026-08-24 09:19:52.015617+00', '030', 3.000, 'A0', 310.000, '310', NULL, NULL, 'A', 6, 713, '{}');
INSERT INTO app.materials VALUES ('B06A0001-A025-310', '{"en": "K45EF Black skin φ2.5x310", "ja": "K45EF 黒皮 φ2.5×310"}', '本', true, NULL, '2026-08-24 09:19:52.015905+00', '2026-08-24 09:19:52.015905+00', '025', 2.500, 'A0', 310.000, '310', NULL, NULL, 'A', 6, 714, '{}');
INSERT INTO app.materials VALUES ('B06A0001-A020-310', '{"en": "K45EF Black skin φ2.0x310", "ja": "K45EF 黒皮 φ2.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.016193+00', '2026-08-24 09:19:52.016193+00', '020', 2.000, 'A0', 310.000, '310', NULL, NULL, 'A', 6, 715, '{}');
INSERT INTO app.materials VALUES ('B06A0001-A015-310', '{"en": "K45EF Black skin φ1.5x310", "ja": "K45EF 黒皮 φ1.5×310"}', '本', true, NULL, '2026-08-24 09:19:52.016492+00', '2026-08-24 09:19:52.016492+00', '015', 1.500, 'A0', 310.000, '310', NULL, NULL, 'A', 6, 716, '{}');
INSERT INTO app.materials VALUES ('B06A0001-A010-310', '{"en": "K45EF Black skin φ1.0x310", "ja": "K45EF 黒皮 φ1.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.016825+00', '2026-08-24 09:19:52.016825+00', '010', 1.000, 'A0', 310.000, '310', NULL, NULL, 'A', 6, 717, '{}');
INSERT INTO app.materials VALUES ('D02A0001-A460-310', '{"en": "CTS20D Black skin φ46.0x310", "ja": "CTS20D 黒皮 φ46.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.017156+00', '2026-08-24 09:19:52.017156+00', '460', 46.000, 'A0', 310.000, '310', NULL, NULL, 'A', 11, 718, '{}');
INSERT INTO app.materials VALUES ('D02A0001-A420-310', '{"en": "CTS20D Black skin φ42.0x310", "ja": "CTS20D 黒皮 φ42.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.017435+00', '2026-08-24 09:19:52.017435+00', '420', 42.000, 'A0', 310.000, '310', NULL, NULL, 'A', 11, 719, '{}');
INSERT INTO app.materials VALUES ('D02A0001-A400-310', '{"en": "CTS20D Black skin φ40.0x310", "ja": "CTS20D 黒皮 φ40.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.017706+00', '2026-08-24 09:19:52.017706+00', '400', 40.000, 'A0', 310.000, '310', NULL, NULL, 'A', 11, 720, '{}');
INSERT INTO app.materials VALUES ('D02A0001-A380-310', '{"en": "CTS20D Black skin φ38.0x310", "ja": "CTS20D 黒皮 φ38.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.018154+00', '2026-08-24 09:19:52.018154+00', '380', 38.000, 'A0', 310.000, '310', NULL, NULL, 'A', 11, 721, '{}');
INSERT INTO app.materials VALUES ('D02A0001-A360-310', '{"en": "CTS20D Black skin φ36.0x310", "ja": "CTS20D 黒皮 φ36.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.018468+00', '2026-08-24 09:19:52.018468+00', '360', 36.000, 'A0', 310.000, '310', NULL, NULL, 'A', 11, 722, '{}');
INSERT INTO app.materials VALUES ('D02A0001-A340-310', '{"en": "CTS20D Black skin φ34.0x310", "ja": "CTS20D 黒皮 φ34.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.018777+00', '2026-08-24 09:19:52.018777+00', '340', 34.000, 'A0', 310.000, '310', NULL, NULL, 'A', 11, 723, '{}');
INSERT INTO app.materials VALUES ('D02A0001-A320-310', '{"en": "CTS20D Black skin φ32.0x310", "ja": "CTS20D 黒皮 φ32.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.019102+00', '2026-08-24 09:19:52.019102+00', '320', 32.000, 'A0', 310.000, '310', NULL, NULL, 'A', 11, 724, '{}');
INSERT INTO app.materials VALUES ('D02A0001-A300-310', '{"en": "CTS20D Black skin φ30.0x310", "ja": "CTS20D 黒皮 φ30.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.01938+00', '2026-08-24 09:19:52.01938+00', '300', 30.000, 'A0', 310.000, '310', NULL, NULL, 'A', 11, 725, '{}');
INSERT INTO app.materials VALUES ('D02A0001-A280-310', '{"en": "CTS20D Black skin φ28.0x310", "ja": "CTS20D 黒皮 φ28.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.019668+00', '2026-08-24 09:19:52.019668+00', '280', 28.000, 'A0', 310.000, '310', NULL, NULL, 'A', 11, 726, '{}');
INSERT INTO app.materials VALUES ('D02A0001-A260-310', '{"en": "CTS20D Black skin φ26.0x310", "ja": "CTS20D 黒皮 φ26.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.019929+00', '2026-08-24 09:19:52.019929+00', '260', 26.000, 'A0', 310.000, '310', NULL, NULL, 'A', 11, 727, '{}');
INSERT INTO app.materials VALUES ('D02A0001-A255-310', '{"en": "CTS20D Black skin φ25.5x310", "ja": "CTS20D 黒皮 φ25.5×310"}', '本', true, NULL, '2026-08-24 09:19:52.020194+00', '2026-08-24 09:19:52.020194+00', '255', 25.500, 'A0', 310.000, '310', NULL, NULL, 'A', 11, 728, '{}');
INSERT INTO app.materials VALUES ('D02A0001-A250-310', '{"en": "CTS20D Black skin φ25.0x310", "ja": "CTS20D 黒皮 φ25.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.020472+00', '2026-08-24 09:19:52.020472+00', '250', 25.000, 'A0', 310.000, '310', NULL, NULL, 'A', 11, 729, '{}');
INSERT INTO app.materials VALUES ('D02A0001-A240-310', '{"en": "CTS20D Black skin φ24.0x310", "ja": "CTS20D 黒皮 φ24.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.02079+00', '2026-08-24 09:19:52.02079+00', '240', 24.000, 'A0', 310.000, '310', NULL, NULL, 'A', 11, 730, '{}');
INSERT INTO app.materials VALUES ('D02A0001-A230-310', '{"en": "CTS20D Black skin φ23.0x310", "ja": "CTS20D 黒皮 φ23.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.021101+00', '2026-08-24 09:19:52.021101+00', '230', 23.000, 'A0', 310.000, '310', NULL, NULL, 'A', 11, 731, '{}');
INSERT INTO app.materials VALUES ('D02A0001-A220-310', '{"en": "CTS20D Black skin φ22.0x310", "ja": "CTS20D 黒皮 φ22.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.021374+00', '2026-08-24 09:19:52.021374+00', '220', 22.000, 'A0', 310.000, '310', NULL, NULL, 'A', 11, 732, '{}');
INSERT INTO app.materials VALUES ('D02A0001-A210-310', '{"en": "CTS20D Black skin φ21.0x310", "ja": "CTS20D 黒皮 φ21.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.021636+00', '2026-08-24 09:19:52.021636+00', '210', 21.000, 'A0', 310.000, '310', NULL, NULL, 'A', 11, 733, '{}');
INSERT INTO app.materials VALUES ('D02A0001-A200-310', '{"en": "CTS20D Black skin φ20.0x310", "ja": "CTS20D 黒皮 φ20.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.021896+00', '2026-08-24 09:19:52.021896+00', '200', 20.000, 'A0', 310.000, '310', NULL, NULL, 'A', 11, 734, '{}');
INSERT INTO app.materials VALUES ('D02A0001-A190-310', '{"en": "CTS20D Black skin φ19.0x310", "ja": "CTS20D 黒皮 φ19.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.022168+00', '2026-08-24 09:19:52.022168+00', '190', 19.000, 'A0', 310.000, '310', NULL, NULL, 'A', 11, 735, '{}');
INSERT INTO app.materials VALUES ('D02A0001-A180-310', '{"en": "CTS20D Black skin φ18.0x310", "ja": "CTS20D 黒皮 φ18.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.022443+00', '2026-08-24 09:19:52.022443+00', '180', 18.000, 'A0', 310.000, '310', NULL, NULL, 'A', 11, 736, '{}');
INSERT INTO app.materials VALUES ('D02A0001-A170-310', '{"en": "CTS20D Black skin φ17.0x310", "ja": "CTS20D 黒皮 φ17.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.022698+00', '2026-08-24 09:19:52.022698+00', '170', 17.000, 'A0', 310.000, '310', NULL, NULL, 'A', 11, 737, '{}');
INSERT INTO app.materials VALUES ('D02A0001-A160-310', '{"en": "CTS20D Black skin φ16.0x310", "ja": "CTS20D 黒皮 φ16.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.022967+00', '2026-08-24 09:19:52.022967+00', '160', 16.000, 'A0', 310.000, '310', NULL, NULL, 'A', 11, 738, '{}');
INSERT INTO app.materials VALUES ('D02A0001-A150-310', '{"en": "CTS20D Black skin φ15.0x310", "ja": "CTS20D 黒皮 φ15.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.023256+00', '2026-08-24 09:19:52.023256+00', '150', 15.000, 'A0', 310.000, '310', NULL, NULL, 'A', 11, 739, '{}');
INSERT INTO app.materials VALUES ('D02A0001-A145-310', '{"en": "CTS20D Black skin φ14.5x310", "ja": "CTS20D 黒皮 φ14.5×310"}', '本', true, NULL, '2026-08-24 09:19:52.023625+00', '2026-08-24 09:19:52.023625+00', '145', 14.500, 'A0', 310.000, '310', NULL, NULL, 'A', 11, 740, '{}');
INSERT INTO app.materials VALUES ('D02A0001-A140-310', '{"en": "CTS20D Black skin φ14.0x310", "ja": "CTS20D 黒皮 φ14.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.023982+00', '2026-08-24 09:19:52.023982+00', '140', 14.000, 'A0', 310.000, '310', NULL, NULL, 'A', 11, 741, '{}');
INSERT INTO app.materials VALUES ('D02A0001-A130-310', '{"en": "CTS20D Black skin φ13.0x310", "ja": "CTS20D 黒皮 φ13.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.024333+00', '2026-08-24 09:19:52.024333+00', '130', 13.000, 'A0', 310.000, '310', NULL, NULL, 'A', 11, 742, '{}');
INSERT INTO app.materials VALUES ('D02A0001-A127-310', '{"en": "CTS20D Black skin φ12.7x310", "ja": "CTS20D 黒皮 φ12.7×310"}', '本', true, NULL, '2026-08-24 09:19:52.024635+00', '2026-08-24 09:19:52.024635+00', '127', 12.700, 'A0', 310.000, '310', NULL, NULL, 'A', 11, 743, '{}');
INSERT INTO app.materials VALUES ('D02A0001-A125-310', '{"en": "CTS20D Black skin φ12.5x310", "ja": "CTS20D 黒皮 φ12.5×310"}', '本', true, NULL, '2026-08-24 09:19:52.024908+00', '2026-08-24 09:19:52.024908+00', '125', 12.500, 'A0', 310.000, '310', NULL, NULL, 'A', 11, 744, '{}');
INSERT INTO app.materials VALUES ('D02A0001-A120-310', '{"en": "CTS20D Black skin φ12.0x310", "ja": "CTS20D 黒皮 φ12.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.025184+00', '2026-08-24 09:19:52.025184+00', '120', 12.000, 'A0', 310.000, '310', NULL, NULL, 'A', 11, 745, '{}');
INSERT INTO app.materials VALUES ('D02A0001-A115-310', '{"en": "CTS20D Black skin φ11.5x310", "ja": "CTS20D 黒皮 φ11.5×310"}', '本', true, NULL, '2026-08-24 09:19:52.025476+00', '2026-08-24 09:19:52.025476+00', '115', 11.500, 'A0', 310.000, '310', NULL, NULL, 'A', 11, 746, '{}');
INSERT INTO app.materials VALUES ('D02A0001-A110-310', '{"en": "CTS20D Black skin φ11.0x310", "ja": "CTS20D 黒皮 φ11.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.025781+00', '2026-08-24 09:19:52.025781+00', '110', 11.000, 'A0', 310.000, '310', NULL, NULL, 'A', 11, 747, '{}');
INSERT INTO app.materials VALUES ('D02A0001-A105-310', '{"en": "CTS20D Black skin φ10.5x310", "ja": "CTS20D 黒皮 φ10.5×310"}', '本', true, NULL, '2026-08-24 09:19:52.026151+00', '2026-08-24 09:19:52.026151+00', '105', 10.500, 'A0', 310.000, '310', NULL, NULL, 'A', 11, 748, '{}');
INSERT INTO app.materials VALUES ('D02A0001-A100-310', '{"en": "CTS20D Black skin φ10.0x310", "ja": "CTS20D 黒皮 φ10.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.026452+00', '2026-08-24 09:19:52.026452+00', '100', 10.000, 'A0', 310.000, '310', NULL, NULL, 'A', 11, 749, '{}');
INSERT INTO app.materials VALUES ('D02A0001-A095-310', '{"en": "CTS20D Black skin φ9.5x310", "ja": "CTS20D 黒皮 φ9.5×310"}', '本', true, NULL, '2026-08-24 09:19:52.026748+00', '2026-08-24 09:19:52.026748+00', '095', 9.500, 'A0', 310.000, '310', NULL, NULL, 'A', 11, 750, '{}');
INSERT INTO app.materials VALUES ('D02A0001-A090-310', '{"en": "CTS20D Black skin φ9.0x310", "ja": "CTS20D 黒皮 φ9.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.027056+00', '2026-08-24 09:19:52.027056+00', '090', 9.000, 'A0', 310.000, '310', NULL, NULL, 'A', 11, 751, '{}');
INSERT INTO app.materials VALUES ('D02A0001-A085-310', '{"en": "CTS20D Black skin φ8.5x310", "ja": "CTS20D 黒皮 φ8.5×310"}', '本', true, NULL, '2026-08-24 09:19:52.027343+00', '2026-08-24 09:19:52.027343+00', '085', 8.500, 'A0', 310.000, '310', NULL, NULL, 'A', 11, 752, '{}');
INSERT INTO app.materials VALUES ('D02A0001-A080-310', '{"en": "CTS20D Black skin φ8.0x310", "ja": "CTS20D 黒皮 φ8.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.027613+00', '2026-08-24 09:19:52.027613+00', '080', 8.000, 'A0', 310.000, '310', NULL, NULL, 'A', 11, 753, '{}');
INSERT INTO app.materials VALUES ('D02A0001-A075-310', '{"en": "CTS20D Black skin φ7.5x310", "ja": "CTS20D 黒皮 φ7.5×310"}', '本', true, NULL, '2026-08-24 09:19:52.027893+00', '2026-08-24 09:19:52.027893+00', '075', 7.500, 'A0', 310.000, '310', NULL, NULL, 'A', 11, 754, '{}');
INSERT INTO app.materials VALUES ('D02A0001-A070-310', '{"en": "CTS20D Black skin φ7.0x310", "ja": "CTS20D 黒皮 φ7.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.028188+00', '2026-08-24 09:19:52.028188+00', '070', 7.000, 'A0', 310.000, '310', NULL, NULL, 'A', 11, 755, '{}');
INSERT INTO app.materials VALUES ('D02A0001-A065-310', '{"en": "CTS20D Black skin φ6.5x310", "ja": "CTS20D 黒皮 φ6.5×310"}', '本', true, NULL, '2026-08-24 09:19:52.028481+00', '2026-08-24 09:19:52.028481+00', '065', 6.500, 'A0', 310.000, '310', NULL, NULL, 'A', 11, 756, '{}');
INSERT INTO app.materials VALUES ('D02A0001-A064-310', '{"en": "CTS20D Black skin φ6.35x310", "ja": "CTS20D 黒皮 φ6.35×310"}', '本', true, NULL, '2026-08-24 09:19:52.028822+00', '2026-08-24 09:19:52.028822+00', '064', 6.350, 'A0', 310.000, '310', NULL, NULL, 'A', 11, 757, '{}');
INSERT INTO app.materials VALUES ('D02A0001-A060-310', '{"en": "CTS20D Black skin φ6.0x310", "ja": "CTS20D 黒皮 φ6.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.029123+00', '2026-08-24 09:19:52.029123+00', '060', 6.000, 'A0', 310.000, '310', NULL, NULL, 'A', 11, 758, '{}');
INSERT INTO app.materials VALUES ('D02A0001-A055-310', '{"en": "CTS20D Black skin φ5.5x310", "ja": "CTS20D 黒皮 φ5.5×310"}', '本', true, NULL, '2026-08-24 09:19:52.029386+00', '2026-08-24 09:19:52.029386+00', '055', 5.500, 'A0', 310.000, '310', NULL, NULL, 'A', 11, 759, '{}');
INSERT INTO app.materials VALUES ('D02A0001-A050-310', '{"en": "CTS20D Black skin φ5.0x310", "ja": "CTS20D 黒皮 φ5.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.029662+00', '2026-08-24 09:19:52.029662+00', '050', 5.000, 'A0', 310.000, '310', NULL, NULL, 'A', 11, 760, '{}');
INSERT INTO app.materials VALUES ('D02A0001-A045-310', '{"en": "CTS20D Black skin φ4.5x310", "ja": "CTS20D 黒皮 φ4.5×310"}', '本', true, NULL, '2026-08-24 09:19:52.029934+00', '2026-08-24 09:19:52.029934+00', '045', 4.500, 'A0', 310.000, '310', NULL, NULL, 'A', 11, 761, '{}');
INSERT INTO app.materials VALUES ('D02A0001-A040-310', '{"en": "CTS20D Black skin φ4.0x310", "ja": "CTS20D 黒皮 φ4.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.030202+00', '2026-08-24 09:19:52.030202+00', '040', 4.000, 'A0', 310.000, '310', NULL, NULL, 'A', 11, 762, '{}');
INSERT INTO app.materials VALUES ('D02A0001-A035-310', '{"en": "CTS20D Black skin φ3.5x310", "ja": "CTS20D 黒皮 φ3.5×310"}', '本', true, NULL, '2026-08-24 09:19:52.030469+00', '2026-08-24 09:19:52.030469+00', '035', 3.500, 'A0', 310.000, '310', NULL, NULL, 'A', 11, 763, '{}');
INSERT INTO app.materials VALUES ('D02A0001-A030-310', '{"en": "CTS20D Black skin φ3.0x310", "ja": "CTS20D 黒皮 φ3.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.03073+00', '2026-08-24 09:19:52.03073+00', '030', 3.000, 'A0', 310.000, '310', NULL, NULL, 'A', 11, 764, '{}');
INSERT INTO app.materials VALUES ('D02A0001-A025-310', '{"en": "CTS20D Black skin φ2.5x310", "ja": "CTS20D 黒皮 φ2.5×310"}', '本', true, NULL, '2026-08-24 09:19:52.031007+00', '2026-08-24 09:19:52.031007+00', '025', 2.500, 'A0', 310.000, '310', NULL, NULL, 'A', 11, 765, '{}');
INSERT INTO app.materials VALUES ('D02A0001-A020-310', '{"en": "CTS20D Black skin φ2.0x310", "ja": "CTS20D 黒皮 φ2.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.031283+00', '2026-08-24 09:19:52.031283+00', '020', 2.000, 'A0', 310.000, '310', NULL, NULL, 'A', 11, 766, '{}');
INSERT INTO app.materials VALUES ('D02A0001-A017-310', '{"en": "CTS20D Black skin φ1.7x310", "ja": "CTS20D 黒皮 φ1.7×310"}', '本', true, NULL, '2026-08-24 09:19:52.03157+00', '2026-08-24 09:19:52.03157+00', '017', 1.700, 'A0', 310.000, '310', NULL, NULL, 'A', 11, 767, '{}');
INSERT INTO app.materials VALUES ('D02A0001-A016-310', '{"en": "CTS20D Black skin φ1.55x310", "ja": "CTS20D 黒皮 φ1.55×310"}', '本', true, NULL, '2026-08-24 09:19:52.031876+00', '2026-08-24 09:19:52.031876+00', '016', 1.550, 'A0', 310.000, '310', NULL, NULL, 'A', 11, 768, '{}');
INSERT INTO app.materials VALUES ('D02A0001-A010-310', '{"en": "CTS20D Black skin φ1.0x310", "ja": "CTS20D 黒皮 φ1.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.032135+00', '2026-08-24 09:19:52.032135+00', '010', 1.000, 'A0', 310.000, '310', NULL, NULL, 'A', 11, 769, '{}');
INSERT INTO app.materials VALUES ('D02A0001-B400-310', '{"en": "CTS20D Polished φ40.0x310", "ja": "CTS20D 研磨 φ40.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.032421+00', '2026-08-24 09:19:52.032421+00', '400', 40.000, 'A0', 310.000, '310', NULL, NULL, 'B', 11, 770, '{}');
INSERT INTO app.materials VALUES ('D02A0001-B380-310', '{"en": "CTS20D Polished φ38.0x310", "ja": "CTS20D 研磨 φ38.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.0327+00', '2026-08-24 09:19:52.0327+00', '380', 38.000, 'A0', 310.000, '310', NULL, NULL, 'B', 11, 771, '{}');
INSERT INTO app.materials VALUES ('D02A0001-B320-310', '{"en": "CTS20D Polished φ32.0x310", "ja": "CTS20D 研磨 φ32.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.032994+00', '2026-08-24 09:19:52.032994+00', '320', 32.000, 'A0', 310.000, '310', NULL, NULL, 'B', 11, 772, '{}');
INSERT INTO app.materials VALUES ('D02A0001-B300-310', '{"en": "CTS20D Polished φ30.0x310", "ja": "CTS20D 研磨 φ30.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.033285+00', '2026-08-24 09:19:52.033285+00', '300', 30.000, 'A0', 310.000, '310', NULL, NULL, 'B', 11, 773, '{}');
INSERT INTO app.materials VALUES ('D02A0001-B280-310', '{"en": "CTS20D Polished φ28.0x310", "ja": "CTS20D 研磨 φ28.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.033576+00', '2026-08-24 09:19:52.033576+00', '280', 28.000, 'A0', 310.000, '310', NULL, NULL, 'B', 11, 774, '{}');
INSERT INTO app.materials VALUES ('D02A0001-B250-310', '{"en": "CTS20D Polished φ25.0x310", "ja": "CTS20D 研磨 φ25.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.033881+00', '2026-08-24 09:19:52.033881+00', '250', 25.000, 'A0', 310.000, '310', NULL, NULL, 'B', 11, 775, '{}');
INSERT INTO app.materials VALUES ('D02A0001-B240-310', '{"en": "CTS20D Polished φ24.0x310", "ja": "CTS20D 研磨 φ24.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.034154+00', '2026-08-24 09:19:52.034154+00', '240', 24.000, 'A0', 310.000, '310', NULL, NULL, 'B', 11, 776, '{}');
INSERT INTO app.materials VALUES ('D02A0001-B220-310', '{"en": "CTS20D Polished φ22.0x310", "ja": "CTS20D 研磨 φ22.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.034453+00', '2026-08-24 09:19:52.034453+00', '220', 22.000, 'A0', 310.000, '310', NULL, NULL, 'B', 11, 777, '{}');
INSERT INTO app.materials VALUES ('D02A0001-B200-310', '{"en": "CTS20D Polished φ20.0x310", "ja": "CTS20D 研磨 φ20.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.034724+00', '2026-08-24 09:19:52.034724+00', '200', 20.000, 'A0', 310.000, '310', NULL, NULL, 'B', 11, 778, '{}');
INSERT INTO app.materials VALUES ('D02A0001-B190-310', '{"en": "CTS20D Polished φ19.0x310", "ja": "CTS20D 研磨 φ19.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.035004+00', '2026-08-24 09:19:52.035004+00', '190', 19.000, 'A0', 310.000, '310', NULL, NULL, 'B', 11, 779, '{}');
INSERT INTO app.materials VALUES ('D02A0001-B180-310', '{"en": "CTS20D Polished φ18.0x310", "ja": "CTS20D 研磨 φ18.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.035304+00', '2026-08-24 09:19:52.035304+00', '180', 18.000, 'A0', 310.000, '310', NULL, NULL, 'B', 11, 780, '{}');
INSERT INTO app.materials VALUES ('D02A0001-B160-310', '{"en": "CTS20D Polished φ16.0x310", "ja": "CTS20D 研磨 φ16.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.0356+00', '2026-08-24 09:19:52.0356+00', '160', 16.000, 'A0', 310.000, '310', NULL, NULL, 'B', 11, 781, '{}');
INSERT INTO app.materials VALUES ('D02A0001-B150-310', '{"en": "CTS20D Polished φ15.0x310", "ja": "CTS20D 研磨 φ15.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.035913+00', '2026-08-24 09:19:52.035913+00', '150', 15.000, 'A0', 310.000, '310', NULL, NULL, 'B', 11, 782, '{}');
INSERT INTO app.materials VALUES ('D02A0001-B140-310', '{"en": "CTS20D Polished φ14.0x310", "ja": "CTS20D 研磨 φ14.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.036245+00', '2026-08-24 09:19:52.036245+00', '140', 14.000, 'A0', 310.000, '310', NULL, NULL, 'B', 11, 783, '{}');
INSERT INTO app.materials VALUES ('D02A0001-B130-310', '{"en": "CTS20D Polished φ13.0x310", "ja": "CTS20D 研磨 φ13.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.036566+00', '2026-08-24 09:19:52.036566+00', '130', 13.000, 'A0', 310.000, '310', NULL, NULL, 'B', 11, 784, '{}');
INSERT INTO app.materials VALUES ('D02A0001-B120-310', '{"en": "CTS20D Polished φ12.0x310", "ja": "CTS20D 研磨 φ12.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.036849+00', '2026-08-24 09:19:52.036849+00', '120', 12.000, 'A0', 310.000, '310', NULL, NULL, 'B', 11, 785, '{}');
INSERT INTO app.materials VALUES ('D02A0001-B110-310', '{"en": "CTS20D Polished φ11.0x310", "ja": "CTS20D 研磨 φ11.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.037188+00', '2026-08-24 09:19:52.037188+00', '110', 11.000, 'A0', 310.000, '310', NULL, NULL, 'B', 11, 786, '{}');
INSERT INTO app.materials VALUES ('D02A0001-B100-310', '{"en": "CTS20D Polished φ10.0x310", "ja": "CTS20D 研磨 φ10.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.037512+00', '2026-08-24 09:19:52.037512+00', '100', 10.000, 'A0', 310.000, '310', NULL, NULL, 'B', 11, 787, '{}');
INSERT INTO app.materials VALUES ('D02A0001-B095-310', '{"en": "CTS20D Polished φ9.5x310", "ja": "CTS20D 研磨 φ9.5×310"}', '本', true, NULL, '2026-08-24 09:19:52.037816+00', '2026-08-24 09:19:52.037816+00', '095', 9.500, 'A0', 310.000, '310', NULL, NULL, 'B', 11, 788, '{}');
INSERT INTO app.materials VALUES ('D02A0001-B090-310', '{"en": "CTS20D Polished φ9.0x310", "ja": "CTS20D 研磨 φ9.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.038119+00', '2026-08-24 09:19:52.038119+00', '090', 9.000, 'A0', 310.000, '310', NULL, NULL, 'B', 11, 789, '{}');
INSERT INTO app.materials VALUES ('D02A0001-B085-310', '{"en": "CTS20D Polished φ8.5x310", "ja": "CTS20D 研磨 φ8.5×310"}', '本', true, NULL, '2026-08-24 09:19:52.038416+00', '2026-08-24 09:19:52.038416+00', '085', 8.500, 'A0', 310.000, '310', NULL, NULL, 'B', 11, 790, '{}');
INSERT INTO app.materials VALUES ('D02A0001-B080-310', '{"en": "CTS20D Polished φ8.0x310", "ja": "CTS20D 研磨 φ8.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.038704+00', '2026-08-24 09:19:52.038704+00', '080', 8.000, 'A0', 310.000, '310', NULL, NULL, 'B', 11, 791, '{}');
INSERT INTO app.materials VALUES ('D02A0001-B075-310', '{"en": "CTS20D Polished φ7.5x310", "ja": "CTS20D 研磨 φ7.5×310"}', '本', true, NULL, '2026-08-24 09:19:52.038981+00', '2026-08-24 09:19:52.038981+00', '075', 7.500, 'A0', 310.000, '310', NULL, NULL, 'B', 11, 792, '{}');
INSERT INTO app.materials VALUES ('D02A0001-B070-310', '{"en": "CTS20D Polished φ7.0x310", "ja": "CTS20D 研磨 φ7.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.039265+00', '2026-08-24 09:19:52.039265+00', '070', 7.000, 'A0', 310.000, '310', NULL, NULL, 'B', 11, 793, '{}');
INSERT INTO app.materials VALUES ('D02A0001-B065-310', '{"en": "CTS20D Polished φ6.5x310", "ja": "CTS20D 研磨 φ6.5×310"}', '本', true, NULL, '2026-08-24 09:19:52.039612+00', '2026-08-24 09:19:52.039612+00', '065', 6.500, 'A0', 310.000, '310', NULL, NULL, 'B', 11, 794, '{}');
INSERT INTO app.materials VALUES ('D02A0001-B060-310', '{"en": "CTS20D Polished φ6.0x310", "ja": "CTS20D 研磨 φ6.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.039925+00', '2026-08-24 09:19:52.039925+00', '060', 6.000, 'A0', 310.000, '310', NULL, NULL, 'B', 11, 795, '{}');
INSERT INTO app.materials VALUES ('D02A0001-B055-310', '{"en": "CTS20D Polished φ5.5x310", "ja": "CTS20D 研磨 φ5.5×310"}', '本', true, NULL, '2026-08-24 09:19:52.040235+00', '2026-08-24 09:19:52.040235+00', '055', 5.500, 'A0', 310.000, '310', NULL, NULL, 'B', 11, 796, '{}');
INSERT INTO app.materials VALUES ('D02A0001-B050-310', '{"en": "CTS20D Polished φ5.0x310", "ja": "CTS20D 研磨 φ5.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.040531+00', '2026-08-24 09:19:52.040531+00', '050', 5.000, 'A0', 310.000, '310', NULL, NULL, 'B', 11, 797, '{}');
INSERT INTO app.materials VALUES ('D02A0001-B045-310', '{"en": "CTS20D Polished φ4.5x310", "ja": "CTS20D 研磨 φ4.5×310"}', '本', true, NULL, '2026-08-24 09:19:52.040811+00', '2026-08-24 09:19:52.040811+00', '045', 4.500, 'A0', 310.000, '310', NULL, NULL, 'B', 11, 798, '{}');
INSERT INTO app.materials VALUES ('D02A0001-B040-310', '{"en": "CTS20D Polished φ4.0x310", "ja": "CTS20D 研磨 φ4.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.041105+00', '2026-08-24 09:19:52.041105+00', '040', 4.000, 'A0', 310.000, '310', NULL, NULL, 'B', 11, 799, '{}');
INSERT INTO app.materials VALUES ('D02A0001-B035-310', '{"en": "CTS20D Polished φ3.5x310", "ja": "CTS20D 研磨 φ3.5×310"}', '本', true, NULL, '2026-08-24 09:19:52.041399+00', '2026-08-24 09:19:52.041399+00', '035', 3.500, 'A0', 310.000, '310', NULL, NULL, 'B', 11, 800, '{}');
INSERT INTO app.materials VALUES ('D02A0001-B030-310', '{"en": "CTS20D Polished φ3.0x310", "ja": "CTS20D 研磨 φ3.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.041692+00', '2026-08-24 09:19:52.041692+00', '030', 3.000, 'A0', 310.000, '310', NULL, NULL, 'B', 11, 801, '{}');
INSERT INTO app.materials VALUES ('D02A0001-B025-310', '{"en": "CTS20D Polished φ2.5x310", "ja": "CTS20D 研磨 φ2.5×310"}', '本', true, NULL, '2026-08-24 09:19:52.041963+00', '2026-08-24 09:19:52.041963+00', '025', 2.500, 'A0', 310.000, '310', NULL, NULL, 'B', 11, 802, '{}');
INSERT INTO app.materials VALUES ('D02A0001-B020-310', '{"en": "CTS20D Polished φ2.0x310", "ja": "CTS20D 研磨 φ2.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.042236+00', '2026-08-24 09:19:52.042236+00', '020', 2.000, 'A0', 310.000, '310', NULL, NULL, 'B', 11, 803, '{}');
INSERT INTO app.materials VALUES ('D02A0001-B015-310', '{"en": "CTS20D Polished φ1.5x310", "ja": "CTS20D 研磨 φ1.5×310"}', '本', true, NULL, '2026-08-24 09:19:52.042519+00', '2026-08-24 09:19:52.042519+00', '015', 1.500, 'A0', 310.000, '310', NULL, NULL, 'B', 11, 804, '{}');
INSERT INTO app.materials VALUES ('D02A0001-B010-310', '{"en": "CTS20D Polished φ1.0x310", "ja": "CTS20D 研磨 φ1.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.042789+00', '2026-08-24 09:19:52.042789+00', '010', 1.000, 'A0', 310.000, '310', NULL, NULL, 'B', 11, 805, '{}');
INSERT INTO app.materials VALUES ('D01A0001-A200-310', '{"en": "CTS12D Black skin φ20.0x310", "ja": "CTS12D 黒皮 φ20.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.043073+00', '2026-08-24 09:19:52.043073+00', '200', 20.000, 'A0', 310.000, '310', NULL, NULL, 'A', 10, 806, '{}');
INSERT INTO app.materials VALUES ('D01A0001-A180-310', '{"en": "CTS12D Black skin φ18.0x310", "ja": "CTS12D 黒皮 φ18.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.043375+00', '2026-08-24 09:19:52.043375+00', '180', 18.000, 'A0', 310.000, '310', NULL, NULL, 'A', 10, 807, '{}');
INSERT INTO app.materials VALUES ('D01A0001-A160-310', '{"en": "CTS12D Black skin φ16.0x310", "ja": "CTS12D 黒皮 φ16.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.043656+00', '2026-08-24 09:19:52.043656+00', '160', 16.000, 'A0', 310.000, '310', NULL, NULL, 'A', 10, 808, '{}');
INSERT INTO app.materials VALUES ('D01A0001-A140-310', '{"en": "CTS12D Black skin φ14.0x310", "ja": "CTS12D 黒皮 φ14.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.043935+00', '2026-08-24 09:19:52.043935+00', '140', 14.000, 'A0', 310.000, '310', NULL, NULL, 'A', 10, 809, '{}');
INSERT INTO app.materials VALUES ('D01A0001-A120-310', '{"en": "CTS12D Black skin φ12.0x310", "ja": "CTS12D 黒皮 φ12.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.044253+00', '2026-08-24 09:19:52.044253+00', '120', 12.000, 'A0', 310.000, '310', NULL, NULL, 'A', 10, 810, '{}');
INSERT INTO app.materials VALUES ('D01A0001-A100-310', '{"en": "CTS12D Black skin φ10.0x310", "ja": "CTS12D 黒皮 φ10.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.044534+00', '2026-08-24 09:19:52.044534+00', '100', 10.000, 'A0', 310.000, '310', NULL, NULL, 'A', 10, 811, '{}');
INSERT INTO app.materials VALUES ('D01A0001-A080-310', '{"en": "CTS12D Black skin φ8.0x310", "ja": "CTS12D 黒皮 φ8.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.044828+00', '2026-08-24 09:19:52.044828+00', '080', 8.000, 'A0', 310.000, '310', NULL, NULL, 'A', 10, 812, '{}');
INSERT INTO app.materials VALUES ('D01A0001-A060-310', '{"en": "CTS12D Black skin φ6.0x310", "ja": "CTS12D 黒皮 φ6.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.045114+00', '2026-08-24 09:19:52.045114+00', '060', 6.000, 'A0', 310.000, '310', NULL, NULL, 'A', 10, 813, '{}');
INSERT INTO app.materials VALUES ('D01A0001-A050-310', '{"en": "CTS12D Black skin φ5.0x310", "ja": "CTS12D 黒皮 φ5.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.045384+00', '2026-08-24 09:19:52.045384+00', '050', 5.000, 'A0', 310.000, '310', NULL, NULL, 'A', 10, 814, '{}');
INSERT INTO app.materials VALUES ('D01A0001-A040-310', '{"en": "CTS12D Black skin φ4.0x310", "ja": "CTS12D 黒皮 φ4.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.045667+00', '2026-08-24 09:19:52.045667+00', '040', 4.000, 'A0', 310.000, '310', NULL, NULL, 'A', 10, 815, '{}');
INSERT INTO app.materials VALUES ('D01A0001-A030-310', '{"en": "CTS12D Black skin φ3.0x310", "ja": "CTS12D 黒皮 φ3.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.045933+00', '2026-08-24 09:19:52.045933+00', '030', 3.000, 'A0', 310.000, '310', NULL, NULL, 'A', 10, 816, '{}');
INSERT INTO app.materials VALUES ('D01A0001-A020-310', '{"en": "CTS12D Black skin φ2.0x310", "ja": "CTS12D 黒皮 φ2.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.046198+00', '2026-08-24 09:19:52.046198+00', '020', 2.000, 'A0', 310.000, '310', NULL, NULL, 'A', 10, 817, '{}');
INSERT INTO app.materials VALUES ('D01A0001-A010-310', '{"en": "CTS12D Black skin φ1.0x310", "ja": "CTS12D 黒皮 φ1.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.046473+00', '2026-08-24 09:19:52.046473+00', '010', 1.000, 'A0', 310.000, '310', NULL, NULL, 'A', 10, 818, '{}');
INSERT INTO app.materials VALUES ('D01A0001-B200-310', '{"en": "CTS12D Polished φ20.0x310", "ja": "CTS12D 研磨 φ20.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.046747+00', '2026-08-24 09:19:52.046747+00', '200', 20.000, 'A0', 310.000, '310', NULL, NULL, 'B', 10, 819, '{}');
INSERT INTO app.materials VALUES ('D01A0001-B160-310', '{"en": "CTS12D Polished φ16.0x310", "ja": "CTS12D 研磨 φ16.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.047024+00', '2026-08-24 09:19:52.047024+00', '160', 16.000, 'A0', 310.000, '310', NULL, NULL, 'B', 10, 820, '{}');
INSERT INTO app.materials VALUES ('D01A0001-B140-310', '{"en": "CTS12D Polished φ14.0x310", "ja": "CTS12D 研磨 φ14.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.047309+00', '2026-08-24 09:19:52.047309+00', '140', 14.000, 'A0', 310.000, '310', NULL, NULL, 'B', 10, 821, '{}');
INSERT INTO app.materials VALUES ('D01A0001-B120-310', '{"en": "CTS12D Polished φ12.0x310", "ja": "CTS12D 研磨 φ12.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.047603+00', '2026-08-24 09:19:52.047603+00', '120', 12.000, 'A0', 310.000, '310', NULL, NULL, 'B', 10, 822, '{}');
INSERT INTO app.materials VALUES ('D01A0001-B100-310', '{"en": "CTS12D Polished φ10.0x310", "ja": "CTS12D 研磨 φ10.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.047871+00', '2026-08-24 09:19:52.047871+00', '100', 10.000, 'A0', 310.000, '310', NULL, NULL, 'B', 10, 823, '{}');
INSERT INTO app.materials VALUES ('D01A0001-B080-310', '{"en": "CTS12D Polished φ8.0x310", "ja": "CTS12D 研磨 φ8.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.048142+00', '2026-08-24 09:19:52.048142+00', '080', 8.000, 'A0', 310.000, '310', NULL, NULL, 'B', 10, 824, '{}');
INSERT INTO app.materials VALUES ('D01A0001-B060-310', '{"en": "CTS12D Polished φ6.0x310", "ja": "CTS12D 研磨 φ6.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.04841+00', '2026-08-24 09:19:52.04841+00', '060', 6.000, 'A0', 310.000, '310', NULL, NULL, 'B', 10, 825, '{}');
INSERT INTO app.materials VALUES ('D01A0001-B040-310', '{"en": "CTS12D Polished φ4.0x310", "ja": "CTS12D 研磨 φ4.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.048676+00', '2026-08-24 09:19:52.048676+00', '040', 4.000, 'A0', 310.000, '310', NULL, NULL, 'B', 10, 826, '{}');
INSERT INTO app.materials VALUES ('D01A0001-B030-310', '{"en": "CTS12D Polished φ3.0x310", "ja": "CTS12D 研磨 φ3.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.048962+00', '2026-08-24 09:19:52.048962+00', '030', 3.000, 'A0', 310.000, '310', NULL, NULL, 'B', 10, 827, '{}');
INSERT INTO app.materials VALUES ('C01A0001-A030-330', '{"en": "GU20F Black skin φ3.0x330", "ja": "GU20F 黒皮 φ3.0×330"}', '本', true, NULL, '2026-08-24 09:19:52.049231+00', '2026-08-24 09:19:52.049231+00', '030', 3.000, 'A0', 330.000, '330', NULL, NULL, 'A', 13, 828, '{}');
INSERT INTO app.materials VALUES ('C01A0001-A040-330', '{"en": "GU20F Black skin φ4.0x330", "ja": "GU20F 黒皮 φ4.0×330"}', '本', true, NULL, '2026-08-24 09:19:52.049492+00', '2026-08-24 09:19:52.049492+00', '040', 4.000, 'A0', 330.000, '330', NULL, NULL, 'A', 13, 829, '{}');
INSERT INTO app.materials VALUES ('C01A0001-A050-330', '{"en": "GU20F Black skin φ5.0x330", "ja": "GU20F 黒皮 φ5.0×330"}', '本', true, NULL, '2026-08-24 09:19:52.049772+00', '2026-08-24 09:19:52.049772+00', '050', 5.000, 'A0', 330.000, '330', NULL, NULL, 'A', 13, 830, '{}');
INSERT INTO app.materials VALUES ('C01A0001-A060-330', '{"en": "GU20F Black skin φ6.0x330", "ja": "GU20F 黒皮 φ6.0×330"}', '本', true, NULL, '2026-08-24 09:19:52.050058+00', '2026-08-24 09:19:52.050058+00', '060', 6.000, 'A0', 330.000, '330', NULL, NULL, 'A', 13, 831, '{}');
INSERT INTO app.materials VALUES ('C01A0001-A070-330', '{"en": "GU20F Black skin φ7.0x330", "ja": "GU20F 黒皮 φ7.0×330"}', '本', true, NULL, '2026-08-24 09:19:52.050332+00', '2026-08-24 09:19:52.050332+00', '070', 7.000, 'A0', 330.000, '330', NULL, NULL, 'A', 13, 832, '{}');
INSERT INTO app.materials VALUES ('C01A0001-A080-330', '{"en": "GU20F Black skin φ8.0x330", "ja": "GU20F 黒皮 φ8.0×330"}', '本', true, NULL, '2026-08-24 09:19:52.050584+00', '2026-08-24 09:19:52.050584+00', '080', 8.000, 'A0', 330.000, '330', NULL, NULL, 'A', 13, 833, '{}');
INSERT INTO app.materials VALUES ('C01A0001-A090-330', '{"en": "GU20F Black skin φ9.0x330", "ja": "GU20F 黒皮 φ9.0×330"}', '本', true, NULL, '2026-08-24 09:19:52.050844+00', '2026-08-24 09:19:52.050844+00', '090', 9.000, 'A0', 330.000, '330', NULL, NULL, 'A', 13, 834, '{}');
INSERT INTO app.materials VALUES ('C01A0001-A100-330', '{"en": "GU20F Black skin φ10.0x330", "ja": "GU20F 黒皮 φ10.0×330"}', '本', true, NULL, '2026-08-24 09:19:52.051096+00', '2026-08-24 09:19:52.051096+00', '100', 10.000, 'A0', 330.000, '330', NULL, NULL, 'A', 13, 835, '{}');
INSERT INTO app.materials VALUES ('C01A0001-A110-330', '{"en": "GU20F Black skin φ11.0x330", "ja": "GU20F 黒皮 φ11.0×330"}', '本', true, NULL, '2026-08-24 09:19:52.051348+00', '2026-08-24 09:19:52.051348+00', '110', 11.000, 'A0', 330.000, '330', NULL, NULL, 'A', 13, 836, '{}');
INSERT INTO app.materials VALUES ('C01A0001-A120-330', '{"en": "GU20F Black skin φ12.0x330", "ja": "GU20F 黒皮 φ12.0×330"}', '本', true, NULL, '2026-08-24 09:19:52.051596+00', '2026-08-24 09:19:52.051596+00', '120', 12.000, 'A0', 330.000, '330', NULL, NULL, 'A', 13, 837, '{}');
INSERT INTO app.materials VALUES ('C01A0001-A130-330', '{"en": "GU20F Black skin φ13.0x330", "ja": "GU20F 黒皮 φ13.0×330"}', '本', true, NULL, '2026-08-24 09:19:52.051865+00', '2026-08-24 09:19:52.051865+00', '130', 13.000, 'A0', 330.000, '330', NULL, NULL, 'A', 13, 838, '{}');
INSERT INTO app.materials VALUES ('C01A0001-A140-330', '{"en": "GU20F Black skin φ14.0x330", "ja": "GU20F 黒皮 φ14.0×330"}', '本', true, NULL, '2026-08-24 09:19:52.052139+00', '2026-08-24 09:19:52.052139+00', '140', 14.000, 'A0', 330.000, '330', NULL, NULL, 'A', 13, 839, '{}');
INSERT INTO app.materials VALUES ('C01A0001-A150-330', '{"en": "GU20F Black skin φ15.0x330", "ja": "GU20F 黒皮 φ15.0×330"}', '本', true, NULL, '2026-08-24 09:19:52.052419+00', '2026-08-24 09:19:52.052419+00', '150', 15.000, 'A0', 330.000, '330', NULL, NULL, 'A', 13, 840, '{}');
INSERT INTO app.materials VALUES ('C01A0001-A160-330', '{"en": "GU20F Black skin φ16.0x330", "ja": "GU20F 黒皮 φ16.0×330"}', '本', true, NULL, '2026-08-24 09:19:52.052701+00', '2026-08-24 09:19:52.052701+00', '160', 16.000, 'A0', 330.000, '330', NULL, NULL, 'A', 13, 841, '{}');
INSERT INTO app.materials VALUES ('C01A0001-A170-330', '{"en": "GU20F Black skin φ17.0x330", "ja": "GU20F 黒皮 φ17.0×330"}', '本', true, NULL, '2026-08-24 09:19:52.05305+00', '2026-08-24 09:19:52.05305+00', '170', 17.000, 'A0', 330.000, '330', NULL, NULL, 'A', 13, 842, '{}');
INSERT INTO app.materials VALUES ('C01A0001-A180-330', '{"en": "GU20F Black skin φ18.0x330", "ja": "GU20F 黒皮 φ18.0×330"}', '本', true, NULL, '2026-08-24 09:19:52.053334+00', '2026-08-24 09:19:52.053334+00', '180', 18.000, 'A0', 330.000, '330', NULL, NULL, 'A', 13, 843, '{}');
INSERT INTO app.materials VALUES ('C01A0001-A190-330', '{"en": "GU20F Black skin φ19.0x330", "ja": "GU20F 黒皮 φ19.0×330"}', '本', true, NULL, '2026-08-24 09:19:52.053633+00', '2026-08-24 09:19:52.053633+00', '190', 19.000, 'A0', 330.000, '330', NULL, NULL, 'A', 13, 844, '{}');
INSERT INTO app.materials VALUES ('C01A0001-A200-330', '{"en": "GU20F Black skin φ20.0x330", "ja": "GU20F 黒皮 φ20.0×330"}', '本', true, NULL, '2026-08-24 09:19:52.053925+00', '2026-08-24 09:19:52.053925+00', '200', 20.000, 'A0', 330.000, '330', NULL, NULL, 'A', 13, 845, '{}');
INSERT INTO app.materials VALUES ('C01A0001-A210-330', '{"en": "GU20F Black skin φ21.0x330", "ja": "GU20F 黒皮 φ21.0×330"}', '本', true, NULL, '2026-08-24 09:19:52.054196+00', '2026-08-24 09:19:52.054196+00', '210', 21.000, 'A0', 330.000, '330', NULL, NULL, 'A', 13, 846, '{}');
INSERT INTO app.materials VALUES ('C01A0001-A220-330', '{"en": "GU20F Black skin φ22.0x330", "ja": "GU20F 黒皮 φ22.0×330"}', '本', true, NULL, '2026-08-24 09:19:52.054471+00', '2026-08-24 09:19:52.054471+00', '220', 22.000, 'A0', 330.000, '330', NULL, NULL, 'A', 13, 847, '{}');
INSERT INTO app.materials VALUES ('C01A0001-A230-330', '{"en": "GU20F Black skin φ23.0x330", "ja": "GU20F 黒皮 φ23.0×330"}', '本', true, NULL, '2026-08-24 09:19:52.054738+00', '2026-08-24 09:19:52.054738+00', '230', 23.000, 'A0', 330.000, '330', NULL, NULL, 'A', 13, 848, '{}');
INSERT INTO app.materials VALUES ('C01A0001-A240-330', '{"en": "GU20F Black skin φ24.0x330", "ja": "GU20F 黒皮 φ24.0×330"}', '本', true, NULL, '2026-08-24 09:19:52.055087+00', '2026-08-24 09:19:52.055087+00', '240', 24.000, 'A0', 330.000, '330', NULL, NULL, 'A', 13, 849, '{}');
INSERT INTO app.materials VALUES ('C01A0001-A250-330', '{"en": "GU20F Black skin φ25.0x330", "ja": "GU20F 黒皮 φ25.0×330"}', '本', true, NULL, '2026-08-24 09:19:52.055391+00', '2026-08-24 09:19:52.055391+00', '250', 25.000, 'A0', 330.000, '330', NULL, NULL, 'A', 13, 850, '{}');
INSERT INTO app.materials VALUES ('C01A0001-A260-330', '{"en": "GU20F Black skin φ26.0x330", "ja": "GU20F 黒皮 φ26.0×330"}', '本', true, NULL, '2026-08-24 09:19:52.055668+00', '2026-08-24 09:19:52.055668+00', '260', 26.000, 'A0', 330.000, '330', NULL, NULL, 'A', 13, 851, '{}');
INSERT INTO app.materials VALUES ('C01A0001-A270-330', '{"en": "GU20F Black skin φ27.0x330", "ja": "GU20F 黒皮 φ27.0×330"}', '本', true, NULL, '2026-08-24 09:19:52.055951+00', '2026-08-24 09:19:52.055951+00', '270', 27.000, 'A0', 330.000, '330', NULL, NULL, 'A', 13, 852, '{}');
INSERT INTO app.materials VALUES ('C01A0001-A280-330', '{"en": "GU20F Black skin φ28.0x330", "ja": "GU20F 黒皮 φ28.0×330"}', '本', true, NULL, '2026-08-24 09:19:52.056228+00', '2026-08-24 09:19:52.056228+00', '280', 28.000, 'A0', 330.000, '330', NULL, NULL, 'A', 13, 853, '{}');
INSERT INTO app.materials VALUES ('C01A0001-A290-330', '{"en": "GU20F Black skin φ29.0x330", "ja": "GU20F 黒皮 φ29.0×330"}', '本', true, NULL, '2026-08-24 09:19:52.056516+00', '2026-08-24 09:19:52.056516+00', '290', 29.000, 'A0', 330.000, '330', NULL, NULL, 'A', 13, 854, '{}');
INSERT INTO app.materials VALUES ('C01A0001-A300-330', '{"en": "GU20F Black skin φ30.0x330", "ja": "GU20F 黒皮 φ30.0×330"}', '本', true, NULL, '2026-08-24 09:19:52.056789+00', '2026-08-24 09:19:52.056789+00', '300', 30.000, 'A0', 330.000, '330', NULL, NULL, 'A', 13, 855, '{}');
INSERT INTO app.materials VALUES ('C01A0001-A310-330', '{"en": "GU20F Black skin φ31.0x330", "ja": "GU20F 黒皮 φ31.0×330"}', '本', true, NULL, '2026-08-24 09:19:52.057129+00', '2026-08-24 09:19:52.057129+00', '310', 31.000, 'A0', 330.000, '330', NULL, NULL, 'A', 13, 856, '{}');
INSERT INTO app.materials VALUES ('C01A0001-A320-330', '{"en": "GU20F Black skin φ32.0x330", "ja": "GU20F 黒皮 φ32.0×330"}', '本', true, NULL, '2026-08-24 09:19:52.057456+00', '2026-08-24 09:19:52.057456+00', '320', 32.000, 'A0', 330.000, '330', NULL, NULL, 'A', 13, 857, '{}');
INSERT INTO app.materials VALUES ('C01A0001-A330-330', '{"en": "GU20F Black skin φ33.0x330", "ja": "GU20F 黒皮 φ33.0×330"}', '本', true, NULL, '2026-08-24 09:19:52.057732+00', '2026-08-24 09:19:52.057732+00', '330', 33.000, 'A0', 330.000, '330', NULL, NULL, 'A', 13, 858, '{}');
INSERT INTO app.materials VALUES ('C01A0001-A340-330', '{"en": "GU20F Black skin φ34.0x330", "ja": "GU20F 黒皮 φ34.0×330"}', '本', true, NULL, '2026-08-24 09:19:52.058037+00', '2026-08-24 09:19:52.058037+00', '340', 34.000, 'A0', 330.000, '330', NULL, NULL, 'A', 13, 859, '{}');
INSERT INTO app.materials VALUES ('C01A0001-A350-330', '{"en": "GU20F Black skin φ35.0x330", "ja": "GU20F 黒皮 φ35.0×330"}', '本', true, NULL, '2026-08-24 09:19:52.058403+00', '2026-08-24 09:19:52.058403+00', '350', 35.000, 'A0', 330.000, '330', NULL, NULL, 'A', 13, 860, '{}');
INSERT INTO app.materials VALUES ('C01A0001-B030-330', '{"en": "GU20F Polished φ3.0x330", "ja": "GU20F 研磨 φ3.0×330"}', '本', true, NULL, '2026-08-24 09:19:52.058716+00', '2026-08-24 09:19:52.058716+00', '030', 3.000, 'A0', 330.000, '330', NULL, NULL, 'B', 13, 861, '{}');
INSERT INTO app.materials VALUES ('C01A0001-B040-330', '{"en": "GU20F Polished φ4.0x330", "ja": "GU20F 研磨 φ4.0×330"}', '本', true, NULL, '2026-08-24 09:19:52.05903+00', '2026-08-24 09:19:52.05903+00', '040', 4.000, 'A0', 330.000, '330', NULL, NULL, 'B', 13, 862, '{}');
INSERT INTO app.materials VALUES ('C01A0001-B050-330', '{"en": "GU20F Polished φ5.0x330", "ja": "GU20F 研磨 φ5.0×330"}', '本', true, NULL, '2026-08-24 09:19:52.059346+00', '2026-08-24 09:19:52.059346+00', '050', 5.000, 'A0', 330.000, '330', NULL, NULL, 'B', 13, 863, '{}');
INSERT INTO app.materials VALUES ('C01A0001-B060-330', '{"en": "GU20F Polished φ6.0x330", "ja": "GU20F 研磨 φ6.0×330"}', '本', true, NULL, '2026-08-24 09:19:52.059639+00', '2026-08-24 09:19:52.059639+00', '060', 6.000, 'A0', 330.000, '330', NULL, NULL, 'B', 13, 864, '{}');
INSERT INTO app.materials VALUES ('C01A0001-B070-330', '{"en": "GU20F Polished φ7.0x330", "ja": "GU20F 研磨 φ7.0×330"}', '本', true, NULL, '2026-08-24 09:19:52.059911+00', '2026-08-24 09:19:52.059911+00', '070', 7.000, 'A0', 330.000, '330', NULL, NULL, 'B', 13, 865, '{}');
INSERT INTO app.materials VALUES ('C01A0001-B080-330', '{"en": "GU20F Polished φ8.0x330", "ja": "GU20F 研磨 φ8.0×330"}', '本', true, NULL, '2026-08-24 09:19:52.060201+00', '2026-08-24 09:19:52.060201+00', '080', 8.000, 'A0', 330.000, '330', NULL, NULL, 'B', 13, 866, '{}');
INSERT INTO app.materials VALUES ('C01A0001-B090-330', '{"en": "GU20F Polished φ9.0x330", "ja": "GU20F 研磨 φ9.0×330"}', '本', true, NULL, '2026-08-24 09:19:52.060478+00', '2026-08-24 09:19:52.060478+00', '090', 9.000, 'A0', 330.000, '330', NULL, NULL, 'B', 13, 867, '{}');
INSERT INTO app.materials VALUES ('C01A0001-B100-330', '{"en": "GU20F Polished φ10.0x330", "ja": "GU20F 研磨 φ10.0×330"}', '本', true, NULL, '2026-08-24 09:19:52.060808+00', '2026-08-24 09:19:52.060808+00', '100', 10.000, 'A0', 330.000, '330', NULL, NULL, 'B', 13, 868, '{}');
INSERT INTO app.materials VALUES ('C01A0001-B110-330', '{"en": "GU20F Polished φ11.0x330", "ja": "GU20F 研磨 φ11.0×330"}', '本', true, NULL, '2026-08-24 09:19:52.061131+00', '2026-08-24 09:19:52.061131+00', '110', 11.000, 'A0', 330.000, '330', NULL, NULL, 'B', 13, 869, '{}');
INSERT INTO app.materials VALUES ('C01A0001-B120-330', '{"en": "GU20F Polished φ12.0x330", "ja": "GU20F 研磨 φ12.0×330"}', '本', true, NULL, '2026-08-24 09:19:52.061425+00', '2026-08-24 09:19:52.061425+00', '120', 12.000, 'A0', 330.000, '330', NULL, NULL, 'B', 13, 870, '{}');
INSERT INTO app.materials VALUES ('C01A0001-B130-330', '{"en": "GU20F Polished φ13.0x330", "ja": "GU20F 研磨 φ13.0×330"}', '本', true, NULL, '2026-08-24 09:19:52.061693+00', '2026-08-24 09:19:52.061693+00', '130', 13.000, 'A0', 330.000, '330', NULL, NULL, 'B', 13, 871, '{}');
INSERT INTO app.materials VALUES ('C01A0001-B140-330', '{"en": "GU20F Polished φ14.0x330", "ja": "GU20F 研磨 φ14.0×330"}', '本', true, NULL, '2026-08-24 09:19:52.061961+00', '2026-08-24 09:19:52.061961+00', '140', 14.000, 'A0', 330.000, '330', NULL, NULL, 'B', 13, 872, '{}');
INSERT INTO app.materials VALUES ('C01A0001-B150-330', '{"en": "GU20F Polished φ15.0x330", "ja": "GU20F 研磨 φ15.0×330"}', '本', true, NULL, '2026-08-24 09:19:52.062251+00', '2026-08-24 09:19:52.062251+00', '150', 15.000, 'A0', 330.000, '330', NULL, NULL, 'B', 13, 873, '{}');
INSERT INTO app.materials VALUES ('C01A0001-B160-330', '{"en": "GU20F Polished φ16.0x330", "ja": "GU20F 研磨 φ16.0×330"}', '本', true, NULL, '2026-08-24 09:19:52.062516+00', '2026-08-24 09:19:52.062516+00', '160', 16.000, 'A0', 330.000, '330', NULL, NULL, 'B', 13, 874, '{}');
INSERT INTO app.materials VALUES ('C01A0001-B170-330', '{"en": "GU20F Polished φ17.0x330", "ja": "GU20F 研磨 φ17.0×330"}', '本', true, NULL, '2026-08-24 09:19:52.062784+00', '2026-08-24 09:19:52.062784+00', '170', 17.000, 'A0', 330.000, '330', NULL, NULL, 'B', 13, 875, '{}');
INSERT INTO app.materials VALUES ('C01A0001-B180-330', '{"en": "GU20F Polished φ18.0x330", "ja": "GU20F 研磨 φ18.0×330"}', '本', true, NULL, '2026-08-24 09:19:52.063072+00', '2026-08-24 09:19:52.063072+00', '180', 18.000, 'A0', 330.000, '330', NULL, NULL, 'B', 13, 876, '{}');
INSERT INTO app.materials VALUES ('C01A0001-B190-330', '{"en": "GU20F Polished φ19.0x330", "ja": "GU20F 研磨 φ19.0×330"}', '本', true, NULL, '2026-08-24 09:19:52.063342+00', '2026-08-24 09:19:52.063342+00', '190', 19.000, 'A0', 330.000, '330', NULL, NULL, 'B', 13, 877, '{}');
INSERT INTO app.materials VALUES ('C01A0001-B200-330', '{"en": "GU20F Polished φ20.0x330", "ja": "GU20F 研磨 φ20.0×330"}', '本', true, NULL, '2026-08-24 09:19:52.063632+00', '2026-08-24 09:19:52.063632+00', '200', 20.000, 'A0', 330.000, '330', NULL, NULL, 'B', 13, 878, '{}');
INSERT INTO app.materials VALUES ('C01A0001-B210-330', '{"en": "GU20F Polished φ21.0x330", "ja": "GU20F 研磨 φ21.0×330"}', '本', true, NULL, '2026-08-24 09:19:52.063927+00', '2026-08-24 09:19:52.063927+00', '210', 21.000, 'A0', 330.000, '330', NULL, NULL, 'B', 13, 879, '{}');
INSERT INTO app.materials VALUES ('C01A0001-B220-330', '{"en": "GU20F Polished φ22.0x330", "ja": "GU20F 研磨 φ22.0×330"}', '本', true, NULL, '2026-08-24 09:19:52.064192+00', '2026-08-24 09:19:52.064192+00', '220', 22.000, 'A0', 330.000, '330', NULL, NULL, 'B', 13, 880, '{}');
INSERT INTO app.materials VALUES ('C01A0001-B230-330', '{"en": "GU20F Polished φ23.0x330", "ja": "GU20F 研磨 φ23.0×330"}', '本', true, NULL, '2026-08-24 09:19:52.064458+00', '2026-08-24 09:19:52.064458+00', '230', 23.000, 'A0', 330.000, '330', NULL, NULL, 'B', 13, 881, '{}');
INSERT INTO app.materials VALUES ('C01A0001-B240-330', '{"en": "GU20F Polished φ24.0x330", "ja": "GU20F 研磨 φ24.0×330"}', '本', true, NULL, '2026-08-24 09:19:52.064722+00', '2026-08-24 09:19:52.064722+00', '240', 24.000, 'A0', 330.000, '330', NULL, NULL, 'B', 13, 882, '{}');
INSERT INTO app.materials VALUES ('C01A0001-B250-330', '{"en": "GU20F Polished φ25.0x330", "ja": "GU20F 研磨 φ25.0×330"}', '本', true, NULL, '2026-08-24 09:19:52.064998+00', '2026-08-24 09:19:52.064998+00', '250', 25.000, 'A0', 330.000, '330', NULL, NULL, 'B', 13, 883, '{}');
INSERT INTO app.materials VALUES ('C01A0001-B260-330', '{"en": "GU20F Polished φ26.0x330", "ja": "GU20F 研磨 φ26.0×330"}', '本', true, NULL, '2026-08-24 09:19:52.065294+00', '2026-08-24 09:19:52.065294+00', '260', 26.000, 'A0', 330.000, '330', NULL, NULL, 'B', 13, 884, '{}');
INSERT INTO app.materials VALUES ('C01A0001-B270-330', '{"en": "GU20F Polished φ27.0x330", "ja": "GU20F 研磨 φ27.0×330"}', '本', true, NULL, '2026-08-24 09:19:52.065564+00', '2026-08-24 09:19:52.065564+00', '270', 27.000, 'A0', 330.000, '330', NULL, NULL, 'B', 13, 885, '{}');
INSERT INTO app.materials VALUES ('C01A0001-B280-330', '{"en": "GU20F Polished φ28.0x330", "ja": "GU20F 研磨 φ28.0×330"}', '本', true, NULL, '2026-08-24 09:19:52.065833+00', '2026-08-24 09:19:52.065833+00', '280', 28.000, 'A0', 330.000, '330', NULL, NULL, 'B', 13, 886, '{}');
INSERT INTO app.materials VALUES ('C01A0001-B290-330', '{"en": "GU20F Polished φ29.0x330", "ja": "GU20F 研磨 φ29.0×330"}', '本', true, NULL, '2026-08-24 09:19:52.066155+00', '2026-08-24 09:19:52.066155+00', '290', 29.000, 'A0', 330.000, '330', NULL, NULL, 'B', 13, 887, '{}');
INSERT INTO app.materials VALUES ('C01A0001-B300-330', '{"en": "GU20F Polished φ30.0x330", "ja": "GU20F 研磨 φ30.0×330"}', '本', true, NULL, '2026-08-24 09:19:52.066444+00', '2026-08-24 09:19:52.066444+00', '300', 30.000, 'A0', 330.000, '330', NULL, NULL, 'B', 13, 888, '{}');
INSERT INTO app.materials VALUES ('C01A0001-B310-330', '{"en": "GU20F Polished φ31.0x330", "ja": "GU20F 研磨 φ31.0×330"}', '本', true, NULL, '2026-08-24 09:19:52.066714+00', '2026-08-24 09:19:52.066714+00', '310', 31.000, 'A0', 330.000, '330', NULL, NULL, 'B', 13, 889, '{}');
INSERT INTO app.materials VALUES ('C01A0001-B320-330', '{"en": "GU20F Polished φ32.0x330", "ja": "GU20F 研磨 φ32.0×330"}', '本', true, NULL, '2026-08-24 09:19:52.066961+00', '2026-08-24 09:19:52.066961+00', '320', 32.000, 'A0', 330.000, '330', NULL, NULL, 'B', 13, 890, '{}');
INSERT INTO app.materials VALUES ('C01A0001-B330-330', '{"en": "GU20F Polished φ33.0x330", "ja": "GU20F 研磨 φ33.0×330"}', '本', true, NULL, '2026-08-24 09:19:52.067267+00', '2026-08-24 09:19:52.067267+00', '330', 33.000, 'A0', 330.000, '330', NULL, NULL, 'B', 13, 891, '{}');
INSERT INTO app.materials VALUES ('C01A0001-B340-330', '{"en": "GU20F Polished φ34.0x330", "ja": "GU20F 研磨 φ34.0×330"}', '本', true, NULL, '2026-08-24 09:19:52.06754+00', '2026-08-24 09:19:52.06754+00', '340', 34.000, 'A0', 330.000, '330', NULL, NULL, 'B', 13, 892, '{}');
INSERT INTO app.materials VALUES ('C01A0001-B350-330', '{"en": "GU20F Polished φ35.0x330", "ja": "GU20F 研磨 φ35.0×330"}', '本', true, NULL, '2026-08-24 09:19:52.067805+00', '2026-08-24 09:19:52.067805+00', '350', 35.000, 'A0', 330.000, '330', NULL, NULL, 'B', 13, 893, '{}');
INSERT INTO app.materials VALUES ('E01A0001-A040-310', '{"en": "SH10 Black skin φ4.0x310", "ja": "SH10 黒皮 φ4.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.068084+00', '2026-08-24 09:19:52.068084+00', '040', 4.000, 'A0', 310.000, '310', NULL, NULL, 'A', 12, 894, '{}');
INSERT INTO app.materials VALUES ('E01A0001-A050-310', '{"en": "SH10 Black skin φ5.0x310", "ja": "SH10 黒皮 φ5.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.068345+00', '2026-08-24 09:19:52.068345+00', '050', 5.000, 'A0', 310.000, '310', NULL, NULL, 'A', 12, 895, '{}');
INSERT INTO app.materials VALUES ('E01A0001-A060-310', '{"en": "SH10 Black skin φ6.0x310", "ja": "SH10 黒皮 φ6.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.068653+00', '2026-08-24 09:19:52.068653+00', '060', 6.000, 'A0', 310.000, '310', NULL, NULL, 'A', 12, 896, '{}');
INSERT INTO app.materials VALUES ('E01A0001-A070-310', '{"en": "SH10 Black skin φ7.0x310", "ja": "SH10 黒皮 φ7.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.068949+00', '2026-08-24 09:19:52.068949+00', '070', 7.000, 'A0', 310.000, '310', NULL, NULL, 'A', 12, 897, '{}');
INSERT INTO app.materials VALUES ('E01A0001-A080-310', '{"en": "SH10 Black skin φ8.0x310", "ja": "SH10 黒皮 φ8.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.069233+00', '2026-08-24 09:19:52.069233+00', '080', 8.000, 'A0', 310.000, '310', NULL, NULL, 'A', 12, 898, '{}');
INSERT INTO app.materials VALUES ('E01A0001-A090-310', '{"en": "SH10 Black skin φ9.0x310", "ja": "SH10 黒皮 φ9.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.069534+00', '2026-08-24 09:19:52.069534+00', '090', 9.000, 'A0', 310.000, '310', NULL, NULL, 'A', 12, 899, '{}');
INSERT INTO app.materials VALUES ('E01A0001-A100-310', '{"en": "SH10 Black skin φ10.0x310", "ja": "SH10 黒皮 φ10.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.06981+00', '2026-08-24 09:19:52.06981+00', '100', 10.000, 'A0', 310.000, '310', NULL, NULL, 'A', 12, 900, '{}');
INSERT INTO app.materials VALUES ('E01A0001-A110-310', '{"en": "SH10 Black skin φ11.0x310", "ja": "SH10 黒皮 φ11.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.070093+00', '2026-08-24 09:19:52.070093+00', '110', 11.000, 'A0', 310.000, '310', NULL, NULL, 'A', 12, 901, '{}');
INSERT INTO app.materials VALUES ('E01A0001-A120-310', '{"en": "SH10 Black skin φ12.0x310", "ja": "SH10 黒皮 φ12.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.070367+00', '2026-08-24 09:19:52.070367+00', '120', 12.000, 'A0', 310.000, '310', NULL, NULL, 'A', 12, 902, '{}');
INSERT INTO app.materials VALUES ('E01A0001-A130-310', '{"en": "SH10 Black skin φ13.0x310", "ja": "SH10 黒皮 φ13.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.070639+00', '2026-08-24 09:19:52.070639+00', '130', 13.000, 'A0', 310.000, '310', NULL, NULL, 'A', 12, 903, '{}');
INSERT INTO app.materials VALUES ('E01A0001-A140-310', '{"en": "SH10 Black skin φ14.0x310", "ja": "SH10 黒皮 φ14.0×310"}', '本', true, NULL, '2026-08-24 09:19:52.070908+00', '2026-08-24 09:19:52.070908+00', '140', 14.000, 'A0', 310.000, '310', NULL, NULL, 'A', 12, 904, '{}');


--
-- Data for Name: process_step_catalog; Type: TABLE DATA; Schema: app; Owner: postgres
--

INSERT INTO app.process_step_catalog VALUES (1, 'MATERIAL_ISSUE', '{"en": "Material issue (stock)", "ja": "素材出し（在庫）"}', 'MATERIAL_PREP', 'INTERNAL', false, false, false, NULL, 10, true, '在庫の移動', 'FLOW', NULL, 'NONE');
INSERT INTO app.process_step_catalog VALUES (2, 'SEMI_FINISHED_ISSUE', '{"en": "Semi-finished issue (stock)", "ja": "半製品出し（在庫）"}', 'MATERIAL_PREP', 'INTERNAL', false, false, false, NULL, 20, true, '在庫の移動。半製品にリブ母材を含む', 'FLOW', NULL, 'NONE');
INSERT INTO app.process_step_catalog VALUES (3, 'MATERIAL_HANDOFF', '{"en": "Material handoff (customer)", "ja": "素材受渡し（受注先）"}', 'MATERIAL_PREP', 'INTERNAL', false, false, false, NULL, 30, true, NULL, 'FLOW', NULL, 'NONE');
INSERT INTO app.process_step_catalog VALUES (4, 'PRODUCT_HANDOFF', '{"en": "Product handoff (customer)", "ja": "製品受渡し（受注先）"}', 'MATERIAL_PREP', 'INTERNAL', false, false, false, NULL, 40, true, NULL, 'FLOW', NULL, 'NONE');
INSERT INTO app.process_step_catalog VALUES (5, 'CUTTING', '{"en": "Cutting", "ja": "切断"}', 'MATERIAL_PREP', 'INTERNAL', false, false, false, NULL, 50, true, '複数回あり', 'FLOW', NULL, 'NONE');
INSERT INTO app.process_step_catalog VALUES (6, 'CENTERLESS', '{"en": "Centerless grinding", "ja": "センタレス"}', 'MATERIAL_PREP', 'INTERNAL_OR_OUTSOURCE', false, false, false, NULL, 60, true, '外注時：依頼日・入荷予定日・入荷日を管理', 'FLOW', NULL, 'NONE');
INSERT INTO app.process_step_catalog VALUES (7, 'CYLINDER_MACHINING', '{"en": "Cylindrical machining", "ja": "円筒加工"}', 'MACHINING', 'INTERNAL', false, false, false, NULL, 70, true, NULL, 'FLOW', NULL, 'NONE');
INSERT INTO app.process_step_catalog VALUES (9, 'CYLINDER_INSPECTION_APPROVAL', '{"en": "Cylindrical inspection approval", "ja": "円筒加工検査承認"}', 'APPROVAL', 'INTERNAL', false, false, true, '係長', 90, true, '係長以上が承認', 'FLOW', NULL, 'NONE');
INSERT INTO app.process_step_catalog VALUES (10, 'LENGTH_ADJUST', '{"en": "Length adjustment", "ja": "全長合わせ"}', 'MATERIAL_PREP', 'INTERNAL', false, false, false, NULL, 100, true, '素材が研磨の場合は前工程不要（空真）', 'FLOW', NULL, 'NONE');
INSERT INTO app.process_step_catalog VALUES (11, 'CHAMFER', '{"en": "Chamfer", "ja": "C面"}', 'MATERIAL_PREP', 'INTERNAL', false, false, false, NULL, 110, true, '角取り', 'FLOW', NULL, 'NONE');
INSERT INTO app.process_step_catalog VALUES (12, 'MARKING', '{"en": "Marking", "ja": "マーキング"}', 'MACHINING', 'INTERNAL', false, false, false, NULL, 120, true, NULL, 'FLOW', NULL, 'NONE');
INSERT INTO app.process_step_catalog VALUES (13, 'STEP_MACHINING', '{"en": "Step machining", "ja": "段加工"}', 'MACHINING', 'INTERNAL', true, false, false, NULL, 130, true, '他工程と同時実施・同時記録可', 'FLOW', NULL, 'NONE');
INSERT INTO app.process_step_catalog VALUES (15, 'STEP_INSPECTION_APPROVAL', '{"en": "Step inspection approval", "ja": "段加工検査承認"}', 'APPROVAL', 'INTERNAL', false, false, true, '係長', 150, true, '係長以上が承認', 'FLOW', NULL, 'NONE');
INSERT INTO app.process_step_catalog VALUES (16, 'TANG', '{"en": "Tang", "ja": "タング"}', 'MACHINING', 'INTERNAL', false, false, false, NULL, 160, true, NULL, 'FLOW', NULL, 'NONE');
INSERT INTO app.process_step_catalog VALUES (17, 'OIL_GROOVE', '{"en": "Oil groove", "ja": "油溝"}', 'MACHINING', 'INTERNAL', false, false, false, NULL, 170, true, NULL, 'FLOW', NULL, 'NONE');
INSERT INTO app.process_step_catalog VALUES (18, 'FLUTE', '{"en": "Flute (fabrication)", "ja": "溝（製作）"}', 'MACHINING', 'INTERNAL', true, false, false, NULL, 180, true, '他工程と同時実施・同時記録可。刃裏と排他', 'FLOW', NULL, 'NONE');
INSERT INTO app.process_step_catalog VALUES (19, 'BLADE_BACK', '{"en": "Blade back (fabrication)", "ja": "刃裏（製作）"}', 'MACHINING', 'INTERNAL', true, false, false, NULL, 190, true, '他工程と同時実施・同時記録可。溝と排他', 'FLOW', NULL, 'NONE');
INSERT INTO app.process_step_catalog VALUES (20, 'OD_FAB', '{"en": "OD (fabrication)", "ja": "外周（製作）"}', 'MACHINING', 'INTERNAL', true, false, false, NULL, 200, true, '他工程と同時実施・同時記録可', 'FLOW', NULL, 'NONE');
INSERT INTO app.process_step_catalog VALUES (21, 'TIP_FAB', '{"en": "Tip (fabrication)", "ja": "先端（製作）"}', 'MACHINING', 'INTERNAL', true, false, false, NULL, 210, true, '他工程と同時実施・同時記録可', 'FLOW', NULL, 'NONE');
INSERT INTO app.process_step_catalog VALUES (22, 'HONING', '{"en": "Honing", "ja": "ホーニング"}', 'MACHINING', 'INTERNAL', false, false, false, NULL, 220, true, '製作検査の前後いずれかで実施', 'FLOW', NULL, 'NONE');
INSERT INTO app.process_step_catalog VALUES (24, 'FAB_INSPECTION_APPROVAL', '{"en": "Fabrication inspection approval", "ja": "製作検査承認"}', 'APPROVAL', 'INTERNAL', false, false, true, '係長', 240, true, '係長以上が承認', 'FLOW', NULL, 'NONE');
INSERT INTO app.process_step_catalog VALUES (25, 'POST_CUTTING', '{"en": "Cutting (post-process)", "ja": "切断（後加工）"}', 'MACHINING', 'INTERNAL', true, false, false, NULL, 250, true, 'ある場合とない場合がある', 'FLOW', NULL, 'NONE');
INSERT INTO app.process_step_catalog VALUES (26, 'POST_CHAMFER', '{"en": "Chamfer (post-process)", "ja": "C面（後加工）"}', 'MACHINING', 'INTERNAL', true, false, false, NULL, 260, true, 'ある場合とない場合がある', 'FLOW', NULL, 'NONE');
INSERT INTO app.process_step_catalog VALUES (27, 'POST_END_FACE', '{"en": "End face (post-process)", "ja": "端面（後加工）"}', 'MACHINING', 'INTERNAL', true, false, false, NULL, 270, true, 'ある場合とない場合がある', 'FLOW', NULL, 'NONE');
INSERT INTO app.process_step_catalog VALUES (29, 'CUSTOMER_INSPECTION_1_APPROVAL', '{"en": "Customer inspection 1 approval", "ja": "客先向け検査１承認（加工後）"}', 'APPROVAL', 'INTERNAL', false, false, true, '係長', 290, true, '係長以上が承認', 'FLOW', NULL, 'NONE');
INSERT INTO app.process_step_catalog VALUES (30, 'NECK_RELIEF', '{"en": "Neck relief", "ja": "首逃し"}', 'MACHINING', 'INTERNAL', true, false, false, NULL, 300, true, '段加工と同時実施・記録する場合あり', 'FLOW', NULL, 'NONE');
INSERT INTO app.process_step_catalog VALUES (32, 'NECK_RELIEF_INSPECTION_APPROVAL', '{"en": "Neck relief inspection approval", "ja": "首逃し検査承認"}', 'APPROVAL', 'INTERNAL', false, false, true, '係長', 320, true, '係長以上が承認', 'FLOW', NULL, 'NONE');
INSERT INTO app.process_step_catalog VALUES (33, 'LD', '{"en": "LD", "ja": "LD"}', 'MACHINING', 'INTERNAL', false, false, false, NULL, 330, true, NULL, 'FLOW', NULL, 'NONE');
INSERT INTO app.process_step_catalog VALUES (35, 'SMAP', '{"en": "SMAP", "ja": "SMAP"}', 'MACHINING', 'INTERNAL', false, false, false, NULL, 350, true, '複数回あり', 'FLOW', NULL, 'NONE');
INSERT INTO app.process_step_catalog VALUES (36, 'COATING', '{"en": "Coating", "ja": "コーティング"}', 'COATING', 'INTERNAL_OR_OUTSOURCE', false, false, false, NULL, 360, true, '外注時：依頼日・入荷予定日・入荷日を管理', 'FLOW', NULL, 'NONE');
INSERT INTO app.process_step_catalog VALUES (37, 'POST_SMAP', '{"en": "Post-SMAP", "ja": "後SMAP"}', 'MACHINING', 'INTERNAL', false, false, false, NULL, 370, true, NULL, 'FLOW', NULL, 'NONE');
INSERT INTO app.process_step_catalog VALUES (39, 'CUSTOMER_INSPECTION_2_APPROVAL', '{"en": "Customer inspection 2 approval", "ja": "客先向け検査２承認（コーティング後）"}', 'APPROVAL', 'INTERNAL', false, false, true, '係長', 390, true, '係長以上が承認', 'FLOW', NULL, 'NONE');
INSERT INTO app.process_step_catalog VALUES (8, 'CYLINDER_INSPECTION', '{"en": "Cylindrical machining inspection", "ja": "円筒加工検査"}', 'INSPECTION', 'INTERNAL', false, true, false, NULL, 80, true, '検査表の完成確認（製作）', 'INSPECTION', NULL, 'NONE');
INSERT INTO app.process_step_catalog VALUES (14, 'STEP_INSPECTION', '{"en": "Step machining inspection", "ja": "段加工検査"}', 'INSPECTION', 'INTERNAL', false, true, false, NULL, 140, true, '検査表の完成確認（段加工）', 'INSPECTION', NULL, 'NONE');
INSERT INTO app.process_step_catalog VALUES (23, 'FAB_INSPECTION', '{"en": "Fabrication inspection", "ja": "製作検査"}', 'INSPECTION', 'INTERNAL', false, true, false, NULL, 230, true, '検査表の完成確認（製作）', 'INSPECTION', NULL, 'NONE');
INSERT INTO app.process_step_catalog VALUES (28, 'CUSTOMER_INSPECTION_1', '{"en": "Customer inspection 1 (post-machining)", "ja": "客先向け検査１（加工後）"}', 'INSPECTION', 'INTERNAL', false, true, false, NULL, 280, true, '検査表の完成確認（客先向け１）', 'INSPECTION', NULL, 'NONE');
INSERT INTO app.process_step_catalog VALUES (31, 'NECK_RELIEF_INSPECTION', '{"en": "Neck relief inspection", "ja": "首逃し検査"}', 'INSPECTION', 'INTERNAL', false, true, false, NULL, 310, true, '検査表の完成確認（製作）', 'INSPECTION', NULL, 'NONE');
INSERT INTO app.process_step_catalog VALUES (34, 'LD_INSPECTION', '{"en": "LD inspection", "ja": "LD検査"}', 'INSPECTION', 'INTERNAL', false, true, false, NULL, 340, true, '写真撮影の有無を確認', 'INSPECTION', NULL, 'NONE');
INSERT INTO app.process_step_catalog VALUES (38, 'CUSTOMER_INSPECTION_2', '{"en": "Customer inspection 2 (post-coating)", "ja": "客先向け検査２（コーティング後）"}', 'INSPECTION', 'INTERNAL', false, true, false, NULL, 380, true, '検査表の完成確認（客先向け２）', 'INSPECTION', NULL, 'NONE');
INSERT INTO app.process_step_catalog VALUES (40, 'PRE_SHIP_INSPECTION', '{"en": "Pre-shipment inspection", "ja": "出荷前検査"}', 'INSPECTION', 'INTERNAL', false, true, false, NULL, 400, true, '全工程完了後。再研磨・在庫で検査済みの場合は省略可', 'INSPECTION', NULL, 'NONE');
INSERT INTO app.process_step_catalog VALUES (42, 'PRODUCT_ISSUE', '{"en": "Product issue (stock)", "ja": "製品出し（在庫）"}', 'MATERIAL_PREP', 'INTERNAL', false, false, false, NULL, 25, true, '在庫の移動（在庫分指示書の開始工程 — 製造分の工程選択には出さない）', 'FLOW', NULL, 'NONE');


--
-- Data for Name: products; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: product_process_routes; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: product_process_route_versions; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: storage_locations; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: work_orders; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: work_order_steps; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: defect_records; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: delivery_orders; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: delivery_notes; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: delivery_note_items; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: order_acceptances; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: order_lines; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: delivery_order_items; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: quotes; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: design_requests; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: design_files; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: document_attachments; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: document_memos; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: document_memo_revisions; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: estimates; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: feature_flags; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: file_folder_grants; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: inspection_templates; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: inspection_records; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: inspection_template_items; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: inspection_record_items; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: inventory_reservations; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: inventory_transactions; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: invoices; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: invoice_items; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: kiosk_cards; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: kiosk_device_locations; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: kiosk_device_logs; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: kiosk_link_requests; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: kiosk_sessions; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: link_blacklist; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: link_index; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: match_aliases; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: storage_shelves; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: material_inventory; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: material_kinds; Type: TABLE DATA; Schema: app; Owner: postgres
--

INSERT INTO app.material_kinds VALUES ('A', 'A0', '{"en": "Standard", "ja": "通常"}', true, '2026-08-24 09:19:51.788864+00', '2026-08-24 09:19:51.788864+00');


--
-- Data for Name: material_purchase_orders; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: material_purchase_order_items; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: material_receipts; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: material_type_prices; Type: TABLE DATA; Schema: app; Owner: postgres
--

INSERT INTO app.material_type_prices VALUES (1, 7, '010', 'A', 929.03, '2026-08-24 09:19:52.086925+00', '2026-08-24 09:19:52.086925+00');
INSERT INTO app.material_type_prices VALUES (2, 7, '020', 'A', 1412.90, '2026-08-24 09:19:52.087479+00', '2026-08-24 09:19:52.087479+00');
INSERT INTO app.material_type_prices VALUES (3, 7, '030', 'A', 1958.06, '2026-08-24 09:19:52.087785+00', '2026-08-24 09:19:52.087785+00');
INSERT INTO app.material_type_prices VALUES (4, 7, '040', 'A', 2609.68, '2026-08-24 09:19:52.088086+00', '2026-08-24 09:19:52.088086+00');
INSERT INTO app.material_type_prices VALUES (5, 7, '050', 'A', 4267.74, '2026-08-24 09:19:52.088398+00', '2026-08-24 09:19:52.088398+00');
INSERT INTO app.material_type_prices VALUES (6, 7, '060', 'A', 5522.58, '2026-08-24 09:19:52.088734+00', '2026-08-24 09:19:52.088734+00');
INSERT INTO app.material_type_prices VALUES (7, 7, '070', 'A', 8274.19, '2026-08-24 09:19:52.089027+00', '2026-08-24 09:19:52.089027+00');
INSERT INTO app.material_type_prices VALUES (8, 7, '080', 'A', 9516.13, '2026-08-24 09:19:52.089286+00', '2026-08-24 09:19:52.089286+00');
INSERT INTO app.material_type_prices VALUES (9, 7, '090', 'A', 12874.19, '2026-08-24 09:19:52.089546+00', '2026-08-24 09:19:52.089546+00');
INSERT INTO app.material_type_prices VALUES (10, 7, '100', 'A', 14587.10, '2026-08-24 09:19:52.089803+00', '2026-08-24 09:19:52.089803+00');
INSERT INTO app.material_type_prices VALUES (11, 7, '110', 'A', 17993.55, '2026-08-24 09:19:52.090097+00', '2026-08-24 09:19:52.090097+00');
INSERT INTO app.material_type_prices VALUES (12, 7, '120', 'A', 20735.48, '2026-08-24 09:19:52.090364+00', '2026-08-24 09:19:52.090364+00');
INSERT INTO app.material_type_prices VALUES (13, 7, '130', 'A', 24929.03, '2026-08-24 09:19:52.090605+00', '2026-08-24 09:19:52.090605+00');
INSERT INTO app.material_type_prices VALUES (14, 7, '140', 'A', 29270.97, '2026-08-24 09:19:52.090866+00', '2026-08-24 09:19:52.090866+00');
INSERT INTO app.material_type_prices VALUES (15, 7, '150', 'A', 32683.87, '2026-08-24 09:19:52.091131+00', '2026-08-24 09:19:52.091131+00');
INSERT INTO app.material_type_prices VALUES (16, 7, '160', 'A', 36270.97, '2026-08-24 09:19:52.091372+00', '2026-08-24 09:19:52.091372+00');
INSERT INTO app.material_type_prices VALUES (17, 7, '170', 'A', 42290.32, '2026-08-24 09:19:52.091605+00', '2026-08-24 09:19:52.091605+00');
INSERT INTO app.material_type_prices VALUES (18, 7, '180', 'A', 45658.06, '2026-08-24 09:19:52.091876+00', '2026-08-24 09:19:52.091876+00');
INSERT INTO app.material_type_prices VALUES (19, 7, '190', 'A', 55274.19, '2026-08-24 09:19:52.092176+00', '2026-08-24 09:19:52.092176+00');
INSERT INTO app.material_type_prices VALUES (20, 7, '200', 'A', 56122.58, '2026-08-24 09:19:52.092427+00', '2026-08-24 09:19:52.092427+00');
INSERT INTO app.material_type_prices VALUES (21, 8, '010', 'A', 854.84, '2026-08-24 09:19:52.092707+00', '2026-08-24 09:19:52.092707+00');
INSERT INTO app.material_type_prices VALUES (22, 8, '020', 'A', 1316.13, '2026-08-24 09:19:52.093402+00', '2026-08-24 09:19:52.093402+00');
INSERT INTO app.material_type_prices VALUES (23, 8, '030', 'A', 1812.90, '2026-08-24 09:19:52.093691+00', '2026-08-24 09:19:52.093691+00');
INSERT INTO app.material_type_prices VALUES (24, 8, '040', 'A', 2441.94, '2026-08-24 09:19:52.09395+00', '2026-08-24 09:19:52.09395+00');
INSERT INTO app.material_type_prices VALUES (25, 8, '050', 'A', 3896.77, '2026-08-24 09:19:52.094207+00', '2026-08-24 09:19:52.094207+00');
INSERT INTO app.material_type_prices VALUES (26, 8, '060', 'A', 5164.52, '2026-08-24 09:19:52.094514+00', '2026-08-24 09:19:52.094514+00');
INSERT INTO app.material_type_prices VALUES (27, 8, '070', 'A', 7532.26, '2026-08-24 09:19:52.094777+00', '2026-08-24 09:19:52.094777+00');
INSERT INTO app.material_type_prices VALUES (28, 8, '080', 'A', 8893.55, '2026-08-24 09:19:52.095094+00', '2026-08-24 09:19:52.095094+00');
INSERT INTO app.material_type_prices VALUES (29, 8, '090', 'A', 11722.58, '2026-08-24 09:19:52.095355+00', '2026-08-24 09:19:52.095355+00');
INSERT INTO app.material_type_prices VALUES (30, 8, '100', 'A', 13635.48, '2026-08-24 09:19:52.095652+00', '2026-08-24 09:19:52.095652+00');
INSERT INTO app.material_type_prices VALUES (31, 8, '110', 'A', 16383.87, '2026-08-24 09:19:52.095914+00', '2026-08-24 09:19:52.095914+00');
INSERT INTO app.material_type_prices VALUES (32, 8, '120', 'A', 19383.87, '2026-08-24 09:19:52.096184+00', '2026-08-24 09:19:52.096184+00');
INSERT INTO app.material_type_prices VALUES (33, 8, '130', 'A', 22667.74, '2026-08-24 09:19:52.09647+00', '2026-08-24 09:19:52.09647+00');
INSERT INTO app.material_type_prices VALUES (34, 8, '140', 'A', 26635.48, '2026-08-24 09:19:52.096746+00', '2026-08-24 09:19:52.096746+00');
INSERT INTO app.material_type_prices VALUES (35, 8, '150', 'A', 29896.77, '2026-08-24 09:19:52.097085+00', '2026-08-24 09:19:52.097085+00');
INSERT INTO app.material_type_prices VALUES (36, 8, '160', 'A', 33906.45, '2026-08-24 09:19:52.097338+00', '2026-08-24 09:19:52.097338+00');
INSERT INTO app.material_type_prices VALUES (37, 8, '170', 'A', 38209.68, '2026-08-24 09:19:52.097613+00', '2026-08-24 09:19:52.097613+00');
INSERT INTO app.material_type_prices VALUES (38, 8, '180', 'A', 42677.42, '2026-08-24 09:19:52.097978+00', '2026-08-24 09:19:52.097978+00');
INSERT INTO app.material_type_prices VALUES (39, 8, '190', 'A', 50451.61, '2026-08-24 09:19:52.098357+00', '2026-08-24 09:19:52.098357+00');
INSERT INTO app.material_type_prices VALUES (40, 8, '200', 'A', 52461.29, '2026-08-24 09:19:52.098668+00', '2026-08-24 09:19:52.098668+00');
INSERT INTO app.material_type_prices VALUES (41, 9, '010', 'A', 854.84, '2026-08-24 09:19:52.098971+00', '2026-08-24 09:19:52.098971+00');
INSERT INTO app.material_type_prices VALUES (42, 9, '020', 'A', 1312.90, '2026-08-24 09:19:52.099261+00', '2026-08-24 09:19:52.099261+00');
INSERT INTO app.material_type_prices VALUES (43, 9, '030', 'A', 1532.26, '2026-08-24 09:19:52.099512+00', '2026-08-24 09:19:52.099512+00');
INSERT INTO app.material_type_prices VALUES (44, 9, '040', 'A', 2567.74, '2026-08-24 09:19:52.099778+00', '2026-08-24 09:19:52.099778+00');
INSERT INTO app.material_type_prices VALUES (45, 9, '050', 'A', 3896.77, '2026-08-24 09:19:52.100077+00', '2026-08-24 09:19:52.100077+00');
INSERT INTO app.material_type_prices VALUES (46, 9, '060', 'A', 5435.48, '2026-08-24 09:19:52.100354+00', '2026-08-24 09:19:52.100354+00');
INSERT INTO app.material_type_prices VALUES (47, 9, '070', 'A', 7532.26, '2026-08-24 09:19:52.100608+00', '2026-08-24 09:19:52.100608+00');
INSERT INTO app.material_type_prices VALUES (48, 9, '080', 'A', 9361.29, '2026-08-24 09:19:52.100943+00', '2026-08-24 09:19:52.100943+00');
INSERT INTO app.material_type_prices VALUES (49, 9, '090', 'A', 11722.58, '2026-08-24 09:19:52.101229+00', '2026-08-24 09:19:52.101229+00');
INSERT INTO app.material_type_prices VALUES (50, 9, '100', 'A', 14348.39, '2026-08-24 09:19:52.101485+00', '2026-08-24 09:19:52.101485+00');
INSERT INTO app.material_type_prices VALUES (51, 9, '110', 'A', 17241.94, '2026-08-24 09:19:52.101782+00', '2026-08-24 09:19:52.101782+00');
INSERT INTO app.material_type_prices VALUES (52, 9, '120', 'A', 20400.00, '2026-08-24 09:19:52.102084+00', '2026-08-24 09:19:52.102084+00');
INSERT INTO app.material_type_prices VALUES (53, 9, '130', 'A', 23822.58, '2026-08-24 09:19:52.102346+00', '2026-08-24 09:19:52.102346+00');
INSERT INTO app.material_type_prices VALUES (54, 9, '140', 'A', 27509.68, '2026-08-24 09:19:52.102602+00', '2026-08-24 09:19:52.102602+00');
INSERT INTO app.material_type_prices VALUES (55, 9, '150', 'A', 31464.52, '2026-08-24 09:19:52.102844+00', '2026-08-24 09:19:52.102844+00');
INSERT INTO app.material_type_prices VALUES (56, 9, '160', 'A', 35683.87, '2026-08-24 09:19:52.10309+00', '2026-08-24 09:19:52.10309+00');
INSERT INTO app.material_type_prices VALUES (57, 9, '170', 'A', 40167.74, '2026-08-24 09:19:52.103407+00', '2026-08-24 09:19:52.103407+00');
INSERT INTO app.material_type_prices VALUES (58, 9, '180', 'A', 44916.13, '2026-08-24 09:19:52.103664+00', '2026-08-24 09:19:52.103664+00');
INSERT INTO app.material_type_prices VALUES (59, 9, '190', 'A', 50451.61, '2026-08-24 09:19:52.103924+00', '2026-08-24 09:19:52.103924+00');
INSERT INTO app.material_type_prices VALUES (60, 9, '200', 'A', 55212.90, '2026-08-24 09:19:52.104191+00', '2026-08-24 09:19:52.104191+00');
INSERT INTO app.material_type_prices VALUES (61, 1, '010', 'A', 1138.71, '2026-08-24 09:19:52.104453+00', '2026-08-24 09:19:52.104453+00');
INSERT INTO app.material_type_prices VALUES (62, 1, '010', 'B', 3058.06, '2026-08-24 09:19:52.10472+00', '2026-08-24 09:19:52.10472+00');
INSERT INTO app.material_type_prices VALUES (63, 1, '015', 'A', 1138.71, '2026-08-24 09:19:52.104979+00', '2026-08-24 09:19:52.104979+00');
INSERT INTO app.material_type_prices VALUES (64, 1, '015', 'B', 3058.06, '2026-08-24 09:19:52.105252+00', '2026-08-24 09:19:52.105252+00');
INSERT INTO app.material_type_prices VALUES (65, 1, '020', 'A', 1454.84, '2026-08-24 09:19:52.105511+00', '2026-08-24 09:19:52.105511+00');
INSERT INTO app.material_type_prices VALUES (66, 1, '020', 'B', 3058.06, '2026-08-24 09:19:52.105774+00', '2026-08-24 09:19:52.105774+00');
INSERT INTO app.material_type_prices VALUES (67, 1, '025', 'A', 1661.29, '2026-08-24 09:19:52.106047+00', '2026-08-24 09:19:52.106047+00');
INSERT INTO app.material_type_prices VALUES (68, 1, '025', 'B', 3058.06, '2026-08-24 09:19:52.106322+00', '2026-08-24 09:19:52.106322+00');
INSERT INTO app.material_type_prices VALUES (69, 1, '030', 'A', 2416.13, '2026-08-24 09:19:52.106567+00', '2026-08-24 09:19:52.106567+00');
INSERT INTO app.material_type_prices VALUES (70, 1, '030', 'B', 3058.06, '2026-08-24 09:19:52.106829+00', '2026-08-24 09:19:52.106829+00');
INSERT INTO app.material_type_prices VALUES (71, 1, '035', 'A', 3000.00, '2026-08-24 09:19:52.107082+00', '2026-08-24 09:19:52.107082+00');
INSERT INTO app.material_type_prices VALUES (72, 1, '035', 'B', 3735.48, '2026-08-24 09:19:52.10734+00', '2026-08-24 09:19:52.10734+00');
INSERT INTO app.material_type_prices VALUES (73, 1, '040', 'A', 3464.52, '2026-08-24 09:19:52.107595+00', '2026-08-24 09:19:52.107595+00');
INSERT INTO app.material_type_prices VALUES (74, 1, '040', 'B', 4306.45, '2026-08-24 09:19:52.107879+00', '2026-08-24 09:19:52.107879+00');
INSERT INTO app.material_type_prices VALUES (75, 1, '045', 'A', 4364.52, '2026-08-24 09:19:52.108132+00', '2026-08-24 09:19:52.108132+00');
INSERT INTO app.material_type_prices VALUES (76, 1, '045', 'B', 5332.26, '2026-08-24 09:19:52.108383+00', '2026-08-24 09:19:52.108383+00');
INSERT INTO app.material_type_prices VALUES (77, 1, '050', 'A', 4890.32, '2026-08-24 09:19:52.108737+00', '2026-08-24 09:19:52.108737+00');
INSERT INTO app.material_type_prices VALUES (78, 1, '050', 'B', 5954.84, '2026-08-24 09:19:52.109027+00', '2026-08-24 09:19:52.109027+00');
INSERT INTO app.material_type_prices VALUES (79, 1, '055', 'A', 5848.39, '2026-08-24 09:19:52.109289+00', '2026-08-24 09:19:52.109289+00');
INSERT INTO app.material_type_prices VALUES (80, 1, '055', 'B', 7041.94, '2026-08-24 09:19:52.109537+00', '2026-08-24 09:19:52.109537+00');
INSERT INTO app.material_type_prices VALUES (81, 1, '060', 'A', 6722.58, '2026-08-24 09:19:52.109803+00', '2026-08-24 09:19:52.109803+00');
INSERT INTO app.material_type_prices VALUES (82, 1, '060', 'B', 8016.13, '2026-08-24 09:19:52.110091+00', '2026-08-24 09:19:52.110091+00');
INSERT INTO app.material_type_prices VALUES (83, 1, '065', 'A', 8561.29, '2026-08-24 09:19:52.110331+00', '2026-08-24 09:19:52.110331+00');
INSERT INTO app.material_type_prices VALUES (84, 1, '065', 'B', 9987.10, '2026-08-24 09:19:52.110574+00', '2026-08-24 09:19:52.110574+00');
INSERT INTO app.material_type_prices VALUES (85, 1, '070', 'A', 9490.32, '2026-08-24 09:19:52.110827+00', '2026-08-24 09:19:52.110827+00');
INSERT INTO app.material_type_prices VALUES (86, 1, '070', 'B', 11019.35, '2026-08-24 09:19:52.111081+00', '2026-08-24 09:19:52.111081+00');
INSERT INTO app.material_type_prices VALUES (87, 1, '075', 'A', 10103.23, '2026-08-24 09:19:52.111412+00', '2026-08-24 09:19:52.111412+00');
INSERT INTO app.material_type_prices VALUES (88, 1, '075', 'B', 11732.26, '2026-08-24 09:19:52.111726+00', '2026-08-24 09:19:52.111726+00');
INSERT INTO app.material_type_prices VALUES (89, 1, '080', 'A', 10861.29, '2026-08-24 09:19:52.11201+00', '2026-08-24 09:19:52.11201+00');
INSERT INTO app.material_type_prices VALUES (90, 1, '080', 'B', 12609.68, '2026-08-24 09:19:52.112256+00', '2026-08-24 09:19:52.112256+00');
INSERT INTO app.material_type_prices VALUES (91, 1, '085', 'A', 12958.06, '2026-08-24 09:19:52.112499+00', '2026-08-24 09:19:52.112499+00');
INSERT INTO app.material_type_prices VALUES (92, 1, '085', 'B', 14845.16, '2026-08-24 09:19:52.112743+00', '2026-08-24 09:19:52.112743+00');
INSERT INTO app.material_type_prices VALUES (93, 1, '090', 'A', 13712.90, '2026-08-24 09:19:52.113007+00', '2026-08-24 09:19:52.113007+00');
INSERT INTO app.material_type_prices VALUES (94, 1, '090', 'B', 15703.23, '2026-08-24 09:19:52.113243+00', '2026-08-24 09:19:52.113243+00');
INSERT INTO app.material_type_prices VALUES (95, 1, '095', 'A', 15196.77, '2026-08-24 09:19:52.113523+00', '2026-08-24 09:19:52.113523+00');
INSERT INTO app.material_type_prices VALUES (96, 1, '095', 'B', 17293.55, '2026-08-24 09:19:52.113785+00', '2026-08-24 09:19:52.113785+00');
INSERT INTO app.material_type_prices VALUES (97, 1, '100', 'A', 16129.03, '2026-08-24 09:19:52.114098+00', '2026-08-24 09:19:52.114098+00');
INSERT INTO app.material_type_prices VALUES (98, 1, '100', 'B', 18354.84, '2026-08-24 09:19:52.114388+00', '2026-08-24 09:19:52.114388+00');
INSERT INTO app.material_type_prices VALUES (99, 1, '105', 'A', 17612.90, '2026-08-24 09:19:52.114645+00', '2026-08-24 09:19:52.114645+00');
INSERT INTO app.material_type_prices VALUES (100, 1, '105', 'B', 19945.16, '2026-08-24 09:19:52.114903+00', '2026-08-24 09:19:52.114903+00');
INSERT INTO app.material_type_prices VALUES (101, 1, '110', 'A', 19129.03, '2026-08-24 09:19:52.115183+00', '2026-08-24 09:19:52.115183+00');
INSERT INTO app.material_type_prices VALUES (102, 1, '110', 'B', 21596.77, '2026-08-24 09:19:52.115453+00', '2026-08-24 09:19:52.115453+00');
INSERT INTO app.material_type_prices VALUES (103, 1, '115', 'A', 20322.58, '2026-08-24 09:19:52.115724+00', '2026-08-24 09:19:52.115724+00');
INSERT INTO app.material_type_prices VALUES (104, 1, '115', 'B', 22893.55, '2026-08-24 09:19:52.115989+00', '2026-08-24 09:19:52.115989+00');
INSERT INTO app.material_type_prices VALUES (105, 1, '120', 'A', 21545.16, '2026-08-24 09:19:52.116236+00', '2026-08-24 09:19:52.116236+00');
INSERT INTO app.material_type_prices VALUES (106, 1, '120', 'B', 24219.35, '2026-08-24 09:19:52.116551+00', '2026-08-24 09:19:52.116551+00');
INSERT INTO app.material_type_prices VALUES (107, 1, '125', 'A', 24225.81, '2026-08-24 09:19:52.116833+00', '2026-08-24 09:19:52.116833+00');
INSERT INTO app.material_type_prices VALUES (108, 1, '125', 'B', 27048.39, '2026-08-24 09:19:52.11714+00', '2026-08-24 09:19:52.11714+00');
INSERT INTO app.material_type_prices VALUES (109, 1, '130', 'A', 26493.55, '2026-08-24 09:19:52.117434+00', '2026-08-24 09:19:52.117434+00');
INSERT INTO app.material_type_prices VALUES (110, 1, '130', 'B', 29435.48, '2026-08-24 09:19:52.117721+00', '2026-08-24 09:19:52.117721+00');
INSERT INTO app.material_type_prices VALUES (111, 1, '135', 'A', 28912.90, '2026-08-24 09:19:52.118001+00', '2026-08-24 09:19:52.118001+00');
INSERT INTO app.material_type_prices VALUES (112, 1, '135', 'B', 31993.55, '2026-08-24 09:19:52.118302+00', '2026-08-24 09:19:52.118302+00');
INSERT INTO app.material_type_prices VALUES (113, 1, '140', 'A', 31151.61, '2026-08-24 09:19:52.11857+00', '2026-08-24 09:19:52.11857+00');
INSERT INTO app.material_type_prices VALUES (114, 1, '140', 'B', 34354.84, '2026-08-24 09:19:52.118859+00', '2026-08-24 09:19:52.118859+00');
INSERT INTO app.material_type_prices VALUES (115, 1, '145', 'A', 31906.45, '2026-08-24 09:19:52.119115+00', '2026-08-24 09:19:52.119115+00');
INSERT INTO app.material_type_prices VALUES (116, 1, '145', 'B', 35232.26, '2026-08-24 09:19:52.119467+00', '2026-08-24 09:19:52.119467+00');
INSERT INTO app.material_type_prices VALUES (117, 1, '150', 'A', 34761.29, '2026-08-24 09:19:52.11975+00', '2026-08-24 09:19:52.11975+00');
INSERT INTO app.material_type_prices VALUES (118, 1, '150', 'B', 38212.90, '2026-08-24 09:19:52.120016+00', '2026-08-24 09:19:52.120016+00');
INSERT INTO app.material_type_prices VALUES (119, 1, '155', 'A', 38254.84, '2026-08-24 09:19:52.120271+00', '2026-08-24 09:19:52.120271+00');
INSERT INTO app.material_type_prices VALUES (120, 1, '155', 'B', 41838.71, '2026-08-24 09:19:52.12056+00', '2026-08-24 09:19:52.12056+00');
INSERT INTO app.material_type_prices VALUES (121, 1, '160', 'A', 40206.45, '2026-08-24 09:19:52.120818+00', '2026-08-24 09:19:52.120818+00');
INSERT INTO app.material_type_prices VALUES (122, 1, '160', 'B', 43925.81, '2026-08-24 09:19:52.121113+00', '2026-08-24 09:19:52.121113+00');
INSERT INTO app.material_type_prices VALUES (123, 1, '165', 'A', 42300.00, '2026-08-24 09:19:52.121386+00', '2026-08-24 09:19:52.121386+00');
INSERT INTO app.material_type_prices VALUES (124, 1, '170', 'A', 44835.48, '2026-08-24 09:19:52.12164+00', '2026-08-24 09:19:52.12164+00');
INSERT INTO app.material_type_prices VALUES (125, 1, '170', 'B', 48812.90, '2026-08-24 09:19:52.121895+00', '2026-08-24 09:19:52.121895+00');
INSERT INTO app.material_type_prices VALUES (126, 1, '175', 'A', 47109.68, '2026-08-24 09:19:52.122188+00', '2026-08-24 09:19:52.122188+00');
INSERT INTO app.material_type_prices VALUES (127, 1, '180', 'A', 48593.55, '2026-08-24 09:19:52.122482+00', '2026-08-24 09:19:52.122482+00');
INSERT INTO app.material_type_prices VALUES (128, 1, '180', 'B', 52819.35, '2026-08-24 09:19:52.122757+00', '2026-08-24 09:19:52.122757+00');
INSERT INTO app.material_type_prices VALUES (129, 1, '185', 'A', 53425.81, '2026-08-24 09:19:52.123015+00', '2026-08-24 09:19:52.123015+00');
INSERT INTO app.material_type_prices VALUES (130, 1, '190', 'A', 58870.97, '2026-08-24 09:19:52.123268+00', '2026-08-24 09:19:52.123268+00');
INSERT INTO app.material_type_prices VALUES (131, 1, '190', 'B', 63425.81, '2026-08-24 09:19:52.123547+00', '2026-08-24 09:19:52.123547+00');
INSERT INTO app.material_type_prices VALUES (132, 1, '195', 'A', 59745.16, '2026-08-24 09:19:52.123888+00', '2026-08-24 09:19:52.123888+00');
INSERT INTO app.material_type_prices VALUES (133, 1, '200', 'A', 62332.26, '2026-08-24 09:19:52.124176+00', '2026-08-24 09:19:52.124176+00');
INSERT INTO app.material_type_prices VALUES (134, 1, '200', 'B', 67116.13, '2026-08-24 09:19:52.124491+00', '2026-08-24 09:19:52.124491+00');
INSERT INTO app.material_type_prices VALUES (135, 1, '210', 'B', 74622.58, '2026-08-24 09:19:52.12482+00', '2026-08-24 09:19:52.12482+00');
INSERT INTO app.material_type_prices VALUES (136, 1, '220', 'B', 82135.48, '2026-08-24 09:19:52.125097+00', '2026-08-24 09:19:52.125097+00');
INSERT INTO app.material_type_prices VALUES (137, 1, '230', 'B', 88441.94, '2026-08-24 09:19:52.125357+00', '2026-08-24 09:19:52.125357+00');
INSERT INTO app.material_type_prices VALUES (138, 1, '240', 'B', 93209.68, '2026-08-24 09:19:52.125612+00', '2026-08-24 09:19:52.125612+00');
INSERT INTO app.material_type_prices VALUES (139, 1, '250', 'B', 97980.65, '2026-08-24 09:19:52.125874+00', '2026-08-24 09:19:52.125874+00');
INSERT INTO app.material_type_prices VALUES (140, 1, '260', 'B', 117987.10, '2026-08-24 09:19:52.126133+00', '2026-08-24 09:19:52.126133+00');
INSERT INTO app.material_type_prices VALUES (141, 1, '270', 'B', 126558.06, '2026-08-24 09:19:52.126385+00', '2026-08-24 09:19:52.126385+00');
INSERT INTO app.material_type_prices VALUES (142, 1, '280', 'B', 135135.48, '2026-08-24 09:19:52.126647+00', '2026-08-24 09:19:52.126647+00');
INSERT INTO app.material_type_prices VALUES (143, 1, '290', 'B', 142967.74, '2026-08-24 09:19:52.126932+00', '2026-08-24 09:19:52.126932+00');
INSERT INTO app.material_type_prices VALUES (144, 1, '300', 'B', 150774.19, '2026-08-24 09:19:52.127215+00', '2026-08-24 09:19:52.127215+00');
INSERT INTO app.material_type_prices VALUES (145, 1, '310', 'B', 158577.42, '2026-08-24 09:19:52.127476+00', '2026-08-24 09:19:52.127476+00');
INSERT INTO app.material_type_prices VALUES (146, 1, '320', 'B', 166416.13, '2026-08-24 09:19:52.127722+00', '2026-08-24 09:19:52.127722+00');
INSERT INTO app.material_type_prices VALUES (147, 1, '330', 'B', 175754.84, '2026-08-24 09:19:52.127987+00', '2026-08-24 09:19:52.127987+00');
INSERT INTO app.material_type_prices VALUES (148, 1, '340', 'B', 189687.10, '2026-08-24 09:19:52.12824+00', '2026-08-24 09:19:52.12824+00');
INSERT INTO app.material_type_prices VALUES (149, 1, '350', 'B', 205070.97, '2026-08-24 09:19:52.128478+00', '2026-08-24 09:19:52.128478+00');
INSERT INTO app.material_type_prices VALUES (150, 2, '010', 'A', 1138.71, '2026-08-24 09:19:52.128733+00', '2026-08-24 09:19:52.128733+00');
INSERT INTO app.material_type_prices VALUES (151, 2, '010', 'B', 3058.06, '2026-08-24 09:19:52.129041+00', '2026-08-24 09:19:52.129041+00');
INSERT INTO app.material_type_prices VALUES (152, 2, '015', 'A', 1138.71, '2026-08-24 09:19:52.129316+00', '2026-08-24 09:19:52.129316+00');
INSERT INTO app.material_type_prices VALUES (153, 2, '015', 'B', 3058.06, '2026-08-24 09:19:52.129604+00', '2026-08-24 09:19:52.129604+00');
INSERT INTO app.material_type_prices VALUES (154, 2, '020', 'A', 1454.84, '2026-08-24 09:19:52.12989+00', '2026-08-24 09:19:52.12989+00');
INSERT INTO app.material_type_prices VALUES (155, 2, '020', 'B', 3058.06, '2026-08-24 09:19:52.130178+00', '2026-08-24 09:19:52.130178+00');
INSERT INTO app.material_type_prices VALUES (156, 2, '025', 'A', 1661.29, '2026-08-24 09:19:52.130496+00', '2026-08-24 09:19:52.130496+00');
INSERT INTO app.material_type_prices VALUES (157, 2, '025', 'B', 3058.06, '2026-08-24 09:19:52.130784+00', '2026-08-24 09:19:52.130784+00');
INSERT INTO app.material_type_prices VALUES (158, 2, '030', 'A', 2416.13, '2026-08-24 09:19:52.131085+00', '2026-08-24 09:19:52.131085+00');
INSERT INTO app.material_type_prices VALUES (159, 2, '030', 'B', 3058.06, '2026-08-24 09:19:52.131356+00', '2026-08-24 09:19:52.131356+00');
INSERT INTO app.material_type_prices VALUES (160, 2, '035', 'A', 3000.00, '2026-08-24 09:19:52.131614+00', '2026-08-24 09:19:52.131614+00');
INSERT INTO app.material_type_prices VALUES (161, 2, '035', 'B', 3735.48, '2026-08-24 09:19:52.131879+00', '2026-08-24 09:19:52.131879+00');
INSERT INTO app.material_type_prices VALUES (162, 2, '040', 'A', 3464.52, '2026-08-24 09:19:52.13217+00', '2026-08-24 09:19:52.13217+00');
INSERT INTO app.material_type_prices VALUES (163, 2, '040', 'B', 4306.45, '2026-08-24 09:19:52.132422+00', '2026-08-24 09:19:52.132422+00');
INSERT INTO app.material_type_prices VALUES (164, 2, '045', 'A', 4364.52, '2026-08-24 09:19:52.132714+00', '2026-08-24 09:19:52.132714+00');
INSERT INTO app.material_type_prices VALUES (165, 2, '045', 'B', 5332.26, '2026-08-24 09:19:52.132967+00', '2026-08-24 09:19:52.132967+00');
INSERT INTO app.material_type_prices VALUES (166, 2, '050', 'A', 4890.32, '2026-08-24 09:19:52.133211+00', '2026-08-24 09:19:52.133211+00');
INSERT INTO app.material_type_prices VALUES (167, 2, '050', 'B', 5954.84, '2026-08-24 09:19:52.133481+00', '2026-08-24 09:19:52.133481+00');
INSERT INTO app.material_type_prices VALUES (168, 2, '055', 'A', 5848.39, '2026-08-24 09:19:52.133736+00', '2026-08-24 09:19:52.133736+00');
INSERT INTO app.material_type_prices VALUES (169, 2, '055', 'B', 7041.94, '2026-08-24 09:19:52.134004+00', '2026-08-24 09:19:52.134004+00');
INSERT INTO app.material_type_prices VALUES (170, 2, '060', 'A', 6722.58, '2026-08-24 09:19:52.134256+00', '2026-08-24 09:19:52.134256+00');
INSERT INTO app.material_type_prices VALUES (171, 2, '060', 'B', 8016.13, '2026-08-24 09:19:52.134513+00', '2026-08-24 09:19:52.134513+00');
INSERT INTO app.material_type_prices VALUES (172, 2, '065', 'A', 8561.29, '2026-08-24 09:19:52.134759+00', '2026-08-24 09:19:52.134759+00');
INSERT INTO app.material_type_prices VALUES (173, 2, '065', 'B', 9987.10, '2026-08-24 09:19:52.135007+00', '2026-08-24 09:19:52.135007+00');
INSERT INTO app.material_type_prices VALUES (174, 2, '070', 'A', 9490.32, '2026-08-24 09:19:52.135264+00', '2026-08-24 09:19:52.135264+00');
INSERT INTO app.material_type_prices VALUES (175, 2, '070', 'B', 11019.35, '2026-08-24 09:19:52.13552+00', '2026-08-24 09:19:52.13552+00');
INSERT INTO app.material_type_prices VALUES (176, 2, '075', 'A', 10103.23, '2026-08-24 09:19:52.135774+00', '2026-08-24 09:19:52.135774+00');
INSERT INTO app.material_type_prices VALUES (177, 2, '075', 'B', 11732.26, '2026-08-24 09:19:52.13604+00', '2026-08-24 09:19:52.13604+00');
INSERT INTO app.material_type_prices VALUES (178, 2, '080', 'A', 10861.29, '2026-08-24 09:19:52.136289+00', '2026-08-24 09:19:52.136289+00');
INSERT INTO app.material_type_prices VALUES (179, 2, '080', 'B', 12609.68, '2026-08-24 09:19:52.136541+00', '2026-08-24 09:19:52.136541+00');
INSERT INTO app.material_type_prices VALUES (180, 2, '085', 'A', 12958.06, '2026-08-24 09:19:52.136809+00', '2026-08-24 09:19:52.136809+00');
INSERT INTO app.material_type_prices VALUES (181, 2, '085', 'B', 14845.16, '2026-08-24 09:19:52.137081+00', '2026-08-24 09:19:52.137081+00');
INSERT INTO app.material_type_prices VALUES (182, 2, '090', 'A', 13712.90, '2026-08-24 09:19:52.137333+00', '2026-08-24 09:19:52.137333+00');
INSERT INTO app.material_type_prices VALUES (183, 2, '090', 'B', 15703.23, '2026-08-24 09:19:52.137596+00', '2026-08-24 09:19:52.137596+00');
INSERT INTO app.material_type_prices VALUES (184, 2, '095', 'A', 15196.77, '2026-08-24 09:19:52.137879+00', '2026-08-24 09:19:52.137879+00');
INSERT INTO app.material_type_prices VALUES (185, 2, '095', 'B', 17293.55, '2026-08-24 09:19:52.138162+00', '2026-08-24 09:19:52.138162+00');
INSERT INTO app.material_type_prices VALUES (186, 2, '100', 'A', 16129.03, '2026-08-24 09:19:52.138465+00', '2026-08-24 09:19:52.138465+00');
INSERT INTO app.material_type_prices VALUES (187, 2, '100', 'B', 18354.84, '2026-08-24 09:19:52.138707+00', '2026-08-24 09:19:52.138707+00');
INSERT INTO app.material_type_prices VALUES (188, 2, '105', 'A', 17612.90, '2026-08-24 09:19:52.138963+00', '2026-08-24 09:19:52.138963+00');
INSERT INTO app.material_type_prices VALUES (189, 2, '105', 'B', 19945.16, '2026-08-24 09:19:52.139211+00', '2026-08-24 09:19:52.139211+00');
INSERT INTO app.material_type_prices VALUES (190, 2, '110', 'A', 19129.03, '2026-08-24 09:19:52.139469+00', '2026-08-24 09:19:52.139469+00');
INSERT INTO app.material_type_prices VALUES (191, 2, '110', 'B', 21596.77, '2026-08-24 09:19:52.139708+00', '2026-08-24 09:19:52.139708+00');
INSERT INTO app.material_type_prices VALUES (192, 2, '115', 'A', 20322.58, '2026-08-24 09:19:52.139961+00', '2026-08-24 09:19:52.139961+00');
INSERT INTO app.material_type_prices VALUES (193, 2, '115', 'B', 22893.55, '2026-08-24 09:19:52.140215+00', '2026-08-24 09:19:52.140215+00');
INSERT INTO app.material_type_prices VALUES (194, 2, '120', 'A', 21545.16, '2026-08-24 09:19:52.140487+00', '2026-08-24 09:19:52.140487+00');
INSERT INTO app.material_type_prices VALUES (195, 2, '120', 'B', 24219.35, '2026-08-24 09:19:52.140766+00', '2026-08-24 09:19:52.140766+00');
INSERT INTO app.material_type_prices VALUES (196, 2, '125', 'A', 24225.81, '2026-08-24 09:19:52.141016+00', '2026-08-24 09:19:52.141016+00');
INSERT INTO app.material_type_prices VALUES (197, 2, '125', 'B', 27048.39, '2026-08-24 09:19:52.141245+00', '2026-08-24 09:19:52.141245+00');
INSERT INTO app.material_type_prices VALUES (198, 2, '130', 'A', 26493.55, '2026-08-24 09:19:52.141503+00', '2026-08-24 09:19:52.141503+00');
INSERT INTO app.material_type_prices VALUES (199, 2, '130', 'B', 29435.48, '2026-08-24 09:19:52.141746+00', '2026-08-24 09:19:52.141746+00');
INSERT INTO app.material_type_prices VALUES (200, 2, '135', 'A', 28912.90, '2026-08-24 09:19:52.141995+00', '2026-08-24 09:19:52.141995+00');
INSERT INTO app.material_type_prices VALUES (201, 2, '135', 'B', 31993.55, '2026-08-24 09:19:52.142234+00', '2026-08-24 09:19:52.142234+00');
INSERT INTO app.material_type_prices VALUES (202, 2, '140', 'A', 31151.61, '2026-08-24 09:19:52.14247+00', '2026-08-24 09:19:52.14247+00');
INSERT INTO app.material_type_prices VALUES (203, 2, '140', 'B', 34354.84, '2026-08-24 09:19:52.142756+00', '2026-08-24 09:19:52.142756+00');
INSERT INTO app.material_type_prices VALUES (204, 2, '145', 'A', 31906.45, '2026-08-24 09:19:52.143029+00', '2026-08-24 09:19:52.143029+00');
INSERT INTO app.material_type_prices VALUES (205, 2, '145', 'B', 35232.26, '2026-08-24 09:19:52.143317+00', '2026-08-24 09:19:52.143317+00');
INSERT INTO app.material_type_prices VALUES (206, 2, '150', 'A', 34761.29, '2026-08-24 09:19:52.143617+00', '2026-08-24 09:19:52.143617+00');
INSERT INTO app.material_type_prices VALUES (207, 2, '150', 'B', 38212.90, '2026-08-24 09:19:52.143913+00', '2026-08-24 09:19:52.143913+00');
INSERT INTO app.material_type_prices VALUES (208, 2, '155', 'A', 38254.84, '2026-08-24 09:19:52.144172+00', '2026-08-24 09:19:52.144172+00');
INSERT INTO app.material_type_prices VALUES (209, 2, '155', 'B', 41838.71, '2026-08-24 09:19:52.144423+00', '2026-08-24 09:19:52.144423+00');
INSERT INTO app.material_type_prices VALUES (210, 2, '160', 'A', 40206.45, '2026-08-24 09:19:52.144708+00', '2026-08-24 09:19:52.144708+00');
INSERT INTO app.material_type_prices VALUES (211, 2, '160', 'B', 43925.81, '2026-08-24 09:19:52.144965+00', '2026-08-24 09:19:52.144965+00');
INSERT INTO app.material_type_prices VALUES (212, 2, '165', 'A', 42300.00, '2026-08-24 09:19:52.145207+00', '2026-08-24 09:19:52.145207+00');
INSERT INTO app.material_type_prices VALUES (213, 2, '170', 'A', 44835.48, '2026-08-24 09:19:52.14546+00', '2026-08-24 09:19:52.14546+00');
INSERT INTO app.material_type_prices VALUES (214, 2, '170', 'B', 48812.90, '2026-08-24 09:19:52.145714+00', '2026-08-24 09:19:52.145714+00');
INSERT INTO app.material_type_prices VALUES (215, 2, '175', 'A', 47109.68, '2026-08-24 09:19:52.146047+00', '2026-08-24 09:19:52.146047+00');
INSERT INTO app.material_type_prices VALUES (216, 2, '180', 'A', 48593.55, '2026-08-24 09:19:52.146379+00', '2026-08-24 09:19:52.146379+00');
INSERT INTO app.material_type_prices VALUES (217, 2, '180', 'B', 52819.35, '2026-08-24 09:19:52.146699+00', '2026-08-24 09:19:52.146699+00');
INSERT INTO app.material_type_prices VALUES (218, 2, '185', 'A', 53425.81, '2026-08-24 09:19:52.147+00', '2026-08-24 09:19:52.147+00');
INSERT INTO app.material_type_prices VALUES (219, 2, '190', 'A', 58870.97, '2026-08-24 09:19:52.147297+00', '2026-08-24 09:19:52.147297+00');
INSERT INTO app.material_type_prices VALUES (220, 2, '190', 'B', 63425.81, '2026-08-24 09:19:52.147562+00', '2026-08-24 09:19:52.147562+00');
INSERT INTO app.material_type_prices VALUES (221, 2, '195', 'A', 59745.16, '2026-08-24 09:19:52.147845+00', '2026-08-24 09:19:52.147845+00');
INSERT INTO app.material_type_prices VALUES (222, 2, '200', 'A', 62332.26, '2026-08-24 09:19:52.148132+00', '2026-08-24 09:19:52.148132+00');
INSERT INTO app.material_type_prices VALUES (223, 2, '200', 'B', 67116.13, '2026-08-24 09:19:52.148402+00', '2026-08-24 09:19:52.148402+00');
INSERT INTO app.material_type_prices VALUES (224, 2, '210', 'B', 74622.58, '2026-08-24 09:19:52.148694+00', '2026-08-24 09:19:52.148694+00');
INSERT INTO app.material_type_prices VALUES (225, 2, '220', 'B', 82135.48, '2026-08-24 09:19:52.148992+00', '2026-08-24 09:19:52.148992+00');
INSERT INTO app.material_type_prices VALUES (226, 2, '230', 'B', 88441.94, '2026-08-24 09:19:52.149268+00', '2026-08-24 09:19:52.149268+00');
INSERT INTO app.material_type_prices VALUES (227, 2, '240', 'B', 93209.68, '2026-08-24 09:19:52.149557+00', '2026-08-24 09:19:52.149557+00');
INSERT INTO app.material_type_prices VALUES (228, 2, '250', 'B', 97980.65, '2026-08-24 09:19:52.149837+00', '2026-08-24 09:19:52.149837+00');
INSERT INTO app.material_type_prices VALUES (229, 2, '260', 'B', 117987.10, '2026-08-24 09:19:52.150136+00', '2026-08-24 09:19:52.150136+00');
INSERT INTO app.material_type_prices VALUES (230, 2, '270', 'B', 126558.06, '2026-08-24 09:19:52.15039+00', '2026-08-24 09:19:52.15039+00');
INSERT INTO app.material_type_prices VALUES (231, 2, '280', 'B', 135135.48, '2026-08-24 09:19:52.150639+00', '2026-08-24 09:19:52.150639+00');
INSERT INTO app.material_type_prices VALUES (232, 2, '290', 'B', 142967.74, '2026-08-24 09:19:52.150887+00', '2026-08-24 09:19:52.150887+00');
INSERT INTO app.material_type_prices VALUES (233, 2, '300', 'B', 150774.19, '2026-08-24 09:19:52.151157+00', '2026-08-24 09:19:52.151157+00');
INSERT INTO app.material_type_prices VALUES (234, 2, '310', 'B', 158577.42, '2026-08-24 09:19:52.151424+00', '2026-08-24 09:19:52.151424+00');
INSERT INTO app.material_type_prices VALUES (235, 2, '320', 'B', 166416.13, '2026-08-24 09:19:52.151717+00', '2026-08-24 09:19:52.151717+00');
INSERT INTO app.material_type_prices VALUES (236, 2, '330', 'B', 175754.84, '2026-08-24 09:19:52.152018+00', '2026-08-24 09:19:52.152018+00');
INSERT INTO app.material_type_prices VALUES (237, 2, '340', 'B', 189687.10, '2026-08-24 09:19:52.152302+00', '2026-08-24 09:19:52.152302+00');
INSERT INTO app.material_type_prices VALUES (238, 2, '350', 'B', 205070.97, '2026-08-24 09:19:52.152557+00', '2026-08-24 09:19:52.152557+00');
INSERT INTO app.material_type_prices VALUES (239, 3, '010', 'A', 1309.68, '2026-08-24 09:19:52.152806+00', '2026-08-24 09:19:52.152806+00');
INSERT INTO app.material_type_prices VALUES (240, 3, '010', 'B', 3516.13, '2026-08-24 09:19:52.153083+00', '2026-08-24 09:19:52.153083+00');
INSERT INTO app.material_type_prices VALUES (241, 3, '015', 'A', 1309.68, '2026-08-24 09:19:52.153321+00', '2026-08-24 09:19:52.153321+00');
INSERT INTO app.material_type_prices VALUES (242, 3, '015', 'B', 3516.13, '2026-08-24 09:19:52.153585+00', '2026-08-24 09:19:52.153585+00');
INSERT INTO app.material_type_prices VALUES (243, 3, '020', 'A', 1674.19, '2026-08-24 09:19:52.153853+00', '2026-08-24 09:19:52.153853+00');
INSERT INTO app.material_type_prices VALUES (244, 3, '020', 'B', 3516.13, '2026-08-24 09:19:52.154112+00', '2026-08-24 09:19:52.154112+00');
INSERT INTO app.material_type_prices VALUES (245, 3, '025', 'A', 1909.68, '2026-08-24 09:19:52.154377+00', '2026-08-24 09:19:52.154377+00');
INSERT INTO app.material_type_prices VALUES (246, 3, '025', 'B', 3516.13, '2026-08-24 09:19:52.154628+00', '2026-08-24 09:19:52.154628+00');
INSERT INTO app.material_type_prices VALUES (247, 3, '030', 'A', 2777.42, '2026-08-24 09:19:52.154879+00', '2026-08-24 09:19:52.154879+00');
INSERT INTO app.material_type_prices VALUES (248, 3, '030', 'B', 3516.13, '2026-08-24 09:19:52.155145+00', '2026-08-24 09:19:52.155145+00');
INSERT INTO app.material_type_prices VALUES (249, 3, '035', 'A', 3448.39, '2026-08-24 09:19:52.155413+00', '2026-08-24 09:19:52.155413+00');
INSERT INTO app.material_type_prices VALUES (250, 3, '035', 'B', 4296.77, '2026-08-24 09:19:52.155675+00', '2026-08-24 09:19:52.155675+00');
INSERT INTO app.material_type_prices VALUES (251, 3, '040', 'A', 3987.10, '2026-08-24 09:19:52.155931+00', '2026-08-24 09:19:52.155931+00');
INSERT INTO app.material_type_prices VALUES (252, 3, '040', 'B', 4951.61, '2026-08-24 09:19:52.156218+00', '2026-08-24 09:19:52.156218+00');
INSERT INTO app.material_type_prices VALUES (253, 3, '045', 'A', 5019.35, '2026-08-24 09:19:52.156473+00', '2026-08-24 09:19:52.156473+00');
INSERT INTO app.material_type_prices VALUES (254, 3, '045', 'B', 6132.26, '2026-08-24 09:19:52.156741+00', '2026-08-24 09:19:52.156741+00');
INSERT INTO app.material_type_prices VALUES (255, 3, '050', 'A', 5625.81, '2026-08-24 09:19:52.156993+00', '2026-08-24 09:19:52.156993+00');
INSERT INTO app.material_type_prices VALUES (256, 3, '050', 'B', 6848.39, '2026-08-24 09:19:52.15725+00', '2026-08-24 09:19:52.15725+00');
INSERT INTO app.material_type_prices VALUES (257, 3, '055', 'A', 6725.81, '2026-08-24 09:19:52.157497+00', '2026-08-24 09:19:52.157497+00');
INSERT INTO app.material_type_prices VALUES (258, 3, '055', 'B', 8096.77, '2026-08-24 09:19:52.15776+00', '2026-08-24 09:19:52.15776+00');
INSERT INTO app.material_type_prices VALUES (259, 3, '060', 'A', 7732.26, '2026-08-24 09:19:52.15804+00', '2026-08-24 09:19:52.15804+00');
INSERT INTO app.material_type_prices VALUES (260, 3, '060', 'B', 9216.13, '2026-08-24 09:19:52.158299+00', '2026-08-24 09:19:52.158299+00');
INSERT INTO app.material_type_prices VALUES (261, 3, '065', 'A', 9845.16, '2026-08-24 09:19:52.158553+00', '2026-08-24 09:19:52.158553+00');
INSERT INTO app.material_type_prices VALUES (262, 3, '065', 'B', 11483.87, '2026-08-24 09:19:52.158803+00', '2026-08-24 09:19:52.158803+00');
INSERT INTO app.material_type_prices VALUES (263, 3, '070', 'A', 10916.13, '2026-08-24 09:19:52.159064+00', '2026-08-24 09:19:52.159064+00');
INSERT INTO app.material_type_prices VALUES (264, 3, '070', 'B', 12674.19, '2026-08-24 09:19:52.159307+00', '2026-08-24 09:19:52.159307+00');
INSERT INTO app.material_type_prices VALUES (265, 3, '075', 'A', 11616.13, '2026-08-24 09:19:52.159574+00', '2026-08-24 09:19:52.159574+00');
INSERT INTO app.material_type_prices VALUES (266, 3, '075', 'B', 13490.32, '2026-08-24 09:19:52.159849+00', '2026-08-24 09:19:52.159849+00');
INSERT INTO app.material_type_prices VALUES (267, 3, '080', 'A', 12490.32, '2026-08-24 09:19:52.160128+00', '2026-08-24 09:19:52.160128+00');
INSERT INTO app.material_type_prices VALUES (268, 3, '080', 'B', 14500.00, '2026-08-24 09:19:52.160392+00', '2026-08-24 09:19:52.160392+00');
INSERT INTO app.material_type_prices VALUES (269, 3, '085', 'A', 14900.00, '2026-08-24 09:19:52.160672+00', '2026-08-24 09:19:52.160672+00');
INSERT INTO app.material_type_prices VALUES (270, 3, '085', 'B', 17074.19, '2026-08-24 09:19:52.160924+00', '2026-08-24 09:19:52.160924+00');
INSERT INTO app.material_type_prices VALUES (271, 3, '090', 'A', 15767.74, '2026-08-24 09:19:52.161186+00', '2026-08-24 09:19:52.161186+00');
INSERT INTO app.material_type_prices VALUES (272, 3, '090', 'B', 18058.06, '2026-08-24 09:19:52.161438+00', '2026-08-24 09:19:52.161438+00');
INSERT INTO app.material_type_prices VALUES (273, 3, '095', 'A', 17477.42, '2026-08-24 09:19:52.16167+00', '2026-08-24 09:19:52.16167+00');
INSERT INTO app.material_type_prices VALUES (274, 3, '095', 'B', 19890.32, '2026-08-24 09:19:52.161899+00', '2026-08-24 09:19:52.161899+00');
INSERT INTO app.material_type_prices VALUES (275, 3, '100', 'A', 18545.16, '2026-08-24 09:19:52.162161+00', '2026-08-24 09:19:52.162161+00');
INSERT INTO app.material_type_prices VALUES (276, 3, '100', 'B', 21106.45, '2026-08-24 09:19:52.162407+00', '2026-08-24 09:19:52.162407+00');
INSERT INTO app.material_type_prices VALUES (277, 3, '105', 'A', 20254.84, '2026-08-24 09:19:52.16264+00', '2026-08-24 09:19:52.16264+00');
INSERT INTO app.material_type_prices VALUES (278, 3, '105', 'B', 22935.48, '2026-08-24 09:19:52.162895+00', '2026-08-24 09:19:52.162895+00');
INSERT INTO app.material_type_prices VALUES (279, 3, '110', 'A', 22000.00, '2026-08-24 09:19:52.163141+00', '2026-08-24 09:19:52.163141+00');
INSERT INTO app.material_type_prices VALUES (280, 3, '110', 'B', 24835.48, '2026-08-24 09:19:52.163428+00', '2026-08-24 09:19:52.163428+00');
INSERT INTO app.material_type_prices VALUES (281, 3, '115', 'A', 23374.19, '2026-08-24 09:19:52.163681+00', '2026-08-24 09:19:52.163681+00');
INSERT INTO app.material_type_prices VALUES (282, 3, '115', 'B', 26329.03, '2026-08-24 09:19:52.163926+00', '2026-08-24 09:19:52.163926+00');
INSERT INTO app.material_type_prices VALUES (283, 3, '120', 'A', 24777.42, '2026-08-24 09:19:52.164173+00', '2026-08-24 09:19:52.164173+00');
INSERT INTO app.material_type_prices VALUES (284, 3, '120', 'B', 27851.61, '2026-08-24 09:19:52.164428+00', '2026-08-24 09:19:52.164428+00');
INSERT INTO app.material_type_prices VALUES (285, 3, '125', 'A', 27858.06, '2026-08-24 09:19:52.16468+00', '2026-08-24 09:19:52.16468+00');
INSERT INTO app.material_type_prices VALUES (286, 3, '125', 'B', 31103.23, '2026-08-24 09:19:52.164941+00', '2026-08-24 09:19:52.164941+00');
INSERT INTO app.material_type_prices VALUES (287, 3, '130', 'A', 30467.74, '2026-08-24 09:19:52.165226+00', '2026-08-24 09:19:52.165226+00');
INSERT INTO app.material_type_prices VALUES (288, 3, '130', 'B', 33848.39, '2026-08-24 09:19:52.165491+00', '2026-08-24 09:19:52.165491+00');
INSERT INTO app.material_type_prices VALUES (289, 3, '135', 'A', 33248.39, '2026-08-24 09:19:52.165772+00', '2026-08-24 09:19:52.165772+00');
INSERT INTO app.material_type_prices VALUES (290, 3, '135', 'B', 36790.32, '2026-08-24 09:19:52.166085+00', '2026-08-24 09:19:52.166085+00');
INSERT INTO app.material_type_prices VALUES (291, 3, '140', 'A', 35825.81, '2026-08-24 09:19:52.166348+00', '2026-08-24 09:19:52.166348+00');
INSERT INTO app.material_type_prices VALUES (292, 3, '140', 'B', 39509.68, '2026-08-24 09:19:52.16663+00', '2026-08-24 09:19:52.16663+00');
INSERT INTO app.material_type_prices VALUES (293, 3, '145', 'A', 36693.55, '2026-08-24 09:19:52.166929+00', '2026-08-24 09:19:52.166929+00');
INSERT INTO app.material_type_prices VALUES (294, 3, '145', 'B', 40516.13, '2026-08-24 09:19:52.167186+00', '2026-08-24 09:19:52.167186+00');
INSERT INTO app.material_type_prices VALUES (295, 3, '150', 'A', 39977.42, '2026-08-24 09:19:52.16746+00', '2026-08-24 09:19:52.16746+00');
INSERT INTO app.material_type_prices VALUES (296, 3, '150', 'B', 43945.16, '2026-08-24 09:19:52.167746+00', '2026-08-24 09:19:52.167746+00');
INSERT INTO app.material_type_prices VALUES (297, 3, '155', 'A', 43993.55, '2026-08-24 09:19:52.168032+00', '2026-08-24 09:19:52.168032+00');
INSERT INTO app.material_type_prices VALUES (298, 3, '155', 'B', 48112.90, '2026-08-24 09:19:52.168296+00', '2026-08-24 09:19:52.168296+00');
INSERT INTO app.material_type_prices VALUES (299, 3, '160', 'A', 46235.48, '2026-08-24 09:19:52.168581+00', '2026-08-24 09:19:52.168581+00');
INSERT INTO app.material_type_prices VALUES (300, 3, '160', 'B', 50516.13, '2026-08-24 09:19:52.16885+00', '2026-08-24 09:19:52.16885+00');
INSERT INTO app.material_type_prices VALUES (301, 3, '165', 'A', 48645.16, '2026-08-24 09:19:52.169129+00', '2026-08-24 09:19:52.169129+00');
INSERT INTO app.material_type_prices VALUES (302, 3, '170', 'A', 51561.29, '2026-08-24 09:19:52.169381+00', '2026-08-24 09:19:52.169381+00');
INSERT INTO app.material_type_prices VALUES (303, 3, '170', 'B', 56135.48, '2026-08-24 09:19:52.169645+00', '2026-08-24 09:19:52.169645+00');
INSERT INTO app.material_type_prices VALUES (304, 3, '175', 'A', 54174.19, '2026-08-24 09:19:52.169902+00', '2026-08-24 09:19:52.169902+00');
INSERT INTO app.material_type_prices VALUES (305, 3, '180', 'A', 55883.87, '2026-08-24 09:19:52.17016+00', '2026-08-24 09:19:52.17016+00');
INSERT INTO app.material_type_prices VALUES (306, 3, '180', 'B', 60741.94, '2026-08-24 09:19:52.170421+00', '2026-08-24 09:19:52.170421+00');
INSERT INTO app.material_type_prices VALUES (307, 3, '185', 'A', 61438.71, '2026-08-24 09:19:52.170664+00', '2026-08-24 09:19:52.170664+00');
INSERT INTO app.material_type_prices VALUES (308, 3, '190', 'A', 67703.23, '2026-08-24 09:19:52.170908+00', '2026-08-24 09:19:52.170908+00');
INSERT INTO app.material_type_prices VALUES (309, 3, '190', 'B', 72941.94, '2026-08-24 09:19:52.171158+00', '2026-08-24 09:19:52.171158+00');
INSERT INTO app.material_type_prices VALUES (310, 3, '195', 'A', 68709.68, '2026-08-24 09:19:52.171436+00', '2026-08-24 09:19:52.171436+00');
INSERT INTO app.material_type_prices VALUES (311, 3, '200', 'A', 71683.87, '2026-08-24 09:19:52.171692+00', '2026-08-24 09:19:52.171692+00');
INSERT INTO app.material_type_prices VALUES (312, 3, '200', 'B', 77183.87, '2026-08-24 09:19:52.171933+00', '2026-08-24 09:19:52.171933+00');
INSERT INTO app.material_type_prices VALUES (313, 3, '210', 'B', 85812.90, '2026-08-24 09:19:52.17218+00', '2026-08-24 09:19:52.17218+00');
INSERT INTO app.material_type_prices VALUES (314, 3, '220', 'B', 94454.84, '2026-08-24 09:19:52.172434+00', '2026-08-24 09:19:52.172434+00');
INSERT INTO app.material_type_prices VALUES (315, 3, '230', 'B', 101706.45, '2026-08-24 09:19:52.172702+00', '2026-08-24 09:19:52.172702+00');
INSERT INTO app.material_type_prices VALUES (316, 3, '240', 'B', 107190.32, '2026-08-24 09:19:52.172958+00', '2026-08-24 09:19:52.172958+00');
INSERT INTO app.material_type_prices VALUES (317, 3, '250', 'B', 112677.42, '2026-08-24 09:19:52.173208+00', '2026-08-24 09:19:52.173208+00');
INSERT INTO app.material_type_prices VALUES (318, 3, '260', 'B', 135683.87, '2026-08-24 09:19:52.173471+00', '2026-08-24 09:19:52.173471+00');
INSERT INTO app.material_type_prices VALUES (319, 3, '270', 'B', 145541.94, '2026-08-24 09:19:52.173722+00', '2026-08-24 09:19:52.173722+00');
INSERT INTO app.material_type_prices VALUES (320, 3, '280', 'B', 155406.45, '2026-08-24 09:19:52.173984+00', '2026-08-24 09:19:52.173984+00');
INSERT INTO app.material_type_prices VALUES (321, 3, '290', 'B', 164412.90, '2026-08-24 09:19:52.174231+00', '2026-08-24 09:19:52.174231+00');
INSERT INTO app.material_type_prices VALUES (322, 3, '300', 'B', 173390.32, '2026-08-24 09:19:52.174477+00', '2026-08-24 09:19:52.174477+00');
INSERT INTO app.material_type_prices VALUES (323, 3, '310', 'B', 182364.52, '2026-08-24 09:19:52.174742+00', '2026-08-24 09:19:52.174742+00');
INSERT INTO app.material_type_prices VALUES (324, 3, '320', 'B', 191377.42, '2026-08-24 09:19:52.174995+00', '2026-08-24 09:19:52.174995+00');
INSERT INTO app.material_type_prices VALUES (325, 3, '330', 'B', 202119.35, '2026-08-24 09:19:52.175253+00', '2026-08-24 09:19:52.175253+00');
INSERT INTO app.material_type_prices VALUES (326, 3, '340', 'B', 218138.71, '2026-08-24 09:19:52.175517+00', '2026-08-24 09:19:52.175517+00');
INSERT INTO app.material_type_prices VALUES (327, 3, '350', 'B', 235829.03, '2026-08-24 09:19:52.175774+00', '2026-08-24 09:19:52.175774+00');
INSERT INTO app.material_type_prices VALUES (328, 4, '010', 'A', 1138.71, '2026-08-24 09:19:52.176047+00', '2026-08-24 09:19:52.176047+00');
INSERT INTO app.material_type_prices VALUES (329, 4, '010', 'B', 3058.06, '2026-08-24 09:19:52.176304+00', '2026-08-24 09:19:52.176304+00');
INSERT INTO app.material_type_prices VALUES (330, 4, '015', 'A', 1138.71, '2026-08-24 09:19:52.176541+00', '2026-08-24 09:19:52.176541+00');
INSERT INTO app.material_type_prices VALUES (331, 4, '015', 'B', 3058.06, '2026-08-24 09:19:52.176798+00', '2026-08-24 09:19:52.176798+00');
INSERT INTO app.material_type_prices VALUES (332, 4, '020', 'A', 1454.84, '2026-08-24 09:19:52.177146+00', '2026-08-24 09:19:52.177146+00');
INSERT INTO app.material_type_prices VALUES (333, 4, '020', 'B', 3058.06, '2026-08-24 09:19:52.177401+00', '2026-08-24 09:19:52.177401+00');
INSERT INTO app.material_type_prices VALUES (334, 4, '025', 'A', 1661.29, '2026-08-24 09:19:52.177654+00', '2026-08-24 09:19:52.177654+00');
INSERT INTO app.material_type_prices VALUES (335, 4, '025', 'B', 3058.06, '2026-08-24 09:19:52.177898+00', '2026-08-24 09:19:52.177898+00');
INSERT INTO app.material_type_prices VALUES (336, 4, '030', 'A', 2416.13, '2026-08-24 09:19:52.178188+00', '2026-08-24 09:19:52.178188+00');
INSERT INTO app.material_type_prices VALUES (337, 4, '030', 'B', 3058.06, '2026-08-24 09:19:52.178467+00', '2026-08-24 09:19:52.178467+00');
INSERT INTO app.material_type_prices VALUES (338, 4, '035', 'A', 3000.00, '2026-08-24 09:19:52.178723+00', '2026-08-24 09:19:52.178723+00');
INSERT INTO app.material_type_prices VALUES (339, 4, '035', 'B', 3735.48, '2026-08-24 09:19:52.178996+00', '2026-08-24 09:19:52.178996+00');
INSERT INTO app.material_type_prices VALUES (340, 4, '040', 'A', 3464.52, '2026-08-24 09:19:52.179269+00', '2026-08-24 09:19:52.179269+00');
INSERT INTO app.material_type_prices VALUES (341, 4, '040', 'B', 4306.45, '2026-08-24 09:19:52.179538+00', '2026-08-24 09:19:52.179538+00');
INSERT INTO app.material_type_prices VALUES (342, 4, '045', 'A', 4364.52, '2026-08-24 09:19:52.179807+00', '2026-08-24 09:19:52.179807+00');
INSERT INTO app.material_type_prices VALUES (343, 4, '045', 'B', 5332.26, '2026-08-24 09:19:52.180049+00', '2026-08-24 09:19:52.180049+00');
INSERT INTO app.material_type_prices VALUES (344, 4, '050', 'A', 4890.32, '2026-08-24 09:19:52.180279+00', '2026-08-24 09:19:52.180279+00');
INSERT INTO app.material_type_prices VALUES (345, 4, '050', 'B', 5954.84, '2026-08-24 09:19:52.180512+00', '2026-08-24 09:19:52.180512+00');
INSERT INTO app.material_type_prices VALUES (346, 4, '055', 'A', 5848.39, '2026-08-24 09:19:52.180823+00', '2026-08-24 09:19:52.180823+00');
INSERT INTO app.material_type_prices VALUES (347, 4, '055', 'B', 7041.94, '2026-08-24 09:19:52.181084+00', '2026-08-24 09:19:52.181084+00');
INSERT INTO app.material_type_prices VALUES (348, 4, '060', 'A', 6722.58, '2026-08-24 09:19:52.181324+00', '2026-08-24 09:19:52.181324+00');
INSERT INTO app.material_type_prices VALUES (349, 4, '060', 'B', 8016.13, '2026-08-24 09:19:52.181563+00', '2026-08-24 09:19:52.181563+00');
INSERT INTO app.material_type_prices VALUES (350, 4, '065', 'A', 8561.29, '2026-08-24 09:19:52.181804+00', '2026-08-24 09:19:52.181804+00');
INSERT INTO app.material_type_prices VALUES (351, 4, '065', 'B', 9987.10, '2026-08-24 09:19:52.182085+00', '2026-08-24 09:19:52.182085+00');
INSERT INTO app.material_type_prices VALUES (352, 4, '070', 'A', 9490.32, '2026-08-24 09:19:52.182363+00', '2026-08-24 09:19:52.182363+00');
INSERT INTO app.material_type_prices VALUES (353, 4, '070', 'B', 11019.35, '2026-08-24 09:19:52.182619+00', '2026-08-24 09:19:52.182619+00');
INSERT INTO app.material_type_prices VALUES (354, 4, '075', 'A', 10103.23, '2026-08-24 09:19:52.182867+00', '2026-08-24 09:19:52.182867+00');
INSERT INTO app.material_type_prices VALUES (355, 4, '075', 'B', 11732.26, '2026-08-24 09:19:52.183133+00', '2026-08-24 09:19:52.183133+00');
INSERT INTO app.material_type_prices VALUES (356, 4, '080', 'A', 10861.29, '2026-08-24 09:19:52.183417+00', '2026-08-24 09:19:52.183417+00');
INSERT INTO app.material_type_prices VALUES (357, 4, '080', 'B', 12609.68, '2026-08-24 09:19:52.183687+00', '2026-08-24 09:19:52.183687+00');
INSERT INTO app.material_type_prices VALUES (358, 4, '085', 'A', 12958.06, '2026-08-24 09:19:52.183948+00', '2026-08-24 09:19:52.183948+00');
INSERT INTO app.material_type_prices VALUES (359, 4, '085', 'B', 14845.16, '2026-08-24 09:19:52.184201+00', '2026-08-24 09:19:52.184201+00');
INSERT INTO app.material_type_prices VALUES (360, 4, '090', 'A', 13712.90, '2026-08-24 09:19:52.184473+00', '2026-08-24 09:19:52.184473+00');
INSERT INTO app.material_type_prices VALUES (361, 4, '090', 'B', 15703.23, '2026-08-24 09:19:52.184758+00', '2026-08-24 09:19:52.184758+00');
INSERT INTO app.material_type_prices VALUES (362, 4, '095', 'A', 15196.77, '2026-08-24 09:19:52.185046+00', '2026-08-24 09:19:52.185046+00');
INSERT INTO app.material_type_prices VALUES (363, 4, '095', 'B', 17293.55, '2026-08-24 09:19:52.185302+00', '2026-08-24 09:19:52.185302+00');
INSERT INTO app.material_type_prices VALUES (364, 4, '100', 'A', 16129.03, '2026-08-24 09:19:52.185567+00', '2026-08-24 09:19:52.185567+00');
INSERT INTO app.material_type_prices VALUES (365, 4, '100', 'B', 18354.84, '2026-08-24 09:19:52.185853+00', '2026-08-24 09:19:52.185853+00');
INSERT INTO app.material_type_prices VALUES (366, 4, '105', 'A', 17612.90, '2026-08-24 09:19:52.186329+00', '2026-08-24 09:19:52.186329+00');
INSERT INTO app.material_type_prices VALUES (367, 4, '105', 'B', 19945.16, '2026-08-24 09:19:52.186643+00', '2026-08-24 09:19:52.186643+00');
INSERT INTO app.material_type_prices VALUES (368, 4, '110', 'A', 19129.03, '2026-08-24 09:19:52.186936+00', '2026-08-24 09:19:52.186936+00');
INSERT INTO app.material_type_prices VALUES (369, 4, '110', 'B', 21596.77, '2026-08-24 09:19:52.187244+00', '2026-08-24 09:19:52.187244+00');
INSERT INTO app.material_type_prices VALUES (370, 4, '115', 'A', 20322.58, '2026-08-24 09:19:52.187522+00', '2026-08-24 09:19:52.187522+00');
INSERT INTO app.material_type_prices VALUES (371, 4, '115', 'B', 22893.55, '2026-08-24 09:19:52.187799+00', '2026-08-24 09:19:52.187799+00');
INSERT INTO app.material_type_prices VALUES (372, 4, '120', 'A', 21545.16, '2026-08-24 09:19:52.188097+00', '2026-08-24 09:19:52.188097+00');
INSERT INTO app.material_type_prices VALUES (373, 4, '120', 'B', 24219.35, '2026-08-24 09:19:52.18838+00', '2026-08-24 09:19:52.18838+00');
INSERT INTO app.material_type_prices VALUES (374, 4, '125', 'A', 24225.81, '2026-08-24 09:19:52.188646+00', '2026-08-24 09:19:52.188646+00');
INSERT INTO app.material_type_prices VALUES (375, 4, '125', 'B', 27048.39, '2026-08-24 09:19:52.188966+00', '2026-08-24 09:19:52.188966+00');
INSERT INTO app.material_type_prices VALUES (376, 4, '130', 'A', 26493.55, '2026-08-24 09:19:52.189232+00', '2026-08-24 09:19:52.189232+00');
INSERT INTO app.material_type_prices VALUES (377, 4, '130', 'B', 29435.48, '2026-08-24 09:19:52.189488+00', '2026-08-24 09:19:52.189488+00');
INSERT INTO app.material_type_prices VALUES (378, 4, '135', 'A', 28912.90, '2026-08-24 09:19:52.189773+00', '2026-08-24 09:19:52.189773+00');
INSERT INTO app.material_type_prices VALUES (379, 4, '135', 'B', 31993.55, '2026-08-24 09:19:52.190036+00', '2026-08-24 09:19:52.190036+00');
INSERT INTO app.material_type_prices VALUES (380, 4, '140', 'A', 31151.61, '2026-08-24 09:19:52.19031+00', '2026-08-24 09:19:52.19031+00');
INSERT INTO app.material_type_prices VALUES (381, 4, '140', 'B', 34354.84, '2026-08-24 09:19:52.190554+00', '2026-08-24 09:19:52.190554+00');
INSERT INTO app.material_type_prices VALUES (382, 4, '145', 'A', 31906.45, '2026-08-24 09:19:52.190803+00', '2026-08-24 09:19:52.190803+00');
INSERT INTO app.material_type_prices VALUES (383, 4, '145', 'B', 35232.26, '2026-08-24 09:19:52.191071+00', '2026-08-24 09:19:52.191071+00');
INSERT INTO app.material_type_prices VALUES (384, 4, '150', 'A', 34761.29, '2026-08-24 09:19:52.191391+00', '2026-08-24 09:19:52.191391+00');
INSERT INTO app.material_type_prices VALUES (385, 4, '150', 'B', 38212.90, '2026-08-24 09:19:52.191627+00', '2026-08-24 09:19:52.191627+00');
INSERT INTO app.material_type_prices VALUES (386, 4, '155', 'A', 38254.84, '2026-08-24 09:19:52.191889+00', '2026-08-24 09:19:52.191889+00');
INSERT INTO app.material_type_prices VALUES (387, 4, '155', 'B', 41838.71, '2026-08-24 09:19:52.192131+00', '2026-08-24 09:19:52.192131+00');
INSERT INTO app.material_type_prices VALUES (388, 4, '160', 'A', 40206.45, '2026-08-24 09:19:52.192382+00', '2026-08-24 09:19:52.192382+00');
INSERT INTO app.material_type_prices VALUES (389, 4, '160', 'B', 43925.81, '2026-08-24 09:19:52.192634+00', '2026-08-24 09:19:52.192634+00');
INSERT INTO app.material_type_prices VALUES (390, 4, '165', 'A', 42300.00, '2026-08-24 09:19:52.19287+00', '2026-08-24 09:19:52.19287+00');
INSERT INTO app.material_type_prices VALUES (391, 4, '170', 'A', 44835.48, '2026-08-24 09:19:52.193115+00', '2026-08-24 09:19:52.193115+00');
INSERT INTO app.material_type_prices VALUES (392, 4, '170', 'B', 48812.90, '2026-08-24 09:19:52.19336+00', '2026-08-24 09:19:52.19336+00');
INSERT INTO app.material_type_prices VALUES (393, 4, '175', 'A', 47109.68, '2026-08-24 09:19:52.193608+00', '2026-08-24 09:19:52.193608+00');
INSERT INTO app.material_type_prices VALUES (394, 4, '180', 'A', 48593.55, '2026-08-24 09:19:52.193887+00', '2026-08-24 09:19:52.193887+00');
INSERT INTO app.material_type_prices VALUES (395, 4, '180', 'B', 52819.35, '2026-08-24 09:19:52.194193+00', '2026-08-24 09:19:52.194193+00');
INSERT INTO app.material_type_prices VALUES (396, 4, '185', 'A', 53425.81, '2026-08-24 09:19:52.194453+00', '2026-08-24 09:19:52.194453+00');
INSERT INTO app.material_type_prices VALUES (397, 4, '190', 'A', 58870.97, '2026-08-24 09:19:52.194723+00', '2026-08-24 09:19:52.194723+00');
INSERT INTO app.material_type_prices VALUES (398, 4, '190', 'B', 63425.81, '2026-08-24 09:19:52.194976+00', '2026-08-24 09:19:52.194976+00');
INSERT INTO app.material_type_prices VALUES (399, 4, '195', 'A', 59745.16, '2026-08-24 09:19:52.195227+00', '2026-08-24 09:19:52.195227+00');
INSERT INTO app.material_type_prices VALUES (400, 4, '200', 'A', 62332.26, '2026-08-24 09:19:52.195492+00', '2026-08-24 09:19:52.195492+00');
INSERT INTO app.material_type_prices VALUES (401, 4, '200', 'B', 67116.13, '2026-08-24 09:19:52.19576+00', '2026-08-24 09:19:52.19576+00');
INSERT INTO app.material_type_prices VALUES (402, 4, '210', 'B', 74622.58, '2026-08-24 09:19:52.196043+00', '2026-08-24 09:19:52.196043+00');
INSERT INTO app.material_type_prices VALUES (403, 4, '220', 'B', 82135.48, '2026-08-24 09:19:52.196291+00', '2026-08-24 09:19:52.196291+00');
INSERT INTO app.material_type_prices VALUES (404, 4, '230', 'B', 88441.94, '2026-08-24 09:19:52.196538+00', '2026-08-24 09:19:52.196538+00');
INSERT INTO app.material_type_prices VALUES (405, 4, '240', 'B', 93209.68, '2026-08-24 09:19:52.196799+00', '2026-08-24 09:19:52.196799+00');
INSERT INTO app.material_type_prices VALUES (406, 4, '250', 'B', 97980.65, '2026-08-24 09:19:52.197075+00', '2026-08-24 09:19:52.197075+00');
INSERT INTO app.material_type_prices VALUES (407, 4, '260', 'B', 117987.10, '2026-08-24 09:19:52.197336+00', '2026-08-24 09:19:52.197336+00');
INSERT INTO app.material_type_prices VALUES (408, 4, '270', 'B', 126558.06, '2026-08-24 09:19:52.197589+00', '2026-08-24 09:19:52.197589+00');
INSERT INTO app.material_type_prices VALUES (409, 4, '280', 'B', 135135.48, '2026-08-24 09:19:52.197886+00', '2026-08-24 09:19:52.197886+00');
INSERT INTO app.material_type_prices VALUES (410, 4, '290', 'B', 142967.74, '2026-08-24 09:19:52.198132+00', '2026-08-24 09:19:52.198132+00');
INSERT INTO app.material_type_prices VALUES (411, 4, '300', 'B', 150774.19, '2026-08-24 09:19:52.198402+00', '2026-08-24 09:19:52.198402+00');
INSERT INTO app.material_type_prices VALUES (412, 4, '310', 'B', 158577.42, '2026-08-24 09:19:52.198655+00', '2026-08-24 09:19:52.198655+00');
INSERT INTO app.material_type_prices VALUES (413, 4, '320', 'B', 166416.13, '2026-08-24 09:19:52.198904+00', '2026-08-24 09:19:52.198904+00');
INSERT INTO app.material_type_prices VALUES (414, 4, '330', 'B', 175754.84, '2026-08-24 09:19:52.199153+00', '2026-08-24 09:19:52.199153+00');
INSERT INTO app.material_type_prices VALUES (415, 4, '340', 'B', 189687.10, '2026-08-24 09:19:52.199416+00', '2026-08-24 09:19:52.199416+00');
INSERT INTO app.material_type_prices VALUES (416, 4, '350', 'B', 205070.97, '2026-08-24 09:19:52.199662+00', '2026-08-24 09:19:52.199662+00');
INSERT INTO app.material_type_prices VALUES (417, 5, '010', 'A', 1138.71, '2026-08-24 09:19:52.19993+00', '2026-08-24 09:19:52.19993+00');
INSERT INTO app.material_type_prices VALUES (418, 5, '010', 'B', 3058.06, '2026-08-24 09:19:52.200177+00', '2026-08-24 09:19:52.200177+00');
INSERT INTO app.material_type_prices VALUES (419, 5, '015', 'A', 1138.71, '2026-08-24 09:19:52.200419+00', '2026-08-24 09:19:52.200419+00');
INSERT INTO app.material_type_prices VALUES (420, 5, '015', 'B', 3058.06, '2026-08-24 09:19:52.200672+00', '2026-08-24 09:19:52.200672+00');
INSERT INTO app.material_type_prices VALUES (421, 5, '020', 'A', 1454.84, '2026-08-24 09:19:52.200901+00', '2026-08-24 09:19:52.200901+00');
INSERT INTO app.material_type_prices VALUES (422, 5, '020', 'B', 3058.06, '2026-08-24 09:19:52.20117+00', '2026-08-24 09:19:52.20117+00');
INSERT INTO app.material_type_prices VALUES (423, 5, '025', 'A', 1661.29, '2026-08-24 09:19:52.20142+00', '2026-08-24 09:19:52.20142+00');
INSERT INTO app.material_type_prices VALUES (424, 5, '025', 'B', 3058.06, '2026-08-24 09:19:52.201685+00', '2026-08-24 09:19:52.201685+00');
INSERT INTO app.material_type_prices VALUES (425, 5, '030', 'A', 2416.13, '2026-08-24 09:19:52.201944+00', '2026-08-24 09:19:52.201944+00');
INSERT INTO app.material_type_prices VALUES (426, 5, '030', 'B', 3058.06, '2026-08-24 09:19:52.202204+00', '2026-08-24 09:19:52.202204+00');
INSERT INTO app.material_type_prices VALUES (427, 5, '035', 'A', 3000.00, '2026-08-24 09:19:52.202458+00', '2026-08-24 09:19:52.202458+00');
INSERT INTO app.material_type_prices VALUES (428, 5, '035', 'B', 3735.48, '2026-08-24 09:19:52.202714+00', '2026-08-24 09:19:52.202714+00');
INSERT INTO app.material_type_prices VALUES (429, 5, '040', 'A', 3464.52, '2026-08-24 09:19:52.202952+00', '2026-08-24 09:19:52.202952+00');
INSERT INTO app.material_type_prices VALUES (430, 5, '040', 'B', 4306.45, '2026-08-24 09:19:52.203179+00', '2026-08-24 09:19:52.203179+00');
INSERT INTO app.material_type_prices VALUES (431, 5, '045', 'A', 4364.52, '2026-08-24 09:19:52.203427+00', '2026-08-24 09:19:52.203427+00');
INSERT INTO app.material_type_prices VALUES (432, 5, '045', 'B', 5332.26, '2026-08-24 09:19:52.203671+00', '2026-08-24 09:19:52.203671+00');
INSERT INTO app.material_type_prices VALUES (433, 5, '050', 'A', 4890.32, '2026-08-24 09:19:52.20391+00', '2026-08-24 09:19:52.20391+00');
INSERT INTO app.material_type_prices VALUES (434, 5, '050', 'B', 5954.84, '2026-08-24 09:19:52.204145+00', '2026-08-24 09:19:52.204145+00');
INSERT INTO app.material_type_prices VALUES (435, 5, '055', 'A', 5848.39, '2026-08-24 09:19:52.204386+00', '2026-08-24 09:19:52.204386+00');
INSERT INTO app.material_type_prices VALUES (436, 5, '055', 'B', 7041.94, '2026-08-24 09:19:52.204643+00', '2026-08-24 09:19:52.204643+00');
INSERT INTO app.material_type_prices VALUES (437, 5, '060', 'A', 6722.58, '2026-08-24 09:19:52.204906+00', '2026-08-24 09:19:52.204906+00');
INSERT INTO app.material_type_prices VALUES (438, 5, '060', 'B', 8016.13, '2026-08-24 09:19:52.20515+00', '2026-08-24 09:19:52.20515+00');
INSERT INTO app.material_type_prices VALUES (439, 5, '065', 'A', 8561.29, '2026-08-24 09:19:52.205392+00', '2026-08-24 09:19:52.205392+00');
INSERT INTO app.material_type_prices VALUES (440, 5, '065', 'B', 9987.10, '2026-08-24 09:19:52.205633+00', '2026-08-24 09:19:52.205633+00');
INSERT INTO app.material_type_prices VALUES (441, 5, '070', 'A', 9490.32, '2026-08-24 09:19:52.205882+00', '2026-08-24 09:19:52.205882+00');
INSERT INTO app.material_type_prices VALUES (442, 5, '070', 'B', 11019.35, '2026-08-24 09:19:52.206139+00', '2026-08-24 09:19:52.206139+00');
INSERT INTO app.material_type_prices VALUES (443, 5, '075', 'A', 10103.23, '2026-08-24 09:19:52.206391+00', '2026-08-24 09:19:52.206391+00');
INSERT INTO app.material_type_prices VALUES (444, 5, '075', 'B', 11732.26, '2026-08-24 09:19:52.206641+00', '2026-08-24 09:19:52.206641+00');
INSERT INTO app.material_type_prices VALUES (445, 5, '080', 'A', 10861.29, '2026-08-24 09:19:52.206911+00', '2026-08-24 09:19:52.206911+00');
INSERT INTO app.material_type_prices VALUES (446, 5, '080', 'B', 12609.68, '2026-08-24 09:19:52.207156+00', '2026-08-24 09:19:52.207156+00');
INSERT INTO app.material_type_prices VALUES (447, 5, '085', 'A', 12958.06, '2026-08-24 09:19:52.207465+00', '2026-08-24 09:19:52.207465+00');
INSERT INTO app.material_type_prices VALUES (448, 5, '085', 'B', 14845.16, '2026-08-24 09:19:52.207731+00', '2026-08-24 09:19:52.207731+00');
INSERT INTO app.material_type_prices VALUES (449, 5, '090', 'A', 13712.90, '2026-08-24 09:19:52.207979+00', '2026-08-24 09:19:52.207979+00');
INSERT INTO app.material_type_prices VALUES (450, 5, '090', 'B', 15703.23, '2026-08-24 09:19:52.208245+00', '2026-08-24 09:19:52.208245+00');
INSERT INTO app.material_type_prices VALUES (451, 5, '095', 'A', 15196.77, '2026-08-24 09:19:52.208517+00', '2026-08-24 09:19:52.208517+00');
INSERT INTO app.material_type_prices VALUES (452, 5, '095', 'B', 17293.55, '2026-08-24 09:19:52.208766+00', '2026-08-24 09:19:52.208766+00');
INSERT INTO app.material_type_prices VALUES (453, 5, '100', 'A', 16129.03, '2026-08-24 09:19:52.209023+00', '2026-08-24 09:19:52.209023+00');
INSERT INTO app.material_type_prices VALUES (454, 5, '100', 'B', 18354.84, '2026-08-24 09:19:52.209276+00', '2026-08-24 09:19:52.209276+00');
INSERT INTO app.material_type_prices VALUES (455, 5, '105', 'A', 17612.90, '2026-08-24 09:19:52.209557+00', '2026-08-24 09:19:52.209557+00');
INSERT INTO app.material_type_prices VALUES (456, 5, '105', 'B', 19945.16, '2026-08-24 09:19:52.209814+00', '2026-08-24 09:19:52.209814+00');
INSERT INTO app.material_type_prices VALUES (457, 5, '110', 'A', 19129.03, '2026-08-24 09:19:52.210154+00', '2026-08-24 09:19:52.210154+00');
INSERT INTO app.material_type_prices VALUES (458, 5, '110', 'B', 21596.77, '2026-08-24 09:19:52.210419+00', '2026-08-24 09:19:52.210419+00');
INSERT INTO app.material_type_prices VALUES (459, 5, '115', 'A', 20322.58, '2026-08-24 09:19:52.210666+00', '2026-08-24 09:19:52.210666+00');
INSERT INTO app.material_type_prices VALUES (460, 5, '115', 'B', 22893.55, '2026-08-24 09:19:52.210919+00', '2026-08-24 09:19:52.210919+00');
INSERT INTO app.material_type_prices VALUES (461, 5, '120', 'A', 21545.16, '2026-08-24 09:19:52.211213+00', '2026-08-24 09:19:52.211213+00');
INSERT INTO app.material_type_prices VALUES (462, 5, '120', 'B', 24219.35, '2026-08-24 09:19:52.211472+00', '2026-08-24 09:19:52.211472+00');
INSERT INTO app.material_type_prices VALUES (463, 5, '125', 'A', 24225.81, '2026-08-24 09:19:52.211743+00', '2026-08-24 09:19:52.211743+00');
INSERT INTO app.material_type_prices VALUES (464, 5, '125', 'B', 27048.39, '2026-08-24 09:19:52.212094+00', '2026-08-24 09:19:52.212094+00');
INSERT INTO app.material_type_prices VALUES (465, 5, '130', 'A', 26493.55, '2026-08-24 09:19:52.21239+00', '2026-08-24 09:19:52.21239+00');
INSERT INTO app.material_type_prices VALUES (466, 5, '130', 'B', 29435.48, '2026-08-24 09:19:52.212661+00', '2026-08-24 09:19:52.212661+00');
INSERT INTO app.material_type_prices VALUES (467, 5, '135', 'A', 28912.90, '2026-08-24 09:19:52.212947+00', '2026-08-24 09:19:52.212947+00');
INSERT INTO app.material_type_prices VALUES (468, 5, '135', 'B', 31993.55, '2026-08-24 09:19:52.213248+00', '2026-08-24 09:19:52.213248+00');
INSERT INTO app.material_type_prices VALUES (469, 5, '140', 'A', 31151.61, '2026-08-24 09:19:52.21351+00', '2026-08-24 09:19:52.21351+00');
INSERT INTO app.material_type_prices VALUES (470, 5, '140', 'B', 34354.84, '2026-08-24 09:19:52.21376+00', '2026-08-24 09:19:52.21376+00');
INSERT INTO app.material_type_prices VALUES (471, 5, '145', 'A', 31906.45, '2026-08-24 09:19:52.214007+00', '2026-08-24 09:19:52.214007+00');
INSERT INTO app.material_type_prices VALUES (472, 5, '145', 'B', 35232.26, '2026-08-24 09:19:52.214286+00', '2026-08-24 09:19:52.214286+00');
INSERT INTO app.material_type_prices VALUES (473, 5, '150', 'A', 34761.29, '2026-08-24 09:19:52.214545+00', '2026-08-24 09:19:52.214545+00');
INSERT INTO app.material_type_prices VALUES (474, 5, '150', 'B', 38212.90, '2026-08-24 09:19:52.214798+00', '2026-08-24 09:19:52.214798+00');
INSERT INTO app.material_type_prices VALUES (475, 5, '155', 'A', 38254.84, '2026-08-24 09:19:52.215091+00', '2026-08-24 09:19:52.215091+00');
INSERT INTO app.material_type_prices VALUES (476, 5, '155', 'B', 41838.71, '2026-08-24 09:19:52.215398+00', '2026-08-24 09:19:52.215398+00');
INSERT INTO app.material_type_prices VALUES (477, 5, '160', 'A', 40206.45, '2026-08-24 09:19:52.215669+00', '2026-08-24 09:19:52.215669+00');
INSERT INTO app.material_type_prices VALUES (478, 5, '160', 'B', 43925.81, '2026-08-24 09:19:52.215904+00', '2026-08-24 09:19:52.215904+00');
INSERT INTO app.material_type_prices VALUES (479, 5, '165', 'A', 42300.00, '2026-08-24 09:19:52.216156+00', '2026-08-24 09:19:52.216156+00');
INSERT INTO app.material_type_prices VALUES (480, 5, '170', 'A', 44835.48, '2026-08-24 09:19:52.216399+00', '2026-08-24 09:19:52.216399+00');
INSERT INTO app.material_type_prices VALUES (481, 5, '170', 'B', 48812.90, '2026-08-24 09:19:52.216649+00', '2026-08-24 09:19:52.216649+00');
INSERT INTO app.material_type_prices VALUES (482, 5, '175', 'A', 47109.68, '2026-08-24 09:19:52.216943+00', '2026-08-24 09:19:52.216943+00');
INSERT INTO app.material_type_prices VALUES (483, 5, '180', 'A', 48593.55, '2026-08-24 09:19:52.217208+00', '2026-08-24 09:19:52.217208+00');
INSERT INTO app.material_type_prices VALUES (484, 5, '180', 'B', 52819.35, '2026-08-24 09:19:52.217447+00', '2026-08-24 09:19:52.217447+00');
INSERT INTO app.material_type_prices VALUES (485, 5, '185', 'A', 53425.81, '2026-08-24 09:19:52.217695+00', '2026-08-24 09:19:52.217695+00');
INSERT INTO app.material_type_prices VALUES (486, 5, '190', 'A', 58870.97, '2026-08-24 09:19:52.217956+00', '2026-08-24 09:19:52.217956+00');
INSERT INTO app.material_type_prices VALUES (487, 5, '190', 'B', 63425.81, '2026-08-24 09:19:52.218238+00', '2026-08-24 09:19:52.218238+00');
INSERT INTO app.material_type_prices VALUES (488, 5, '195', 'A', 59745.16, '2026-08-24 09:19:52.218496+00', '2026-08-24 09:19:52.218496+00');
INSERT INTO app.material_type_prices VALUES (489, 5, '200', 'A', 62332.26, '2026-08-24 09:19:52.218769+00', '2026-08-24 09:19:52.218769+00');
INSERT INTO app.material_type_prices VALUES (490, 5, '200', 'B', 67116.13, '2026-08-24 09:19:52.219029+00', '2026-08-24 09:19:52.219029+00');
INSERT INTO app.material_type_prices VALUES (491, 5, '210', 'B', 74622.58, '2026-08-24 09:19:52.219281+00', '2026-08-24 09:19:52.219281+00');
INSERT INTO app.material_type_prices VALUES (492, 5, '220', 'B', 82135.48, '2026-08-24 09:19:52.219531+00', '2026-08-24 09:19:52.219531+00');
INSERT INTO app.material_type_prices VALUES (493, 5, '230', 'B', 88441.94, '2026-08-24 09:19:52.219787+00', '2026-08-24 09:19:52.219787+00');
INSERT INTO app.material_type_prices VALUES (494, 5, '240', 'B', 93209.68, '2026-08-24 09:19:52.22005+00', '2026-08-24 09:19:52.22005+00');
INSERT INTO app.material_type_prices VALUES (495, 5, '250', 'B', 97980.65, '2026-08-24 09:19:52.220301+00', '2026-08-24 09:19:52.220301+00');
INSERT INTO app.material_type_prices VALUES (496, 5, '260', 'B', 117987.10, '2026-08-24 09:19:52.220561+00', '2026-08-24 09:19:52.220561+00');
INSERT INTO app.material_type_prices VALUES (497, 5, '270', 'B', 126558.06, '2026-08-24 09:19:52.22082+00', '2026-08-24 09:19:52.22082+00');
INSERT INTO app.material_type_prices VALUES (498, 5, '280', 'B', 135135.48, '2026-08-24 09:19:52.221102+00', '2026-08-24 09:19:52.221102+00');
INSERT INTO app.material_type_prices VALUES (499, 5, '290', 'B', 142967.74, '2026-08-24 09:19:52.221348+00', '2026-08-24 09:19:52.221348+00');
INSERT INTO app.material_type_prices VALUES (500, 5, '300', 'B', 150774.19, '2026-08-24 09:19:52.221606+00', '2026-08-24 09:19:52.221606+00');
INSERT INTO app.material_type_prices VALUES (501, 5, '310', 'B', 158577.42, '2026-08-24 09:19:52.221879+00', '2026-08-24 09:19:52.221879+00');
INSERT INTO app.material_type_prices VALUES (502, 5, '320', 'B', 166416.13, '2026-08-24 09:19:52.222122+00', '2026-08-24 09:19:52.222122+00');
INSERT INTO app.material_type_prices VALUES (503, 5, '330', 'B', 175754.84, '2026-08-24 09:19:52.222366+00', '2026-08-24 09:19:52.222366+00');
INSERT INTO app.material_type_prices VALUES (504, 5, '340', 'B', 189687.10, '2026-08-24 09:19:52.222613+00', '2026-08-24 09:19:52.222613+00');
INSERT INTO app.material_type_prices VALUES (505, 5, '350', 'B', 205070.97, '2026-08-24 09:19:52.222849+00', '2026-08-24 09:19:52.222849+00');
INSERT INTO app.material_type_prices VALUES (506, 6, '010', 'A', 1309.68, '2026-08-24 09:19:52.223083+00', '2026-08-24 09:19:52.223083+00');
INSERT INTO app.material_type_prices VALUES (507, 6, '010', 'B', 3516.13, '2026-08-24 09:19:52.223314+00', '2026-08-24 09:19:52.223314+00');
INSERT INTO app.material_type_prices VALUES (508, 6, '015', 'A', 1309.68, '2026-08-24 09:19:52.223638+00', '2026-08-24 09:19:52.223638+00');
INSERT INTO app.material_type_prices VALUES (509, 6, '015', 'B', 3516.13, '2026-08-24 09:19:52.223883+00', '2026-08-24 09:19:52.223883+00');
INSERT INTO app.material_type_prices VALUES (510, 6, '020', 'A', 1674.19, '2026-08-24 09:19:52.224126+00', '2026-08-24 09:19:52.224126+00');
INSERT INTO app.material_type_prices VALUES (511, 6, '020', 'B', 3516.13, '2026-08-24 09:19:52.224353+00', '2026-08-24 09:19:52.224353+00');
INSERT INTO app.material_type_prices VALUES (512, 6, '025', 'A', 1909.68, '2026-08-24 09:19:52.224595+00', '2026-08-24 09:19:52.224595+00');
INSERT INTO app.material_type_prices VALUES (513, 6, '025', 'B', 3516.13, '2026-08-24 09:19:52.224864+00', '2026-08-24 09:19:52.224864+00');
INSERT INTO app.material_type_prices VALUES (514, 6, '030', 'A', 2777.42, '2026-08-24 09:19:52.225114+00', '2026-08-24 09:19:52.225114+00');
INSERT INTO app.material_type_prices VALUES (515, 6, '030', 'B', 3516.13, '2026-08-24 09:19:52.225363+00', '2026-08-24 09:19:52.225363+00');
INSERT INTO app.material_type_prices VALUES (516, 6, '035', 'A', 3448.39, '2026-08-24 09:19:52.225624+00', '2026-08-24 09:19:52.225624+00');
INSERT INTO app.material_type_prices VALUES (517, 6, '035', 'B', 4296.77, '2026-08-24 09:19:52.225963+00', '2026-08-24 09:19:52.225963+00');
INSERT INTO app.material_type_prices VALUES (518, 6, '040', 'A', 3987.10, '2026-08-24 09:19:52.226248+00', '2026-08-24 09:19:52.226248+00');
INSERT INTO app.material_type_prices VALUES (519, 6, '040', 'B', 4951.61, '2026-08-24 09:19:52.226495+00', '2026-08-24 09:19:52.226495+00');
INSERT INTO app.material_type_prices VALUES (520, 6, '045', 'A', 5019.35, '2026-08-24 09:19:52.226745+00', '2026-08-24 09:19:52.226745+00');
INSERT INTO app.material_type_prices VALUES (521, 6, '045', 'B', 6132.26, '2026-08-24 09:19:52.227026+00', '2026-08-24 09:19:52.227026+00');
INSERT INTO app.material_type_prices VALUES (522, 6, '050', 'A', 5625.81, '2026-08-24 09:19:52.227282+00', '2026-08-24 09:19:52.227282+00');
INSERT INTO app.material_type_prices VALUES (523, 6, '050', 'B', 6848.39, '2026-08-24 09:19:52.227546+00', '2026-08-24 09:19:52.227546+00');
INSERT INTO app.material_type_prices VALUES (524, 6, '055', 'A', 6725.81, '2026-08-24 09:19:52.227815+00', '2026-08-24 09:19:52.227815+00');
INSERT INTO app.material_type_prices VALUES (525, 6, '055', 'B', 8096.77, '2026-08-24 09:19:52.22813+00', '2026-08-24 09:19:52.22813+00');
INSERT INTO app.material_type_prices VALUES (526, 6, '060', 'A', 7732.26, '2026-08-24 09:19:52.228388+00', '2026-08-24 09:19:52.228388+00');
INSERT INTO app.material_type_prices VALUES (527, 6, '060', 'B', 9216.13, '2026-08-24 09:19:52.228635+00', '2026-08-24 09:19:52.228635+00');
INSERT INTO app.material_type_prices VALUES (528, 6, '065', 'A', 9845.16, '2026-08-24 09:19:52.228897+00', '2026-08-24 09:19:52.228897+00');
INSERT INTO app.material_type_prices VALUES (529, 6, '065', 'B', 11483.87, '2026-08-24 09:19:52.229153+00', '2026-08-24 09:19:52.229153+00');
INSERT INTO app.material_type_prices VALUES (530, 6, '070', 'A', 10916.13, '2026-08-24 09:19:52.229422+00', '2026-08-24 09:19:52.229422+00');
INSERT INTO app.material_type_prices VALUES (531, 6, '070', 'B', 12674.19, '2026-08-24 09:19:52.229723+00', '2026-08-24 09:19:52.229723+00');
INSERT INTO app.material_type_prices VALUES (532, 6, '075', 'A', 11616.13, '2026-08-24 09:19:52.230034+00', '2026-08-24 09:19:52.230034+00');
INSERT INTO app.material_type_prices VALUES (533, 6, '075', 'B', 13490.32, '2026-08-24 09:19:52.230303+00', '2026-08-24 09:19:52.230303+00');
INSERT INTO app.material_type_prices VALUES (534, 6, '080', 'A', 12490.32, '2026-08-24 09:19:52.230567+00', '2026-08-24 09:19:52.230567+00');
INSERT INTO app.material_type_prices VALUES (535, 6, '080', 'B', 14500.00, '2026-08-24 09:19:52.230836+00', '2026-08-24 09:19:52.230836+00');
INSERT INTO app.material_type_prices VALUES (536, 6, '085', 'A', 14900.00, '2026-08-24 09:19:52.231115+00', '2026-08-24 09:19:52.231115+00');
INSERT INTO app.material_type_prices VALUES (537, 6, '085', 'B', 17074.19, '2026-08-24 09:19:52.231418+00', '2026-08-24 09:19:52.231418+00');
INSERT INTO app.material_type_prices VALUES (538, 6, '090', 'A', 15767.74, '2026-08-24 09:19:52.23171+00', '2026-08-24 09:19:52.23171+00');
INSERT INTO app.material_type_prices VALUES (539, 6, '090', 'B', 18058.06, '2026-08-24 09:19:52.231997+00', '2026-08-24 09:19:52.231997+00');
INSERT INTO app.material_type_prices VALUES (540, 6, '095', 'A', 17477.42, '2026-08-24 09:19:52.232248+00', '2026-08-24 09:19:52.232248+00');
INSERT INTO app.material_type_prices VALUES (541, 6, '095', 'B', 19890.32, '2026-08-24 09:19:52.232513+00', '2026-08-24 09:19:52.232513+00');
INSERT INTO app.material_type_prices VALUES (542, 6, '100', 'A', 18545.16, '2026-08-24 09:19:52.232759+00', '2026-08-24 09:19:52.232759+00');
INSERT INTO app.material_type_prices VALUES (543, 6, '100', 'B', 21106.45, '2026-08-24 09:19:52.233018+00', '2026-08-24 09:19:52.233018+00');
INSERT INTO app.material_type_prices VALUES (544, 6, '105', 'A', 20254.84, '2026-08-24 09:19:52.233262+00', '2026-08-24 09:19:52.233262+00');
INSERT INTO app.material_type_prices VALUES (545, 6, '105', 'B', 22935.48, '2026-08-24 09:19:52.233489+00', '2026-08-24 09:19:52.233489+00');
INSERT INTO app.material_type_prices VALUES (546, 6, '110', 'A', 22000.00, '2026-08-24 09:19:52.233704+00', '2026-08-24 09:19:52.233704+00');
INSERT INTO app.material_type_prices VALUES (547, 6, '110', 'B', 24835.48, '2026-08-24 09:19:52.233884+00', '2026-08-24 09:19:52.233884+00');
INSERT INTO app.material_type_prices VALUES (548, 6, '115', 'A', 23374.19, '2026-08-24 09:19:52.234109+00', '2026-08-24 09:19:52.234109+00');
INSERT INTO app.material_type_prices VALUES (549, 6, '115', 'B', 26329.03, '2026-08-24 09:19:52.234357+00', '2026-08-24 09:19:52.234357+00');
INSERT INTO app.material_type_prices VALUES (550, 6, '120', 'A', 24777.42, '2026-08-24 09:19:52.234584+00', '2026-08-24 09:19:52.234584+00');
INSERT INTO app.material_type_prices VALUES (551, 6, '120', 'B', 27851.61, '2026-08-24 09:19:52.234823+00', '2026-08-24 09:19:52.234823+00');
INSERT INTO app.material_type_prices VALUES (552, 6, '125', 'A', 27858.06, '2026-08-24 09:19:52.235056+00', '2026-08-24 09:19:52.235056+00');
INSERT INTO app.material_type_prices VALUES (553, 6, '125', 'B', 31103.23, '2026-08-24 09:19:52.235265+00', '2026-08-24 09:19:52.235265+00');
INSERT INTO app.material_type_prices VALUES (554, 6, '130', 'A', 30467.74, '2026-08-24 09:19:52.235473+00', '2026-08-24 09:19:52.235473+00');
INSERT INTO app.material_type_prices VALUES (555, 6, '130', 'B', 33848.39, '2026-08-24 09:19:52.235708+00', '2026-08-24 09:19:52.235708+00');
INSERT INTO app.material_type_prices VALUES (556, 6, '135', 'A', 33248.39, '2026-08-24 09:19:52.235997+00', '2026-08-24 09:19:52.235997+00');
INSERT INTO app.material_type_prices VALUES (557, 6, '135', 'B', 36790.32, '2026-08-24 09:19:52.236218+00', '2026-08-24 09:19:52.236218+00');
INSERT INTO app.material_type_prices VALUES (558, 6, '140', 'A', 35825.81, '2026-08-24 09:19:52.236425+00', '2026-08-24 09:19:52.236425+00');
INSERT INTO app.material_type_prices VALUES (559, 6, '140', 'B', 39509.68, '2026-08-24 09:19:52.236666+00', '2026-08-24 09:19:52.236666+00');
INSERT INTO app.material_type_prices VALUES (560, 6, '145', 'A', 36693.55, '2026-08-24 09:19:52.236892+00', '2026-08-24 09:19:52.236892+00');
INSERT INTO app.material_type_prices VALUES (561, 6, '145', 'B', 40516.13, '2026-08-24 09:19:52.237096+00', '2026-08-24 09:19:52.237096+00');
INSERT INTO app.material_type_prices VALUES (562, 6, '150', 'A', 39977.42, '2026-08-24 09:19:52.237302+00', '2026-08-24 09:19:52.237302+00');
INSERT INTO app.material_type_prices VALUES (563, 6, '150', 'B', 43945.16, '2026-08-24 09:19:52.23751+00', '2026-08-24 09:19:52.23751+00');
INSERT INTO app.material_type_prices VALUES (564, 6, '155', 'A', 43993.55, '2026-08-24 09:19:52.237709+00', '2026-08-24 09:19:52.237709+00');
INSERT INTO app.material_type_prices VALUES (565, 6, '155', 'B', 48112.90, '2026-08-24 09:19:52.237979+00', '2026-08-24 09:19:52.237979+00');
INSERT INTO app.material_type_prices VALUES (566, 6, '160', 'A', 46235.48, '2026-08-24 09:19:52.238249+00', '2026-08-24 09:19:52.238249+00');
INSERT INTO app.material_type_prices VALUES (567, 6, '160', 'B', 50516.13, '2026-08-24 09:19:52.238497+00', '2026-08-24 09:19:52.238497+00');
INSERT INTO app.material_type_prices VALUES (568, 6, '165', 'A', 48645.16, '2026-08-24 09:19:52.238733+00', '2026-08-24 09:19:52.238733+00');
INSERT INTO app.material_type_prices VALUES (569, 6, '170', 'A', 51561.29, '2026-08-24 09:19:52.238968+00', '2026-08-24 09:19:52.238968+00');
INSERT INTO app.material_type_prices VALUES (570, 6, '170', 'B', 56135.48, '2026-08-24 09:19:52.239174+00', '2026-08-24 09:19:52.239174+00');
INSERT INTO app.material_type_prices VALUES (571, 6, '175', 'A', 54174.19, '2026-08-24 09:19:52.239422+00', '2026-08-24 09:19:52.239422+00');
INSERT INTO app.material_type_prices VALUES (572, 6, '180', 'A', 55883.87, '2026-08-24 09:19:52.239666+00', '2026-08-24 09:19:52.239666+00');
INSERT INTO app.material_type_prices VALUES (573, 6, '180', 'B', 60741.94, '2026-08-24 09:19:52.239878+00', '2026-08-24 09:19:52.239878+00');
INSERT INTO app.material_type_prices VALUES (574, 6, '185', 'A', 61438.71, '2026-08-24 09:19:52.240094+00', '2026-08-24 09:19:52.240094+00');
INSERT INTO app.material_type_prices VALUES (575, 6, '190', 'A', 67703.23, '2026-08-24 09:19:52.240318+00', '2026-08-24 09:19:52.240318+00');
INSERT INTO app.material_type_prices VALUES (576, 6, '190', 'B', 72941.94, '2026-08-24 09:19:52.240531+00', '2026-08-24 09:19:52.240531+00');
INSERT INTO app.material_type_prices VALUES (577, 6, '195', 'A', 68709.68, '2026-08-24 09:19:52.240742+00', '2026-08-24 09:19:52.240742+00');
INSERT INTO app.material_type_prices VALUES (578, 6, '200', 'A', 71683.87, '2026-08-24 09:19:52.240955+00', '2026-08-24 09:19:52.240955+00');
INSERT INTO app.material_type_prices VALUES (579, 6, '200', 'B', 77183.87, '2026-08-24 09:19:52.241204+00', '2026-08-24 09:19:52.241204+00');
INSERT INTO app.material_type_prices VALUES (580, 6, '210', 'B', 85812.90, '2026-08-24 09:19:52.241462+00', '2026-08-24 09:19:52.241462+00');
INSERT INTO app.material_type_prices VALUES (581, 6, '220', 'B', 94454.84, '2026-08-24 09:19:52.24171+00', '2026-08-24 09:19:52.24171+00');
INSERT INTO app.material_type_prices VALUES (582, 6, '230', 'B', 101706.45, '2026-08-24 09:19:52.242024+00', '2026-08-24 09:19:52.242024+00');
INSERT INTO app.material_type_prices VALUES (583, 6, '240', 'B', 107190.32, '2026-08-24 09:19:52.242245+00', '2026-08-24 09:19:52.242245+00');
INSERT INTO app.material_type_prices VALUES (584, 6, '250', 'B', 112677.42, '2026-08-24 09:19:52.242472+00', '2026-08-24 09:19:52.242472+00');
INSERT INTO app.material_type_prices VALUES (585, 6, '260', 'B', 135683.87, '2026-08-24 09:19:52.242671+00', '2026-08-24 09:19:52.242671+00');
INSERT INTO app.material_type_prices VALUES (586, 6, '270', 'B', 145541.94, '2026-08-24 09:19:52.242888+00', '2026-08-24 09:19:52.242888+00');
INSERT INTO app.material_type_prices VALUES (587, 6, '280', 'B', 155406.45, '2026-08-24 09:19:52.243093+00', '2026-08-24 09:19:52.243093+00');
INSERT INTO app.material_type_prices VALUES (588, 6, '290', 'B', 164412.90, '2026-08-24 09:19:52.243361+00', '2026-08-24 09:19:52.243361+00');
INSERT INTO app.material_type_prices VALUES (589, 6, '300', 'B', 173390.32, '2026-08-24 09:19:52.243585+00', '2026-08-24 09:19:52.243585+00');
INSERT INTO app.material_type_prices VALUES (590, 6, '310', 'B', 182364.52, '2026-08-24 09:19:52.243786+00', '2026-08-24 09:19:52.243786+00');
INSERT INTO app.material_type_prices VALUES (591, 6, '320', 'B', 191377.42, '2026-08-24 09:19:52.244014+00', '2026-08-24 09:19:52.244014+00');
INSERT INTO app.material_type_prices VALUES (592, 6, '330', 'B', 202119.35, '2026-08-24 09:19:52.244222+00', '2026-08-24 09:19:52.244222+00');
INSERT INTO app.material_type_prices VALUES (593, 6, '340', 'B', 218138.71, '2026-08-24 09:19:52.244433+00', '2026-08-24 09:19:52.244433+00');
INSERT INTO app.material_type_prices VALUES (594, 6, '350', 'B', 235829.03, '2026-08-24 09:19:52.24466+00', '2026-08-24 09:19:52.24466+00');
INSERT INTO app.material_type_prices VALUES (595, 13, '030', 'A', 939.39, '2026-08-24 09:19:52.244879+00', '2026-08-24 09:19:52.244879+00');
INSERT INTO app.material_type_prices VALUES (596, 13, '030', 'B', 939.39, '2026-08-24 09:19:52.245085+00', '2026-08-24 09:19:52.245085+00');
INSERT INTO app.material_type_prices VALUES (597, 13, '040', 'A', 1572.73, '2026-08-24 09:19:52.245318+00', '2026-08-24 09:19:52.245318+00');
INSERT INTO app.material_type_prices VALUES (598, 13, '040', 'B', 1572.73, '2026-08-24 09:19:52.245524+00', '2026-08-24 09:19:52.245524+00');
INSERT INTO app.material_type_prices VALUES (599, 13, '050', 'A', 2369.70, '2026-08-24 09:19:52.245761+00', '2026-08-24 09:19:52.245761+00');
INSERT INTO app.material_type_prices VALUES (600, 13, '050', 'B', 2369.70, '2026-08-24 09:19:52.246007+00', '2026-08-24 09:19:52.246007+00');
INSERT INTO app.material_type_prices VALUES (601, 13, '060', 'A', 3333.33, '2026-08-24 09:19:52.246231+00', '2026-08-24 09:19:52.246231+00');
INSERT INTO app.material_type_prices VALUES (602, 13, '060', 'B', 3333.33, '2026-08-24 09:19:52.246471+00', '2026-08-24 09:19:52.246471+00');
INSERT INTO app.material_type_prices VALUES (603, 13, '070', 'A', 4515.15, '2026-08-24 09:19:52.24667+00', '2026-08-24 09:19:52.24667+00');
INSERT INTO app.material_type_prices VALUES (604, 13, '070', 'B', 4515.15, '2026-08-24 09:19:52.246887+00', '2026-08-24 09:19:52.246887+00');
INSERT INTO app.material_type_prices VALUES (605, 13, '080', 'A', 5809.09, '2026-08-24 09:19:52.247114+00', '2026-08-24 09:19:52.247114+00');
INSERT INTO app.material_type_prices VALUES (606, 13, '080', 'B', 5809.09, '2026-08-24 09:19:52.247358+00', '2026-08-24 09:19:52.247358+00');
INSERT INTO app.material_type_prices VALUES (607, 13, '090', 'A', 7266.67, '2026-08-24 09:19:52.247572+00', '2026-08-24 09:19:52.247572+00');
INSERT INTO app.material_type_prices VALUES (608, 13, '090', 'B', 7266.67, '2026-08-24 09:19:52.247779+00', '2026-08-24 09:19:52.247779+00');
INSERT INTO app.material_type_prices VALUES (609, 13, '100', 'A', 8881.82, '2026-08-24 09:19:52.248016+00', '2026-08-24 09:19:52.248016+00');
INSERT INTO app.material_type_prices VALUES (610, 13, '100', 'B', 8881.82, '2026-08-24 09:19:52.248223+00', '2026-08-24 09:19:52.248223+00');
INSERT INTO app.material_type_prices VALUES (611, 13, '110', 'A', 10663.64, '2026-08-24 09:19:52.248451+00', '2026-08-24 09:19:52.248451+00');
INSERT INTO app.material_type_prices VALUES (612, 13, '110', 'B', 10663.64, '2026-08-24 09:19:52.248647+00', '2026-08-24 09:19:52.248647+00');
INSERT INTO app.material_type_prices VALUES (613, 13, '120', 'A', 12609.09, '2026-08-24 09:19:52.248856+00', '2026-08-24 09:19:52.248856+00');
INSERT INTO app.material_type_prices VALUES (614, 13, '120', 'B', 12609.09, '2026-08-24 09:19:52.249061+00', '2026-08-24 09:19:52.249061+00');
INSERT INTO app.material_type_prices VALUES (615, 13, '130', 'A', 14821.21, '2026-08-24 09:19:52.249295+00', '2026-08-24 09:19:52.249295+00');
INSERT INTO app.material_type_prices VALUES (616, 13, '130', 'B', 14821.21, '2026-08-24 09:19:52.249502+00', '2026-08-24 09:19:52.249502+00');
INSERT INTO app.material_type_prices VALUES (617, 13, '140', 'A', 17103.03, '2026-08-24 09:19:52.249745+00', '2026-08-24 09:19:52.249745+00');
INSERT INTO app.material_type_prices VALUES (618, 13, '140', 'B', 17103.03, '2026-08-24 09:19:52.250017+00', '2026-08-24 09:19:52.250017+00');
INSERT INTO app.material_type_prices VALUES (619, 13, '150', 'A', 19539.39, '2026-08-24 09:19:52.250317+00', '2026-08-24 09:19:52.250317+00');
INSERT INTO app.material_type_prices VALUES (620, 13, '150', 'B', 19539.39, '2026-08-24 09:19:52.250544+00', '2026-08-24 09:19:52.250544+00');
INSERT INTO app.material_type_prices VALUES (621, 13, '160', 'A', 22145.45, '2026-08-24 09:19:52.250781+00', '2026-08-24 09:19:52.250781+00');
INSERT INTO app.material_type_prices VALUES (622, 13, '160', 'B', 22145.45, '2026-08-24 09:19:52.251019+00', '2026-08-24 09:19:52.251019+00');
INSERT INTO app.material_type_prices VALUES (623, 13, '170', 'A', 25048.48, '2026-08-24 09:19:52.251233+00', '2026-08-24 09:19:52.251233+00');
INSERT INTO app.material_type_prices VALUES (624, 13, '170', 'B', 25048.48, '2026-08-24 09:19:52.251486+00', '2026-08-24 09:19:52.251486+00');
INSERT INTO app.material_type_prices VALUES (625, 13, '180', 'A', 27987.88, '2026-08-24 09:19:52.251708+00', '2026-08-24 09:19:52.251708+00');
INSERT INTO app.material_type_prices VALUES (626, 13, '180', 'B', 27987.88, '2026-08-24 09:19:52.251995+00', '2026-08-24 09:19:52.251995+00');
INSERT INTO app.material_type_prices VALUES (627, 13, '190', 'A', 31090.91, '2026-08-24 09:19:52.252241+00', '2026-08-24 09:19:52.252241+00');
INSERT INTO app.material_type_prices VALUES (628, 13, '190', 'B', 31090.91, '2026-08-24 09:19:52.252461+00', '2026-08-24 09:19:52.252461+00');
INSERT INTO app.material_type_prices VALUES (629, 13, '200', 'A', 34345.45, '2026-08-24 09:19:52.252712+00', '2026-08-24 09:19:52.252712+00');
INSERT INTO app.material_type_prices VALUES (630, 13, '200', 'B', 34345.45, '2026-08-24 09:19:52.252988+00', '2026-08-24 09:19:52.252988+00');
INSERT INTO app.material_type_prices VALUES (631, 13, '210', 'A', 37772.73, '2026-08-24 09:19:52.253257+00', '2026-08-24 09:19:52.253257+00');
INSERT INTO app.material_type_prices VALUES (632, 13, '210', 'B', 37772.73, '2026-08-24 09:19:52.253493+00', '2026-08-24 09:19:52.253493+00');
INSERT INTO app.material_type_prices VALUES (633, 13, '220', 'A', 41357.58, '2026-08-24 09:19:52.253723+00', '2026-08-24 09:19:52.253723+00');
INSERT INTO app.material_type_prices VALUES (634, 13, '220', 'B', 41357.58, '2026-08-24 09:19:52.253971+00', '2026-08-24 09:19:52.253971+00');
INSERT INTO app.material_type_prices VALUES (635, 13, '230', 'A', 45112.12, '2026-08-24 09:19:52.2542+00', '2026-08-24 09:19:52.2542+00');
INSERT INTO app.material_type_prices VALUES (636, 13, '230', 'B', 45112.12, '2026-08-24 09:19:52.25443+00', '2026-08-24 09:19:52.25443+00');
INSERT INTO app.material_type_prices VALUES (637, 13, '240', 'A', 49024.24, '2026-08-24 09:19:52.254636+00', '2026-08-24 09:19:52.254636+00');
INSERT INTO app.material_type_prices VALUES (638, 13, '240', 'B', 49024.24, '2026-08-24 09:19:52.254864+00', '2026-08-24 09:19:52.254864+00');
INSERT INTO app.material_type_prices VALUES (639, 13, '250', 'A', 53096.97, '2026-08-24 09:19:52.255087+00', '2026-08-24 09:19:52.255087+00');
INSERT INTO app.material_type_prices VALUES (640, 13, '250', 'B', 53096.97, '2026-08-24 09:19:52.255279+00', '2026-08-24 09:19:52.255279+00');
INSERT INTO app.material_type_prices VALUES (641, 13, '260', 'A', 57333.33, '2026-08-24 09:19:52.255497+00', '2026-08-24 09:19:52.255497+00');
INSERT INTO app.material_type_prices VALUES (642, 13, '260', 'B', 57333.33, '2026-08-24 09:19:52.255709+00', '2026-08-24 09:19:52.255709+00');
INSERT INTO app.material_type_prices VALUES (643, 13, '270', 'A', 61733.33, '2026-08-24 09:19:52.255923+00', '2026-08-24 09:19:52.255923+00');
INSERT INTO app.material_type_prices VALUES (644, 13, '270', 'B', 61733.33, '2026-08-24 09:19:52.256124+00', '2026-08-24 09:19:52.256124+00');
INSERT INTO app.material_type_prices VALUES (645, 13, '280', 'A', 66296.97, '2026-08-24 09:19:52.256347+00', '2026-08-24 09:19:52.256347+00');
INSERT INTO app.material_type_prices VALUES (646, 13, '280', 'B', 66296.97, '2026-08-24 09:19:52.256556+00', '2026-08-24 09:19:52.256556+00');
INSERT INTO app.material_type_prices VALUES (647, 13, '290', 'A', 71021.21, '2026-08-24 09:19:52.256776+00', '2026-08-24 09:19:52.256776+00');
INSERT INTO app.material_type_prices VALUES (648, 13, '290', 'B', 71021.21, '2026-08-24 09:19:52.257016+00', '2026-08-24 09:19:52.257016+00');
INSERT INTO app.material_type_prices VALUES (649, 13, '300', 'A', 75912.12, '2026-08-24 09:19:52.257224+00', '2026-08-24 09:19:52.257224+00');
INSERT INTO app.material_type_prices VALUES (650, 13, '300', 'B', 75912.12, '2026-08-24 09:19:52.257438+00', '2026-08-24 09:19:52.257438+00');
INSERT INTO app.material_type_prices VALUES (651, 13, '310', 'A', 80963.64, '2026-08-24 09:19:52.257649+00', '2026-08-24 09:19:52.257649+00');
INSERT INTO app.material_type_prices VALUES (652, 13, '310', 'B', 80963.64, '2026-08-24 09:19:52.257882+00', '2026-08-24 09:19:52.257882+00');
INSERT INTO app.material_type_prices VALUES (653, 13, '320', 'A', 86172.73, '2026-08-24 09:19:52.258124+00', '2026-08-24 09:19:52.258124+00');
INSERT INTO app.material_type_prices VALUES (654, 13, '320', 'B', 86172.73, '2026-08-24 09:19:52.258343+00', '2026-08-24 09:19:52.258343+00');
INSERT INTO app.material_type_prices VALUES (655, 13, '330', 'A', 91548.48, '2026-08-24 09:19:52.258543+00', '2026-08-24 09:19:52.258543+00');
INSERT INTO app.material_type_prices VALUES (656, 13, '330', 'B', 91548.48, '2026-08-24 09:19:52.258748+00', '2026-08-24 09:19:52.258748+00');
INSERT INTO app.material_type_prices VALUES (657, 13, '340', 'A', 97090.91, '2026-08-24 09:19:52.25898+00', '2026-08-24 09:19:52.25898+00');
INSERT INTO app.material_type_prices VALUES (658, 13, '340', 'B', 97090.91, '2026-08-24 09:19:52.259176+00', '2026-08-24 09:19:52.259176+00');
INSERT INTO app.material_type_prices VALUES (659, 13, '350', 'A', 102793.94, '2026-08-24 09:19:52.259376+00', '2026-08-24 09:19:52.259376+00');
INSERT INTO app.material_type_prices VALUES (660, 13, '350', 'B', 102793.94, '2026-08-24 09:19:52.259599+00', '2026-08-24 09:19:52.259599+00');
INSERT INTO app.material_type_prices VALUES (661, 10, '010', 'A', 906.45, '2026-08-24 09:19:52.259844+00', '2026-08-24 09:19:52.259844+00');
INSERT INTO app.material_type_prices VALUES (662, 10, '020', 'A', 1483.87, '2026-08-24 09:19:52.260067+00', '2026-08-24 09:19:52.260067+00');
INSERT INTO app.material_type_prices VALUES (663, 10, '030', 'A', 2387.10, '2026-08-24 09:19:52.260272+00', '2026-08-24 09:19:52.260272+00');
INSERT INTO app.material_type_prices VALUES (664, 10, '030', 'B', 3035.48, '2026-08-24 09:19:52.260469+00', '2026-08-24 09:19:52.260469+00');
INSERT INTO app.material_type_prices VALUES (665, 10, '040', 'A', 3812.90, '2026-08-24 09:19:52.260761+00', '2026-08-24 09:19:52.260761+00');
INSERT INTO app.material_type_prices VALUES (666, 10, '040', 'B', 4300.00, '2026-08-24 09:19:52.261002+00', '2026-08-24 09:19:52.261002+00');
INSERT INTO app.material_type_prices VALUES (667, 10, '050', 'A', 5196.77, '2026-08-24 09:19:52.261202+00', '2026-08-24 09:19:52.261202+00');
INSERT INTO app.material_type_prices VALUES (668, 10, '060', 'A', 6690.32, '2026-08-24 09:19:52.261416+00', '2026-08-24 09:19:52.261416+00');
INSERT INTO app.material_type_prices VALUES (669, 10, '060', 'B', 7816.13, '2026-08-24 09:19:52.261624+00', '2026-08-24 09:19:52.261624+00');
INSERT INTO app.material_type_prices VALUES (670, 10, '080', 'A', 11687.10, '2026-08-24 09:19:52.261834+00', '2026-08-24 09:19:52.261834+00');
INSERT INTO app.material_type_prices VALUES (671, 10, '080', 'B', 12809.68, '2026-08-24 09:19:52.262052+00', '2026-08-24 09:19:52.262052+00');
INSERT INTO app.material_type_prices VALUES (672, 10, '100', 'A', 16022.58, '2026-08-24 09:19:52.262256+00', '2026-08-24 09:19:52.262256+00');
INSERT INTO app.material_type_prices VALUES (673, 10, '100', 'B', 18319.35, '2026-08-24 09:19:52.262462+00', '2026-08-24 09:19:52.262462+00');
INSERT INTO app.material_type_prices VALUES (674, 10, '120', 'A', 22425.81, '2026-08-24 09:19:52.262685+00', '2026-08-24 09:19:52.262685+00');
INSERT INTO app.material_type_prices VALUES (675, 10, '120', 'B', 24896.77, '2026-08-24 09:19:52.26289+00', '2026-08-24 09:19:52.26289+00');
INSERT INTO app.material_type_prices VALUES (676, 10, '140', 'A', 30483.87, '2026-08-24 09:19:52.263103+00', '2026-08-24 09:19:52.263103+00');
INSERT INTO app.material_type_prices VALUES (677, 10, '140', 'B', 33951.61, '2026-08-24 09:19:52.263328+00', '2026-08-24 09:19:52.263328+00');
INSERT INTO app.material_type_prices VALUES (678, 10, '160', 'A', 40932.26, '2026-08-24 09:19:52.263558+00', '2026-08-24 09:19:52.263558+00');
INSERT INTO app.material_type_prices VALUES (679, 10, '160', 'B', 42841.94, '2026-08-24 09:19:52.263761+00', '2026-08-24 09:19:52.263761+00');
INSERT INTO app.material_type_prices VALUES (680, 10, '180', 'A', 52412.90, '2026-08-24 09:19:52.263968+00', '2026-08-24 09:19:52.263968+00');
INSERT INTO app.material_type_prices VALUES (681, 10, '200', 'A', 63045.16, '2026-08-24 09:19:52.264225+00', '2026-08-24 09:19:52.264225+00');
INSERT INTO app.material_type_prices VALUES (682, 10, '200', 'B', 64761.29, '2026-08-24 09:19:52.264431+00', '2026-08-24 09:19:52.264431+00');
INSERT INTO app.material_type_prices VALUES (683, 11, '010', 'A', 661.29, '2026-08-24 09:19:52.264647+00', '2026-08-24 09:19:52.264647+00');
INSERT INTO app.material_type_prices VALUES (684, 11, '010', 'B', 1412.90, '2026-08-24 09:19:52.264868+00', '2026-08-24 09:19:52.264868+00');
INSERT INTO app.material_type_prices VALUES (685, 11, '015', 'B', 1664.52, '2026-08-24 09:19:52.265085+00', '2026-08-24 09:19:52.265085+00');
INSERT INTO app.material_type_prices VALUES (686, 11, '016', 'A', 906.45, '2026-08-24 09:19:52.265285+00', '2026-08-24 09:19:52.265285+00');
INSERT INTO app.material_type_prices VALUES (687, 11, '017', 'A', 1080.65, '2026-08-24 09:19:52.265487+00', '2026-08-24 09:19:52.265487+00');
INSERT INTO app.material_type_prices VALUES (688, 11, '020', 'A', 1483.87, '2026-08-24 09:19:52.265734+00', '2026-08-24 09:19:52.265734+00');
INSERT INTO app.material_type_prices VALUES (689, 11, '020', 'B', 1896.77, '2026-08-24 09:19:52.265984+00', '2026-08-24 09:19:52.265984+00');
INSERT INTO app.material_type_prices VALUES (690, 11, '025', 'A', 1945.16, '2026-08-24 09:19:52.266215+00', '2026-08-24 09:19:52.266215+00');
INSERT INTO app.material_type_prices VALUES (691, 11, '025', 'B', 2367.74, '2026-08-24 09:19:52.266446+00', '2026-08-24 09:19:52.266446+00');
INSERT INTO app.material_type_prices VALUES (692, 11, '030', 'A', 2387.10, '2026-08-24 09:19:52.266653+00', '2026-08-24 09:19:52.266653+00');
INSERT INTO app.material_type_prices VALUES (693, 11, '030', 'B', 3035.48, '2026-08-24 09:19:52.266874+00', '2026-08-24 09:19:52.266874+00');
INSERT INTO app.material_type_prices VALUES (694, 11, '035', 'A', 3025.81, '2026-08-24 09:19:52.267088+00', '2026-08-24 09:19:52.267088+00');
INSERT INTO app.material_type_prices VALUES (695, 11, '035', 'B', 3864.52, '2026-08-24 09:19:52.267298+00', '2026-08-24 09:19:52.267298+00');
INSERT INTO app.material_type_prices VALUES (696, 11, '040', 'A', 3812.90, '2026-08-24 09:19:52.267507+00', '2026-08-24 09:19:52.267507+00');
INSERT INTO app.material_type_prices VALUES (697, 11, '040', 'B', 4300.00, '2026-08-24 09:19:52.267726+00', '2026-08-24 09:19:52.267726+00');
INSERT INTO app.material_type_prices VALUES (698, 11, '045', 'A', 4632.26, '2026-08-24 09:19:52.267959+00', '2026-08-24 09:19:52.267959+00');
INSERT INTO app.material_type_prices VALUES (699, 11, '045', 'B', 5364.52, '2026-08-24 09:19:52.268203+00', '2026-08-24 09:19:52.268203+00');
INSERT INTO app.material_type_prices VALUES (700, 11, '050', 'A', 5196.77, '2026-08-24 09:19:52.268431+00', '2026-08-24 09:19:52.268431+00');
INSERT INTO app.material_type_prices VALUES (701, 11, '050', 'B', 6100.00, '2026-08-24 09:19:52.268643+00', '2026-08-24 09:19:52.268643+00');
INSERT INTO app.material_type_prices VALUES (702, 11, '055', 'A', 6129.03, '2026-08-24 09:19:52.268897+00', '2026-08-24 09:19:52.268897+00');
INSERT INTO app.material_type_prices VALUES (703, 11, '055', 'B', 7300.00, '2026-08-24 09:19:52.269141+00', '2026-08-24 09:19:52.269141+00');
INSERT INTO app.material_type_prices VALUES (704, 11, '060', 'A', 5283.87, '2026-08-24 09:19:52.269356+00', '2026-08-24 09:19:52.269356+00');
INSERT INTO app.material_type_prices VALUES (705, 11, '060', 'B', 7829.03, '2026-08-24 09:19:52.269578+00', '2026-08-24 09:19:52.269578+00');
INSERT INTO app.material_type_prices VALUES (706, 11, '064', 'A', 7351.61, '2026-08-24 09:19:52.269858+00', '2026-08-24 09:19:52.269858+00');
INSERT INTO app.material_type_prices VALUES (707, 11, '065', 'A', 7983.87, '2026-08-24 09:19:52.270092+00', '2026-08-24 09:19:52.270092+00');
INSERT INTO app.material_type_prices VALUES (708, 11, '065', 'B', 9316.13, '2026-08-24 09:19:52.270294+00', '2026-08-24 09:19:52.270294+00');
INSERT INTO app.material_type_prices VALUES (709, 11, '070', 'A', 9364.52, '2026-08-24 09:19:52.270505+00', '2026-08-24 09:19:52.270505+00');
INSERT INTO app.material_type_prices VALUES (710, 11, '070', 'B', 10441.94, '2026-08-24 09:19:52.270693+00', '2026-08-24 09:19:52.270693+00');
INSERT INTO app.material_type_prices VALUES (711, 11, '075', 'A', 10619.35, '2026-08-24 09:19:52.270887+00', '2026-08-24 09:19:52.270887+00');
INSERT INTO app.material_type_prices VALUES (712, 11, '075', 'B', 11803.23, '2026-08-24 09:19:52.271114+00', '2026-08-24 09:19:52.271114+00');
INSERT INTO app.material_type_prices VALUES (713, 11, '080', 'A', 11687.10, '2026-08-24 09:19:52.27134+00', '2026-08-24 09:19:52.27134+00');
INSERT INTO app.material_type_prices VALUES (714, 11, '080', 'B', 12809.68, '2026-08-24 09:19:52.2716+00', '2026-08-24 09:19:52.2716+00');
INSERT INTO app.material_type_prices VALUES (715, 11, '085', 'A', 13241.94, '2026-08-24 09:19:52.27181+00', '2026-08-24 09:19:52.27181+00');
INSERT INTO app.material_type_prices VALUES (716, 11, '085', 'B', 14332.26, '2026-08-24 09:19:52.272058+00', '2026-08-24 09:19:52.272058+00');
INSERT INTO app.material_type_prices VALUES (717, 11, '090', 'A', 14680.65, '2026-08-24 09:19:52.272282+00', '2026-08-24 09:19:52.272282+00');
INSERT INTO app.material_type_prices VALUES (718, 11, '090', 'B', 16022.58, '2026-08-24 09:19:52.272501+00', '2026-08-24 09:19:52.272501+00');
INSERT INTO app.material_type_prices VALUES (719, 11, '095', 'A', 16590.32, '2026-08-24 09:19:52.272746+00', '2026-08-24 09:19:52.272746+00');
INSERT INTO app.material_type_prices VALUES (720, 11, '095', 'B', 17825.81, '2026-08-24 09:19:52.27299+00', '2026-08-24 09:19:52.27299+00');
INSERT INTO app.material_type_prices VALUES (721, 11, '100', 'A', 17100.00, '2026-08-24 09:19:52.273187+00', '2026-08-24 09:19:52.273187+00');
INSERT INTO app.material_type_prices VALUES (722, 11, '100', 'B', 18316.13, '2026-08-24 09:19:52.273411+00', '2026-08-24 09:19:52.273411+00');
INSERT INTO app.material_type_prices VALUES (723, 11, '105', 'A', 19070.97, '2026-08-24 09:19:52.273654+00', '2026-08-24 09:19:52.273654+00');
INSERT INTO app.material_type_prices VALUES (724, 11, '110', 'A', 20683.87, '2026-08-24 09:19:52.273921+00', '2026-08-24 09:19:52.273921+00');
INSERT INTO app.material_type_prices VALUES (725, 11, '110', 'B', 22087.10, '2026-08-24 09:19:52.274168+00', '2026-08-24 09:19:52.274168+00');
INSERT INTO app.material_type_prices VALUES (726, 11, '115', 'A', 22138.71, '2026-08-24 09:19:52.274406+00', '2026-08-24 09:19:52.274406+00');
INSERT INTO app.material_type_prices VALUES (727, 11, '120', 'A', 23825.81, '2026-08-24 09:19:52.274649+00', '2026-08-24 09:19:52.274649+00');
INSERT INTO app.material_type_prices VALUES (728, 11, '120', 'B', 24896.77, '2026-08-24 09:19:52.274878+00', '2026-08-24 09:19:52.274878+00');
INSERT INTO app.material_type_prices VALUES (729, 11, '125', 'A', 26596.77, '2026-08-24 09:19:52.275083+00', '2026-08-24 09:19:52.275083+00');
INSERT INTO app.material_type_prices VALUES (730, 11, '127', 'A', 26767.74, '2026-08-24 09:19:52.2753+00', '2026-08-24 09:19:52.2753+00');
INSERT INTO app.material_type_prices VALUES (731, 11, '130', 'A', 28729.03, '2026-08-24 09:19:52.275539+00', '2026-08-24 09:19:52.275539+00');
INSERT INTO app.material_type_prices VALUES (732, 11, '130', 'B', 29925.81, '2026-08-24 09:19:52.275809+00', '2026-08-24 09:19:52.275809+00');
INSERT INTO app.material_type_prices VALUES (733, 11, '140', 'A', 32390.32, '2026-08-24 09:19:52.276067+00', '2026-08-24 09:19:52.276067+00');
INSERT INTO app.material_type_prices VALUES (734, 11, '140', 'B', 33951.61, '2026-08-24 09:19:52.276278+00', '2026-08-24 09:19:52.276278+00');
INSERT INTO app.material_type_prices VALUES (735, 11, '145', 'A', 35719.35, '2026-08-24 09:19:52.276488+00', '2026-08-24 09:19:52.276488+00');
INSERT INTO app.material_type_prices VALUES (736, 11, '150', 'A', 37512.90, '2026-08-24 09:19:52.276727+00', '2026-08-24 09:19:52.276727+00');
INSERT INTO app.material_type_prices VALUES (737, 11, '150', 'B', 39206.45, '2026-08-24 09:19:52.276984+00', '2026-08-24 09:19:52.276984+00');
INSERT INTO app.material_type_prices VALUES (738, 11, '160', 'A', 40932.26, '2026-08-24 09:19:52.277257+00', '2026-08-24 09:19:52.277257+00');
INSERT INTO app.material_type_prices VALUES (739, 11, '160', 'B', 42841.94, '2026-08-24 09:19:52.277465+00', '2026-08-24 09:19:52.277465+00');
INSERT INTO app.material_type_prices VALUES (740, 11, '170', 'A', 47716.13, '2026-08-24 09:19:52.277679+00', '2026-08-24 09:19:52.277679+00');
INSERT INTO app.material_type_prices VALUES (741, 11, '180', 'A', 52412.90, '2026-08-24 09:19:52.27789+00', '2026-08-24 09:19:52.27789+00');
INSERT INTO app.material_type_prices VALUES (742, 11, '180', 'B', 54103.23, '2026-08-24 09:19:52.278137+00', '2026-08-24 09:19:52.278137+00');
INSERT INTO app.material_type_prices VALUES (743, 11, '190', 'A', 60012.90, '2026-08-24 09:19:52.278371+00', '2026-08-24 09:19:52.278371+00');
INSERT INTO app.material_type_prices VALUES (744, 11, '190', 'B', 61425.81, '2026-08-24 09:19:52.278591+00', '2026-08-24 09:19:52.278591+00');
INSERT INTO app.material_type_prices VALUES (745, 11, '200', 'A', 63045.16, '2026-08-24 09:19:52.278815+00', '2026-08-24 09:19:52.278815+00');
INSERT INTO app.material_type_prices VALUES (746, 11, '200', 'B', 64764.52, '2026-08-24 09:19:52.279037+00', '2026-08-24 09:19:52.279037+00');
INSERT INTO app.material_type_prices VALUES (747, 11, '220', 'B', 81474.19, '2026-08-24 09:19:52.279264+00', '2026-08-24 09:19:52.279264+00');
INSERT INTO app.material_type_prices VALUES (748, 11, '240', 'B', 95851.61, '2026-08-24 09:19:52.279489+00', '2026-08-24 09:19:52.279489+00');
INSERT INTO app.material_type_prices VALUES (749, 11, '250', 'B', 100841.94, '2026-08-24 09:19:52.279729+00', '2026-08-24 09:19:52.279729+00');
INSERT INTO app.material_type_prices VALUES (750, 11, '280', 'B', 126861.29, '2026-08-24 09:19:52.279962+00', '2026-08-24 09:19:52.279962+00');
INSERT INTO app.material_type_prices VALUES (751, 11, '300', 'B', 146409.68, '2026-08-24 09:19:52.280155+00', '2026-08-24 09:19:52.280155+00');
INSERT INTO app.material_type_prices VALUES (752, 11, '320', 'B', 167054.84, '2026-08-24 09:19:52.280384+00', '2026-08-24 09:19:52.280384+00');
INSERT INTO app.material_type_prices VALUES (753, 11, '380', 'B', 240935.48, '2026-08-24 09:19:52.280603+00', '2026-08-24 09:19:52.280603+00');
INSERT INTO app.material_type_prices VALUES (754, 11, '400', 'B', 267216.13, '2026-08-24 09:19:52.280803+00', '2026-08-24 09:19:52.280803+00');
INSERT INTO app.material_type_prices VALUES (755, 12, '040', 'A', 10467.74, '2026-08-24 09:19:52.281056+00', '2026-08-24 09:19:52.281056+00');
INSERT INTO app.material_type_prices VALUES (756, 12, '050', 'A', 10822.58, '2026-08-24 09:19:52.281277+00', '2026-08-24 09:19:52.281277+00');
INSERT INTO app.material_type_prices VALUES (757, 12, '060', 'A', 14193.55, '2026-08-24 09:19:52.281484+00', '2026-08-24 09:19:52.281484+00');
INSERT INTO app.material_type_prices VALUES (758, 12, '070', 'A', 18274.19, '2026-08-24 09:19:52.281685+00', '2026-08-24 09:19:52.281685+00');
INSERT INTO app.material_type_prices VALUES (759, 12, '080', 'A', 22532.26, '2026-08-24 09:19:52.281901+00', '2026-08-24 09:19:52.281901+00');
INSERT INTO app.material_type_prices VALUES (760, 12, '090', 'A', 27677.42, '2026-08-24 09:19:52.282155+00', '2026-08-24 09:19:52.282155+00');
INSERT INTO app.material_type_prices VALUES (761, 12, '100', 'A', 33177.42, '2026-08-24 09:19:52.28237+00', '2026-08-24 09:19:52.28237+00');
INSERT INTO app.material_type_prices VALUES (762, 12, '110', 'A', 39209.68, '2026-08-24 09:19:52.282588+00', '2026-08-24 09:19:52.282588+00');
INSERT INTO app.material_type_prices VALUES (763, 12, '120', 'A', 45951.61, '2026-08-24 09:19:52.282799+00', '2026-08-24 09:19:52.282799+00');
INSERT INTO app.material_type_prices VALUES (764, 12, '130', 'A', 53225.81, '2026-08-24 09:19:52.28305+00', '2026-08-24 09:19:52.28305+00');
INSERT INTO app.material_type_prices VALUES (765, 12, '140', 'A', 60500.00, '2026-08-24 09:19:52.283284+00', '2026-08-24 09:19:52.283284+00');


--
-- Data for Name: notifications; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: numbering_sequences; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: order_acceptance_cancel_requests; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: permissions; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: price_list_entries; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: price_list_variants; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: price_list_discounts; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: price_list_tiers; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: process_step_exec_dependencies; Type: TABLE DATA; Schema: app; Owner: postgres
--

INSERT INTO app.process_step_exec_dependencies VALUES (30, 1, 'OR', '素材手配の完了');
INSERT INTO app.process_step_exec_dependencies VALUES (7, 1, 'OR', '素材手配の完了');
INSERT INTO app.process_step_exec_dependencies VALUES (6, 1, 'OR', '素材手配の完了');
INSERT INTO app.process_step_exec_dependencies VALUES (5, 1, 'OR', '素材手配の完了');
INSERT INTO app.process_step_exec_dependencies VALUES (30, 3, 'OR', '素材手配の完了');
INSERT INTO app.process_step_exec_dependencies VALUES (7, 3, 'OR', '素材手配の完了');
INSERT INTO app.process_step_exec_dependencies VALUES (6, 3, 'OR', '素材手配の完了');
INSERT INTO app.process_step_exec_dependencies VALUES (5, 3, 'OR', '素材手配の完了');
INSERT INTO app.process_step_exec_dependencies VALUES (10, 6, 'OR', 'いずれかの完了（素材が研磨は空真）');
INSERT INTO app.process_step_exec_dependencies VALUES (8, 7, 'AND', '円筒加工の完了');
INSERT INTO app.process_step_exec_dependencies VALUES (9, 8, 'AND', '円筒加工検査の完了');
INSERT INTO app.process_step_exec_dependencies VALUES (21, 9, 'AND', '円筒検査承認');
INSERT INTO app.process_step_exec_dependencies VALUES (20, 9, 'AND', '円筒検査承認');
INSERT INTO app.process_step_exec_dependencies VALUES (19, 9, 'AND', '円筒検査承認');
INSERT INTO app.process_step_exec_dependencies VALUES (18, 9, 'AND', '円筒検査承認');
INSERT INTO app.process_step_exec_dependencies VALUES (13, 9, 'AND', '円筒検査承認');
INSERT INTO app.process_step_exec_dependencies VALUES (12, 9, 'AND', '円筒検査承認');
INSERT INTO app.process_step_exec_dependencies VALUES (10, 9, 'OR', 'いずれかの完了（素材が研磨は空真）');
INSERT INTO app.process_step_exec_dependencies VALUES (21, 10, 'OR', '素材準備済み');
INSERT INTO app.process_step_exec_dependencies VALUES (20, 10, 'OR', '素材準備済み');
INSERT INTO app.process_step_exec_dependencies VALUES (19, 10, 'OR', '素材準備済み');
INSERT INTO app.process_step_exec_dependencies VALUES (18, 10, 'OR', '素材準備済み');
INSERT INTO app.process_step_exec_dependencies VALUES (17, 10, 'OR', '素材準備済み');
INSERT INTO app.process_step_exec_dependencies VALUES (16, 10, 'OR', '素材準備済み');
INSERT INTO app.process_step_exec_dependencies VALUES (13, 10, 'OR', '素材準備済み');
INSERT INTO app.process_step_exec_dependencies VALUES (12, 10, 'OR', '素材準備済み');
INSERT INTO app.process_step_exec_dependencies VALUES (11, 10, 'AND', '全長合わせの完了');
INSERT INTO app.process_step_exec_dependencies VALUES (14, 13, 'AND', '段加工の完了');
INSERT INTO app.process_step_exec_dependencies VALUES (15, 14, 'AND', '段加工検査の完了');
INSERT INTO app.process_step_exec_dependencies VALUES (23, 18, 'AND', '製作完了（存在する製作工程すべて）');
INSERT INTO app.process_step_exec_dependencies VALUES (21, 18, 'AND', '溝の完了');
INSERT INTO app.process_step_exec_dependencies VALUES (20, 18, 'AND', '溝の完了');
INSERT INTO app.process_step_exec_dependencies VALUES (23, 19, 'AND', '製作完了（存在する製作工程すべて）');
INSERT INTO app.process_step_exec_dependencies VALUES (23, 20, 'AND', '製作完了（存在する製作工程すべて）');
INSERT INTO app.process_step_exec_dependencies VALUES (23, 21, 'AND', '製作完了（存在する製作工程すべて）');
INSERT INTO app.process_step_exec_dependencies VALUES (22, 21, 'AND', '先端の完了');
INSERT INTO app.process_step_exec_dependencies VALUES (23, 22, 'AND', '製作完了（存在する製作工程すべて）');
INSERT INTO app.process_step_exec_dependencies VALUES (24, 23, 'AND', '製作検査の完了');
INSERT INTO app.process_step_exec_dependencies VALUES (37, 24, 'AND', '製作検査承認');
INSERT INTO app.process_step_exec_dependencies VALUES (36, 24, 'AND', '製作検査承認の完了（受渡しフローでは空真）');
INSERT INTO app.process_step_exec_dependencies VALUES (35, 24, 'AND', 'すべて完了');
INSERT INTO app.process_step_exec_dependencies VALUES (33, 24, 'AND', '製作検査承認の完了（受渡しフローでは空真）');
INSERT INTO app.process_step_exec_dependencies VALUES (28, 24, 'AND', '製作検査承認の完了');
INSERT INTO app.process_step_exec_dependencies VALUES (29, 28, 'AND', '客先向け検査１の完了');
INSERT INTO app.process_step_exec_dependencies VALUES (31, 30, 'AND', '首逃しの完了');
INSERT INTO app.process_step_exec_dependencies VALUES (32, 31, 'AND', '首逃し検査の完了');
INSERT INTO app.process_step_exec_dependencies VALUES (37, 33, 'OR', 'コーティング or LD の完了');
INSERT INTO app.process_step_exec_dependencies VALUES (35, 33, 'AND', 'すべて完了');
INSERT INTO app.process_step_exec_dependencies VALUES (34, 33, 'AND', 'LDの完了');
INSERT INTO app.process_step_exec_dependencies VALUES (38, 36, 'AND', 'コーティングの完了');
INSERT INTO app.process_step_exec_dependencies VALUES (37, 36, 'OR', 'コーティング or LD の完了');
INSERT INTO app.process_step_exec_dependencies VALUES (35, 36, 'AND', 'すべて完了');
INSERT INTO app.process_step_exec_dependencies VALUES (39, 38, 'AND', '客先向け検査２の完了');


--
-- Data for Name: process_step_use_dependencies; Type: TABLE DATA; Schema: app; Owner: postgres
--

INSERT INTO app.process_step_use_dependencies VALUES (30, 1, 'OR', false, '素材手配');
INSERT INTO app.process_step_use_dependencies VALUES (7, 1, 'OR', false, '素材手配');
INSERT INTO app.process_step_use_dependencies VALUES (6, 1, 'OR', false, '素材手配');
INSERT INTO app.process_step_use_dependencies VALUES (5, 1, 'OR', false, '素材手配');
INSERT INTO app.process_step_use_dependencies VALUES (30, 3, 'OR', false, '素材手配');
INSERT INTO app.process_step_use_dependencies VALUES (7, 3, 'OR', false, '素材手配');
INSERT INTO app.process_step_use_dependencies VALUES (6, 3, 'OR', false, '素材手配');
INSERT INTO app.process_step_use_dependencies VALUES (5, 3, 'OR', false, '素材手配');
INSERT INTO app.process_step_use_dependencies VALUES (36, 4, 'OR', false, '製作検査承認 or 製品受渡し');
INSERT INTO app.process_step_use_dependencies VALUES (33, 4, 'OR', false, '製作検査承認 or 製品受渡し');
INSERT INTO app.process_step_use_dependencies VALUES (10, 6, 'OR', false, 'センタレス or 円筒加工検査承認 or 素材が研磨');
INSERT INTO app.process_step_use_dependencies VALUES (8, 7, 'AND', false, NULL);
INSERT INTO app.process_step_use_dependencies VALUES (9, 8, 'AND', false, NULL);
INSERT INTO app.process_step_use_dependencies VALUES (7, 8, 'AND', false, '検査必須');
INSERT INTO app.process_step_use_dependencies VALUES (10, 9, 'OR', false, 'センタレス or 円筒加工検査承認 or 素材が研磨');
INSERT INTO app.process_step_use_dependencies VALUES (7, 9, 'AND', false, '検査承認必須');
INSERT INTO app.process_step_use_dependencies VALUES (21, 10, 'OR', false, '素材準備済み');
INSERT INTO app.process_step_use_dependencies VALUES (20, 10, 'OR', false, '素材準備済み');
INSERT INTO app.process_step_use_dependencies VALUES (19, 10, 'OR', false, '素材準備済み');
INSERT INTO app.process_step_use_dependencies VALUES (18, 10, 'OR', false, '素材準備済み');
INSERT INTO app.process_step_use_dependencies VALUES (17, 10, 'OR', false, '素材準備済み');
INSERT INTO app.process_step_use_dependencies VALUES (16, 10, 'OR', false, '素材準備済み');
INSERT INTO app.process_step_use_dependencies VALUES (13, 10, 'OR', false, '素材準備済み');
INSERT INTO app.process_step_use_dependencies VALUES (12, 10, 'OR', false, '素材準備済み');
INSERT INTO app.process_step_use_dependencies VALUES (11, 10, 'AND', false, NULL);
INSERT INTO app.process_step_use_dependencies VALUES (14, 13, 'AND', false, NULL);
INSERT INTO app.process_step_use_dependencies VALUES (15, 14, 'AND', false, NULL);
INSERT INTO app.process_step_use_dependencies VALUES (13, 14, 'AND', false, '検査必須');
INSERT INTO app.process_step_use_dependencies VALUES (14, 15, 'AND', false, NULL);
INSERT INTO app.process_step_use_dependencies VALUES (13, 15, 'AND', false, '検査承認必須');
INSERT INTO app.process_step_use_dependencies VALUES (23, 18, 'OR', false, '製作工程のいずれか');
INSERT INTO app.process_step_use_dependencies VALUES (19, 18, 'AND', true, '排他: 溝（製作）と併用不可');
INSERT INTO app.process_step_use_dependencies VALUES (23, 19, 'OR', false, '製作工程のいずれか');
INSERT INTO app.process_step_use_dependencies VALUES (18, 19, 'AND', true, '排他: 刃裏（製作）と併用不可');
INSERT INTO app.process_step_use_dependencies VALUES (23, 20, 'OR', false, '製作工程のいずれか');
INSERT INTO app.process_step_use_dependencies VALUES (23, 21, 'OR', false, '製作工程のいずれか');
INSERT INTO app.process_step_use_dependencies VALUES (22, 21, 'AND', false, NULL);
INSERT INTO app.process_step_use_dependencies VALUES (24, 23, 'AND', false, NULL);
INSERT INTO app.process_step_use_dependencies VALUES (21, 23, 'AND', false, '検査必須');
INSERT INTO app.process_step_use_dependencies VALUES (20, 23, 'AND', false, '検査必須');
INSERT INTO app.process_step_use_dependencies VALUES (19, 23, 'AND', false, '検査必須');
INSERT INTO app.process_step_use_dependencies VALUES (18, 23, 'AND', false, '検査必須');
INSERT INTO app.process_step_use_dependencies VALUES (36, 24, 'OR', false, '製作検査承認 or 製品受渡し');
INSERT INTO app.process_step_use_dependencies VALUES (35, 24, 'AND', false, NULL);
INSERT INTO app.process_step_use_dependencies VALUES (33, 24, 'OR', false, '製作検査承認 or 製品受渡し');
INSERT INTO app.process_step_use_dependencies VALUES (28, 24, 'AND', false, NULL);
INSERT INTO app.process_step_use_dependencies VALUES (23, 24, 'AND', false, '検査承認必須');
INSERT INTO app.process_step_use_dependencies VALUES (21, 24, 'AND', false, '検査承認必須');
INSERT INTO app.process_step_use_dependencies VALUES (20, 24, 'AND', false, '検査承認必須');
INSERT INTO app.process_step_use_dependencies VALUES (19, 24, 'AND', false, '検査承認必須');
INSERT INTO app.process_step_use_dependencies VALUES (18, 24, 'AND', false, '検査承認必須');
INSERT INTO app.process_step_use_dependencies VALUES (29, 28, 'AND', false, NULL);
INSERT INTO app.process_step_use_dependencies VALUES (28, 29, 'AND', false, '検査承認必須');
INSERT INTO app.process_step_use_dependencies VALUES (31, 30, 'AND', false, NULL);
INSERT INTO app.process_step_use_dependencies VALUES (32, 31, 'AND', false, NULL);
INSERT INTO app.process_step_use_dependencies VALUES (30, 31, 'AND', false, '検査必須');
INSERT INTO app.process_step_use_dependencies VALUES (30, 32, 'AND', false, '検査承認必須');
INSERT INTO app.process_step_use_dependencies VALUES (37, 33, 'OR', false, 'コーティング or LD');
INSERT INTO app.process_step_use_dependencies VALUES (34, 33, 'AND', false, NULL);
INSERT INTO app.process_step_use_dependencies VALUES (33, 34, 'AND', false, '検査必須');
INSERT INTO app.process_step_use_dependencies VALUES (38, 36, 'AND', false, NULL);
INSERT INTO app.process_step_use_dependencies VALUES (37, 36, 'OR', false, 'コーティング or LD');
INSERT INTO app.process_step_use_dependencies VALUES (39, 38, 'AND', false, NULL);
INSERT INTO app.process_step_use_dependencies VALUES (38, 39, 'AND', false, '検査承認必須');


--
-- Data for Name: process_step_work_locations; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: product_inventory; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: product_process_route_version_steps; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: purchase_requests; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: purchase_request_items; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: push_subscriptions; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: quote_items; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: roles; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: role_permission_relation; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: system_settings; Type: TABLE DATA; Schema: app; Owner: postgres
--

INSERT INTO app.system_settings VALUES ('trial_pricing.material_price_basis', '"MAX"', '材料参照価格の算出方法（MAX/LATEST/AVERAGE）', NULL, '2026-08-24 09:19:51.478759+00');
INSERT INTO app.system_settings VALUES ('trial_pricing.lookback_months', '6', '仕入実績の参照期間（月）', NULL, '2026-08-24 09:19:51.478759+00');
INSERT INTO app.system_settings VALUES ('trial_pricing.machining_rate_per_10min', '2000', '加工単価（¥/10分）', NULL, '2026-08-24 09:19:51.478759+00');
INSERT INTO app.system_settings VALUES ('trial_pricing.spare_shape_count', '3', '予備本数', NULL, '2026-08-24 09:19:51.478759+00');
INSERT INTO app.system_settings VALUES ('trial_pricing.correction_factor', '1.25', '補正値', NULL, '2026-08-24 09:19:51.478759+00');
INSERT INTO app.system_settings VALUES ('trial_pricing.ld_charge_per_10min', '7500', 'LD加算（¥/10分）', NULL, '2026-08-24 09:19:51.478759+00');


--
-- Data for Name: user_home_settings; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: user_notification_settings; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: user_plants; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: user_role_relation; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: work_order_flow_changes; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: work_order_links; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: work_order_order_lines; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: work_order_step_actuals; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: work_order_step_inspection_templates; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: work_order_step_links; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: work_order_step_plans; Type: TABLE DATA; Schema: app; Owner: postgres
--



--
-- Data for Name: ldap_sync_log; Type: TABLE DATA; Schema: directory; Owner: postgres
--



--
-- Name: approval_flow_rule_steps_id_seq; Type: SEQUENCE SET; Schema: app; Owner: postgres
--

SELECT pg_catalog.setval('app.approval_flow_rule_steps_id_seq', 1, false);


--
-- Name: approval_flow_rules_id_seq; Type: SEQUENCE SET; Schema: app; Owner: postgres
--

SELECT pg_catalog.setval('app.approval_flow_rules_id_seq', 1, false);


--
-- Name: approval_flow_steps_id_seq; Type: SEQUENCE SET; Schema: app; Owner: postgres
--

SELECT pg_catalog.setval('app.approval_flow_steps_id_seq', 5, true);


--
-- Name: approval_groups_id_seq; Type: SEQUENCE SET; Schema: app; Owner: postgres
--

SELECT pg_catalog.setval('app.approval_groups_id_seq', 2, true);


--
-- Name: audit_logs_id_seq; Type: SEQUENCE SET; Schema: app; Owner: postgres
--

SELECT pg_catalog.setval('app.audit_logs_id_seq', 1, false);


--
-- Name: defect_types_id_seq; Type: SEQUENCE SET; Schema: app; Owner: postgres
--

SELECT pg_catalog.setval('app.defect_types_id_seq', 6, true);


--
-- Name: file_folder_grants_id_seq; Type: SEQUENCE SET; Schema: app; Owner: postgres
--

SELECT pg_catalog.setval('app.file_folder_grants_id_seq', 1, false);


--
-- Name: inspection_template_items_id_seq; Type: SEQUENCE SET; Schema: app; Owner: postgres
--

SELECT pg_catalog.setval('app.inspection_template_items_id_seq', 1, false);


--
-- Name: inspection_templates_id_seq; Type: SEQUENCE SET; Schema: app; Owner: postgres
--

SELECT pg_catalog.setval('app.inspection_templates_id_seq', 1, false);


--
-- Name: kiosk_device_logs_id_seq; Type: SEQUENCE SET; Schema: app; Owner: postgres
--

SELECT pg_catalog.setval('app.kiosk_device_logs_id_seq', 1, false);


--
-- Name: match_aliases_id_seq; Type: SEQUENCE SET; Schema: app; Owner: postgres
--

SELECT pg_catalog.setval('app.match_aliases_id_seq', 1, false);


--
-- Name: material_type_prices_id_seq; Type: SEQUENCE SET; Schema: app; Owner: postgres
--

SELECT pg_catalog.setval('app.material_type_prices_id_seq', 765, true);


--
-- Name: material_types_id_new_seq; Type: SEQUENCE SET; Schema: app; Owner: postgres
--

SELECT pg_catalog.setval('app.material_types_id_new_seq', 13, true);


--
-- Name: materials_id_new_seq; Type: SEQUENCE SET; Schema: app; Owner: postgres
--

SELECT pg_catalog.setval('app.materials_id_new_seq', 904, true);


--
-- Name: plants_id_seq; Type: SEQUENCE SET; Schema: app; Owner: postgres
--

SELECT pg_catalog.setval('app.plants_id_seq', 1, true);


--
-- Name: process_step_catalog_id_seq; Type: SEQUENCE SET; Schema: app; Owner: postgres
--

SELECT pg_catalog.setval('app.process_step_catalog_id_seq', 42, true);


--
-- Name: process_step_work_locations_id_seq; Type: SEQUENCE SET; Schema: app; Owner: postgres
--

SELECT pg_catalog.setval('app.process_step_work_locations_id_seq', 1, false);


--
-- Name: product_process_routes_id_seq; Type: SEQUENCE SET; Schema: app; Owner: postgres
--

SELECT pg_catalog.setval('app.product_process_routes_id_seq', 1, false);


--
-- Name: products_id_new_seq; Type: SEQUENCE SET; Schema: app; Owner: postgres
--

SELECT pg_catalog.setval('app.products_id_new_seq', 1, false);


--
-- Name: regions_id_seq; Type: SEQUENCE SET; Schema: app; Owner: postgres
--

SELECT pg_catalog.setval('app.regions_id_seq', 1, false);


--
-- Name: roles_id_seq; Type: SEQUENCE SET; Schema: app; Owner: postgres
--

SELECT pg_catalog.setval('app.roles_id_seq', 1, false);


--
-- Name: storage_locations_id_seq; Type: SEQUENCE SET; Schema: app; Owner: postgres
--

SELECT pg_catalog.setval('app.storage_locations_id_seq', 1, false);


--
-- Name: storage_shelves_id_seq; Type: SEQUENCE SET; Schema: app; Owner: postgres
--

SELECT pg_catalog.setval('app.storage_shelves_id_seq', 1, false);


--
-- Name: work_location_groups_id_seq; Type: SEQUENCE SET; Schema: app; Owner: postgres
--

SELECT pg_catalog.setval('app.work_location_groups_id_seq', 1, false);


--
-- Name: work_locations_id_seq; Type: SEQUENCE SET; Schema: app; Owner: postgres
--

SELECT pg_catalog.setval('app.work_locations_id_seq', 1, false);


--
-- Name: ldap_sync_log_id_seq; Type: SEQUENCE SET; Schema: directory; Owner: postgres
--

SELECT pg_catalog.setval('directory.ldap_sync_log_id_seq', 1, false);


--
-- PostgreSQL database dump complete
--



SET session_replication_role = DEFAULT;
COMMIT;
