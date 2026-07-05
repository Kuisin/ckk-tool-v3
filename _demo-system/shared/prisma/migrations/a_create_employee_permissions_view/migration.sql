-- Create view for employee permissions with aggregated groups, permissions, and zones
-- This view provides one record per employee (enabled and disabled) with arrays of group_ids, permission codes, and zones
-- Disabled employees will have empty arrays for permissions and groups
-- Only includes non-expired memberships, enabled groups, enabled group permissions, and active permissions
CREATE OR REPLACE VIEW employee_permissions_view AS
SELECT 
  e.username,
  e.is_enabled,
  e.display_name,
  e.department,
  e.title,
  -- Aggregate zones from employee_zones table
  COALESCE(
    (SELECT ARRAY_AGG(DISTINCT ez.zone::TEXT)
     FROM employee_zones ez
     WHERE ez.employee_username = e.username),
    ARRAY[]::TEXT[]
  ) as zones,
  -- Only aggregate groups if employee is enabled
  COALESCE(
    ARRAY_AGG(DISTINCT egm.group_id) FILTER (WHERE 
      e.is_enabled = true
      AND (egm.expires_at IS NULL OR egm.expires_at > NOW())
      AND g.is_enabled = true
    ),
    ARRAY[]::INTEGER[]
  ) as group_ids,
  -- Only aggregate permissions if employee is enabled
  COALESCE(
    ARRAY_AGG(DISTINCT p.code) FILTER (WHERE 
      e.is_enabled = true
      AND (egm.expires_at IS NULL OR egm.expires_at > NOW())
      AND g.is_enabled = true
      AND gp.is_enabled = true
      AND p.is_active = true
    ),
    ARRAY[]::TEXT[]
  ) as permission_codes
FROM employees e
LEFT JOIN employee_group_memberships egm ON e.username = egm.employee_username
LEFT JOIN groups g ON egm.group_id = g.id
LEFT JOIN group_permissions gp ON g.id = gp.group_id
LEFT JOIN permissions p ON gp.permission_id = p.id
GROUP BY e.username, e.is_enabled, e.display_name, e.department, e.title;

-- Create partial index on is_enabled for faster filtering of enabled/disabled employees
-- This index helps with queries that filter by is_enabled status
CREATE INDEX IF NOT EXISTS idx_employees_is_enabled ON employees(is_enabled) WHERE is_enabled = true;
CREATE INDEX IF NOT EXISTS idx_employees_is_enabled_false ON employees(is_enabled) WHERE is_enabled = false;

-- Create composite index on (username, is_enabled) on the employees table
-- This index on the underlying table helps optimize queries against the view
-- when querying by username and filtering by enabled status
CREATE INDEX IF NOT EXISTS idx_employees_username_is_enabled ON employees(username, is_enabled);

