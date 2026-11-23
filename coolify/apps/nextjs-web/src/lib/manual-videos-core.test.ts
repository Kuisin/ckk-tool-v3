import { describe, expect, it } from "vitest";
import {
  formatTimestamp,
  parseManifest,
  parseRange,
  resolveMedia,
} from "./manual-videos-core";

const manifest = {
  commit: "abc123",
  recordedAt: "2026-11-23T14:46:29+09:00",
  videos: [
    {
      id: "process-sales",
      docPage: "process/sales",
      title: "販売の流れ",
      durationSec: 127.9,
      chapters: [
        { title: "価格試算を作る", startSec: 0 },
        { title: "価格表を作る", startSec: 34.8 },
      ],
    },
  ],
};

describe("parseManifest", () => {
  it("録画スクリプトが書く形を受け取る", () => {
    expect(parseManifest(manifest)?.videos[0]?.id).toBe("process-sales");
  });

  it("commit が分からない録画（null）も受け取る", () => {
    expect(parseManifest({ ...manifest, commit: null })).not.toBeNull();
  });

  it("形が違えば動画なしとして扱う", () => {
    expect(parseManifest(null)).toBeNull();
    expect(parseManifest({ videos: "x" })).toBeNull();
    expect(parseManifest({ ...manifest, videos: [{ id: "a" }] })).toBeNull();
  });

  it("ファイル名にできない id を持つ manifest は受け取らない", () => {
    const bad = {
      ...manifest,
      videos: [{ ...manifest.videos[0], id: "../secret" }],
    };
    expect(parseManifest(bad)).toBeNull();
  });
});

describe("resolveMedia", () => {
  const m = parseManifest(manifest);
  if (!m) throw new Error("fixture");

  it("manifest に載っている動画の 3 種類のファイルだけを通す", () => {
    expect(resolveMedia("process-sales.webm", m)?.contentType).toBe(
      "video/webm",
    );
    expect(resolveMedia("process-sales.vtt", m)?.contentType).toContain(
      "text/vtt",
    );
    expect(resolveMedia("process-sales.jpg", m)?.contentType).toBe(
      "image/jpeg",
    );
  });

  it("載っていない id は通さない", () => {
    expect(resolveMedia("process-other.webm", m)).toBeNull();
  });

  it("パスを含む名前・知らない拡張子は通さない", () => {
    for (const name of [
      "../process-sales.webm",
      "process-sales.webm/..",
      "a/process-sales.webm",
      "process-sales.json",
      "manifest.json",
      "process-sales",
      "process-sales.webm.bak",
      "PROCESS-SALES.webm",
      "process-sales.webm\0.jpg",
      "",
    ]) {
      expect(resolveMedia(name, m), name).toBeNull();
    }
  });
});

describe("parseRange", () => {
  it("Range が無ければ全体", () => {
    expect(parseRange(null, 100)).toBeNull();
  });

  it("開始〜終了（両端を含む）", () => {
    expect(parseRange("bytes=0-9", 100)).toEqual({ start: 0, end: 9 });
  });

  it("開始だけなら最後まで", () => {
    expect(parseRange("bytes=40-", 100)).toEqual({ start: 40, end: 99 });
  });

  it("終了がファイルより先なら末尾で切る", () => {
    expect(parseRange("bytes=90-500", 100)).toEqual({ start: 90, end: 99 });
  });

  it("末尾から N バイト", () => {
    expect(parseRange("bytes=-10", 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange("bytes=-500", 100)).toEqual({ start: 0, end: 99 });
  });

  it("ファイルの外は invalid（416）", () => {
    expect(parseRange("bytes=100-", 100)).toBe("invalid");
    expect(parseRange("bytes=50-40", 100)).toBe("invalid");
    expect(parseRange("bytes=-0", 100)).toBe("invalid");
    expect(parseRange("bytes=0-", 0)).toBe("invalid");
  });

  it("解釈できない形・複数範囲は全体を返す", () => {
    expect(parseRange("bytes=0-1,5-6", 100)).toBeNull();
    expect(parseRange("items=0-1", 100)).toBeNull();
    expect(parseRange("bytes=-", 100)).toBeNull();
    expect(parseRange("bytes=a-b", 100)).toBeNull();
  });
});

describe("formatTimestamp", () => {
  it("m:ss で出す", () => {
    expect(formatTimestamp(0)).toBe("0:00");
    expect(formatTimestamp(34.8)).toBe("0:34");
    expect(formatTimestamp(127.9)).toBe("2:07");
    expect(formatTimestamp(-3)).toBe("0:00");
  });
});
