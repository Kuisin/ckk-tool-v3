/**
 * display-template-labels.ts — display-templates.ts（twin file）が持つ
 * 鍵（`displayTemplates.*`）を実際の文言へ解決する。**web 専用・twin ではない。**
 *
 * twin file の `label` / `description` / `help` / `placeholder` / `suffix` /
 * `choices[].label` は `messages/<locale>.json` の鍵を文字列として持つだけで、
 * 中身は次の関数を通すまで見えない。kiosk はこれらのフィールドを読まない
 * （`key` / `kind` / 数値の範囲・既定値だけで動く）ので、鍵の解決は web だけで
 * 完結する。
 */

import {
  DISPLAY_TEMPLATES,
  type DisplayOptionSpec,
  type DisplayTemplate,
} from "./display-templates";
import type { Locale } from "./i18n";
import { label } from "./messages";

function resolveOptionSpec(
  spec: DisplayOptionSpec,
  locale: Locale,
): DisplayOptionSpec {
  const resolvedLabel = label(spec.label, locale, spec.label);
  const help = spec.help ? label(spec.help, locale, spec.help) : undefined;
  switch (spec.kind) {
    case "plant":
      return { ...spec, label: resolvedLabel, help };
    case "number":
      return {
        ...spec,
        label: resolvedLabel,
        help,
        suffix: spec.suffix
          ? label(spec.suffix, locale, spec.suffix)
          : undefined,
      };
    case "select":
      return {
        ...spec,
        label: resolvedLabel,
        help,
        choices: spec.choices.map((c) => ({
          value: c.value,
          label: label(c.label, locale, c.label),
        })),
      };
    case "boolean":
      return { ...spec, label: resolvedLabel, help };
    case "text":
      return {
        ...spec,
        label: resolvedLabel,
        help,
        placeholder: spec.placeholder
          ? label(spec.placeholder, locale, spec.placeholder)
          : undefined,
      };
  }
}

/** テンプレート登録簿を、いまの言語の文言で解決したもの。UI 表示専用。 */
export function localizedDisplayTemplates(locale: Locale): DisplayTemplate[] {
  return DISPLAY_TEMPLATES.map((t) => ({
    ...t,
    label: label(t.label, locale, t.label),
    description: label(t.description, locale, t.description),
    options: t.options.map((o) => resolveOptionSpec(o, locale)),
  }));
}

/** `findDisplayTemplate` の文言解決版。UI 表示専用（検証・既定値は生の版を使う）。 */
export function findLocalizedDisplayTemplate(
  key: string | undefined | null,
  locale: Locale,
): DisplayTemplate | undefined {
  if (!key) return undefined;
  return localizedDisplayTemplates(locale).find((t) => t.key === key);
}
