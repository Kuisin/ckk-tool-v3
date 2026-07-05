# Shared Prisma Setup

## Overview

This shared Prisma setup provides a centralized database schema and client for all KAI Lab applications. The generated Prisma client is automatically copied to each Next.js app after generation.

## Folder Structure

```
shared/prisma/
├── schema.prisma          # Main Prisma schema
├── prisma.config.ts       # Prisma 7 configuration
├── index.ts              # Exported Prisma client
├── package.json          # Package configuration
├── tsconfig.json         # TypeScript configuration
├── README.md            # This file
├── migrations/          # Database migrations
├── custom_sql/          # Custom SQL migrations
├── scripts/             # Utility scripts
│   ├── seed.ts         # Database seeding script
│   └── copy-generated.js # Auto-copy script
└── data/               # Data files
    └── permissions.csv  # Permission definitions
```

## How It Works

1. **Generate Prisma Client**: Run `pnpm generate` in `shared/prisma`
2. **Auto-Copy**: The `generate` script automatically runs `copy-generated.js` after generation
3. **Apps Updated**: Generated client is copied to:
   - `nextjs-user/generated/prisma/`
   - `apps-portal/generated/prisma/`

## Usage

### Generate and Copy (Recommended)

```bash
cd shared/prisma
pnpm generate
```

This will:
1. Generate Prisma client to `shared/generated/prisma/`
2. Automatically copy to all apps

### Generate Only (Without Copy)

```bash
cd shared/prisma
pnpm generate:only
```

### Copy Only (After Manual Generation)

```bash
cd shared/prisma
pnpm copy
```

## Script Details

### `scripts/copy-generated.js`

- Copies `shared/generated/prisma/` to each app's `generated/prisma/` directory
- Removes old generated files before copying
- Provides feedback on success/failure
- Skips apps that don't exist

### Apps Configuration

The script copies to:
- `nextjs-user/generated/prisma/`
- `apps-portal/generated/prisma/`

To add more apps, edit `scripts/copy-generated.js` and add to the `apps` array.

## App Import Paths

Each app imports from its local generated client:

**nextjs-user/src/lib/prisma.ts:**
```typescript
export type * from "../generated/prisma/client";
export { prisma } from "../generated/prisma/client";
```

**apps-portal/src/lib/prisma.ts:**
```typescript
export type * from "../generated/prisma/client";
export { prisma } from "../generated/prisma/client";
```

## Benefits

✅ **No Module Resolution Issues**: Each app has its own copy, no cross-directory imports
✅ **Automatic Updates**: Run `pnpm generate` once, all apps updated
✅ **Works with Middleware**: Local imports work in all Next.js contexts
✅ **TypeScript Support**: Standard relative imports, no special configuration needed

## Workflow

1. Make schema changes in `shared/prisma/schema.prisma`
2. Run `cd shared/prisma && pnpm generate`
3. Generated client is automatically copied to all apps
4. Apps can immediately use the updated client

## Troubleshooting

### Copy Fails

If copy fails, check:
- Generated client exists: `ls shared/generated/prisma/`
- App directories exist
- Permissions are correct

### Apps Don't See Updates

- Ensure `pnpm generate` completed successfully
- Check that `generated/prisma/client.ts` exists in each app
- Restart Next.js dev server

## Manual Copy (If Needed)

If automatic copy fails, manually copy:

```bash
# Copy to nextjs-user
cp -r shared/generated/prisma nextjs-user/generated/

# Copy to apps-portal
cp -r shared/generated/prisma apps-portal/generated/
```
