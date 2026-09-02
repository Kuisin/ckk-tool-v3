/**
 * floor-map-client.ts — 図面画像アップロードのクライアント側呼び出し。
 *
 * Server Action ではなく Route Handler（/api/floor-maps/[mapId]/image）へ
 * 送る。Server Action のボディ上限は既定 1MB で、図面（〜10MB）は自分の
 * コードに届く前に 413 になるため（app CLAUDE.md「Conventions that bite」）。
 *
 * 戻り値は Server Action と同じ `ActionResult` なので、呼び出し側の
 * `run(() => …)` はそのまま使える。
 */

import type { ActionResult } from "./server-action";

/** next-intl の `t()` と互換の最小の形（クライアント側の `useTranslations()` を渡す）。 */
type TrLike = (key: string) => string;

export async function uploadFloorMapImage(
  mapId: string,
  file: File,
  tr: TrLike,
): Promise<ActionResult> {
  let res: Response;
  try {
    const body = new FormData();
    body.append("file", file);
    res = await fetch(`/api/floor-maps/${mapId}/image`, {
      method: "POST",
      body,
    });
  } catch {
    return { ok: false, error: tr("common.communicationFailed") };
  }
  const json = (await res.json().catch(() => null)) as ActionResult | null;
  if (json && typeof json === "object" && "ok" in json) return json;
  return { ok: false, error: tr("common.mapImageUpdateFailed") };
}
