-- Schema for the King of Time importer (matches db.py's INSERT).
-- Normally Prisma-managed in the main app; recreated here for the standalone import.

-- employee_code (KOT) -> username (AD). Must be populated for rows to match.
CREATE TABLE IF NOT EXISTS employees (
    employee_code integer PRIMARY KEY,
    username      text NOT NULL
);

-- Roster seen in KOT exports (employee_code + name as KOT reports it).
-- Filled by the loader on every run; used by the name-matcher to seed `employees`.
CREATE TABLE IF NOT EXISTS kot_employees (
    employee_code integer PRIMARY KEY,
    name          text NOT NULL,
    last_seen_at  timestamptz NOT NULL DEFAULT now()
);

-- Daily attendance records loaded from KOT CSV.
CREATE TABLE IF NOT EXISTS hr_records (
    id                bigserial PRIMARY KEY,
    employee_username text NOT NULL,
    zone              text NOT NULL,
    date              date NOT NULL,
    wt_normal         integer,
    wt_overtime       integer,
    wt_overtime_night integer,
    wt_night          integer,
    wt_leave_late     integer,
    pto               integer,
    plan_start        timestamp,
    plan_end          timestamp,
    record_starts     timestamp[],
    record_ends       timestamp[],
    rest_starts       timestamp[],
    rest_ends         timestamp[]
);

-- db.py deletes the date range (per zone) before inserting; index helps that.
CREATE INDEX IF NOT EXISTS idx_hr_records_zone_date ON hr_records (zone, date);
CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_records ON hr_records (employee_username, zone, date);

-- One row per import run (shown in adminTools).
CREATE TABLE IF NOT EXISTS import_runs (
    id          bigserial PRIMARY KEY,
    finished_at timestamptz NOT NULL DEFAULT now(),
    start_date  date,
    end_date    date,
    days        integer,
    rows        integer,
    status      text,
    message     text
);
CREATE INDEX IF NOT EXISTS idx_import_runs_finished ON import_runs (finished_at DESC);
