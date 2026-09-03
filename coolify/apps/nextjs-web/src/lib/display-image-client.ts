/**
 * display-image-client.ts — 掲示画像アップロードのクライアント側呼び出し。
 *
 * Server Action ではなく Route Handler（/api/displays/[id]/image）へ送る。
 * Server Action のボディ上限は既定 1MB で、画像は自分のコードに届く前に
 * 413 になるため（app CLAUDE.md「Conventions that bite」）。
 *
 * 戻り値は Server Action と同じ `ActionResult` なので、呼び出し側の
 * `run(() => …)` はそのまま使える。
 */

import type { Tr } from "./i18n";
import type { ActionResult } from "./server-action";

export async function uploadDisplayImage(
  displayId: string,
  file: File,
  tr: Tr,
): Promise<ActionResult> {
  let res: Response;
  try {
    const body = new FormData();
    body.append("file", file);
    res = await fetch(`/api/displays/${displayId}/image`, {
      method: "POST",
      body,
    });
  } catch {
    return { ok: false, error: tr("common.communicationFailed") };
  }
  const json = (await res.json().catch(() => null)) as ActionResult | null;
  if (json && typeof json === "object" && "ok" in json) return json;
  return { ok: false, error: tr("common.imageSaveFailed") };
}
