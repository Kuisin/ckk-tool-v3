/**
 * scenarios.spec.ts — 機能ごとの通し確認を 1 本だけ走らせる（env SCN_ID）。
 *
 * scripts/scenarios.ts が、1 本ごとに DB の複製とアプリを立ててからここを呼ぶ。
 * 手順ごとに画面を撮り、確かめた結果と一緒に <SCN_OUT_DIR>/result.json へ書く
 * （レポートはそれを束ねたもの）。
 *
 * 落とす条件: 手順が例外で止まった / `s.check` が 1 つでも FAIL / 未捕捉例外
 * （pageerror）/ console.error（試験環境に無い外部サービス由来は console-ignore.ts）。
 * **手順が止まっても result.json は必ず書く** — 止まった手順の画面と、そこまでの
 * 記録がそのまま調査の入口になる。
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { isIgnoredConsole } from "./console-ignore";
import { scenarios } from "./scenarios";
import { Scn } from "./scenarios/scn";
import type { Scenario, ScenarioResult, StepResult } from "./scenarios/types";
import { AUTH_STATE } from "./walkthroughs/walk";

const ID = process.env.SCN_ID;
const OUT_DIR = process.env.SCN_OUT_DIR ?? `.verify-out/scenarios/${ID}`;

const scenario = scenarios.find((s): s is Scenario => s.id === ID && s.kind !== "script");

/** JST のオフセット付き ISO 8601。 */
function nowJst(): string {
  const d = new Date(Date.now() + 9 * 3600_000);
  return `${d.toISOString().slice(0, 19)}+09:00`;
}

if (!scenario) {
  test("scenario", () => {
    throw new Error(`SCN_ID=${ID} のシナリオが無い（scenarios/index.ts）`);
  });
} else {
  test.use({ storageState: AUTH_STATE[scenario.user ?? "staff"] });

  test(`${scenario.id} — ${scenario.title}`, async ({ page }) => {
    const problems: string[] = [];
    page.on("pageerror", (e) => problems.push(`pageerror: ${e.message.slice(0, 300)} @ ${page.url()}`));
    page.on("console", (m) => {
      if (m.type() !== "error") return;
      const where = m.location()?.url ?? "";
      if (isIgnoredConsole(m.text(), where)) return;
      problems.push(`console.error: ${m.text().slice(0, 300)} @ ${where || page.url()}`);
    });

    const s = new Scn(page, {
      outDir: OUT_DIR,
      dbContainer: process.env.SCN_DB_CONTAINER ?? "ckk-scn-db",
      dbName: process.env.SCN_DB_NAME ?? "ckk",
      kioskUrl: process.env.KIOSK_URL,
    });

    const startedAt = nowJst();
    const t0 = Date.now();
    const steps: StepResult[] = [];
    let stopped = false;

    for (const [i, step] of scenario.steps.entries()) {
      const record: StepResult = {
        no: i + 1,
        caption: step.caption,
        status: "skipped",
        durationMs: 0,
        checks: [],
        shots: [],
      };
      steps.push(record);
      if (stopped) continue;

      s.checks = record.checks;
      s.shots = record.shots;
      s.beginStep(step.caption);
      const st = Date.now();
      try {
        await test.step(`${i + 1}. ${step.caption}`, () => step.run(s));
        await s.shot("手順の終わり");
        record.status = record.checks.every((c) => c.ok) ? "pass" : "fail";
      } catch (e) {
        stopped = true;
        record.status = "fail";
        record.error = (e instanceof Error ? e.message : String(e)).slice(0, 1500);
        await s.shot("止まったときの画面");
        // どこで止まったか。ブラウザを開けない場面でも、画面の構造が調査の入口になる。
        const where = (await page.getByRole("dialog").count()) ? page.getByRole("dialog").last() : page.locator("main");
        const snapshot = await where.ariaSnapshot({ timeout: 5_000 }).catch(() => "(取得できず)");
        writeFileSync(join(OUT_DIR, `step-${i + 1}-aria.txt`), `URL: ${page.url()}\n\n${snapshot}\n`);
        if (process.env.SCN_DEBUG) console.log(`URL: ${page.url()}\n\n${snapshot}`);
      }
      record.url = page.url();
      record.durationMs = Date.now() - st;
    }
    await s.dispose();

    const failed = steps.some((r) => r.status === "fail") || problems.length > 0;
    const result: ScenarioResult = {
      id: scenario.id,
      title: scenario.title,
      feature: scenario.feature,
      kind: "walk",
      status: failed ? "fail" : "pass",
      startedAt,
      durationMs: Date.now() - t0,
      steps,
      problems,
    };
    writeFileSync(join(OUT_DIR, "result.json"), `${JSON.stringify(result, null, 2)}\n`);

    const summary = steps
      .filter((r) => r.status === "fail")
      .map((r) => `手順 ${r.no}「${r.caption}」: ${r.error ?? r.checks.filter((c) => !c.ok).map((c) => `${c.name} → ${c.actual ?? ""}`).join(" / ")}`);
    expect([...summary, ...problems], `「${scenario.title}」で問題が見つかった`).toEqual([]);
  });
}
