-- AlterTable: ユーザーの UI 言語（ja/en/zh — キオスク QR ログイン後の表示言語）
ALTER TABLE "app"."users" ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'ja';
