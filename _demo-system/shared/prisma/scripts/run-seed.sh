#!/bin/bash
# Wrapper script to run seed with correct module resolution
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.."
# Ensure we can resolve @prisma/client from the generated location
# Create a symlink so the generated client can find @prisma/client
PRISMA_DIR="$PWD/node_modules/@prisma"
GENERATED_DIR="$PWD/../generated/prisma"
if [ -d "$PRISMA_DIR" ]; then
  mkdir -p "$GENERATED_DIR/node_modules"
  # Remove existing symlink if it exists and create a new one
  rm -f "$GENERATED_DIR/node_modules/@prisma"
  ln -sf "$PRISMA_DIR" "$GENERATED_DIR/node_modules/@prisma"
fi
# Run the seed script
dotenv -e ../../.env -- tsx scripts/seed.ts

