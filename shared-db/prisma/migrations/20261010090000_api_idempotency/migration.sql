-- CreateTable
CREATE TABLE "app"."api_idempotency_keys" (
    "key" VARCHAR(255) NOT NULL,
    "client_id" UUID NOT NULL,
    "request_hash" CHAR(64) NOT NULL,
    "response_status" INTEGER NOT NULL,
    "response_body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_idempotency_keys_pkey" PRIMARY KEY ("client_id","key")
);

-- CreateIndex
CREATE INDEX "api_idempotency_keys_created_at_idx" ON "app"."api_idempotency_keys"("created_at");
