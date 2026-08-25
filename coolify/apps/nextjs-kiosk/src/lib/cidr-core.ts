/**
 * cidr-core.ts — IP アドレスと CIDR の照合。純関数・isomorphic・依存ゼロ。
 *
 * 用途は 2 つ:
 *   1. 送信元 IP が「社内ネットワークか」の判定（device-ownership-core）
 *   2. プロキシチェーン（x-forwarded-for）から**信頼できる**クライアント IP を
 *      取り出すこと
 *
 * ライブラリを入れない（ロックファイル凍結）ので手書きだが、手書き実装が
 * 現場で壊れる箇所は決まっているので、そこを最初から潰してある:
 *
 * - **IPv4-mapped IPv6**（`::ffff:192.168.50.7`）。デュアルスタック待ち受けの
 *   Node は日常的にこの形を返す。素朴な実装は「v6 だから v4 の CIDR には
 *   マッチしない」と答えて社内判定を落とす。ここでは比較前に v4 へ畳む。
 * - **先頭ゼロ**。`010.0.0.1` を 8 進と解釈する処理系があるので、曖昧な表記は
 *   受け付けない（`0` 単独のみ許す）。
 * - **ゾーン ID / 角括弧 / 末尾ポート**（`fe80::1%eth0` `[::1]` `1.2.3.4:443`）。
 *   ヘッダやログから来る値には普通に混ざる。
 * - **x-forwarded-for の左端**。左端はクライアントが自由に書ける値で、認証や
 *   ネットワーク判定の材料にしてはいけない。→ clientIpFromForwardedFor 参照。
 *
 * 方針: **例外を投げない**。不正な入力は null / false を返す。ヘッダ由来の値を
 * 扱うので、想定外の文字列で認証経路が落ちてはいけない。
 */

export type IpVersion = 4 | 6;

export interface ParsedIp {
  /** ネットワークバイトオーダ。v4 = 4 バイト / v6 = 16 バイト */
  bytes: Uint8Array;
  version: IpVersion;
}

export interface ParsedCidr extends ParsedIp {
  /** プレフィクス長。v4 = 0..32 / v6 = 0..128 */
  prefix: number;
}

/** 角括弧・ゾーン ID・末尾ポートを剥がす。 */
function stripHostDecoration(input: string): string {
  let value = input.trim();
  if (!value) return "";

  // [::1] / [::1]:443
  if (value.startsWith("[")) {
    const close = value.indexOf("]");
    if (close < 0) return "";
    value = value.slice(1, close);
  } else {
    // 1.2.3.4:443 — コロンが 1 個だけなら v6 ではありえないのでポートとみなす
    const first = value.indexOf(":");
    if (first >= 0 && first === value.lastIndexOf(":") && value.includes(".")) {
      value = value.slice(0, first);
    }
  }

  // fe80::1%eth0
  const zone = value.indexOf("%");
  if (zone >= 0) value = value.slice(0, zone);

  return value.trim();
}

function parseIpv4Bytes(value: string): Uint8Array | null {
  const parts = value.split(".");
  if (parts.length !== 4) return null;
  const bytes = new Uint8Array(4);
  for (let i = 0; i < 4; i += 1) {
    const part = parts[i];
    if (!part || part.length > 3) return null;
    if (!/^[0-9]+$/.test(part)) return null;
    // 先頭ゼロは 8 進と誤読される表記なので拒否（"0" 単独のみ許す）
    if (part.length > 1 && part.startsWith("0")) return null;
    const n = Number(part);
    if (n > 255) return null;
    bytes[i] = n;
  }
  return bytes;
}

function parseIpv6Bytes(value: string): Uint8Array | null {
  if (!value.includes(":")) return null;
  // "::" は 1 回まで
  const doubleColon = value.indexOf("::");
  if (doubleColon >= 0 && value.indexOf("::", doubleColon + 1) >= 0)
    return null;

  const headRaw = doubleColon >= 0 ? value.slice(0, doubleColon) : value;
  const tailRaw = doubleColon >= 0 ? value.slice(doubleColon + 2) : null;

  const splitGroups = (part: string): string[] =>
    part === "" ? [] : part.split(":");

  const head = splitGroups(headRaw);
  const tail = tailRaw === null ? [] : splitGroups(tailRaw);
  if (head.includes("") || tail.includes("")) return null;

  /** 1 グループを 16bit 値へ。末尾埋め込み IPv4 は 2 グループ分になる。 */
  const expand = (group: string, isLast: boolean): number[] | null => {
    if (group.includes(".")) {
      // 末尾埋め込み IPv4（::ffff:192.168.0.1）は最後の要素にしか置けない
      if (!isLast) return null;
      const v4 = parseIpv4Bytes(group);
      if (!v4) return null;
      return [
        ((v4[0] as number) << 8) | (v4[1] as number),
        ((v4[2] as number) << 8) | (v4[3] as number),
      ];
    }
    if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return null;
    return [Number.parseInt(group, 16)];
  };

  const headGroups: number[] = [];
  for (let i = 0; i < head.length; i += 1) {
    const expanded = expand(
      head[i] as string,
      tail.length === 0 && tailRaw === null && i === head.length - 1,
    );
    if (!expanded) return null;
    headGroups.push(...expanded);
  }
  const tailGroups: number[] = [];
  for (let i = 0; i < tail.length; i += 1) {
    const expanded = expand(tail[i] as string, i === tail.length - 1);
    if (!expanded) return null;
    tailGroups.push(...expanded);
  }

  const total = headGroups.length + tailGroups.length;
  if (doubleColon >= 0) {
    if (total > 7) return null; // "::" は最低 1 グループ分を埋める
  } else if (total !== 8) {
    return null;
  }

  const all = [
    ...headGroups,
    ...new Array<number>(8 - total).fill(0),
    ...tailGroups,
  ];
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 8; i += 1) {
    bytes[i * 2] = (all[i] as number) >> 8;
    bytes[i * 2 + 1] = (all[i] as number) & 0xff;
  }
  return bytes;
}

/** IPv4-mapped IPv6（::ffff:a.b.c.d）か。 */
function isV4Mapped(bytes: Uint8Array): boolean {
  if (bytes.length !== 16) return false;
  for (let i = 0; i < 10; i += 1) if (bytes[i] !== 0) return false;
  return bytes[10] === 0xff && bytes[11] === 0xff;
}

/**
 * 比較に使う形へ畳む。IPv4-mapped IPv6 は IPv4 として扱う
 * （デュアルスタックの Node が返す `::ffff:192.168.50.7` を
 * `192.168.50.0/24` に正しくマッチさせるため）。
 */
function foldToComparable(parsed: ParsedIp): ParsedIp {
  if (parsed.version === 6 && isV4Mapped(parsed.bytes)) {
    return { bytes: parsed.bytes.slice(12), version: 4 };
  }
  return parsed;
}

/** IP 文字列を解析する。解析できなければ null（例外は投げない）。 */
export function parseIp(value: unknown): ParsedIp | null {
  if (typeof value !== "string") return null;
  const host = stripHostDecoration(value);
  if (!host) return null;
  if (host.includes(":")) {
    const bytes = parseIpv6Bytes(host);
    return bytes ? { bytes, version: 6 } : null;
  }
  const bytes = parseIpv4Bytes(host);
  return bytes ? { bytes, version: 4 } : null;
}

function formatIpv4(bytes: Uint8Array): string {
  return `${bytes[0]}.${bytes[1]}.${bytes[2]}.${bytes[3]}`;
}

function formatIpv6(bytes: Uint8Array): string {
  const groups: number[] = [];
  for (let i = 0; i < 8; i += 1) {
    groups.push(((bytes[i * 2] as number) << 8) | (bytes[i * 2 + 1] as number));
  }
  // 最長のゼロ連（2 個以上）を :: に畳む
  let bestStart = -1;
  let bestLen = 0;
  let start = -1;
  for (let i = 0; i <= 8; i += 1) {
    if (i < 8 && groups[i] === 0) {
      if (start < 0) start = i;
    } else if (start >= 0) {
      const len = i - start;
      if (len > bestLen) {
        bestLen = len;
        bestStart = start;
      }
      start = -1;
    }
  }
  const hex = groups.map((g) => g.toString(16));
  if (bestLen < 2) return hex.join(":");
  const head = hex.slice(0, bestStart).join(":");
  const tail = hex.slice(bestStart + bestLen).join(":");
  return `${head}::${tail}`;
}

/**
 * 保存・表示用の正規形。IPv4-mapped IPv6 はドット表記へ畳むので、
 * 同じ端末が待ち受け方式の違いで 2 通りに記録されることを防ぐ。
 */
export function normalizeIp(value: unknown): string | null {
  const parsed = parseIp(value);
  if (!parsed) return null;
  const folded = foldToComparable(parsed);
  return folded.version === 4
    ? formatIpv4(folded.bytes)
    : formatIpv6(folded.bytes);
}

/** `10.0.0.0/8` 形式を解析する。`/` 無しはホストルート（/32・/128）。 */
export function parseCidr(value: unknown): ParsedCidr | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const slash = trimmed.lastIndexOf("/");
  const addrPart = slash >= 0 ? trimmed.slice(0, slash) : trimmed;
  const prefixPart = slash >= 0 ? trimmed.slice(slash + 1) : null;

  const parsed = parseIp(addrPart);
  if (!parsed) return null;
  const folded = foldToComparable(parsed);
  const maxPrefix = folded.version === 4 ? 32 : 128;

  if (prefixPart === null) {
    return { ...folded, prefix: maxPrefix };
  }
  if (!/^[0-9]{1,3}$/.test(prefixPart)) return null;
  const prefix = Number(prefixPart);
  if (prefix > maxPrefix) return null;
  return { ...folded, prefix };
}

/** IP が CIDR の中か。版が違えば常に false（畳んだ後で判定する）。 */
export function ipInCidr(ip: unknown, cidr: unknown): boolean {
  const parsedIp = parseIp(ip);
  const parsedCidr = parseCidr(cidr);
  if (!parsedIp || !parsedCidr) return false;
  const target = foldToComparable(parsedIp);
  if (target.version !== parsedCidr.version) return false;

  const fullBytes = parsedCidr.prefix >> 3;
  for (let i = 0; i < fullBytes; i += 1) {
    if (target.bytes[i] !== parsedCidr.bytes[i]) return false;
  }
  const remainder = parsedCidr.prefix & 7;
  if (remainder === 0) return true;
  const mask = (0xff << (8 - remainder)) & 0xff;
  return (
    ((target.bytes[fullBytes] as number) & mask) ===
    ((parsedCidr.bytes[fullBytes] as number) & mask)
  );
}

/** どれか 1 つの CIDR に入れば true。空リストは常に false。 */
export function ipInAnyCidr(ip: unknown, cidrs: readonly unknown[]): boolean {
  if (!Array.isArray(cidrs)) return false;
  for (const cidr of cidrs) {
    if (ipInCidr(ip, cidr)) return true;
  }
  return false;
}

/**
 * env 文字列（カンマ・空白・改行区切り）を CIDR リストへ。
 * 解析できない要素は黙って落とす — 設定ミス 1 個で判定全体を止めない。
 */
export function parseCidrList(value: unknown): string[] {
  if (typeof value !== "string") return [];
  return value
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && parseCidr(item) !== null);
}

/**
 * x-forwarded-for から**クライアント IP**を取り出す。
 *
 * XFF は各プロキシが「自分が受け取った相手の IP」を**追記**していくので、
 * 左端＝クライアントが自称した値（偽装自由）、右端＝自分に一番近い信頼できる
 * プロキシが観測した値（偽装不可）になる。よって **左端を採ってはいけない**。
 *
 * trustedHops = 自分の前に居る「XFF に追記するプロキシ」の数。
 *   0 → 右端（最も近いプロキシが観測した値）
 *   n → 右から n+1 番目
 * 実運用ではまず 0 で入れて、記録された生チェーン（ip_chain）を見てから
 * 実際の段数へ合わせる。要素数が足りないときは左端で頭打ちにする
 * （それ以上遡れないので、取れる中で最もクライアントに近い値）。
 */
export function clientIpFromForwardedFor(
  xff: unknown,
  trustedHops = 0,
): string | null {
  if (typeof xff !== "string" || !xff.trim()) return null;
  const hops =
    typeof trustedHops === "number" && Number.isFinite(trustedHops)
      ? Math.max(0, Math.floor(trustedHops))
      : 0;
  const parts = xff.split(",").map((part) => part.trim());
  const index = Math.max(0, parts.length - 1 - hops);
  return normalizeIp(parts[index]);
}
