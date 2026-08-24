import { describe, expect, it } from "vitest";
import { imageSize } from "./image-size";

/** テスト用の最小 PNG ヘッダー（IHDR まで）。 */
function png(width: number, height: number): Uint8Array {
  const b = new Uint8Array(24);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const v = new DataView(b.buffer);
  v.setUint32(8, 13); // IHDR 長
  b.set([0x49, 0x48, 0x44, 0x52], 12); // "IHDR"
  v.setUint32(16, width);
  v.setUint32(20, height);
  return b;
}

/** APP0 セグメントを挟んだ SOF0 を持つ最小 JPEG。 */
function jpeg(width: number, height: number): Uint8Array {
  const b = new Uint8Array(2 + 6 + 11);
  const v = new DataView(b.buffer);
  b.set([0xff, 0xd8], 0); // SOI
  b.set([0xff, 0xe0], 2); // APP0
  v.setUint16(4, 4); // 長さ 4（データ 2 バイト）
  b.set([0x00, 0x00], 6);
  b.set([0xff, 0xc0], 8); // SOF0
  v.setUint16(10, 11); // 長さ
  b[12] = 8; // precision
  v.setUint16(13, height);
  v.setUint16(15, width);
  return b;
}

/** ロスあり WEBP（VP8）。 */
function webpVp8(width: number, height: number): Uint8Array {
  const b = new Uint8Array(30);
  const v = new DataView(b.buffer);
  const ascii = (s: string, off: number) => {
    for (let i = 0; i < s.length; i++) b[off + i] = s.charCodeAt(i);
  };
  ascii("RIFF", 0);
  ascii("WEBP", 8);
  ascii("VP8 ", 12);
  v.setUint16(26, width, true);
  v.setUint16(28, height, true);
  return b;
}

/** ロスレス WEBP（VP8L）— 幅・高さは 14bit ずつで -1 されている。 */
function webpVp8l(width: number, height: number): Uint8Array {
  const b = new Uint8Array(30);
  const v = new DataView(b.buffer);
  const ascii = (s: string, off: number) => {
    for (let i = 0; i < s.length; i++) b[off + i] = s.charCodeAt(i);
  };
  ascii("RIFF", 0);
  ascii("WEBP", 8);
  ascii("VP8L", 12);
  v.setUint32(21, (width - 1) | ((height - 1) << 14), true);
  return b;
}

/** 拡張 WEBP（VP8X）— 24bit ずつで -1 されている。 */
function webpVp8x(width: number, height: number): Uint8Array {
  const b = new Uint8Array(30);
  const ascii = (s: string, off: number) => {
    for (let i = 0; i < s.length; i++) b[off + i] = s.charCodeAt(i);
  };
  ascii("RIFF", 0);
  ascii("WEBP", 8);
  ascii("VP8X", 12);
  const w = width - 1;
  const h = height - 1;
  b[24] = w & 0xff;
  b[25] = (w >> 8) & 0xff;
  b[26] = (w >> 16) & 0xff;
  b[27] = h & 0xff;
  b[28] = (h >> 8) & 0xff;
  b[29] = (h >> 16) & 0xff;
  return b;
}

describe("imageSize", () => {
  it("PNG の寸法を読む", () => {
    expect(imageSize(png(512, 512))).toEqual({ width: 512, height: 512 });
    expect(imageSize(png(1920, 1080))).toEqual({ width: 1920, height: 1080 });
  });

  it("JPEG の寸法を読む（先行セグメントを読み飛ばす）", () => {
    expect(imageSize(jpeg(512, 512))).toEqual({ width: 512, height: 512 });
    expect(imageSize(jpeg(640, 480))).toEqual({ width: 640, height: 480 });
  });

  it("WEBP の 3 形式の寸法を読む", () => {
    expect(imageSize(webpVp8(512, 512))).toEqual({ width: 512, height: 512 });
    expect(imageSize(webpVp8l(300, 200))).toEqual({ width: 300, height: 200 });
    expect(imageSize(webpVp8x(2048, 1024))).toEqual({
      width: 2048,
      height: 1024,
    });
  });

  it("ArrayBuffer でも Uint8Array でも読める", () => {
    const bytes = png(64, 64);
    expect(imageSize(bytes)).toEqual({ width: 64, height: 64 });
    expect(imageSize(bytes.buffer.slice(0) as ArrayBuffer)).toEqual({
      width: 64,
      height: 64,
    });
  });

  it("未対応・壊れたデータは null", () => {
    expect(imageSize(new Uint8Array(0))).toBeNull();
    expect(imageSize(new Uint8Array([1, 2, 3, 4, 5]))).toBeNull();
    // PDF ヘッダー
    expect(
      imageSize(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])),
    ).toBeNull();
    // SOI だけで SOF が無い JPEG
    expect(imageSize(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]))).toBeNull();
    // 寸法 0 の PNG
    expect(imageSize(png(0, 0))).toBeNull();
  });

  it("正方形判定に使える（アバターの不変条件）", () => {
    const square = imageSize(jpeg(512, 512));
    const portrait = imageSize(jpeg(512, 640));
    expect(square && square.width === square.height).toBe(true);
    expect(portrait && portrait.width === portrait.height).toBe(false);
  });
});
