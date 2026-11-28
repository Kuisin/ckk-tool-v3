/**
 * scenarios.ts — 機能ごとの通し確認（scenarios/）を、**並列に**走らせてレポートにする。
 *
 *   1. ひな形の DB を用意する（使い捨て Postgres を起動してデモシード。起動済みなら使い回す）
 *   2. nextjs-web（要るなら nextjs-kiosk も）を production build（--no-build で飛ばせる）
 *   3. シナリオ 1 本ごとに、並列で:
 *        ひな形から DB を複製（CREATE DATABASE … TEMPLATE）→ fixtures を流す
 *        → その DB に向けたアプリを空きポートで起動 → 1 本走らせる → アプリ停止・DB 削除
 *   4. 手順ごとの画像と合否を 1 ページにまとめる（<out>/index.html）
 *
 * 1 本ごとに DB を複製するので、シナリオは互いに独立で、何度流しても同じ結果になる
 * （通し操作は書類を作って先へ進めるので、同じ DB で 2 回目は通らない）。
 * 複製は 1 秒かからない — シードを本数ぶん流し直すのとは桁が違う。
 *
 * 使い方（package.json: `pnpm scenarios`）:
 *   pnpm scenarios                       全部
 *   pnpm scenarios --only a,b            その id だけ（前回の他の結果はレポートに残る）
 *   pnpm scenarios --list                登録されている id を並べて終わる
 *
 * フラグ:
 *   --jobs <n>      同時に走らせる本数（既定 4）
 *   --no-build      2 を飛ばす（.next が今の変更で作られていること）
 *   --fresh         ひな形の DB を作り直す（マイグレーション・シードを変えたあと）
 *   --down          終わったらひな形の DB（と Gotenberg）を消す。既定は残す —
 *                   直しては流し直す使い方が主なので
 *   --out <dir>     書き出し先（既定 .verify-out/scenarios）
 *   --inline        画像を埋め込んだ 1 ファイル（report.html）も書く（人に渡す用）
 *   --keep-failed   落ちた 1 本のアプリと DB を残す（接続先を表示する。手で調べる用）
 *   --serve         走らせずに、--only の 1 本ぶんの DB（複製 + fixtures）とアプリだけを
 *                   立てて待つ（Ctrl-C で片付ける）。シナリオを書きながら画面を触る用。
 *                   --only を省くと fixtures なしの素の複製（id = scratch）
 *   --verbose       各 1 本の出力をそのまま流す（既定は <out>/<id>/run.log だけ）
 *
 * 環境変数:
 *   SCN_DB_CONTAINER  ひな形の DB のコンテナ名（既定 ckk-scn-db）
 *   SCN_DB_PORT       そのホスト側ポート（既定 55472）
 *   SCN_GOTENBERG_PORT PDF レンダラのポート（既定 3398。pdf: true のシナリオがあるときだけ起動）
 * 別のワークツリーと同時に使うときは、この 3 つをまとめて変える。
 */

import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer as createHttpServer, type Server } from "node:http";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { scenarios } from "../scenarios";
import type { AnyScenario, CheckResult, ScenarioResult } from "../scenarios/types";
import { buildReport } from "./scenario-report";

const HERE = join(fileURLToPath(import.meta.url), "../..");
const REPO = resolve(HERE, "../..");
const NEXTJS_WEB = join(REPO, "coolify/apps/nextjs-web");
const NEXTJS_KIOSK = join(REPO, "coolify/apps/nextjs-kiosk");

const args = process.argv.slice(2);
const flag = (f: string) => args.includes(f);
const flagValue = (f: string): string | undefined => {
  const i = args.indexOf(f);
  return i >= 0 ? args[i + 1] : undefined;
};

const ONLY = (flagValue("--only") ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const JOBS = Math.max(1, Number(flagValue("--jobs") ?? 4));
const OUT_DIR = resolve(flagValue("--out") ?? join(HERE, ".verify-out/scenarios"));
const VERBOSE = flag("--verbose");
const KEEP_FAILED = flag("--keep-failed");

const DB_CONTAINER = process.env.SCN_DB_CONTAINER ?? "ckk-scn-db";
const DB_PORT = Number(process.env.SCN_DB_PORT ?? 55472);
const TEMPLATE_DB = "ckk";
const GOTENBERG_CONTAINER = `${DB_CONTAINER}-gotenberg`;
const GOTENBERG_PORT = Number(process.env.SCN_GOTENBERG_PORT ?? 3398);
const GOTENBERG_IMAGE = "gotenberg/gotenberg:8.17";
const AUTH_SECRET = "docs-screenshots-fixed-secret-not-production";
const APP_VERSION = "0.1.0-local";

function log(msg: string): void {
  console.log(`\x1b[36m[scn]\x1b[0m ${msg}`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function docker(dArgs: string[], input?: string): string {
  return execFileSync("docker", dArgs, { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 }).trim();
}

function containerRunning(name: string): boolean {
  try {
    return docker(["ps", "-q", "-f", `name=^${name}$`]) !== "";
  } catch {
    return false;
  }
}

/** ひな形ではなく管理用の DB（postgres）へつないで流す（複製・削除はここから）。 */
function adminSql(query: string): string {
  return docker(["exec", "-i", DB_CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-tAc", query]);
}

/** OS に空きポートを 1 つもらう（並列に走る他の実行と重ならないように）。 */
function freePort(): Promise<number> {
  return new Promise((ok, ng) => {
    const srv = createServer();
    srv.unref();
    srv.on("error", ng);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      srv.close(() => ok(port));
    });
  });
}

async function waitFor(url: string, what: string, tries = 90): Promise<void> {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await sleep(1000);
  }
  throw new Error(`${what} が起動しない（${url}）`);
}

/** 子プロセスを、その子（pnpm が起こした node）ごと止める。 */
function killTree(proc: ChildProcess | undefined): void {
  if (!proc?.pid) return;
  try {
    process.kill(-proc.pid, "SIGTERM");
  } catch {
    /* already gone */
  }
}

// ── 1. ひな形の DB ───────────────────────────────────────────────────────────

function ensureTemplate(): void {
  if (flag("--fresh") && containerRunning(DB_CONTAINER)) {
    log(`--fresh: ${DB_CONTAINER} を作り直す`);
    docker(["rm", "-f", DB_CONTAINER]);
  }
  if (containerRunning(DB_CONTAINER)) {
    log(`ひな形の DB ${DB_CONTAINER} は起動済み — 使い回す（シードを変えたら --fresh）`);
    return;
  }
  log(`ひな形の DB を作る: ${DB_CONTAINER} on :${DB_PORT}`);
  execFileSync("pnpm", ["exec", "tsx", "scripts/orchestrate.ts", "--seed-only"], {
    cwd: HERE,
    stdio: "inherit",
    env: { ...process.env, SHOT_DB_CONTAINER: DB_CONTAINER, SHOT_DB_PORT: String(DB_PORT) },
  });
}

function ensureGotenberg(): void {
  if (containerRunning(GOTENBERG_CONTAINER)) return;
  log(`PDF レンダラを起動: ${GOTENBERG_CONTAINER} on :${GOTENBERG_PORT}`);
  docker(["run", "-d", "--rm", "--name", GOTENBERG_CONTAINER, "-p", `${GOTENBERG_PORT}:3000`, GOTENBERG_IMAGE]);
}

// DB の複製は 1 つずつ（ひな形に他の接続があると CREATE DATABASE … TEMPLATE が落ちる）。
let cloneChain: Promise<void> = Promise.resolve();
function cloneDb(name: string, fixtures: string[]): Promise<void> {
  const run = cloneChain.then(() => {
    adminSql(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${TEMPLATE_DB}' AND pid <> pg_backend_pid()`);
    adminSql(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    adminSql(`CREATE DATABASE "${name}" TEMPLATE "${TEMPLATE_DB}"`);
    for (const f of fixtures) {
      docker(
        ["exec", "-i", DB_CONTAINER, "psql", "-U", "postgres", "-d", name, "-v", "ON_ERROR_STOP=1", "-q", "-f", "-"],
        readFileSync(join(HERE, f), "utf8"),
      );
    }
  });
  cloneChain = run.catch(() => undefined);
  return run;
}

function dropDb(name: string): void {
  try {
    adminSql(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  } catch {
    /* container already gone */
  }
}

// ── 3. 1 本を走らせる ────────────────────────────────────────────────────────

const running = new Set<{ procs: ChildProcess[]; db: string }>();

function nowJst(): string {
  const d = new Date(Date.now() + 9 * 3600_000);
  return `${d.toISOString().slice(0, 19)}+09:00`;
}

/** 子プロセスを走らせ、出力をログへ書く。終了コードを返す。 */
function runLogged(cmd: string, cmdArgs: string[], env: NodeJS.ProcessEnv, logPath: string, tag: string): Promise<{ code: number; proc: ChildProcess }> {
  return new Promise((ok) => {
    const out = createWriteStream(logPath);
    const proc = spawn(cmd, cmdArgs, { cwd: HERE, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
    const pipe = (chunk: Buffer) => {
      out.write(chunk);
      if (VERBOSE) process.stdout.write(chunk.toString().replace(/^/gm, `[${tag}] `));
    };
    proc.stdout?.on("data", pipe);
    proc.stderr?.on("data", pipe);
    proc.on("close", (code) => {
      out.end();
      ok({ code: code ?? 1, proc });
    });
  });
}

/** e2e-*.ts の標準出力（`PASS  名前  → 実測` / `FAIL  名前 — 実測`）を拾う。 */
function parseChecks(output: string): CheckResult[] {
  const checks: CheckResult[] = [];
  for (const line of output.split("\n")) {
    const m = /^(PASS|FAIL)\s+(.*)$/.exec(line.replace(/\x1b\[[0-9;]*m/g, "").trim());
    if (!m) continue;
    const [name, actual] = (m[2] ?? "").split(/\s+(?:→|—)\s+/, 2);
    checks.push({ name: name ?? "", ok: m[1] === "PASS", actual });
  }
  return checks;
}

interface Stack {
  appUrl: string;
  kioskUrl?: string;
  databaseUrl: string;
}

/**
 * `storage: true` のシナリオ用の、メモリだけの SeaweedFS Filer もどき。
 * アプリ（lib/storage.ts）が使うのは Filer の HTTP API の PUT / GET / HEAD /
 * DELETE だけなので、それだけを持つ。1 本ごとに別のポートで立て、終わったら閉じる
 * — 本物の SeaweedFS を足すより軽く、シナリオ同士が中身を共有しない。
 */
const filers = new Map<string, Server>();

async function startFiler(dbName: string): Promise<string> {
  const objects = new Map<string, { type: string; body: Buffer }>();
  const server = createHttpServer((req, res) => {
    const key = decodeURIComponent((req.url ?? "/").split("?")[0]);
    if (req.method === "PUT" || req.method === "POST") {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        objects.set(key, {
          type: String(req.headers["content-type"] ?? "application/octet-stream"),
          body: Buffer.concat(chunks),
        });
        res.writeHead(201).end();
      });
      return;
    }
    const obj = objects.get(key);
    if (req.method === "DELETE") {
      objects.delete(key);
      res.writeHead(obj ? 204 : 404).end();
      return;
    }
    if (!obj) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "content-type": obj.type, "content-length": obj.body.length });
    res.end(req.method === "HEAD" ? undefined : obj.body);
  });
  const port = await freePort();
  await new Promise<void>((ok) => server.listen(port, "127.0.0.1", ok));
  filers.set(dbName, server);
  return `http://127.0.0.1:${port}`;
}

function stopFiler(dbName: string): void {
  filers.get(dbName)?.close();
  filers.delete(dbName);
}

/** 1 本ぶんの DB（複製 + fixtures）とアプリを立てる。止めるのは呼び出し側（procs / dbName）。 */
async function startStack(
  sc: Pick<AnyScenario, "id" | "fixtures" | "kiosk" | "pdf" | "storage">,
  dbName: string,
  outDir: string,
  procs: ChildProcess[],
): Promise<Stack> {
  const databaseUrl = `postgresql://postgres:shots@127.0.0.1:${DB_PORT}/${dbName}`;
  await cloneDb(dbName, sc.fixtures ?? []);

  const filerUrl = sc.storage ? await startFiler(dbName) : undefined;
  const appPort = await freePort();
  const appUrl = `http://localhost:${appPort}`;
  const appLog = createWriteStream(join(outDir, "app.log"));
  const app = spawn("pnpm", ["exec", "next", "start", "-p", String(appPort)], {
    cwd: NEXTJS_WEB,
    detached: true,
    env: {
      ...process.env,
      TZ: "Asia/Tokyo",
      DATABASE_URL: databaseUrl,
      AUTH_SECRET,
      AUTH_URL: appUrl,
      NODE_ENV: "production",
      KIOSK_WS_SECRET: "docs-screenshots-fixed-ws-secret",
      ...(sc.pdf ? { GOTENBERG_URL: `http://127.0.0.1:${GOTENBERG_PORT}` } : {}),
      ...(filerUrl ? { SEAWEED_FILER_URL: filerUrl } : {}),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  app.stdout?.pipe(appLog);
  app.stderr?.pipe(appLog);
  procs.push(app);

  let kioskUrl: string | undefined;
  if (sc.kiosk) {
    const kioskPort = await freePort();
    kioskUrl = `http://localhost:${kioskPort}`;
    const kioskLog = createWriteStream(join(outDir, "kiosk.log"));
    const kiosk = spawn("pnpm", ["run", "start"], {
      cwd: NEXTJS_KIOSK,
      detached: true,
      env: {
        ...process.env,
        TZ: "Asia/Tokyo",
        DATABASE_URL: databaseUrl,
        NODE_ENV: "production",
        PORT: String(kioskPort),
        KIOSK_WS_SECRET: "docs-screenshots-fixed-ws-secret",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    kiosk.stdout?.pipe(kioskLog);
    kiosk.stderr?.pipe(kioskLog);
    procs.push(kiosk);
  }
  await waitFor(`${appUrl}/login`, `${sc.id} のアプリ`);
  if (kioskUrl) await waitFor(`${kioskUrl}/api/healthz`, `${sc.id} の共有端末アプリ`, 60);
  return { appUrl, kioskUrl, databaseUrl };
}

/** --serve: 走らせずに、1 本ぶんの DB とアプリだけ立てて待つ。 */
async function serve(sc: Pick<AnyScenario, "id" | "fixtures" | "kiosk" | "pdf" | "storage">): Promise<void> {
  const outDir = join(OUT_DIR, `serve-${sc.id}`);
  mkdirSync(outDir, { recursive: true });
  const dbName = `scn_serve_${sc.id.replace(/[^a-z0-9]/gi, "_").toLowerCase()}_${process.pid}`;
  const procs: ChildProcess[] = [];
  running.add({ procs, db: dbName });
  const stack = await startStack(sc, dbName, outDir, procs);
  log(`serve ${sc.id}`);
  console.log(`  APP_URL=${stack.appUrl}`);
  if (stack.kioskUrl) console.log(`  KIOSK_URL=${stack.kioskUrl}`);
  console.log(`  DB: docker exec -i ${DB_CONTAINER} psql -U postgres -d ${dbName}`);
  console.log(`  ログイン: 開発用アカウント demo1 / demo2026（管理者）・demo2 / demo2026（担当者）・demo_shot / shot2026（承認者）`);
  console.log("  Ctrl-C（SIGINT / SIGTERM）で片付ける");
  await new Promise(() => undefined);
}

async function runOne(sc: AnyScenario): Promise<ScenarioResult> {
  const outDir = join(OUT_DIR, sc.id);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const dbName = `scn_${sc.id.replace(/[^a-z0-9]/gi, "_").toLowerCase()}_${process.pid}`;
  const procs: ChildProcess[] = [];
  const handle = { procs, db: dbName };
  running.add(handle);
  const t0 = Date.now();
  const startedAt = nowJst();
  let result: ScenarioResult | undefined;
  let keep = false;
  let appUrl = "";
  try {
    const stack = await startStack(sc, dbName, outDir, procs);
    appUrl = stack.appUrl;
    const { kioskUrl, databaseUrl } = stack;

    const common: NodeJS.ProcessEnv = {
      APP_URL: appUrl,
      ...(kioskUrl ? { KIOSK_URL: kioskUrl } : {}),
      // 既存の e2e-*.ts は 2 通りの名前で読む。
      DB_CONTAINER,
      SHOT_DB_CONTAINER: DB_CONTAINER,
      DB_NAME: dbName,
      DATABASE_URL: databaseUrl,
    };
    const logPath = join(outDir, "run.log");

    if (sc.kind === "script") {
      const { code } = await runLogged("pnpm", ["exec", "tsx", sc.script], { ...common, SHOT_DIR: outDir }, logPath, sc.id);
      const output = readFileSync(logPath, "utf8");
      const checks = parseChecks(output);
      const shots = readdirSync(outDir)
        .filter((f) => /\.(png|jpe?g)$/i.test(f))
        .sort()
        .map((f) => ({ file: f, label: f.replace(/\.[^.]+$/, "") }));
      const failed = code !== 0 || checks.some((c) => !c.ok);
      result = {
        id: sc.id,
        title: sc.title,
        feature: sc.feature,
        kind: "script",
        status: failed ? "fail" : "pass",
        startedAt,
        durationMs: Date.now() - t0,
        steps: [
          {
            no: 1,
            caption: `${sc.script} を実行`,
            status: failed ? "fail" : "pass",
            error: code !== 0 && checks.every((c) => c.ok) ? `終了コード ${code}（ログの末尾を参照）` : undefined,
            durationMs: Date.now() - t0,
            checks,
            shots,
          },
        ],
        problems: [],
        log: output.slice(-6000),
      };
      writeFileSync(join(outDir, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
    } else {
      const { code } = await runLogged(
        "pnpm",
        ["exec", "playwright", "test", "-c", "playwright.scenarios.config.ts"],
        {
          ...common,
          SCN_ID: sc.id,
          SCN_OUT_DIR: outDir,
          SCN_DB_CONTAINER: DB_CONTAINER,
          SCN_DB_NAME: dbName,
          SCN_RESULTS_DIR: join(outDir, "playwright"),
          SHOT_AUTH_DIR: join(outDir, ".auth"),
        },
        logPath,
        sc.id,
      );
      const resultPath = join(outDir, "result.json");
      if (existsSync(resultPath)) {
        result = JSON.parse(readFileSync(resultPath, "utf8")) as ScenarioResult;
        if (code !== 0 && result.status === "pass") result.status = "fail";
        if (result.status === "fail") result.log = readFileSync(logPath, "utf8").slice(-6000);
        writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
      }
    }
    // ログインの storageState（cookie）は残さない。
    rmSync(join(outDir, ".auth"), { recursive: true, force: true });
  } catch (e) {
    result = undefined;
    writeFileSync(join(outDir, "run.log"), `\n[scenarios.ts] ${e instanceof Error ? (e.stack ?? e.message) : String(e)}\n`, { flag: "a" });
  }

  if (!result) {
    // 結果を書く前に止まった（アプリが起動しない・ログインできない など）。
    const tail = existsSync(join(outDir, "run.log")) ? readFileSync(join(outDir, "run.log"), "utf8").slice(-6000) : "";
    result = {
      id: sc.id,
      title: sc.title,
      feature: sc.feature,
      kind: sc.kind === "script" ? "script" : "walk",
      status: "fail",
      startedAt,
      durationMs: Date.now() - t0,
      steps: [],
      problems: ["結果を書く前に止まった（run.log / app.log を参照）"],
      log: tail,
    };
    writeFileSync(join(outDir, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
  }

  keep = KEEP_FAILED && result.status === "fail";
  if (keep) {
    log(`${sc.id}: 残した — ${appUrl} / docker exec -it ${DB_CONTAINER} psql -U postgres -d ${dbName}`);
  } else {
    for (const p of procs) killTree(p);
    stopFiler(dbName);
    await sleep(300);
    dropDb(dbName);
  }
  running.delete(handle);
  return result;
}

function cleanupAll(): void {
  for (const h of running) {
    for (const p of h.procs) killTree(p);
    stopFiler(h.db);
    dropDb(h.db);
  }
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (flag("--list")) {
    for (const s of scenarios) console.log(`${s.id.padEnd(34)} ${s.feature} — ${s.title}`);
    return;
  }
  const unknown = ONLY.filter((id) => !scenarios.some((s) => s.id === id));
  if (unknown.length > 0) throw new Error(`登録されていない id: ${unknown.join(", ")}（--list で確認）`);
  const selected = ONLY.length > 0 ? scenarios.filter((s) => ONLY.includes(s.id)) : scenarios;
  const dup = selected.map((s) => s.id).filter((id, i, a) => a.indexOf(id) !== i);
  if (dup.length > 0) throw new Error(`id が重複している: ${dup.join(", ")}`);

  mkdirSync(OUT_DIR, { recursive: true });
  ensureTemplate();
  if (selected.some((s) => s.pdf) || flag("--serve")) ensureGotenberg();

  if (flag("--serve")) {
    const sc = ONLY.length > 0 ? selected[0] : undefined;
    await serve(sc ? { ...sc, pdf: true } : { id: "scratch", kiosk: flag("--kiosk"), pdf: true });
    return;
  }

  if (!flag("--no-build")) {
    const databaseUrl = `postgresql://postgres:shots@127.0.0.1:${DB_PORT}/${TEMPLATE_DB}`;
    // マニュアルの生成物（.source）を先に作る。まっさらなチェックアウトでは、
    // これが無いまま next build が manual-source.ts の import を解決しに行って
    // 落ちることがある（2 回目のビルドでは通る — 1 回目が途中で作るため）。
    log("fumadocs-mdx（マニュアルの生成物）");
    execFileSync("pnpm", ["exec", "fumadocs-mdx"], { cwd: NEXTJS_WEB, stdio: "inherit" });
    log("next build（nextjs-web）");
    execFileSync("pnpm", ["build"], { cwd: NEXTJS_WEB, stdio: "inherit", env: { ...process.env, DATABASE_URL: databaseUrl, NEXT_PUBLIC_APP_VERSION: APP_VERSION } });
    if (selected.some((s) => s.kiosk)) {
      log("next build（nextjs-kiosk）");
      execFileSync("pnpm", ["build"], { cwd: NEXTJS_KIOSK, stdio: "inherit", env: { ...process.env, DATABASE_URL: databaseUrl, NEXT_PUBLIC_APP_VERSION: APP_VERSION } });
    }
  }

  log(`${selected.length} 本を ${Math.min(JOBS, selected.length)} 並列で走らせる → ${OUT_DIR}`);
  const queue = [...selected];
  const results: ScenarioResult[] = [];
  const worker = async (): Promise<void> => {
    for (let sc = queue.shift(); sc; sc = queue.shift()) {
      const r = await runOne(sc);
      results.push(r);
      const checks = r.steps.flatMap((s) => s.checks);
      const mark = r.status === "pass" ? "\x1b[32mPASS\x1b[0m" : "\x1b[31mFAIL\x1b[0m";
      log(`${mark} ${r.id}（${Math.round(r.durationMs / 1000)}s・手順 ${r.steps.filter((s) => s.status === "pass").length}/${r.steps.length}・チェック ${checks.filter((c) => c.ok).length}/${checks.length}）`);
      if (r.status === "fail") {
        for (const s of r.steps.filter((x) => x.status === "fail")) {
          const why = s.error?.split("\n")[0] ?? s.checks.filter((c) => !c.ok).map((c) => `${c.name} → ${c.actual ?? ""}`).join(" / ");
          console.log(`       手順 ${s.no}「${s.caption}」: ${why}`);
        }
        for (const p of r.problems) console.log(`       ${p}`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(JOBS, selected.length) }, worker));

  const { total, failed } = buildReport(OUT_DIR, { inline: flag("--inline"), order: scenarios.map((s) => s.id) });
  log(`レポート: ${join(OUT_DIR, "index.html")}（${total} 本・失敗 ${failed} 本）`);

  if (flag("--down")) {
    for (const c of [DB_CONTAINER, GOTENBERG_CONTAINER]) {
      try {
        docker(["rm", "-f", c]);
      } catch {
        /* not running */
      }
    }
  }
  if (results.some((r) => r.status === "fail")) process.exitCode = 1;
}

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    cleanupAll();
    process.exit(130);
  });
}

main().catch((e) => {
  cleanupAll();
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
