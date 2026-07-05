#!/bin/bash
# Script to run Prisma migrations
# Usage: ./scripts/run-migrations.sh

set -e

echo "🔍 Checking for DATABASE_URL..."

# Try to load from .env file if DATABASE_URL is not set
if [ -z "$DATABASE_URL" ]; then
  # Look for .env file in project root (two levels up)
  ENV_FILE="../../.env"
  if [ -f "$ENV_FILE" ]; then
    echo "📄 Loading environment variables from $ENV_FILE..."
    # Source the .env file and export variables
    set -a
    source "$ENV_FILE"
    set +a
    
    # Construct DATABASE_URL from individual variables if not set directly
    if [ -z "$DATABASE_URL" ] && [ -n "$POSTGRES_APP_USER" ] && [ -n "$POSTGRES_APP_PASSWORD" ] && [ -n "$POSTGRES_DB" ]; then
      export DATABASE_URL="postgresql://${POSTGRES_APP_USER}:${POSTGRES_APP_PASSWORD}@localhost:5432/${POSTGRES_DB}"
      echo "✅ Constructed DATABASE_URL from .env variables"
    fi
  fi
fi

# Check again after loading .env
if [ -z "$DATABASE_URL" ]; then
  echo "❌ DATABASE_URL environment variable is not set"
  echo ""
  echo "Please set DATABASE_URL before running migrations:"
  echo "  export DATABASE_URL='postgresql://user:password@localhost:5432/database'"
  echo ""
  echo "Or ensure .env file exists in project root with:"
  echo "  POSTGRES_APP_USER=..."
  echo "  POSTGRES_APP_PASSWORD=..."
  echo "  POSTGRES_DB=..."
  exit 1
fi

echo "✅ DATABASE_URL is set"
echo "📦 Running Prisma migrations..."

pnpm migrate:deploy

echo "✅ Migrations completed successfully!"


