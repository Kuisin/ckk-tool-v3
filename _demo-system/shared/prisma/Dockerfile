# syntax=docker.io/docker/dockerfile:1

FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package.json pnpm-lock.yaml* ./
RUN corepack enable pnpm && pnpm i --frozen-lockfile

# Copy Prisma schema and configuration (will be overridden by volume mount in dev)
COPY schema.prisma ./
COPY prisma.config.ts ./
COPY migrations ./migrations

# Copy watch script
COPY scripts ./scripts

# Create directory for generated client (schema outputs to ../generated/prisma)
RUN mkdir -p ../generated

# Generate Prisma client (required for Prisma Studio)
# This will be regenerated when schema changes via watch script
RUN pnpm generate:only

# Expose Prisma Studio port
EXPOSE 5555

# Set environment variables
ENV PRISMA_STUDIO_PORT=5555
ENV PRISMA_STUDIO_BROWSER=none

# Run Prisma Studio with watch mode (regenerates client on schema changes)
CMD ["pnpm", "studio:watch"]

