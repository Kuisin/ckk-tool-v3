-- システムユーザー（固定 UUID）。認証実装前の操作、および seed・force-migration
-- 等のシステム操作の actor（audit_logs.user_id）。冪等 INSERT。

INSERT INTO "app"."users" ("id", "group", "username", "display_name", "is_active", "created_at", "updated_at")
VALUES ('00000000-0000-0000-0000-000000000000', 'SYSTEM', 'system', 'システム', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
