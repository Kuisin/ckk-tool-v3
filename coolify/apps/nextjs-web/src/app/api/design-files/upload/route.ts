/**
 * POST /api/design-files/upload — 設計図の版を 1 つ**下書きで**作る（multipart/form-data）。
 *
 * 設計図 (PD16) の唯一の登録口。設計依頼から出た版も、依頼を経ない版
 * （図面だけ先に出来ている・既存図面を取り込む）も同じここを通る。
 * 確定（承認フローがあれば承認依頼）は版の詳細で行う — 作った瞬間に
 * 指示書から見えるようにはしない。
 *
 * フィールド:
 *   itemId          … 対象製品の品目 id（items.id, itemType: PRODUCT。必須）
 *   customerBpId    … 受注元（任意。空 = 汎用）
 *   designRequestId … 成果物とする設計依頼の uuid（任意。空 = 手動登録）
 *   spec            … 仕様の JSON（lib/design-spec.ts versionSpecSchema）
 *   blueprint / model / preview / reference / referenceNote … _uploads.ts
 *
 * **Server Action ではなく Route Handler なのは、Server Action のボディが
 * 1MB で頭打ちになるから**（app CLAUDE.md）。図面は普通に超える。
 */

import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { requirePermissionResponse } from "@/lib/authz";
import { createDesignVersion } from "@/lib/design-files";
import { validateVersionSpec, versionSpecSchema } from "@/lib/design-spec";
import { readUploads, UUID_RE } from "../_uploads";

export const dynamic = "force-dynamic";

function badRequest(error: string): NextResponse {
  return NextResponse.json({ ok: false, error }, { status: 400 });
}

export async function POST(request: Request): Promise<NextResponse> {
  const tr = await getTranslations();
  // 図面そのものの権限。設計依頼 (design_request) とは別コード — 依頼を
  // 出す人と図面を描く人は同じではない。
  const deny = await requirePermissionResponse("design_file", "CREATE");
  if (deny) return deny as NextResponse;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return badRequest(
      tr("production.designFilesUpload.sendAsMultipartFormData"),
    );
  }

  const itemId = Number(form.get("itemId"));
  if (!Number.isInteger(itemId) || itemId <= 0) {
    return badRequest(
      tr("production.designFilesUpload.targetProductNotSpecified"),
    );
  }

  const bpRaw = String(form.get("customerBpId") ?? "").trim();
  if (bpRaw && !UUID_RE.test(bpRaw)) {
    return badRequest(
      tr("production.designFilesUpload.invalidOrderingCustomer"),
    );
  }

  const requestRaw = String(form.get("designRequestId") ?? "").trim();
  if (requestRaw && !UUID_RE.test(requestRaw)) {
    return badRequest(tr("production.designFilesUpload.invalidDesignRequest"));
  }

  let specRaw: unknown;
  try {
    specRaw = JSON.parse(String(form.get("spec") ?? "{}"));
  } catch {
    return badRequest(tr("common.invalidInput"));
  }
  const parsedSpec = versionSpecSchema.safeParse(specRaw);
  if (!parsedSpec.success) return badRequest(tr("common.invalidInput"));
  const spec = await validateVersionSpec(parsedSpec.data);
  if (!spec.ok) return badRequest(spec.error);

  const read = await readUploads(form);
  if (!read.ok) {
    return badRequest(
      tr("production.designFilesUpload.isTooLargeMax20mb", {
        name: read.tooLarge,
      }),
    );
  }

  const result = await createDesignVersion({
    itemId,
    customerBpId: bpRaw || null,
    designRequestId: requestRaw || null,
    spec: spec.data,
    uploads: read.uploads,
  });
  if (!result.ok) return badRequest(result.error);
  return NextResponse.json({
    ok: true,
    versionId: result.data.versionId,
    version: result.data.version,
    itemId: result.data.itemId,
  });
}
