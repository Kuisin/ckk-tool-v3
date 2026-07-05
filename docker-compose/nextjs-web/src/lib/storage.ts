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

/** Delete an object. Returns false if storage is unreachable / not found. */
export async function deleteObject(key: string): Promise<boolean> {
  try {
    const res = await fetch(objectUrl(key), { method: "DELETE" });
    return res.ok;
  } catch {
    return false;
  }
}

/** Reports whether the filer is reachable (for the admin storage status). */
export async function storageReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${FILER_URL}/`, {
      headers: { accept: "application/json" },
    });
    return res.ok;
  } catch {
    return false;
  }
}

export interface StoredFile {
  /** Object key without a leading slash, e.g. `pdfs/quotes/QOT-…​.pdf`. */
  key: string;
  /** Basename of the key. */
  name: string;
  size: number;
  mime: string;
  /** ISO timestamp, or null if the filer didn't report one. */
  mtime: string | null;
}

// Go's os.ModeDir (1<<31) — set on directory entries in the filer JSON.
const DIR_MODE_BIT = 0x80000000;

function normalizeMtime(m: unknown): string | null {
  if (typeof m === "string") return m;
  if (typeof m === "number") return new Date(m * 1000).toISOString();
  return null;
}

type FilerEntry = {
  FullPath?: string;
  Mtime?: string | number;
  Mode?: number;
  Mime?: string;
  FileSize?: number;
  chunks?: { size?: number }[];
};

async function listDir(
  dir: string,
): Promise<{ files: StoredFile[]; dirs: string[] }> {
  const clean = dir.replace(/^\/+|\/+$/g, "");
  const url = `${FILER_URL}/${clean ? `${clean}/` : ""}?limit=1000`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) return { files: [], dirs: [] };
  const json = (await res.json()) as { Entries?: FilerEntry[] };
  const files: StoredFile[] = [];
  const dirs: string[] = [];
  for (const e of json.Entries ?? []) {
    const full = String(e.FullPath ?? "").replace(/^\/+/, "");
    if (!full) continue;
    if (typeof e.Mode === "number" && (e.Mode & DIR_MODE_BIT) !== 0) {
      dirs.push(full);
      continue;
    }
    const size =
      e.FileSize ?? e.chunks?.reduce((sum, c) => sum + (c.size ?? 0), 0) ?? 0;
    files.push({
      key: full,
      name: full.split("/").pop() ?? full,
      size: Number(size) || 0,
      mime: e.Mime ?? "",
      mtime: normalizeMtime(e.Mtime),
    });
  }
  return { files, dirs };
}

/**
 * Recursively list stored objects under `prefix` (default: entire filer),
 * newest first. Bounded so a runaway tree can't hang the admin request.
 * Returns [] when storage is unreachable.
 */
export async function listObjects(prefix = ""): Promise<StoredFile[]> {
  try {
    const out: StoredFile[] = [];
    const queue = [prefix];
    let guard = 0;
    while (queue.length > 0 && guard < 500 && out.length < 5000) {
      guard += 1;
      const dir = queue.shift() as string;
      const { files, dirs } = await listDir(dir);
      out.push(...files);
      queue.push(...dirs);
    }
    out.sort((a, b) => (b.mtime ?? "").localeCompare(a.mtime ?? ""));
    return out;
  } catch {
    return [];
  }
}

const CONTENT_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  txt: "text/plain; charset=utf-8",
  csv: "text/csv; charset=utf-8",
  json: "application/json",
};

/** Best-effort content type for a key, by extension. */
export function contentTypeForKey(key: string): string {
  const ext = key.split(".").pop()?.toLowerCase() ?? "";
  return CONTENT_TYPES[ext] ?? "application/octet-stream";
}
