-- CreateTable
CREATE TABLE "app"."inspection_template_approvers" (
    "template_id" INTEGER NOT NULL,
    "user_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "inspection_template_approvers_pkey" PRIMARY KEY ("template_id","user_id")
);

-- CreateIndex
CREATE INDEX "inspection_template_approvers_user_id_idx" ON "app"."inspection_template_approvers"("user_id");

-- AddForeignKey
ALTER TABLE "app"."inspection_template_approvers" ADD CONSTRAINT "inspection_template_approvers_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "app"."inspection_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."inspection_template_approvers" ADD CONSTRAINT "inspection_template_approvers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
