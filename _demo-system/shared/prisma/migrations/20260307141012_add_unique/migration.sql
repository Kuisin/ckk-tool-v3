/*
  Warnings:

  - A unique constraint covering the columns `[employee_code]` on the table `employees` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "employees" ALTER COLUMN "employee_code" DROP DEFAULT;

-- CreateIndex
CREATE UNIQUE INDEX "employees_employee_code_key" ON "employees"("employee_code");
