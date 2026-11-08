/**
 * e2e-pages.ts — 全画面の読み込み確認を、使い捨て DB + 本番ビルドで一気通貫に回す。
 *
 *   1. 使い捨て Postgres を起動してシード（orchestrate.ts --seed-only を流用）
 *   2. nextjs-web を production build（--no-build で飛ばせる）
 *   3. next start で起動
 *   4. playwright test -c playwright.pages.config.ts（page-load.spec.ts）
 *   5. 全部破棄
 *
 * フラグ:
 *   --reuse      1–3 を飛ばし、APP_URL（既定 http://localhost:3100）の起動済み
 *                スタックに対して 4 だけ走らせる（手元で確認中のとき）
 *   --no-build   2 を飛ばす（.next が今の変更で作られていること）
 *
 * 既定の名前・ポートは撮影パイプライン（docs:shots）と**わざと違える**:
 * コンテナ ckk-pages-db / DB :55452 / app :3120。同じ機械で別のワークツリーが
 * 撮影中でも、互いのコンテナを消さない（後始末は名前だけで相手を決める）。
 * それでも重なるときは SHOT_DB_CONTAINER / SHOT_DB_PORT / SHOT_APP_PORT を変える。
 */

import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = join(fileURLToPath(import.meta.url), "../..");
const REPO = resolve(HERE, "../..");
const NEXTJS_WEB = join(REPO, "coolify/apps/nextjs-web");

const args = process.argv.slice(2);
const flag = (f: string) => args.includes(f);

const DB_CONTAINER = process.env.SHOT_DB_CONTAINER ?? "ckk-pages-db";
const DB_PORT = Number(process.env.SHOT_DB_PORT ?? 55452);
const APP_PORT = Number(process.env.SHOT_APP_PORT ?? 3120);
const APP_URL = flag("--reuse") ? (process.env.APP_URL ?? "http://localhost:3100") : `http://localhost:${APP_PORT}`;
const DATABASE_URL = `postgresql://postgres:shots@127.0.0.1:${DB_PORT}/ckk`;
const AUTH_SECRET = "docs-screenshots-fixed-secret-not-production";

function log(msg: string): void {
  console.log(`\x1b[36m[pages]\x1b[0m ${msg}`);
}

function sh(cmd: string, cmdArgs: string[], opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {}): void {
  execFileSync(cmd, cmdArgs, { stdio: "inherit", cwd: opts.cwd ?? HERE, env: { ...process.env, ...opts.env } });
}

let appProc: ChildProcess | undefined;

function stopApp(): void {
  if (appProc && !appProc.killed) {
    appProc.kill("SIGTERM");
    appProc = undefined;
  }
}

function stopDb(): void {
  try {
    execFileSync("docker", ["rm", "-f", DB_CONTAINER], { stdio: "ignore" });
  } catch {
    /* already gone */
  }
}

async function waitForApp(): Promise<void> {
  for (let i = 0; i < 90; i++) {
    try {
      const res = await fetch(`${APP_URL}/login`);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`app did not come up at ${APP_URL}`);
}

async function main(): Promise<void> {
  const reuse = flag("--reuse");
  try {
    if (!reuse) {
      log(`seed: ${DB_CONTAINER} on :${DB_PORT}`);
      sh("pnpm", ["exec", "tsx", "scripts/orchestrate.ts", "--seed-only"], {
        env: { SHOT_DB_CONTAINER: DB_CONTAINER, SHOT_DB_PORT: String(DB_PORT) },
      });
      if (!flag("--no-build")) {
        log("next build");
        sh("pnpm", ["build"], { cwd: NEXTJS_WEB });
      }
      log(`next start on :${APP_PORT}`);
      appProc = spawn("pnpm", ["exec", "next", "start", "-p", String(APP_PORT)], {
        cwd: NEXTJS_WEB,
        // 本番のコンテナは Coolify の env で TZ=Asia/Tokyo。ここも合わせないと
        // サーバー（UTC の CI ランナー）とブラウザ（Asia/Tokyo）で時刻文字列が
        // 割れ、hydration の #418 が「環境差」として混ざる。実際に TZ 依存の
        // hydration 不一致は別の欠陥として見張る（page-load.spec.ts は
        // ブラウザ側を Asia/Tokyo に固定している）。
        env: { ...process.env, TZ: "Asia/Tokyo", DATABASE_URL, AUTH_SECRET, AUTH_URL: APP_URL, NODE_ENV: "production" },
        stdio: "inherit",
      });
      await waitForApp();
    }
    log(`playwright: page-load.spec.ts against ${APP_URL}`);
    sh("pnpm", ["exec", "playwright", "test", "-c", "playwright.pages.config.ts"], { env: { APP_URL } });
    log("all pages loaded without errors");
  } finally {
    if (!reuse) {
      stopApp();
      stopDb();
    }
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
