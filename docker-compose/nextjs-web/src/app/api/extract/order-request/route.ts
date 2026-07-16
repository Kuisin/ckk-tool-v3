/**
 * POST /api/extract/order-request — proxy an uploaded order PDF/scan to the
 * self-hosted `po-extract` API and return the structured 受注請書 JSON.
 *
 * Keeps the extractor server-side (the browser never talks to it directly).
 * `PO_EXTRACT_URL` points at the extractor; in the deployed stack `nextjs-web`
 * is attached to the `ai-stack` network and reaches it at http://po-extract:8000.
 */

import { requirePermissionResponse } from "@/lib/authz";

// Vision extraction takes ~25-40s; keep this a runtime (uncached) handler.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const PO_EXTRACT_URL = (
  process.env.PO_EXTRACT_URL ?? "http://po-extract:8000"
).replace(/\/$/, "");

export async function POST(request: Request): Promise<Response> {
  // 受注請書取込の一部として実行される — order_acceptance:CREATE でゲート。
  const denied = await requirePermissionResponse("order_acceptance", "CREATE");
  if (denied) return denied;
  const inForm = await request.formData();
  const file = inForm.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "file is required" }, { status: 400 });
  }

  const out = new FormData();
  out.append("file", file, file.name || "upload.pdf");

  try {
    const res = await fetch(`${PO_EXTRACT_URL}/extract/order-request`, {
      method: "POST",
      body: out,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return Response.json(
        { error: `extractor returned ${res.status}`, detail },
        { status: 502 },
      );
    }
    return Response.json(await res.json());
  } catch (err) {
    console.error("[extract/order-request]", err);
    return Response.json({ error: "extractor unreachable" }, { status: 502 });
  }
}
