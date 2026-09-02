/**
 * route.test.ts — POST /api/intake/inbound。
 *
 * このリポジトリで唯一のルートハンドラのテスト。例外にする価値があるのは、
 * ここで守りたいのが**順序**だから: 503（未設定）→ 401（トークン）→ 413
 * （本文を読む前）→ 400（中身）。並びが崩れると、認証前に巨大なボディを
 * バッファしたり、トークンを持たない相手にファイル名の妥当性を教えたりする。
 * 併せて「監査行にトークンが載らない」ことも固定する。
 *
 * DB は触らせない（recordAudit を差し替える）。フォルダは実物の一時ディレクトリ。
 */
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createTranslator } from "next-intl";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import ja from "../../../../../messages/ja.json";

// DB を触らせない（recordAudit は自前で catch するが、prisma を読ませない）
const audited: unknown[] = [];
vi.mock("@/lib/audit", () => ({
  recordAudit: async (input: unknown) => {
    audited.push(input);
  },
}));

// getTranslations() は Next.js のリクエストスコープ（AsyncLocalStorage）が
// 無いと呼べない。route handler を直に呼ぶこのテストだけの事情なので、
// 実物の ja.json を使う createTranslator に差し替える（product-types.test.ts /
// field-help.test.ts と同じ手法）。
vi.mock("next-intl/server", () => ({
  getTranslations: async () =>
    createTranslator({
      locale: "ja",
      // biome-ignore lint/suspicious/noExplicitAny: next-intl's messages type is too wide for a plain JSON import here
      messages: ja as any,
    }),
}));

let dir = "";
let POST: (r: Request) => Promise<Response>;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "inbound-"));
  process.env.INTAKE_DIR = dir;
  process.env.INTAKE_INBOUND_TOKEN = "test-token-abc";
  ({ POST } = await import("@/app/api/intake/inbound/route"));
});
afterAll(() => {
  // undefined を代入すると文字列 "undefined" が入る。delete でないと消えない。
  delete process.env.INTAKE_DIR;
  delete process.env.INTAKE_INBOUND_TOKEN;
});

function req(opts: {
  token?: string;
  file?: { name: string; bytes: number };
  fields?: Record<string, string>;
  contentLength?: string;
}): Request {
  const form = new FormData();
  if (opts.file) {
    form.set(
      "file",
      new File([new Uint8Array(opts.file.bytes)], opts.file.name, {
        type: "application/pdf",
      }),
    );
  }
  for (const [k, v] of Object.entries(opts.fields ?? {})) form.set(k, v);
  const headers = new Headers();
  if (opts.token) headers.set("x-intake-token", opts.token);
  if (opts.contentLength) headers.set("content-length", opts.contentLength);
  return new Request("http://x/api/intake/inbound", {
    method: "POST",
    headers,
    body: form,
  });
}

describe("POST /api/intake/inbound", () => {
  it("INTAKE_INBOUND_TOKEN 未設定 → 503（開けっ放しにしない）", async () => {
    const saved = process.env.INTAKE_INBOUND_TOKEN;
    delete process.env.INTAKE_INBOUND_TOKEN;
    try {
      const r = await POST(
        req({ token: "anything", file: { name: "a.pdf", bytes: 10 } }),
      );
      expect(r.status).toBe(503);
      expect((await r.json()).error).toContain("INTAKE_INBOUND_TOKEN");
    } finally {
      process.env.INTAKE_INBOUND_TOKEN = saved;
    }
  });

  it("トークン無し → 401", async () => {
    const r = await POST(req({ file: { name: "a.pdf", bytes: 10 } }));
    expect(r.status).toBe(401);
    expect(await r.json()).toEqual({ ok: false, error: "invalid token" });
  });

  it("トークン不一致 → 401", async () => {
    const r = await POST(
      req({ token: "wrong", file: { name: "a.pdf", bytes: 10 } }),
    );
    expect(r.status).toBe(401);
  });

  it("content-length が上限超 → 413（本文を読む前）", async () => {
    const r = await POST(
      req({
        token: "test-token-abc",
        file: { name: "a.pdf", bytes: 10 },
        contentLength: String(30 * 1024 * 1024),
      }),
    );
    expect(r.status).toBe(413);
  });

  it("ファイル未指定 → 400", async () => {
    const r = await POST(req({ token: "test-token-abc" }));
    expect(r.status).toBe(400);
    expect((await r.json()).error).toBe("ファイルが指定されていません");
  });

  it("空ファイル → 400", async () => {
    const r = await POST(
      req({ token: "test-token-abc", file: { name: "a.pdf", bytes: 0 } }),
    );
    expect(r.status).toBe(400);
    expect((await r.json()).error).toBe("ファイルが空です");
  });

  it("拡張子が対象外 → 400", async () => {
    const r = await POST(
      req({ token: "test-token-abc", file: { name: "note.txt", bytes: 10 } }),
    );
    expect(r.status).toBe(400);
    expect((await r.json()).error).toContain("対応していないファイル形式");
  });

  it("正常 → 200 + 実際にフォルダへ置かれる + 監査 1 行", async () => {
    const r = await POST(
      req({
        token: "test-token-abc",
        file: { name: "注文書 5.pdf", bytes: 128 },
        fields: {
          channel: "fax",
          from: "fax@example.co.jp",
          subject: "ご注文",
        },
      }),
    );
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.ok).toBe(true);
    expect(body.name).toMatch(/注文書_5\.pdf$/);
    expect(body.number).toBeUndefined(); // 採番は返さない

    const files = await readdir(dir);
    expect(files).toContain(body.name);
    expect(files.some((f) => f.endsWith(".part"))).toBe(false);
    expect(body.name.startsWith("ORD-")).toBe(false);

    const last = audited.at(-1) as {
      tableName: string;
      recordId: string;
      after: Record<string, unknown>;
    };
    expect(last.tableName).toBe("intake_folder");
    expect(last.recordId).toBe(body.name);
    expect(last.after.channel).toBe("FAX"); // 小文字も正規化される
    expect(last.after.from).toBe("fax@example.co.jp");
    expect(JSON.stringify(last)).not.toContain("test-token-abc");
  });

  it("channel が想定外なら UPLOAD に丸める", async () => {
    await POST(
      req({
        token: "test-token-abc",
        file: { name: "b.pdf", bytes: 10 },
        fields: { channel: "TELEPATHY" },
      }),
    );
    expect(
      (audited.at(-1) as { after: { channel: string } }).after.channel,
    ).toBe("UPLOAD");
  });
});
