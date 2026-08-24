-- CreateIndex
CREATE INDEX "hr_records_employee_username_zone_date_idx" ON "hr_records"("employee_username", "zone", "date");

-- AddForeignKey
ALTER TABLE "hr_records" ADD CONSTRAINT "hr_records_employee_username_fkey" FOREIGN KEY ("employee_username") REFERENCES "employees"("username") ON DELETE CASCADE ON UPDATE CASCADE;
