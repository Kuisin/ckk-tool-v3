import "server-only";

/**
 * price-scale-preset-store.ts — 数量スケールのプリセット（価格表の既定の数量段階）の
 * 読み書き。永続化は app.system_settings の 1 キー（スキーマ変更なし）。
 * 画面（SY02 の編集ページ）は価格試算計算の下に置くが、価格試算のエンジンは
 * 読まない — 単価の計算に混ぜず、価格表の初期値としてだけ使うため。
 */

import { readConfigNamespace, writeConfigValues } from "./app-config";
import {
  DEFAULT_SCALE_PRESET,
  parseScalePreset,
  type ScalePresetRow,
} from "./price-scale-preset";

export const SCALE_PRESET_KEY = "trial_pricing.scale_preset";

/** 保存値。未設定・壊れた値は既定（旧ロット割引率の表）へ倒す。 */
export async function getScalePreset(): Promise<ScalePresetRow[]> {
  const byKey = await readConfigNamespace("trial_pricing");
  const stored = parseScalePreset(byKey.get(SCALE_PRESET_KEY));
  return stored ?? DEFAULT_SCALE_PRESET.map((r) => ({ ...r }));
}

export async function saveScalePreset(rows: ScalePresetRow[]): Promise<void> {
  await writeConfigValues({ [SCALE_PRESET_KEY]: rows });
}
