#!/usr/bin/env node

/**
 * Watch script for Prisma Studio
 * Watches for changes to schema.prisma and regenerates the Prisma client
 * Then restarts Prisma Studio
 */

const { watch } = require("fs");
const { spawn, exec } = require("child_process");
const path = require("path");

const schemaPath = path.join(__dirname, "../schema.prisma");
let studioProcess = null;
let regenerateTimeout = null;

function startStudio() {
  console.log("[Prisma Watch] Starting Prisma Studio on port 5555...");
  // Use prisma studio directly with explicit flags
  studioProcess = spawn(
    "npx",
    [
      "prisma",
      "studio",
      "--config",
      "./prisma.config.ts",
      "--port",
      "5555",
      "--browser",
      "none",
    ],
    {
      stdio: "inherit",
      shell: true,
      cwd: path.join(__dirname, ".."),
      env: {
        ...process.env,
        PRISMA_STUDIO_PORT: "5555",
        BROWSER: "none",
      },
    },
  );

  studioProcess.on("exit", (code) => {
    if (code !== null && code !== 0) {
      console.error(`[Prisma Watch] Prisma Studio exited with code ${code}`);
      // Restart after a delay if it crashed (but not if it was intentionally stopped)
      if (code !== 130 && code !== 143) {
        // Not SIGINT or SIGTERM
        setTimeout(() => {
          console.log("[Prisma Watch] Attempting to restart Prisma Studio...");
          startStudio();
        }, 2000);
      }
    }
  });

  studioProcess.on("error", (error) => {
    console.error("[Prisma Watch] Error starting Prisma Studio:", error);
  });
}

function regenerateClient() {
  return new Promise((resolve, reject) => {
    console.log("[Prisma Watch] Regenerating Prisma client...");
    exec(
      "pnpm generate:only",
      {
        cwd: path.join(__dirname, ".."),
      },
      (error, stdout, stderr) => {
        if (error) {
          console.error("[Prisma Watch] Error regenerating client:", error);
          reject(error);
          return;
        }
        console.log("[Prisma Watch] Prisma client regenerated successfully");
        if (stdout) console.log(stdout);
        if (stderr) console.error(stderr);
        resolve();
      },
    );
  });
}

async function handleSchemaChange() {
  // Debounce: clear any pending regeneration
  if (regenerateTimeout) {
    clearTimeout(regenerateTimeout);
  }

  // Wait 500ms before regenerating to handle multiple rapid file changes
  regenerateTimeout = setTimeout(async () => {
    console.log("[Prisma Watch] Schema file changed, regenerating client...");

    try {
      await regenerateClient();
      console.log(
        "[Prisma Watch] Client regenerated. Restarting Prisma Studio...",
      );

      // Kill existing studio process
      if (studioProcess) {
        studioProcess.kill("SIGTERM");
        studioProcess = null;

        // Wait a bit before restarting
        setTimeout(() => {
          startStudio();
        }, 1000);
      } else {
        startStudio();
      }
    } catch (error) {
      console.error("[Prisma Watch] Failed to regenerate client:", error);
    }
  }, 500);
}

// Initial client generation and studio start
async function init() {
  try {
    await regenerateClient();
    startStudio();
  } catch (error) {
    console.error("[Prisma Watch] Initial setup failed:", error);
    process.exit(1);
  }
}

// Watch for schema changes
console.log(`[Prisma Watch] Watching ${schemaPath} for changes...`);
watch(schemaPath, { persistent: true }, (eventType) => {
  if (eventType === "change") {
    handleSchemaChange();
  }
});

// Also watch prisma.config.ts in case it changes
const configPath = path.join(__dirname, "../prisma.config.ts");
watch(configPath, { persistent: true }, (eventType) => {
  if (eventType === "change") {
    handleSchemaChange();
  }
});

// Handle graceful shutdown
process.on("SIGTERM", () => {
  console.log("[Prisma Watch] Shutting down...");
  if (studioProcess) {
    studioProcess.kill("SIGTERM");
  }
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("[Prisma Watch] Shutting down...");
  if (studioProcess) {
    studioProcess.kill("SIGTERM");
  }
  process.exit(0);
});

// Initialize
init();
