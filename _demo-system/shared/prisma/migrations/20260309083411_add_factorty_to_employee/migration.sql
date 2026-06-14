-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "factory_id" INTEGER;

-- CreateIndex
CREATE INDEX "employees_factory_id_idx" ON "employees"("factory_id");

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_factory_id_fkey" FOREIGN KEY ("factory_id") REFERENCES "app_factories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
