/**
 * GET /api/admin/files/raw?key=<key>[&download=1] — stream a stored object.
 *
 * Proxies the SeaweedFS filer (internal-only) so the admin UI can view/download
 * files. Content type is guessed from the key's extension; `download=1` forces
 * an attachment, otherwise the file is served inline (e.g. PDFs open in-browser).
 */

import { contentTypeForKey, getObject } from "@/lib/storage";

export const dynamic = "force-dynamic";

function safeKey(key: string): string | null {
  const k = key.replace(/^\/+/, "").trim();
  if (!k || k.includes("..") || k.includes("\0")) return null;
  return k;
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const raw = url.searchParams.get("key");
  const download = url.searchParams.get("download") === "1";
  const key = raw ? safeKey(raw) : null;
  if (!key) {
    return new Response('Missing or invalid "key"', { status: 400 });
  }

  const bytes = await getObject(key);
  if (!bytes) {
    return new Response(`Not found: ${key}`, { status: 404 });
  }

  const name = key.split("/").pop() ?? "file";
  const disp = download ? "attachment" : "inline";
  return new Response(bytes, {
    status: 200,
    headers: {
      "content-type": contentTypeForKey(key),
      "content-disposition": `${disp}; filename="${encodeURIComponent(name)}"`,
    },
  });
}
