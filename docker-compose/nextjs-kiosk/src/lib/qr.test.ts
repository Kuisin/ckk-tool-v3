/**
 * qr.test.ts — qr.ts の正しさをQRライブラリなしで証明するテスト。
 *
 * 証明戦略:
 *  1. 構造的不変条件(サイズ・ファインダ・タイミング・ダークモジュール・フォーマット2コピー一致)
 *  2. エンコード→独立実装の最小デコーダで復号し、ペイロード一致を確認
 *     (フォーマット情報のBCH検査、アンマスク、ジグザグ読取、デインターリーブ、
 *      RSシンドローム全ゼロ検査、バイトモードヘッダ解析)
 *  3. RS既知解テスト: 素朴な多項式筆算(独立実装)との突き合わせ
 *  4. マスクは 0..7 のいずれかで、フォーマット情報が有効であること
 */
import { describe, expect, it } from "vitest";
import { qrMatrix, qrSvg, rsEcc, rsGeneratorPoly } from "./qr";

type Ecc = "M" | "Q";

/* ================= 独立実装: GF(256) を「掛け算の定義通り」に計算 ================= */
// エンコーダは log/exp テーブルを使うが、こちらはロシア農民法で逐次計算する。
function slowGfMul(aIn: number, bIn: number): number {
  let a = aIn;
  let b = bIn;
  let r = 0;
  while (b > 0) {
    if (b & 1) r ^= a;
    a <<= 1;
    if (a & 0x100) a ^= 0x11d;
    b >>>= 1;
  }
  return r;
}

function slowGfPow(exp: number): number {
  // α = 2 の exp 乗
  let r = 1;
  for (let i = 0; i < exp; i++) r = slowGfMul(r, 2);
  return r;
}

/** 独立実装: 生成多項式を全積で作り、素朴な筆算で剰余を求める。 */
function slowRsEcc(data: readonly number[], degree: number): number[] {
  let gen: number[] = [1];
  for (let i = 0; i < degree; i++) {
    const alpha = slowGfPow(i);
    const next: number[] = new Array(gen.length + 1).fill(0);
    for (let j = 0; j < gen.length; j++) {
      next[j] ^= gen[j];
      next[j + 1] ^= slowGfMul(gen[j], alpha);
    }
    gen = next;
  }
  const msg: number[] = [...data, ...new Array<number>(degree).fill(0)];
  for (let i = 0; i < data.length; i++) {
    const coef = msg[i];
    if (coef !== 0) {
      for (let j = 0; j < gen.length; j++)
        msg[i + j] ^= slowGfMul(gen[j], coef);
    }
  }
  return msg.slice(data.length);
}

/* ================= 独立実装: 最小デコーダ ================= */

// ISO/IEC 18004 表9 からの転記(テスト側の独立コピー)
const T_BLOCKS: Record<Ecc, { ec: number; groups: [number, number][] }[]> = {
  M: [
    { ec: 10, groups: [[1, 16]] },
    { ec: 16, groups: [[1, 28]] },
    { ec: 26, groups: [[1, 44]] },
    { ec: 18, groups: [[2, 32]] },
    { ec: 24, groups: [[2, 43]] },
    { ec: 16, groups: [[4, 27]] },
    { ec: 18, groups: [[4, 31]] },
    {
      ec: 22,
      groups: [
        [2, 38],
        [2, 39],
      ],
    },
    {
      ec: 22,
      groups: [
        [3, 36],
        [2, 37],
      ],
    },
    {
      ec: 26,
      groups: [
        [4, 43],
        [1, 44],
      ],
    },
  ],
  Q: [
    { ec: 13, groups: [[1, 13]] },
    { ec: 22, groups: [[1, 22]] },
    { ec: 18, groups: [[2, 17]] },
    { ec: 26, groups: [[2, 24]] },
    {
      ec: 18,
      groups: [
        [2, 15],
        [2, 16],
      ],
    },
    { ec: 24, groups: [[4, 19]] },
    {
      ec: 18,
      groups: [
        [2, 14],
        [4, 15],
      ],
    },
    {
      ec: 22,
      groups: [
        [4, 18],
        [2, 19],
      ],
    },
    {
      ec: 20,
      groups: [
        [4, 16],
        [4, 17],
      ],
    },
    {
      ec: 24,
      groups: [
        [6, 19],
        [2, 20],
      ],
    },
  ],
};

const T_ALIGN: number[][] = [
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
];

/** 15bit 値が BCH(15,5)(生成多項式 0x537)の有効符号語かを剰余ゼロで検査。 */
function bch15Valid(v: number): boolean {
  let r = v;
  for (let i = 14; i >= 10; i--) {
    if ((r >>> i) & 1) r ^= 0x537 << (i - 10);
  }
  return r === 0;
}

/** 18bit 値が BCH(18,6)(生成多項式 0x1F25)の有効符号語かを剰余ゼロで検査。 */
function bch18Valid(v: number): boolean {
  let r = v;
  for (let i = 17; i >= 12; i--) {
    if ((r >>> i) & 1) r ^= 0x1f25 << (i - 12);
  }
  return r === 0;
}

function utf8Decode(bytes: readonly number[]): string {
  let out = "";
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i];
    let cp: number;
    if (b < 0x80) {
      cp = b;
      i += 1;
    } else if ((b & 0xe0) === 0xc0) {
      cp = ((b & 0x1f) << 6) | (bytes[i + 1] & 0x3f);
      i += 2;
    } else if ((b & 0xf0) === 0xe0) {
      cp =
        ((b & 0x0f) << 12) |
        ((bytes[i + 1] & 0x3f) << 6) |
        (bytes[i + 2] & 0x3f);
      i += 3;
    } else {
      cp =
        ((b & 0x07) << 18) |
        ((bytes[i + 1] & 0x3f) << 12) |
        ((bytes[i + 2] & 0x3f) << 6) |
        (bytes[i + 3] & 0x3f);
      i += 4;
    }
    out += String.fromCodePoint(cp);
  }
  return out;
}

interface Decoded {
  version: number;
  ecc: Ecc;
  mask: number;
  mode: number;
  payload: string;
  formatValid: boolean;
  formatCopiesEqual: boolean;
  versionInfoValid: boolean | null; // 型番7未満は null
  syndromesZero: boolean;
  remainderBitsZero: boolean;
}

function decodeQr(m: boolean[][]): Decoded {
  const size = m.length;
  const version = (size - 17) / 4;
  if (!Number.isInteger(version) || version < 1 || version > 10) {
    throw new Error(`bad size ${size}`);
  }

  // ---- 機能モジュール判定(仕様の領域定義から独立に記述) ----
  const centers = T_ALIGN[version - 1];
  const last = centers.length - 1;
  const isFunc = (row: number, col: number): boolean => {
    if (row < 9 && col < 9) return true; // 左上ファインダ+分離帯+フォーマット
    if (row < 9 && col >= size - 8) return true; // 右上
    if (row >= size - 8 && col < 9) return true; // 左下(ダークモジュール含む)
    if (row === 6 || col === 6) return true; // タイミング
    if (
      version >= 7 &&
      ((row < 6 && col >= size - 11) || (col < 6 && row >= size - 11))
    ) {
      return true; // バージョン情報
    }
    for (let i = 0; i < centers.length; i++) {
      for (let j = 0; j < centers.length; j++) {
        if (
          (i === 0 && j === 0) ||
          (i === 0 && j === last) ||
          (i === last && j === 0)
        )
          continue;
        if (Math.abs(row - centers[i]) <= 2 && Math.abs(col - centers[j]) <= 2)
          return true;
      }
    }
    return false;
  };

  // ---- フォーマット情報(2コピー)読み取り ----
  let f1 = 0;
  for (let i = 0; i <= 5; i++) f1 |= (m[i][8] ? 1 : 0) << i;
  f1 |= (m[7][8] ? 1 : 0) << 6;
  f1 |= (m[8][8] ? 1 : 0) << 7;
  f1 |= (m[8][7] ? 1 : 0) << 8;
  for (let i = 9; i <= 14; i++) f1 |= (m[8][14 - i] ? 1 : 0) << i;
  let f2 = 0;
  for (let i = 0; i <= 7; i++) f2 |= (m[8][size - 1 - i] ? 1 : 0) << i;
  for (let i = 8; i <= 14; i++) f2 |= (m[size - 15 + i][8] ? 1 : 0) << i;

  const fmt = f1 ^ 0x5412; // 規格指定のフォーマットマスクを外す
  const formatValid = bch15Valid(fmt);
  const eclBits = (fmt >> 13) & 3;
  const mask = (fmt >> 10) & 7;
  let ecc: Ecc;
  if (eclBits === 0) ecc = "M";
  else if (eclBits === 3) ecc = "Q";
  else throw new Error(`unexpected ECL bits ${eclBits}`);

  // ---- バージョン情報(型番7以上) ----
  let versionInfoValid: boolean | null = null;
  if (version >= 7) {
    let vb = 0;
    for (let i = 0; i < 18; i++) {
      const a = size - 11 + (i % 3);
      const c = Math.floor(i / 3);
      vb |= (m[a][c] ? 1 : 0) << i; // 左下コピー
    }
    versionInfoValid = bch18Valid(vb) && vb >>> 12 === version;
  }

  // ---- アンマスク+ジグザグ読取 ----
  const maskFns: ((row: number, col: number) => boolean)[] = [
    (i, j) => (i + j) % 2 === 0,
    (i, _j) => i % 2 === 0,
    (_i, j) => j % 3 === 0,
    (i, j) => (i + j) % 3 === 0,
    (i, j) => (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0,
    (i, j) => ((i * j) % 2) + ((i * j) % 3) === 0,
    (i, j) => (((i * j) % 2) + ((i * j) % 3)) % 2 === 0,
    (i, j) => (((i + j) % 2) + ((i * j) % 3)) % 2 === 0,
  ];
  const mf = maskFns[mask];
  const bits: number[] = [];
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    const upward = ((right + 1) & 2) === 0;
    for (let vert = 0; vert < size; vert++) {
      const row = upward ? size - 1 - vert : vert;
      for (let j = 0; j < 2; j++) {
        const col = right - j;
        if (isFunc(row, col)) continue;
        bits.push(m[row][col] !== mf(row, col) ? 1 : 0);
      }
    }
  }

  // ---- 符号語化+残余ビット検査 ----
  const spec = T_BLOCKS[ecc][version - 1];
  const blockSizes: number[] = [];
  for (const [count, dlen] of spec.groups) {
    for (let k = 0; k < count; k++) blockSizes.push(dlen);
  }
  const totalData = blockSizes.reduce((a, b) => a + b, 0);
  const totalCw = totalData + spec.ec * blockSizes.length;
  const remainder = bits.length - totalCw * 8;
  const remainderBitsZero =
    remainder >= 0 &&
    remainder <= 7 &&
    bits.slice(totalCw * 8).every((b) => b === 0);
  const cw: number[] = [];
  for (let i = 0; cw.length < totalCw; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
    cw.push(b);
  }

  // ---- デインターリーブ ----
  const dataBlocks: number[][] = blockSizes.map(() => []);
  const eccBlocks: number[][] = blockSizes.map(() => []);
  let idx = 0;
  const maxD = Math.max(...blockSizes);
  for (let i = 0; i < maxD; i++) {
    for (let b = 0; b < blockSizes.length; b++) {
      if (i < blockSizes[b]) dataBlocks[b].push(cw[idx++]);
    }
  }
  for (let i = 0; i < spec.ec; i++) {
    for (let b = 0; b < blockSizes.length; b++) eccBlocks[b].push(cw[idx++]);
  }

  // ---- RS シンドローム検査: 各ブロックの受信多項式を α^0..α^(ec-1) で評価し全て0 ----
  let syndromesZero = true;
  for (let b = 0; b < blockSizes.length; b++) {
    const poly = [...dataBlocks[b], ...eccBlocks[b]];
    for (let s = 0; s < spec.ec; s++) {
      const alpha = slowGfPow(s);
      let val = 0;
      for (const c of poly) val = slowGfMul(val, alpha) ^ c; // ホーナー法
      if (val !== 0) syndromesZero = false;
    }
  }

  // ---- バイトモードヘッダ解析 ----
  const data = dataBlocks.flat();
  let bp = 0;
  const readBits = (n: number): number => {
    let v = 0;
    for (let k = 0; k < n; k++) {
      v = (v << 1) | ((data[bp >> 3] >> (7 - (bp & 7))) & 1);
      bp++;
    }
    return v;
  };
  const mode = readBits(4);
  const len = readBits(version <= 9 ? 8 : 16);
  const bytes: number[] = [];
  for (let k = 0; k < len; k++) bytes.push(readBits(8));

  return {
    version,
    ecc,
    mask,
    mode,
    payload: utf8Decode(bytes),
    formatValid,
    formatCopiesEqual: f1 === f2,
    versionInfoValid,
    syndromesZero,
    remainderBitsZero,
  };
}

/* ================= テスト本体 ================= */

const CARD_ID = "ABCDEFGHJKLMNPQR"; // 16文字カードID
const URL45 = "https://ckk-kiosk.kai-lab.net/q/ABCDEFGHJKLMN"; // 45文字
const FORCE_V5 = "https://ckk-kiosk.kai-lab.net/q/" + "X".repeat(38); // 70バイト → M では版5

function json120(): string {
  const build = (n: number): string =>
    JSON.stringify({ t: "setup", device: "kiosk-01", key: "K".repeat(n) });
  let n = 1;
  while (build(n).length < 120) n++;
  return build(n);
}

describe("構造的不変条件", () => {
  const FINDER: number[][] = [
    [1, 1, 1, 1, 1, 1, 1],
    [1, 0, 0, 0, 0, 0, 1],
    [1, 0, 1, 1, 1, 0, 1],
    [1, 0, 1, 1, 1, 0, 1],
    [1, 0, 1, 1, 1, 0, 1],
    [1, 0, 0, 0, 0, 0, 1],
    [1, 1, 1, 1, 1, 1, 1],
  ];

  it("サイズ = 17 + 4×版", () => {
    expect(qrMatrix("A").length).toBe(21); // 1バイト → 版1
    expect(qrMatrix(CARD_ID).length).toBe(25); // 16バイト → 版2 (版1のMは14バイトまで)
    expect(qrMatrix(FORCE_V5).length).toBeGreaterThanOrEqual(17 + 4 * 5);
    for (const row of qrMatrix(URL45)) {
      expect(row.length).toBe(qrMatrix(URL45).length); // 正方
    }
  });

  it("ファインダパターンが3隅に正確に存在し、分離帯は白", () => {
    for (const payload of [CARD_ID, URL45]) {
      const m = qrMatrix(payload);
      const size = m.length;
      const corners: [number, number][] = [
        [0, 0],
        [0, size - 7],
        [size - 7, 0],
      ];
      for (const [r0, c0] of corners) {
        for (let r = 0; r < 7; r++) {
          for (let c = 0; c < 7; c++) {
            expect(m[r0 + r][c0 + c]).toBe(FINDER[r][c] === 1);
          }
        }
      }
      // 分離帯(各ファインダに隣接する1モジュール幅)は白
      for (let i = 0; i <= 7; i++) {
        expect(m[7][i]).toBe(false);
        expect(m[i][7]).toBe(false);
        expect(m[7][size - 1 - i]).toBe(false);
        expect(m[i][size - 8]).toBe(false);
        expect(m[size - 8][i]).toBe(false);
        expect(m[size - 1 - i][7]).toBe(false);
      }
    }
  });

  it("タイミングパターンが交互に並ぶ", () => {
    const m = qrMatrix(CARD_ID);
    const size = m.length;
    for (let i = 8; i <= size - 9; i++) {
      expect(m[6][i]).toBe(i % 2 === 0);
      expect(m[i][6]).toBe(i % 2 === 0);
    }
  });

  it("ダークモジュールが (8, size-8) に存在する", () => {
    for (const payload of ["A", CARD_ID, URL45, json120()]) {
      const m = qrMatrix(payload);
      expect(m[m.length - 8][8]).toBe(true);
    }
  });

  it("フォーマット情報: 2コピー一致・BCH有効・マスクは0..7", () => {
    for (const payload of ["A", CARD_ID, URL45]) {
      for (const ecc of ["M", "Q"] as const) {
        const d = decodeQr(qrMatrix(payload, ecc));
        expect(d.formatCopiesEqual).toBe(true);
        expect(d.formatValid).toBe(true);
        expect(d.mask).toBeGreaterThanOrEqual(0);
        expect(d.mask).toBeLessThanOrEqual(7);
        expect(d.ecc).toBe(ecc);
      }
    }
  });
});

describe("エンコード→独立デコーダによるラウンドトリップ", () => {
  const payloads: [string, string][] = [
    ["1文字", "A"],
    ["16文字カードID", CARD_ID],
    ["45文字URL", URL45],
    ["120バイトJSON", json120()],
    ["版5以上を強制する70バイト", FORCE_V5],
  ];

  for (const [label, payload] of payloads) {
    it(`M: ${label}`, () => {
      const d = decodeQr(qrMatrix(payload, "M"));
      expect(d.formatValid).toBe(true);
      expect(d.formatCopiesEqual).toBe(true);
      expect(d.mode).toBe(4); // バイトモード
      expect(d.syndromesZero).toBe(true);
      expect(d.remainderBitsZero).toBe(true);
      expect(d.payload).toBe(payload);
    });
    it(`Q: ${label}`, () => {
      const d = decodeQr(qrMatrix(payload, "Q"));
      expect(d.ecc).toBe("Q");
      expect(d.mode).toBe(4);
      expect(d.syndromesZero).toBe(true);
      expect(d.payload).toBe(payload);
    });
  }

  it("版の下限: 70バイトのMは版5以上、120バイトJSONのMは版7以上(バージョン情報あり)", () => {
    const d5 = decodeQr(qrMatrix(FORCE_V5, "M"));
    expect(d5.version).toBeGreaterThanOrEqual(5);
    const d7 = decodeQr(qrMatrix(json120(), "M"));
    expect(d7.version).toBeGreaterThanOrEqual(7);
    expect(d7.versionInfoValid).toBe(true);
    const d9 = decodeQr(qrMatrix(json120(), "Q"));
    expect(d9.version).toBeGreaterThanOrEqual(9);
    expect(d9.versionInfoValid).toBe(true);
  });

  it("非ASCII(UTF-8マルチバイト)もラウンドトリップする", () => {
    const jp = '{"名称":"試算","記号":"→"}';
    const d = decodeQr(qrMatrix(jp, "M"));
    expect(d.syndromesZero).toBe(true);
    expect(d.payload).toBe(jp);
  });
});

describe("Reed-Solomon 既知解", () => {
  it("生成多項式: 先頭係数1・次数どおりの長さ", () => {
    for (const deg of [10, 13, 16, 18, 22, 24, 26]) {
      const g = rsGeneratorPoly(deg);
      expect(g.length).toBe(deg + 1);
      expect(g[0]).toBe(1);
      // 独立実装の生成多項式と一致
      let gen: number[] = [1];
      for (let i = 0; i < deg; i++) {
        const alpha = slowGfPow(i);
        const next: number[] = new Array(gen.length + 1).fill(0);
        for (let j = 0; j < gen.length; j++) {
          next[j] ^= gen[j];
          next[j + 1] ^= slowGfMul(gen[j], alpha);
        }
        gen = next;
      }
      expect(g).toEqual(gen);
    }
  });

  it("固定データ列のECC符号語が独立の筆算実装と一致(版1-M相当: 16データ+10EC)", () => {
    // 版1-M で "01234567" を数字モード符号化した既知のデータ符号語列(ISO/IEC 18004 の例)
    const data = [
      16, 32, 12, 86, 97, 128, 236, 17, 236, 17, 236, 17, 236, 17, 236, 17,
    ];
    const fast = rsEcc(data, 10);
    const slow = slowRsEcc(data, 10);
    expect(fast).toEqual(slow);
    // ISO/IEC 18004 Annex に掲載されている既知のEC符号語列
    expect(fast).toEqual([165, 36, 212, 193, 237, 54, 199, 135, 44, 85]);
  });

  it("ランダム風データ×複数次数でも両実装が一致し、シンドロームが全ゼロ", () => {
    // 擬似乱数(線形合同法・再現可能)
    let seed = 42;
    const rnd = (): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed & 0xff;
    };
    for (const deg of [10, 18, 22, 26]) {
      const data = Array.from({ length: 40 }, rnd);
      const fast = rsEcc(data, deg);
      expect(fast).toEqual(slowRsEcc(data, deg));
      // 符号語全体(データ+EC)の α^0..α^(deg-1) におけるシンドロームが0
      const poly = [...data, ...fast];
      for (let s = 0; s < deg; s++) {
        const alpha = slowGfPow(s);
        let val = 0;
        for (const c of poly) val = slowGfMul(val, alpha) ^ c;
        expect(val).toBe(0);
      }
    }
  });
});

describe("SVG 出力", () => {
  it("viewBox・クワイエットゾーン・単一黒パスを含む", () => {
    const svg = qrSvg(CARD_ID);
    const size = qrMatrix(CARD_ID).length;
    expect(svg.startsWith("<svg ")).toBe(true);
    expect(svg).toContain(`viewBox="0 0 ${size + 8} ${size + 8}"`); // 既定マージン4
    expect(svg).toContain('fill="#ffffff"');
    expect((svg.match(/<path /g) ?? []).length).toBe(1);
    // マージン指定が反映される
    const svg0 = qrSvg(CARD_ID, { margin: 0, moduleSize: 10 });
    expect(svg0).toContain(`viewBox="0 0 ${size} ${size}"`);
    expect(svg0).toContain(`width="${size * 10}"`);
  });

  it("容量超過は明示的にエラー", () => {
    expect(() => qrMatrix("X".repeat(300), "M")).toThrow(/too long/);
  });
});
