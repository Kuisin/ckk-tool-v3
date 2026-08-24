/**
 * qr.ts — 依存ゼロ・純 TypeScript の QR コードエンコーダ。
 *
 * ※ TWIN FILE: coolify/apps/nextjs-kiosk/src/lib/qr.ts と同一内容。
 *   共有パッケージ機構が無いため複製で運用 — 変更時は両方を更新すること。
 *
 * - バイトモード専用(UTF-8 バイト列として符号化)
 * - 誤り訂正レベル M / Q、型番(version)1〜10 を自動選択
 * - ISO/IEC 18004 準拠の完全パイプライン:
 *   モード+文字数指示子 → データ符号語 → RS 誤り訂正(GF(256)) →
 *   ブロックインターリーブ → 機能パターン → フォーマット情報(BCH 15,5) →
 *   バージョン情報(型番7以上) → 全8マスクをペナルティ4規則で評価し最良を選択
 * - ブラウザ・サーバ両対応(import なし・Node 組み込み API 不使用)
 */

export type Ecc = "M" | "Q";

/* ======================= GF(256) 演算 ======================= */
// QR の RS 符号は原始多項式 x^8+x^4+x^3+x^2+1 (0x11D) 上の GF(256) を使う。
const GF_EXP: number[] = new Array(510).fill(0);
const GF_LOG: number[] = new Array(256).fill(0);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  // 指数の折り返し(mod 255)をテーブル側で吸収
  for (let i = 255; i < 510; i++) GF_EXP[i] = GF_EXP[i - 255];
}

function gfMul(a: number, b: number): number {
  return a === 0 || b === 0 ? 0 : GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

/**
 * RS 生成多項式 g(x) = Π_{i=0}^{degree-1} (x + α^i) をその場で計算する
 * (固定テーブルは持たない)。係数は最高次から順に並び、g[0] は常に 1。
 * テストから参照できるよう export している。
 */
export function rsGeneratorPoly(degree: number): number[] {
  let poly: number[] = [1];
  for (let i = 0; i < degree; i++) {
    const next: number[] = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j]; // ×x の寄与
      next[j + 1] ^= gfMul(poly[j], GF_EXP[i]); // ×α^i の寄与
    }
    poly = next;
  }
  return poly;
}

/**
 * データ符号語列に対する RS 誤り訂正符号語 = data(x)·x^degree を g(x) で
 * 割った剰余。テスト(独立実装との突き合わせ)用に export している。
 */
export function rsEcc(data: readonly number[], degree: number): number[] {
  const gen = rsGeneratorPoly(degree);
  const rem: number[] = new Array(degree).fill(0);
  for (const b of data) {
    const factor = (b ^ rem[0]) & 0xff;
    for (let i = 0; i < degree - 1; i++) {
      rem[i] = rem[i + 1] ^ gfMul(gen[i + 1], factor);
    }
    rem[degree - 1] = gfMul(gen[degree], factor);
  }
  return rem;
}

/* ======================= 定数表 ======================= */

/** 型番ごとの誤り訂正ブロック構成(ISO/IEC 18004 表9 より、型番1〜10)。 */
interface BlockSpec {
  /** 1ブロックあたりの EC 符号語数 */
  ec: number;
  /** [ブロック数, ブロックあたりデータ符号語数] のグループ列(短いブロックが先) */
  groups: ReadonlyArray<readonly [number, number]>;
}

const BLOCKS: Record<Ecc, ReadonlyArray<BlockSpec>> = {
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

/** 位置合わせパターン中心座標(型番1〜10)。 */
const ALIGN_POS: ReadonlyArray<ReadonlyArray<number>> = [
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

/** フォーマット情報中の EC レベル指示ビット(L=1, M=0, Q=3, H=2 — 直感に反する並びなので注意)。 */
const ECC_FORMAT_BITS: Record<Ecc, number> = { M: 0, Q: 3 };

/** マスクパターン(x=列, y=行)。true のセルを反転する。 */
const MASK_FNS: ReadonlyArray<(x: number, y: number) => boolean> = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x, _y) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

/* ======================= ビット列の組み立て ======================= */

function toUtf8Bytes(s: string): number[] {
  const out: number[] = [];
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    else if (cp < 0x10000)
      out.push(
        0xe0 | (cp >> 12),
        0x80 | ((cp >> 6) & 0x3f),
        0x80 | (cp & 0x3f),
      );
    else
      out.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 0x3f),
        0x80 | ((cp >> 6) & 0x3f),
        0x80 | (cp & 0x3f),
      );
  }
  return out;
}

function dataCodewordCount(version: number, ecc: Ecc): number {
  return BLOCKS[ecc][version - 1].groups.reduce((n, [c, d]) => n + c * d, 0);
}

/** バイトモードの文字数指示子ビット数: 型番1〜9は8bit、10〜26は16bit。 */
function byteLengthBits(version: number): number {
  return version <= 9 ? 8 : 16;
}

function chooseVersion(byteLen: number, ecc: Ecc): number {
  for (let v = 1; v <= 10; v++) {
    // 終端(4bit)は容量が丁度なら省略可なのでヘッダ+データのみで判定する
    if (4 + byteLengthBits(v) + byteLen * 8 <= dataCodewordCount(v, ecc) * 8)
      return v;
  }
  throw new Error(
    `QR: payload too long (${byteLen} bytes) for versions 1-10 at level ${ecc}`,
  );
}

/** ビット列→データ符号語→ブロック分割→RS→インターリーブ済み最終符号語列。 */
function buildCodewords(
  bytes: readonly number[],
  version: number,
  ecc: Ecc,
): number[] {
  const spec = BLOCKS[ecc][version - 1];
  const dataCw = dataCodewordCount(version, ecc);
  const bits: number[] = [];
  const push = (val: number, n: number): void => {
    for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1);
  };
  push(0b0100, 4); // バイトモード
  push(bytes.length, byteLengthBits(version));
  for (const b of bytes) push(b, 8);
  const cap = dataCw * 8;
  push(0, Math.min(4, cap - bits.length)); // 終端(容量が足りない場合は短縮)
  while (bits.length % 8 !== 0) bits.push(0);

  const cw: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
    cw.push(b);
  }
  // 規格で定められた交互パディングバイト
  for (let pad = 0xec; cw.length < dataCw; pad ^= 0xec ^ 0x11) cw.push(pad);

  // ブロック分割(短いブロックが先) → 各ブロックの RS 計算
  const blocks: number[][] = [];
  let off = 0;
  for (const [count, dlen] of spec.groups) {
    for (let i = 0; i < count; i++) {
      blocks.push(cw.slice(off, off + dlen));
      off += dlen;
    }
  }
  const eccBlocks = blocks.map((b) => rsEcc(b, spec.ec));

  // インターリーブ: データは列方向(短ブロックは末尾をスキップ)、続けて EC
  const out: number[] = [];
  const maxD = Math.max(...blocks.map((b) => b.length));
  for (let i = 0; i < maxD; i++) {
    for (const b of blocks) if (i < b.length) out.push(b[i]);
  }
  for (let i = 0; i < spec.ec; i++) {
    for (const e of eccBlocks) out.push(e[i]);
  }
  return out;
}

/* ======================= 行列の組み立て ======================= */

type Matrix = boolean[][];

/** BCH(15,5): フォーマット情報。生成多項式 0x537、規格指定のマスク 0x5412 を XOR。 */
function formatInfoBits(ecc: Ecc, mask: number): number {
  const data = (ECC_FORMAT_BITS[ecc] << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

/** BCH(18,6): バージョン情報(型番7以上)。生成多項式 0x1F25。 */
function versionInfoBits(version: number): number {
  let rem = version;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  return (version << 12) | rem;
}

/** フォーマット情報2コピー+ダークモジュールを描画。fn 非 null なら機能領域として予約。 */
function drawFormatBits(
  m: Matrix,
  fn: Matrix | null,
  ecc: Ecc,
  mask: number,
): void {
  const size = m.length;
  const set = (x: number, y: number, dark: boolean): void => {
    m[y][x] = dark;
    if (fn) fn[y][x] = true;
  };
  const bits = formatInfoBits(ecc, mask);
  const bit = (i: number): boolean => ((bits >>> i) & 1) !== 0;
  // 第1コピー(左上)。x=6/y=6 はタイミングパターンなので配置が飛んでいる
  for (let i = 0; i <= 5; i++) set(8, i, bit(i));
  set(8, 7, bit(6));
  set(8, 8, bit(7));
  set(7, 8, bit(8));
  for (let i = 9; i <= 14; i++) set(14 - i, 8, bit(i));
  // 第2コピー(右上の行8+左下の列8)
  for (let i = 0; i <= 7; i++) set(size - 1 - i, 8, bit(i));
  for (let i = 8; i <= 14; i++) set(8, size - 15 + i, bit(i));
  // ダークモジュール(常に黒: 座標 (8, 4v+9))
  set(8, size - 8, true);
}

function drawFunctionPatterns(
  m: Matrix,
  fn: Matrix,
  version: number,
  ecc: Ecc,
): void {
  const size = m.length;
  const set = (x: number, y: number, dark: boolean): void => {
    m[y][x] = dark;
    fn[y][x] = true;
  };
  // タイミングパターン(行6・列6、明暗交互)
  for (let i = 0; i < size; i++) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }
  // ファインダパターン+分離帯(3隅)。中心からのチェビシェフ距離 2 と 4 が白
  const finder = (cx: number, cy: number): void => {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || x >= size || y < 0 || y >= size) continue;
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        set(x, y, d !== 2 && d !== 4);
      }
    }
  };
  finder(3, 3);
  finder(size - 4, 3);
  finder(3, size - 4);
  // 位置合わせパターン(ファインダと重なる3隅はスキップ)
  const pos = ALIGN_POS[version - 1];
  const last = pos.length - 1;
  for (let i = 0; i < pos.length; i++) {
    for (let j = 0; j < pos.length; j++) {
      if (
        (i === 0 && j === 0) ||
        (i === 0 && j === last) ||
        (i === last && j === 0)
      )
        continue;
      const cx = pos[j];
      const cy = pos[i];
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
      }
    }
  }
  // フォーマット情報領域の予約(実値はマスク決定後に上書き)
  drawFormatBits(m, fn, ecc, 0);
  // バージョン情報(型番7以上): 右上 3×6 と左下 6×3
  if (version >= 7) {
    const bits = versionInfoBits(version);
    for (let i = 0; i < 18; i++) {
      const b = ((bits >>> i) & 1) !== 0;
      const a = size - 11 + (i % 3);
      const c = Math.floor(i / 3);
      set(a, c, b);
      set(c, a, b);
    }
  }
}

/** 符号語ビットをジグザグ順(右下から2列ずつ上下交互、列6は飛ばす)に配置。 */
function drawCodewords(
  m: Matrix,
  fn: Matrix,
  codewords: readonly number[],
): void {
  const size = m.length;
  const totalBits = codewords.length * 8;
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5; // 列6はタイミングパターン専用なのでスキップ
    const upward = ((right + 1) & 2) === 0;
    for (let vert = 0; vert < size; vert++) {
      const y = upward ? size - 1 - vert : vert;
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        if (fn[y][x] || i >= totalBits) continue;
        m[y][x] = ((codewords[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0;
        i++;
      }
      // 残余ビット(型番2〜6で7bit)は白(false)のまま残る
    }
  }
}

/** ペナルティ計算(規格の4規則 N1〜N4)。 */
function penaltyScore(m: Matrix): number {
  const size = m.length;
  let score = 0;
  // 1011101 の前後どちらかに白4連(ファインダ誤認パターン)
  const P1: readonly boolean[] = [
    true,
    false,
    true,
    true,
    true,
    false,
    true,
    false,
    false,
    false,
    false,
  ];
  const P2: readonly boolean[] = [
    false,
    false,
    false,
    false,
    true,
    false,
    true,
    true,
    true,
    false,
    true,
  ];
  const line = (get: (i: number) => boolean): void => {
    // N1: 同色5連以上 → 3 + (長さ-5)
    let run = 1;
    for (let i = 1; i <= size; i++) {
      if (i < size && get(i) === get(i - 1)) run++;
      else {
        if (run >= 5) score += 3 + (run - 5);
        run = 1;
      }
    }
    // N3: ファインダ様パターン → 40(重複出現もそれぞれ数える)
    for (let i = 0; i + 11 <= size; i++) {
      let m1 = true;
      let m2 = true;
      for (let j = 0; j < 11; j++) {
        const v = get(i + j);
        if (v !== P1[j]) m1 = false;
        if (v !== P2[j]) m2 = false;
      }
      if (m1) score += 40;
      if (m2) score += 40;
    }
  };
  for (let y = 0; y < size; y++) line((i) => m[y][i]);
  for (let x = 0; x < size; x++) line((i) => m[i][x]);
  // N2: 2×2 同色ブロック → 3
  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const c = m[y][x];
      if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1])
        score += 3;
    }
  }
  // N4: 黒比率の 50% からの乖離 5% ごとに 10
  let dark = 0;
  for (const row of m) for (const c of row) if (c) dark++;
  const total = size * size;
  score += Math.floor(Math.abs(dark * 20 - total * 10) / total) * 10;
  return score;
}

/* ======================= 公開 API ======================= */

/**
 * 文字列をエンコードしたモジュール行列を返す(true = 黒)。クワイエットゾーンは含まない。
 * 行列は matrix[行][列] で、一辺 = 17 + 4×型番。
 */
export function qrMatrix(data: string, ecc: Ecc = "M"): boolean[][] {
  const bytes = toUtf8Bytes(data);
  const version = chooseVersion(bytes.length, ecc);
  const size = version * 4 + 17;
  const codewords = buildCodewords(bytes, version, ecc);

  const m: Matrix = Array.from({ length: size }, () =>
    new Array<boolean>(size).fill(false),
  );
  const fn: Matrix = Array.from({ length: size }, () =>
    new Array<boolean>(size).fill(false),
  );
  drawFunctionPatterns(m, fn, version, ecc);
  drawCodewords(m, fn, codewords);

  // 全8マスクを適用してペナルティ最小のものを採用(規格必須の手順)
  let bestScore = Number.POSITIVE_INFINITY;
  let best: Matrix = m;
  for (let mask = 0; mask < 8; mask++) {
    const trial = m.map((row) => row.slice());
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (!fn[y][x] && MASK_FNS[mask](x, y)) trial[y][x] = !trial[y][x];
      }
    }
    drawFormatBits(trial, null, ecc, mask); // フォーマット情報はマスク対象外
    const s = penaltyScore(trial);
    if (s < bestScore) {
      bestScore = s;
      best = trial;
    }
  }
  return best;
}

/**
 * スタンドアロン SVG 文字列を返す(白地に黒1パス、viewBox ベースで拡縮可)。
 * margin はクワイエットゾーンのモジュール数(規格最小値の4が既定)。
 */
export function qrSvg(
  data: string,
  opts?: { ecc?: Ecc; moduleSize?: number; margin?: number },
): string {
  const ecc = opts?.ecc ?? "M";
  const moduleSize = opts?.moduleSize ?? 4;
  const margin = opts?.margin ?? 4;
  const m = qrMatrix(data, ecc);
  const n = m.length;
  const dim = n + margin * 2;
  let d = "";
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (m[y][x]) d += `M${x + margin} ${y + margin}h1v1h-1z`;
    }
  }
  const px = dim * moduleSize;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" ` +
    `viewBox="0 0 ${dim} ${dim}" shape-rendering="crispEdges" role="img">` +
    `<rect width="${dim}" height="${dim}" fill="#ffffff"/>` +
    `<path d="${d}" fill="#000000"/></svg>`
  );
}
