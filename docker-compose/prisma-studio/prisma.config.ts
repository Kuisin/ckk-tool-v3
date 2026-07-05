// Prisma config for the read-only Studio browser.
// schema/ is a synced COPY of <repo>/shared-db/prisma/schema (source of truth).
// No migrations here — Studio only reads the schema to render the data browser.
import { defineConfig } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema',
  datasource: {
    url: process.env.DATABASE_URL!,
  },
})
