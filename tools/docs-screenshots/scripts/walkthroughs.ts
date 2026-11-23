/**
 * walkthroughs.ts — 業務の通し操作を、使い捨て DB + 本番ビルドで一気通貫に回す。
 *
 *   1. 使い捨て Postgres を起動してシード（orchestrate.ts --seed-only を流用）
 *   2. nextjs-web を production build（--no-build で飛ばせる）
 *   3. next start で起動（APP_ENV=main — 本番と同じ見た目・同じ公開範囲）
 *   4. playwright test -c playwright.walkthroughs.config.ts（walkthroughs.spec.ts）
 *   5. 全部破棄
 *
 * 2 通りの使い方（package.json）:
 *   pnpm walk:check    検査だけ。途中で止まれば落ちる（CI の walkthroughs ジョブ）
 *   pnpm docs:videos   --record。動画・字幕・サムネイル・manifest.json を書き出す
 *
 * フラグ:
 *   --record        録画する（WALK_MODE=record）。付けなければ検査だけ
 *   --out <dir>     録画の書き出し先（既定 .verify-out/manual-videos）。
 *                   **全部通ったときだけ**中身を入れ替える — 1 本でも落ちたら
 *                   前回の動画に手を付けない（壊れた手順の動画で上書きしない）
 *   --only <id>     1 本だけ走らせる（カンマ区切りで複数）。--record と併せると
 *                   その動画だけ差し替え、他は前回のものを残す
 *   --reuse         1–3 を飛ばし、APP_URL の起動済みスタックに対して 4 だけ走らせる。
 *                   **DB はシード直後であること** — 通し操作は書類を作って先へ
 *                   進めるので、同じ DB で 2 回目は通らない
 *   --no-build      2 を飛ばす（.next が今の変更で作られていること）
 *
 * 既定の名前・ポートは他のパイプラインと**わざと違える**: コンテナ ckk-walk-db /
 * DB :55462 / app :3130。重なるときは SHOT_DB_CONTAINER / SHOT_DB_PORT /
 * SHOT_APP_PORT を変える。SHOT_DATABASE_URL を渡すと docker を使わず、その DB へ
 * シードする（録画用コンテナ coolify/apps/manual-videos — 中に docker が無い）。
 */

import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { RecordedVideo, VideoManifest } from "../walkthroughs/types";

const HERE = join(fileURLToPath(import.meta.url), "../..");
const REPO = resolve(HERE, "../..");
const NEXTJS_WEB = join(REPO, "coolify/apps/nextjs-web");

const args = process.argv.slice(2);
const flag = (f: string) => args.includes(f);
const flagValue = (f: string): string | undefined => {
  const i = args.indexOf(f);
  return i >= 0 ? args[i + 1] : undefined;
};

const RECORD = flag("--record");
const REUSE = flag("--reuse");
const ONLY = (flagValue("--only") ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const OUT_DIR = resolve(flagValue("--out") ?? join(HERE, ".verify-out/manual-videos"));

const EXTERNAL_DB = process.env.SHOT_DATABASE_URL;
const DB_CONTAINER = process.env.SHOT_DB_CONTAINER ?? "ckk-walk-db";
const DB_PORT = Number(process.env.SHOT_DB_PORT ?? 55462);
const APP_PORT = Number(process.env.SHOT_APP_PORT ?? 3130);
const APP_URL = REUSE ? (process.env.APP_URL ?? `http://localhost:${APP_PORT}`) : `http://localhost:${APP_PORT}`;
const DATABASE_URL = EXTERNAL_DB ?? `postgresql://postgres:shots@127.0.0.1:${DB_PORT}/ckk`;
const AUTH_SECRET = "docs-screenshots-fixed-secret-not-production";
// フッターに出るバージョン。録画のたびに変わらないよう撮影と同じ固定値にする。
const APP_VERSION = "0.1.0-local";

function log(msg: string): void {
  console.log(`\x1b[36m[walk]\x1b[0m ${msg}`);
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
  if (EXTERNAL_DB) return; // 借り物の DB は消さない
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

/** 録画したときのコミット。git が無い環境（録画用コンテナ）は env で受け取る。 */
function currentCommit(): string | null {
  if (process.env.WALK_COMMIT) return process.env.WALK_COMMIT;
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

/** JST のオフセット付き ISO 8601（サーバーとブラウザの TZ が違っても同じ日付に読める）。 */
function nowJst(): string {
  const d = new Date(Date.now() + 9 * 3600_000);
  return `${d.toISOString().slice(0, 19)}+09:00`;
}

/**
 * 一時ディレクトリに撮れた分を、配信用ディレクトリへ移す。
 * ここへ来るのは**全部通ったあと**だけ（playwright が落ちれば例外で抜けている）。
 * --only のときは撮った動画だけ差し替え、manifest.json は前回分と束ね直す。
 */
function publish(stage: string): void {
  const recorded = readdirSync(stage)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(join(stage, f), "utf8")) as RecordedVideo);
  if (recorded.length === 0) throw new Error("録画が 1 本も書き出されていない");

  let previous: RecordedVideo[] = [];
  const manifestPath = join(OUT_DIR, "manifest.json");
  if (ONLY.length > 0 && existsSync(manifestPath)) {
    previous = (JSON.parse(readFileSync(manifestPath, "utf8")) as VideoManifest).videos;
  }
  const ids = new Set(recorded.map((v) => v.id));
  const manifest: VideoManifest = {
    commit: currentCommit(),
    recordedAt: nowJst(),
    videos: [...previous.filter((v) => !ids.has(v.id)), ...recorded],
  };

  mkdirSync(OUT_DIR, { recursive: true });
  // 全部撮り直したときは、登録簿から消えた古い動画を残さない。
  if (ONLY.length === 0) {
    for (const f of readdirSync(OUT_DIR)) {
      if (/\.(webm|vtt|jpg)$/.test(f) && !ids.has(f.replace(/\.[^.]+$/, ""))) rmSync(join(OUT_DIR, f));
    }
  }
  for (const v of recorded) {
    for (const ext of ["webm", "vtt", "jpg"]) {
      const src = join(stage, `${v.id}.${ext}`);
      // 同じファイルシステムとは限らない（bind mount）ので rename ではなくコピー。
      if (existsSync(src)) cpSync(src, join(OUT_DIR, `${v.id}.${ext}`));
    }
  }
  // manifest.json は最後に書く — 読む側（lib/manual-videos.ts）はここに載っている
  // 動画しか出さないので、書き換えの途中で半端な一覧を見せない。
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  log(`${recorded.length} 本を書き出した → ${OUT_DIR}`);
}

async function main(): Promise<void> {
  const stage = RECORD ? mkdtempSync(join(tmpdir(), "ckk-walk-")) : undefined;
  try {
    if (!REUSE) {
      log(EXTERNAL_DB ? "seed: 外部 DB（SHOT_DATABASE_URL）" : `seed: ${DB_CONTAINER} on :${DB_PORT}`);
      sh("pnpm", ["exec", "tsx", "scripts/orchestrate.ts", "--seed-only"], {
        env: { SHOT_DB_CONTAINER: DB_CONTAINER, SHOT_DB_PORT: String(DB_PORT) },
      });
      if (!flag("--no-build")) {
        log("next build");
        sh("pnpm", ["build"], { cwd: NEXTJS_WEB, env: { DATABASE_URL, NEXT_PUBLIC_APP_VERSION: APP_VERSION } });
      }
      log(`next start on :${APP_PORT}`);
      appProc = spawn("pnpm", ["exec", "next", "start", "-p", String(APP_PORT)], {
        cwd: NEXTJS_WEB,
        env: {
          ...process.env,
          // 本番のコンテナと同じ TZ。合わせないとサーバーとブラウザで時刻文字列が割れる。
          TZ: "Asia/Tokyo",
          DATABASE_URL,
          AUTH_SECRET,
          AUTH_URL: APP_URL,
          NODE_ENV: "production",
          // 本番相当: 開発環境バーを出さず、公開済みのアプリだけを並べる。
          APP_ENV: "main",
        },
        stdio: "inherit",
      });
      await waitForApp();
    }

    const pwArgs = ["exec", "playwright", "test", "-c", "playwright.walkthroughs.config.ts"];
    // -g はテスト名の前置き（ファイル名 › describe ›）を含む文字列に当たる。
    // describe 名 = ウォークスルーの id なので、それを選言で渡す。
    if (ONLY.length > 0) pwArgs.push("-g", ONLY.length > 1 ? `(${ONLY.join("|")})` : ONLY[0]);
    log(`playwright: ${RECORD ? "record" : "check"} against ${APP_URL}${ONLY.length ? `（${ONLY.join(", ")}）` : ""}`);
    sh("pnpm", pwArgs, {
      env: { APP_URL, WALK_MODE: RECORD ? "record" : "check", ...(stage ? { WALK_OUT_DIR: stage } : {}) },
    });

    if (stage) publish(stage);
    log(RECORD ? "録画が終わった" : "すべての通し操作が最後まで通った");
  } finally {
    if (stage) rmSync(stage, { recursive: true, force: true });
    if (!REUSE) {
      stopApp();
      stopDb();
    }
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
