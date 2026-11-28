/**
 * toast-hygiene-core.ts — 画面右上の通知（トースト）の片付けの規則（純ロジック）。
 *
 * **成功の通知が出たら、それより前に出ていたエラーの通知は消す。**
 *
 * エラーのトーストは「いまの入力ではできなかった」を伝えるもので、直して成功した
 * 時点で役目が終わっている。残しておくと、保存できて詳細画面へ移ったあとも
 * 「保存できませんでした」が成功の通知と並んで出続け、どちらが今の結果なのかが
 * 読めない（MS0I 自法人: 入力の不備 2 回 → 保存成功 で、赤 2 枚 + 緑 1 枚が並んだ）。
 *
 * 画面ごとに `notifications.clean()` を書くと書き忘れる（通知を出している画面は
 * 190 近くある）ので、全画面の通知の置き場（providers.tsx）で 1 回だけ当てる。
 * 色は設計の取り決め（_specs/design.md §16.1: 成功 = green / エラー = red）。
 *
 * エラー以外（黄色の注意・青の案内）は消さない — 成功とは別の話をしているので。
 */

export interface ToastLike {
  id?: string;
  color?: string | null;
}

const SUCCESS = "green";
const ERROR = "red";

/**
 * 前回と今回の通知の並び（表示中 + 待ち行列）から、消すべきエラーの id を返す。
 * 今回**新しく**出た通知の中に成功があるときだけ、それ以前からあったエラーを返す。
 */
export function supersededErrorIds(
  prev: readonly ToastLike[],
  next: readonly ToastLike[],
): string[] {
  const before = new Set(prev.map((n) => n.id).filter(Boolean));
  const added = next.filter((n) => n.id != null && !before.has(n.id));
  if (!added.some((n) => n.color === SUCCESS)) return [];
  return next
    .filter((n) => n.id != null && before.has(n.id) && n.color === ERROR)
    .map((n) => n.id as string);
}
