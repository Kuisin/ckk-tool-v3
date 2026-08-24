-- CreateTable
CREATE TABLE "hr_records" (
    "id" SERIAL NOT NULL,
    "employee_username" TEXT NOT NULL,
    "zone" "Zone" NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "date" TIMESTAMPTZ NOT NULL,
    "wt_normal" INTEGER NOT NULL,
    "wt_overtime" INTEGER NOT NULL,
    "wt_overtime_night" INTEGER NOT NULL,
    "wt_night" INTEGER NOT NULL,
    "wt_leave_late" INTEGER NOT NULL,
    "pto" INTEGER NOT NULL,
    "plan_start" TIMESTAMPTZ NOT NULL,
    "plan_end" TIMESTAMPTZ NOT NULL,
    "record_starts" TIMESTAMPTZ[],
    "record_ends" TIMESTAMPTZ[],
    "rest_starts" TIMESTAMPTZ[],
    "rest_ends" TIMESTAMPTZ[],

    CONSTRAINT "hr_records_pkey" PRIMARY KEY ("id")
);
