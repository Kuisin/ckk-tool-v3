-- CreateTable
CREATE TABLE "app"."webhook_endpoints" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "client_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "url" VARCHAR(2048) NOT NULL,
    "event_types" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "secret" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "consecutive_failures" INTEGER NOT NULL DEFAULT 0,
    "disabled_at" TIMESTAMPTZ(6),
    "disabled_reason" VARCHAR(200),
    "last_delivered_at" TIMESTAMPTZ(6),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "webhook_endpoints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."webhook_deliveries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "endpoint_id" UUID NOT NULL,
    "audit_event_id" BIGINT,
    "event_type" VARCHAR(80) NOT NULL,
    "payload" TEXT NOT NULL,
    "status" VARCHAR(12) NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_status" INTEGER,
    "last_error" VARCHAR(300),
    "delivered_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "webhook_endpoints_is_active_idx" ON "app"."webhook_endpoints"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_endpoints_client_id_name_key" ON "app"."webhook_endpoints"("client_id", "name");

-- CreateIndex
CREATE INDEX "webhook_deliveries_status_next_attempt_at_idx" ON "app"."webhook_deliveries"("status", "next_attempt_at");

-- CreateIndex
CREATE INDEX "webhook_deliveries_endpoint_id_created_at_idx" ON "app"."webhook_deliveries"("endpoint_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "webhook_deliveries_endpoint_id_audit_event_id_event_type_key" ON "app"."webhook_deliveries"("endpoint_id", "audit_event_id", "event_type");

-- AddForeignKey
ALTER TABLE "app"."webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "app"."api_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_endpoint_id_fkey" FOREIGN KEY ("endpoint_id") REFERENCES "app"."webhook_endpoints"("id") ON DELETE CASCADE ON UPDATE CASCADE;
