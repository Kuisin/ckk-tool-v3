/**
 * workflow-core-labels.ts — workflow-core.ts（twin file）が持つ `t()` の鍵を
 * キオスク自身の辞書（getMessages + fillMessage）へつなぐ。
 *
 * canStartStep() の reasons だけを対象にする。validateQuantities /
 * validateRouting の message はキオスク側では
 * translateError()（components/steps/step-ui.ts）が codes[0] の汎用文言を
 * 優先して使うため実質参照されない — 鍵を増やすだけの意味のない対応は
 * しない（未使用のまま古びる辞書を持たない）。
 */

import { fillMessage, getMessages, type Locale } from "./i18n";
import type { WorkflowCoreT } from "./workflow-core";

export function workflowCoreT(locale: Locale): WorkflowCoreT {
  const table = getMessages(locale).workflowCore as Record<string, string>;
  return (key, fallback, vars) => {
    const template = table[key];
    if (!template) return fallback;
    return vars ? fillMessage(template, vars) : template;
  };
}
