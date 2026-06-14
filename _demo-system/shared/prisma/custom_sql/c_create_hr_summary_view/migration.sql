-- HR Summary View: Aggregates hr_records by employee, zone, and month
-- Sums work time fields (normal, overtime, overtime night, night, leave/late) and PTO
CREATE OR REPLACE VIEW "hr_summary_view" AS
SELECT
  r.employee_username,
  r.zone,
  DATE_TRUNC('month', r.date) AS month,
  SUM(r.wt_normal)::int AS wt_normal,
  SUM(r.wt_overtime)::int AS wt_overtime,
  SUM(r.wt_overtime_night)::int AS wt_overtime_night,
  SUM(r.wt_night)::int AS wt_night,
  SUM(r.wt_leave_late)::int AS wt_leave_late,
  SUM(r.pto)::int AS pto
FROM "hr_records" r
GROUP BY r.employee_username, r.zone, DATE_TRUNC('month', r.date);
