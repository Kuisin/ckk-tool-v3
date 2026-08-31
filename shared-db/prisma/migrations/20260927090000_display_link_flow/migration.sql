-- allow-destructive: ディスプレイ機能は数時間前に入ったばかりで dev 限定（dev-features）、
-- 3 表とも 0 行、参照しているのはこの機能だけ。旧アプリが壊れるのは
-- デプロイ重複中のディスプレイ画面だけで、登録済みの実機はまだ 1 台も無い。
--
-- 通常なら expand / contract（参照をやめたリリース → 次で削除）にすべきだが、
-- 利用者も行も無い機能のために 2 リリース分けるのは釣り合わない。
-- **この判断が成り立つのは「まだ誰も使っていない」間だけ**で、実機が付いた
-- あとに同じことをするなら、素直に 2 段階へ分けること。

-- 管理ディスプレイ: 登録の流れを共有端末（キオスク端末）にそろえ、表示倍率を足す。
--
-- 20260926090000_add_display は **すでに dev に適用済み**なので直せない
-- （Prisma は適用済みマイグレーションのチェックサムを持っていて、書き換えると
--  次のデプロイが P3006 で落ちる）。よって差分をこの 1 本で当てる。
--
-- 変えるもの:
--   1. 状態に PENDING / LINKED を足す（code-first → profile-first）
--      作る（PENDING）→ リンク（LINKED）→ 有効化（ACTIVE）。端末と同じ 3 段。
--   2. paired_by/paired_at → linked_at + activated_by/activated_at
--      「誰がペアリングしたか」ではなく「いつ結ばれ、誰が有効化したか」。
--      端末（kiosk_devices）と同じ語彙にそろえる。
--   3. display_pairing_sessions → display_link_requests（kiosk_link_requests と同型）
--   4. scale_percent（表示倍率）を足す
--
-- ★ 状態の enum は **作り直す**。PostgreSQL は `ALTER TYPE ... ADD VALUE` で
--   足した値を、同じトランザクションの中で使えない（既定値を 'PENDING' に
--   するのがまさにそれに当たる）。Prisma が値の追加・並べ替えで出すのと同じ形。

-- ── 1. 状態 enum の作り直し ─────────────────────────────────────────────────
ALTER TYPE "app"."DISPLAY_DEVICE_STATUS" RENAME TO "DISPLAY_DEVICE_STATUS_old";

CREATE TYPE "app"."DISPLAY_DEVICE_STATUS" AS ENUM ('PENDING', 'LINKED', 'ACTIVE', 'DISABLED', 'REVOKED');

ALTER TABLE "app"."display_devices" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "app"."display_devices"
  ALTER COLUMN "status" TYPE "app"."DISPLAY_DEVICE_STATUS"
  USING ("status"::text::"app"."DISPLAY_DEVICE_STATUS");
ALTER TABLE "app"."display_devices" ALTER COLUMN "status" SET DEFAULT 'PENDING';

DROP TYPE "app"."DISPLAY_DEVICE_STATUS_old";

-- ── 2. 端末の列（リンク・有効化・表示倍率） ─────────────────────────────────
ALTER TABLE "app"."display_devices" DROP CONSTRAINT "display_devices_paired_by_fkey";

ALTER TABLE "app"."display_devices"
  DROP COLUMN "paired_at",
  DROP COLUMN "paired_by",
  ADD COLUMN  "linked_at"     TIMESTAMPTZ(6),
  ADD COLUMN  "activated_by"  UUID,
  ADD COLUMN  "activated_at"  TIMESTAMPTZ(6),
  ADD COLUMN  "scale_percent" INTEGER NOT NULL DEFAULT 100;

ALTER TABLE "app"."display_devices"
  ADD CONSTRAINT "display_devices_activated_by_fkey"
  FOREIGN KEY ("activated_by") REFERENCES "app"."users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 表示倍率の範囲は DB 側でも閉じる（users.text_scale / date_format と同じ規約）。
-- 画面が読めなくなる値を、経路を問わず入れられないようにする。
ALTER TABLE "app"."display_devices"
  ADD CONSTRAINT "display_devices_scale_percent_check"
  CHECK ("scale_percent" BETWEEN 50 AND 200);

-- ── 3. ペアリングセッション → リンクリクエスト ──────────────────────────────
-- DROP + CREATE ではなく RENAME にしているのは、これが「作り直し」ではなく
-- 「呼び名を端末に合わせた」だけだから。発行済みのコードも失われない。
ALTER TABLE "app"."display_pairing_sessions" RENAME TO "display_link_requests";
ALTER TABLE "app"."display_link_requests" RENAME COLUMN "display_device_id" TO "device_id";

ALTER TABLE "app"."display_link_requests"
  RENAME CONSTRAINT "display_pairing_sessions_pkey" TO "display_link_requests_pkey";
ALTER TABLE "app"."display_link_requests"
  RENAME CONSTRAINT "display_pairing_sessions_display_device_id_fkey" TO "display_link_requests_device_id_fkey";

ALTER INDEX "app"."display_pairing_sessions_code_key" RENAME TO "display_link_requests_code_key";
ALTER INDEX "app"."display_pairing_sessions_expires_at_idx" RENAME TO "display_link_requests_expires_at_idx";
