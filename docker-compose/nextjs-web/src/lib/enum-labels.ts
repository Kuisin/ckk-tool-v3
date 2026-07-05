/**
 * enum-labels.ts — DB enum → Japanese UI label maps (_specs/design.md §17.1).
 *
 * Server- and client-safe (pure data). Keep in sync with shared-db enums.
 */

/** master.MATERIAL_FORM */
export const MATERIAL_FORM_LABEL: Record<string, string> = {
  POLISHED: "研磨",
  STANDARD_LENGTH: "定尺",
  SEMI_FINISHED: "半製品",
  OTHER: "その他",
};

export const MATERIAL_FORM_OPTIONS = Object.entries(MATERIAL_FORM_LABEL).map(
  ([value, label]) => ({ value, label }),
);
