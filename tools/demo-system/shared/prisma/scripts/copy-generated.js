#!/usr/bin/env node
/**
 * Copy generated Prisma client to each Next.js app
 * This script runs after `prisma generate` to ensure all apps have the latest client
 */

const fs = require("fs");
const path = require("path");

const sharedPrismaDir = path.resolve(__dirname, "..");
const generatedDir = path.join(sharedPrismaDir, "../generated/prisma");
const workspaceRoot = path.resolve(sharedPrismaDir, "../..");

// Detect if we're in a Docker build context
// In Docker builds, we're typically in /app and other apps won't be in the build context
// Check if we're in a typical Docker working directory
const isDockerBuild =
  process.cwd() === "/app" || process.cwd().startsWith("/app/");

// Apps that need the generated Prisma client
const apps = [
  {
    name: "nextjs-user",
    targetDir: path.join(workspaceRoot, "nextjs-user/generated/prisma"),
  },
  {
    name: "apps-portal",
    targetDir: path.join(workspaceRoot, "apps-portal/generated/prisma"),
  },
];

// Check if generated directory exists
if (!fs.existsSync(generatedDir)) {
  console.error("❌ Generated Prisma client not found at:", generatedDir);
  console.error("   Run 'pnpm generate' first to generate the client.");
  process.exit(1);
}

// In Docker builds, skip copying to other apps (they're built separately)
if (isDockerBuild) {
  console.log(
    "📦 Docker build detected - skipping cross-app Prisma client copy",
  );
  console.log("   (Each app copies the client during its own build)");
  process.exit(0);
}

console.log("📦 Copying generated Prisma client to apps...");
console.log("   Source:", generatedDir);

let successCount = 0;
let errorCount = 0;

for (const app of apps) {
  try {
    // Check if app root directory exists
    const appRoot = path.dirname(path.dirname(app.targetDir));
    if (!fs.existsSync(appRoot)) {
      console.warn(
        `⚠️  Skipping ${app.name}: app directory not found at ${appRoot}`,
      );
      continue;
    }

    // Remove existing generated directory if it exists
    if (fs.existsSync(app.targetDir)) {
      fs.rmSync(app.targetDir, { recursive: true, force: true });
    }

    // Create target directory (and parent directories if needed)
    fs.mkdirSync(app.targetDir, { recursive: true });

    // Copy all files from generated directory
    copyRecursiveSync(generatedDir, app.targetDir);

    console.log(`✅ Copied to ${app.name}`);
    successCount++;
  } catch (error) {
    console.error(`❌ Failed to copy to ${app.name}:`, error.message);
    errorCount++;
  }
}

console.log("\n📊 Summary:");
console.log(`   ✅ Success: ${successCount}`);
if (errorCount > 0) {
  console.log(`   ❌ Errors: ${errorCount}`);
  process.exit(1);
}

/**
 * Recursively copy directory
 */
function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();

  if (isDirectory) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    fs.readdirSync(src).forEach((childItemName) => {
      copyRecursiveSync(
        path.join(src, childItemName),
        path.join(dest, childItemName),
      );
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}
