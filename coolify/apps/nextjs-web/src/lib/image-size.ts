/**
 * image-size.ts — 画像バイト列から寸法を読む（PNG / JPEG / WEBP）。isomorphic.
 *
 * プロフィール写真は「正方形で保存する」ことを不変条件にしている（表示側は
 * 丸く切り抜くだけでよい）。クライアントの canvas 切り抜きを信用せず、
 * サーバー側でも寸法を検証するために使う。デコードはせずヘッダーだけを読む
 * ので、依存も追加コストも無い。
 *
 * 読めない / 未対応形式なら null を返す（呼び出し側で扱いを決める）。
 */

export interface ImageSize {
  width: number;
  height: number;
}

/** PNG: シグネチャ + IHDR の幅・高さ（ビッグエンディアン）。 */
function pngSize(v: DataView): ImageSize | null {
  if (v.byteLength < 24) return null;
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < sig.length; i++) {
    if (v.getUint8(i) !== sig[i]) return null;
  }
  // 8..11 = チャンク長, 12..15 = "IHDR", 16..19 = width, 20..23 = height
  if (
    v.getUint8(12) !== 0x49 ||
    v.getUint8(13) !== 0x48 ||
    v.getUint8(14) !== 0x44 ||
    v.getUint8(15) !== 0x52
  ) {
    return null;
  }
  return { width: v.getUint32(16), height: v.getUint32(20) };
}

/** JPEG: SOF0–SOF15（DHT/DAC/RST を除く）マーカーの寸法。 */
function jpegSize(v: DataView): ImageSize | null {
  if (v.byteLength < 4) return null;
  if (v.getUint8(0) !== 0xff || v.getUint8(1) !== 0xd8) return null;
  let i = 2;
  while (i + 3 < v.byteLength) {
    if (v.getUint8(i) !== 0xff) {
      i += 1; // フィルバイト等 — 次のマーカーまで進める
      continue;
    }
    const marker = v.getUint8(i + 1);
    // スタンドアロンマーカー（長さフィールドを持たない）
    if (
      marker === 0xd8 ||
      marker === 0x01 ||
      (marker >= 0xd0 && marker <= 0xd7)
    ) {
      i += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) return null; // EOI / SOS
    const len = v.getUint16(i + 2);
    if (len < 2) return null;
    const isSof =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 && // DHT
      marker !== 0xc8 && // JPG
      marker !== 0xcc; // DAC
    if (isSof) {
      if (i + 9 >= v.byteLength) return null;
      // i+4 = precision, i+5..6 = height, i+7..8 = width
      return { height: v.getUint16(i + 5), width: v.getUint16(i + 7) };
    }
    i += 2 + len;
  }
  return null;
}

/** WEBP: RIFF コンテナ内の VP8 / VP8L / VP8X（いずれもリトルエンディアン）。 */
function webpSize(v: DataView): ImageSize | null {
  if (v.byteLength < 30) return null;
  const tag = (off: number) =>
    String.fromCharCode(
      v.getUint8(off),
      v.getUint8(off + 1),
      v.getUint8(off + 2),
      v.getUint8(off + 3),
    );
  if (tag(0) !== "RIFF" || tag(8) !== "WEBP") return null;
  const format = tag(12);
  if (format === "VP8 ") {
    // 20..22 = 同期コード, 26/28 に 14bit の幅・高さ
    return {
      width: v.getUint16(26, true) & 0x3fff,
      height: v.getUint16(28, true) & 0x3fff,
    };
  }
  if (format === "VP8L") {
    // 21 バイト目以降 4 バイトに 14bit ずつ（-1 されている）
    const bits = v.getUint32(21, true);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
    };
  }
  if (format === "VP8X") {
    // 24..26 / 27..29 に 24bit の (幅-1) / (高さ-1)
    const w = v.getUint8(24) | (v.getUint8(25) << 8) | (v.getUint8(26) << 16);
    const h = v.getUint8(27) | (v.getUint8(28) << 8) | (v.getUint8(29) << 16);
    return { width: w + 1, height: h + 1 };
  }
  return null;
}

/** 画像バイト列の寸法。未対応 / 壊れている場合は null。 */
export function imageSize(bytes: ArrayBuffer | Uint8Array): ImageSize | null {
  const view =
    bytes instanceof Uint8Array
      ? new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
      : new DataView(bytes);
  const size = pngSize(view) ?? jpegSize(view) ?? webpSize(view);
  if (!size || size.width <= 0 || size.height <= 0) return null;
  return size;
}
