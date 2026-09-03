/**
 * workflow-core-labels.test.ts — workflow-core.ts が使う `workflowCore.*` の
 * 翻訳鍵が 3 言語すべてで解決されること。
 *
 * ここが守るもの: workflowCoreT()（本体は next-intl の tr を包むだけ）を
 * 直接呼ぶには useTranslations() のモックが要るため、同じ messages/<locale>.json
 * を読む lib/messages.ts の label() で鍵の綴りを機械的に検査する。
 */

import { describe, expect, it } from "vitest";
import { LOCALES, type Locale } from "./i18n";
import { label } from "./messages";
import { QUANTITY_LABELS } from "./workflow-core";

const FALLBACK = "__unresolved__";

/** 一部の鍵は ICU プレースホルダを含む — ダミー値を渡さないと ICU が解決に失敗する。 */
const DUMMY_VARS = {
  stepId: 1,
  workOrderNumber: 1,
  label: "x",
  sum: 0,
  input: 0,
  static: 0,
  limit: 0,
};

const KEYS = [
  "stepNotFound",
  "stepNotStartable",
  "anotherUserSession",
  "execDepIncomplete",
  "execDepOrIncomplete",
  "branchSourceIncomplete",
  "precedingWorkOrderIncomplete",
  "quantityNegative",
  "quantityConservationInspection",
  "quantityConservationFlow",
  "routingExceedsLimit",
  "selfLoopNotAllowed",
  "linkEndpointOutsideWorkOrder",
  "branchesAreCyclic",
  "fullQuantity",
];

describe("workflowCore.* の翻訳鍵", () => {
  it.each(LOCALES)(
    "%s — 検証メッセージの鍵がすべて解決される",
    (locale: Locale) => {
      for (const key of KEYS) {
        expect(
          label(`workflowCore.${key}`, locale, FALLBACK, DUMMY_VARS),
        ).not.toBe(FALLBACK);
      }
    },
  );

  it.each(LOCALES)(
    "%s — QUANTITY_LABELS の鍵もすべて解決される",
    (locale: Locale) => {
      for (const mode of ["FLOW", "INSPECTION", "NONE"] as const) {
        for (const field of [
          "input",
          "success",
          "semi",
          "scrap",
          "rework",
        ] as const) {
          const key = QUANTITY_LABELS[mode][field];
          expect(label(`workflowCore.${key}`, locale, FALLBACK)).not.toBe(
            FALLBACK,
          );
        }
      }
    },
  );
});
