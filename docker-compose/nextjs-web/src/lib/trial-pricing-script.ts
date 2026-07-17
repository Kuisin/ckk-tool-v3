/**
 * trial-pricing-script.ts — admin-authored custom calculation hook for 見積試算.
 *
 * A holder of the `system` permission can supply a small JavaScript snippet
 * (system setting `trial_pricing.custom_script`) that post-processes the
 * deterministic `calcTrialPricing` result — e.g. bespoke per-customer uplifts,
 * rounding rules, or extra warnings that the fixed engine does not encode.
 *
 * The snippet runs isomorphically (browser live-preview + server render) through
 * the `Function` constructor with the common dangerous globals shadowed to
 * `undefined`, a deep-frozen/cloned context, and validated + clamped output.
 *
 * SECURITY: this is a convenience sandbox, NOT a hard security boundary — a
 * determined author can still reach the runtime (e.g. via constructor chains).
 * That is acceptable here because only the `system` admin can set the script,
 * i.e. an actor already trusted to change system behaviour (they can also flip
 * feature flags and deploy). The settings UI states this explicitly.
 *
 * Contract (mirrored in the settings editor help):
 *   ctx = {
 *     input,     // TrialInput   (readonly clone)
 *     result,    // TrialResult  (readonly clone, the engine output)
 *     lots,      // result.lots  (readonly convenience alias)
 *     settings,  // { correctionFactor, ldChargePer10min } (readonly)
 *     round,     // (n, unit=10) => 切り上げ helper
 *   }
 *   return;                         // → no change
 *   return {
 *     unitPrices?: number[],        // per-lot 見積単価 override (aligned to lots)
 *     warnings?: string[],          // appended to result.warnings
 *   }
 *
 * `CURRENT_LOGIC_SCRIPT` reproduces the built-in 見積単価 formula so admins can
 * start from the real logic and customise it (see the settings editor button).
 */

import type { TrialInput, TrialResult } from "./trial-pricing";

/** Coefficients exposed to the script (mirror of TrialPricingOptions). */
export interface TrialScriptSettings {
  correctionFactor: number;
  ldChargePer10min: number;
}

export interface TrialScriptContext {
  input: TrialInput;
  result: TrialResult;
  settings?: TrialScriptSettings;
}

/**
 * Editable template that reproduces the current 見積単価 logic 1:1
 * (見積単価 = 最低単価 × 掛け率 × 補正値、10円単位切り上げ). Inserting it and
 * saving leaves prices unchanged; edit it to customise the real formula.
 */
export const CURRENT_LOGIC_SCRIPT = `// 現在の見積単価ロジック（この内容 = 既定動作）。編集して調整できます。
// 見積単価 = 最低単価(minimumPrice) × 掛け率(discountRate) × 補正値 を10円単位で切り上げ。
return {
  unitPrices: ctx.lots.map((lot) =>
    ctx.round(lot.minimumPrice * lot.discountRate * ctx.settings.correctionFactor, 10)
  ),
};
`;

export interface CustomScriptOutcome {
  result: TrialResult;
  /** Set when the script threw; the base result is returned unchanged + warned. */
  error?: string;
}

/** Global identifiers shadowed as `undefined` params inside the snippet. */
const SHADOWED_GLOBALS = [
  "globalThis",
  "window",
  "self",
  "global",
  "process",
  "require",
  "module",
  "exports",
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  // NB: `eval` / `arguments` are illegal as strict-mode param names, so they
  // cannot be shadowed here — `Function` is shadowed to block `new Function`.
  "Function",
  "setTimeout",
  "setInterval",
  "queueMicrotask",
  "Deno",
  "Bun",
  "document",
  "navigator",
  "localStorage",
] as const;

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** JSON clone — TrialInput/TrialResult are plain data; also strips functions. */
function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function deepFreeze<T>(obj: T): T {
  if (obj && typeof obj === "object") {
    for (const v of Object.values(obj)) deepFreeze(v);
    Object.freeze(obj);
  }
  return obj;
}

function appendWarning(result: TrialResult, msg: string): TrialResult {
  return { ...result, warnings: [...result.warnings, msg] };
}

/**
 * Compile and run the snippet, returning its raw return value. Throws on syntax
 * or runtime error (used by the settings "テスト実行" button to surface errors).
 */
export function runCustomScript(
  script: string,
  ctx: TrialScriptContext,
): unknown {
  const round = (n: number, unit = 10) => {
    const u = Number(unit) || 10;
    return Math.ceil(Number(n) / u) * u;
  };
  const api = deepFreeze({
    input: clone(ctx.input),
    result: clone(ctx.result),
    lots: clone(ctx.result.lots),
    settings: clone(
      ctx.settings ?? { correctionFactor: 1, ldChargePer10min: 0 },
    ),
    round,
  });
  // Shadowing the globals as params makes bare identifier lookups resolve to the
  // (undefined) params rather than the real host objects.
  const fn = new Function(
    ...SHADOWED_GLOBALS,
    "ctx",
    `"use strict";\n${script}`,
  );
  return fn(...SHADOWED_GLOBALS.map(() => undefined), api);
}

/**
 * Compile-check the snippet without running it. Returns an error message on a
 * syntax error, or null when it parses. Used to reject a broken script on save
 * so it never breaks the estimate for everyone.
 */
export function checkScriptSyntax(script: string): string | null {
  const trimmed = script?.trim();
  if (!trimmed) return null;
  try {
    // Constructing the Function parses the body; it is never invoked here.
    new Function(...SHADOWED_GLOBALS, "ctx", `"use strict";\n${trimmed}`);
    return null;
  } catch (e) {
    return errMsg(e);
  }
}

/** Merge a validated patch onto the engine result (numeric clamp, string-only). */
function mergePatch(result: TrialResult, patch: unknown): TrialResult {
  if (!patch || typeof patch !== "object") return result;
  const p = patch as Record<string, unknown>;
  let out = result;

  if (Array.isArray(p.unitPrices)) {
    const prices = p.unitPrices;
    out = {
      ...out,
      lots: out.lots.map((lot, i) => {
        const v = prices[i];
        return typeof v === "number" && Number.isFinite(v) && v >= 0
          ? { ...lot, estimateUnitPrice: v }
          : lot;
      }),
    };
  }

  if (Array.isArray(p.warnings)) {
    const ws = p.warnings.filter((w): w is string => typeof w === "string");
    if (ws.length) out = { ...out, warnings: [...out.warnings, ...ws] };
  }

  return out;
}

/**
 * Run the custom script against a computed result and return the (possibly
 * adjusted) result. Never throws — a failing script yields the base result plus
 * a warning so the estimate stays usable.
 */
export function applyCustomScript(
  script: string | null | undefined,
  ctx: TrialScriptContext,
): CustomScriptOutcome {
  const trimmed = script?.trim();
  if (!trimmed) return { result: ctx.result };
  try {
    const patch = runCustomScript(trimmed, ctx);
    return { result: mergePatch(ctx.result, patch) };
  } catch (e) {
    return {
      result: appendWarning(ctx.result, `カスタム計算エラー: ${errMsg(e)}`),
      error: errMsg(e),
    };
  }
}
