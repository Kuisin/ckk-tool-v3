/**
 * storage.ts — Generated-document storage on SeaweedFS (server-only).
 *
 * Per techstack: generated PDFs are stored in SeaweedFS and served for
 * view/download. We use SeaweedFS's native Filer HTTP API (PUT/GET/HEAD) over
 * `fetch` — no S3 SDK, so the lockfile stays frozen. Objects live under a flat
 * prefix, e.g. `pdfs/QOT-202602-00012.pdf`.
 *
 * `SEAWEED_FILER_URL` points at the filer (default the in-stack service). When
 * storage is unreachable the callers fall back to on-the-fly generation, so a
 * missing filer degrades gracefully rather than breaking the PDF action.
 */

const FILER_URL = (
  process.env.SEAWEED_FILER_URL ?? "http://localhost:8888"
).replace(/\/$/, "");

/** Full filer URL for an object key (key may contain `/`). */
function objectUrl(key: string): string {
  const safe = key.replace(/^\/+/, "");
  return `${FILER_URL}/${safe}`;
}

/** Store bytes at `key` (overwrites). Returns false if storage is unreachable. */
export async function putObject(
  key: string,
  body: ArrayBuffer | Uint8Array,
  contentType: string,
): Promise<boolean> {
  try {
    const res = await fetch(objectUrl(key), {
      method: "PUT",
      headers: { "content-type": contentType },
      body: body as BodyInit,
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Fetch a stored object, or null if absent / storage unreachable. */
export async function getObject(key: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(objectUrl(key));
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}
