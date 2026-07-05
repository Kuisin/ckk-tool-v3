/*
  Warnings:

  - A unique constraint covering the columns `[employee_code]` on the table `employees` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "employee_code" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "employees_employee_code_key" ON "employees"("employee_code");
