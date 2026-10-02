/**
 * 設計図のアップロード（multipart/form-data）の共通の読み取り。
 *
 * 役割ごとのフィールド:
 *   blueprint     … 2D 原図 0..1 枚（図脳 SXF / DXF / DWG …）
 *   model         … 3D 原図 0..1 枚（STEP / IGES / CIM3D …）
 *   preview       … プレビュー用 0..1 枚（STL 等）
 *   reference     … 参考資料 0..N 枚（同名で複数）
 *   referenceNote … 参考資料の説明（reference と**同じ順**で並べる）
 * どれも任意（仕様だけの版もある）。
 */

import { MAX_ATTACHMENT_BYTES } from "@/lib/attachments";
import type { UploadedFile, VersionUploads } from "@/lib/design-files";

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function one(form: FormData, name: string): File | null {
  const v = form.get(name);
  return v instanceof File && v.size > 0 ? v : null;
}

async function toBytes(f: File, note?: string | null): Promise<UploadedFile> {
  return { name: f.name, type: f.type, bytes: await f.arrayBuffer(), note };
}

/**
 * フォームからアップロードを取り出す。上限を超えたファイルがあれば
 * そのファイル名を返す（バッファリングの前に弾く）。
 */
export async function readUploads(
  form: FormData,
): Promise<
  { ok: true; uploads: VersionUploads } | { ok: false; tooLarge: string }
> {
  const blueprint = one(form, "blueprint");
  const model = one(form, "model");
  const preview = one(form, "preview");
  // 説明が足りない/多いぶんは無視する（順ズレしても落とさない）。
  const referenceNotes = form.getAll("referenceNote").map(String);
  const references = form
    .getAll("reference")
    .filter((f): f is File => f instanceof File && f.size > 0);

  for (const f of [blueprint, model, preview, ...references]) {
    if (f && f.size > MAX_ATTACHMENT_BYTES)
      return { ok: false, tooLarge: f.name };
  }
  return {
    ok: true,
    uploads: {
      blueprint: blueprint ? await toBytes(blueprint) : null,
      model: model ? await toBytes(model) : null,
      preview: preview ? await toBytes(preview) : null,
      references: await Promise.all(
        references.map((f, i) => toBytes(f, referenceNotes[i]?.trim() || null)),
      ),
    },
  };
}
