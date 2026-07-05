# Quick Migration Fix

Since `migrate:status` successfully connected to your database, you can run migrations directly.

## Run this command:

```bash
cd /Users/admin/Desktop/system-apps/shared/prisma
pnpm migrate:deploy
```

If that doesn't work because DATABASE_URL isn't being picked up, try:

```bash
cd /Users/admin/Desktop/system-apps/shared/prisma
export DATABASE_URL="postgresql://${POSTGRES_APP_USER}:${POSTGRES_APP_PASSWORD}@localhost:5432/${POSTGRES_DB}"
pnpm migrate:deploy
```

Or if you have a .env file in the project root:

```bash
cd /Users/admin/Desktop/system-apps
export $(cat .env | xargs)
cd shared/prisma
pnpm migrate:deploy
```

## Expected Output

After running migrations, you should see:
```
✅ Applied migration: 20251223154904_init
✅ Applied migration: 20251223155535_fix
✅ Applied migration: 20251224142819_add_bug_table
✅ Applied migration: 20251228045205_add_3d_file
✅ Applied migration: a_create_employee_permissions_view
```

This will create the `auth_users` table and all other required tables.


