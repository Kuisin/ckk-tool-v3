// Prisma config for nextjs-web — CLIENT GENERATION ONLY.
//
// The schema under prisma/schema is a synced COPY of the single source of
// truth in <repo>/shared-db/prisma/schema. Never edit it here; edit the
// shared folder and run `pnpm db:sync-schema`.
//
// Migrations are owned by shared-db (pnpm migrate:dev there) — do not run
// `prisma migrate` from this package.
import { defineConfig } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema',
  datasource: {
    // Only used by CLI introspection; the app passes a driver adapter at runtime.
    url: process.env.DATABASE_URL ?? 'postgresql://app:unused@shared-db:5432/ckk',
  },
})
