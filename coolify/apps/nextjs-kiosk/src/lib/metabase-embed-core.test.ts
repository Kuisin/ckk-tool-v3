import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildMetabaseEmbedUrl,
  DEFAULT_EMBED_TTL_SEC,
  signMetabaseToken,
} from "./metabase-embed-core";

const SECRET = "0123456789abcdef0123456789abcdef";
const NOW_MS = 1_790_000_000_000; // 固定時刻（テストを時計から切り離す）

function decodeSegment(segment: string): unknown {
  return JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
}

describe("signMetabaseToken", () => {
  const token = signMetabaseToken({
    siteUrl: "https://bi.example.jp",
    secret: SECRET,
    dashboardId: 14,
    params: { plant_id: "NAGOYA", line_id: 3 },
    nowMs: NOW_MS,
  });

  it("3 つの部分からなる JWT を返す", () => {
    expect(token.split(".")).toHaveLength(3);
  });

  it("ヘッダは HS256", () => {
    expect(decodeSegment(token.split(".")[0])).toEqual({
      alg: "HS256",
      typ: "JWT",
    });
  });

  it("ペイロードに resource / params / exp が入る", () => {
    expect(decodeSegment(token.split(".")[1])).toEqual({
      resource: { dashboard: 14 },
      params: { plant_id: "NAGOYA", line_id: 3 },
      exp: Math.floor(NOW_MS / 1000) + DEFAULT_EMBED_TTL_SEC,
    });
  });

  it("署名が HMAC-SHA256(header.payload) と一致する", () => {
    const [header, payload, signature] = token.split(".");
    const expected = createHmac("sha256", SECRET)
      .update(`${header}.${payload}`)
      .digest("base64url");
    expect(signature).toBe(expected);
  });

  it("同じ入力・同じ時刻なら決定的", () => {
    const again = signMetabaseToken({
      siteUrl: "https://bi.example.jp",
      secret: SECRET,
      dashboardId: 14,
      params: { plant_id: "NAGOYA", line_id: 3 },
      nowMs: NOW_MS,
    });
    expect(again).toBe(token);
  });

  it("鍵が違えば署名が変わる", () => {
    const other = signMetabaseToken({
      siteUrl: "https://bi.example.jp",
      secret: `${SECRET}x`,
      dashboardId: 14,
      params: { plant_id: "NAGOYA", line_id: 3 },
      nowMs: NOW_MS,
    });
    expect(other).not.toBe(token);
  });

  it("params 未指定なら空オブジェクト（undefined を署名に入れない）", () => {
    const bare = signMetabaseToken({
      siteUrl: "https://bi.example.jp",
      secret: SECRET,
      dashboardId: 1,
      nowMs: NOW_MS,
    });
    expect(decodeSegment(bare.split(".")[1])).toMatchObject({ params: {} });
  });

  it("expiresInSec で寿命を変えられる", () => {
    const short = signMetabaseToken({
      siteUrl: "https://bi.example.jp",
      secret: SECRET,
      dashboardId: 1,
      expiresInSec: 30,
      nowMs: NOW_MS,
    });
    expect(decodeSegment(short.split(".")[1])).toMatchObject({
      exp: Math.floor(NOW_MS / 1000) + 30,
    });
  });

  it("base64url なので +/= を含まない（URL に直接置ける）", () => {
    // 記号が出やすい入力で確かめる
    const t = signMetabaseToken({
      siteUrl: "https://bi.example.jp",
      secret: SECRET,
      dashboardId: 255,
      params: { q: "あいう?&=/+" },
      nowMs: NOW_MS,
    });
    expect(t).not.toMatch(/[+/=]/);
  });
});

describe("buildMetabaseEmbedUrl", () => {
  it("/embed/dashboard/<jwt> と表示オプションを付ける", () => {
    const url = buildMetabaseEmbedUrl({
      siteUrl: "https://bi.example.jp",
      secret: SECRET,
      dashboardId: 7,
      nowMs: NOW_MS,
    });
    expect(url).toMatch(
      /^https:\/\/bi\.example\.jp\/embed\/dashboard\/[\w-]+\.[\w-]+\.[\w-]+#bordered=false&titled=false&refresh=60$/,
    );
  });

  it("末尾スラッシュを重ねない", () => {
    const url = buildMetabaseEmbedUrl({
      siteUrl: "https://bi.example.jp///",
      secret: SECRET,
      dashboardId: 7,
      nowMs: NOW_MS,
    });
    expect(url).toContain("https://bi.example.jp/embed/dashboard/");
    expect(url).not.toContain("//embed");
  });
});
