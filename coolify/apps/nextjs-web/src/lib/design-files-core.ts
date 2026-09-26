/**
 * design-files-core.ts — 設計図の版まわりの判定規則（純関数・唯一の定義元）。
 *
 * 版は **(製品 × 受注元)** の系列で育つ（番号だけは製品の通し番号 — nextDesignVersion）。同じ製品でも顧客ごとに図面が別々に
 * 育つので、顧客 A の v3 と顧客 B の v1 が同居する。`customerBpId = null` の
 * 系列は「汎用」で、顧客専用の図面が無いときのフォールバック。
 *
 * この優先規則（顧客一致 → 汎用）は製品工程ルートの `pickDefaultRoute`
 * （lib/product-routes-core.ts）と**同じ**。「製品 × 顧客」で枝分かれする
 * ものが 2 通りの読み方を持つと、どちらが効いているのか誰も判らなくなる。
 *
 * サーバー・クライアントの両方から使うので DB にも React にも触らない。
 */

import type { Tr } from "./i18n";

export type DesignFileRole = "PREVIEW" | "BLUEPRINT" | "MODEL" | "REFERENCE";

/** 版の状態。書類と同じ「下書き → (承認) → 確定」。 */
export type DesignVersionStatus =
  | "DRAFT"
  | "REQUESTED"
  | "CONFIRMED"
  | "REJECTED";

export const DESIGN_VERSION_STATUSES: readonly DesignVersionStatus[] = [
  "DRAFT",
  "REQUESTED",
  "CONFIRMED",
  "REJECTED",
];

/**
 * 図面の表題欄の項目（design_versions.title_block のキー）。唯一の定義元。
 * 図脳 SXF を読むと lib/sxf-core.ts の表題欄の項目からここへ写す。
 * 並びは画面に出す順。
 */
export const TITLE_BLOCK_FIELDS = [
  "productName",
  "drawingNumber",
  "toolNumber",
  "material",
  "surfaceTreatment",
  "flutes",
  "helix",
  "marking",
  "drawnAt",
] as const;
export type TitleBlockField = (typeof TITLE_BLOCK_FIELDS)[number];
export type TitleBlock = Partial<Record<TitleBlockField, string>>;

/** JSON 列 → 表題欄（知らないキー・文字列でない値は落とす）。 */
export function toTitleBlock(value: unknown): TitleBlock {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const out: TitleBlock = {};
  for (const f of TITLE_BLOCK_FIELDS) {
    const v = (value as Record<string, unknown>)[f];
    if (typeof v === "string" && v.trim() !== "") out[f] = v.trim();
  }
  return out;
}

/** 表題欄 → JSON 列（空なら null — 「何も書かれていない」を空オブジェクトで持たない）。 */
export function titleBlockJson(tb: TitleBlock): Record<string, string> | null {
  const clean = toTitleBlock(tb);
  return Object.keys(clean).length > 0 ? clean : null;
}

/** 版の出どころ。列は持たず、依頼 id の有無から導く。 */
export type DesignFileSource = "REQUEST" | "MANUAL";

export interface DesignFileLike {
  id: string;
  version: number;
  isLatest: boolean;
  role: DesignFileRole;
  /** null = 汎用。 */
  customerBpId: string | null;
  /** null = 設計依頼を経ていない（手動登録）。 */
  designRequestId: string | null;
}

/**
 * 依頼から出来た版か、手で足した版か。
 *
 * **列を増やさず導く。** 依頼を経た版は必ず design_request_id を持ち、
 * 経ていない版は持たない — 1 対 1 なので、別に持たせると必ずずれる。
 */
export function designFileSource(f: {
  designRequestId: string | null;
}): DesignFileSource {
  return f.designRequestId == null ? "MANUAL" : "REQUEST";
}

export function designFileSourceLabel(
  source: DesignFileSource,
  tr: Tr,
): string {
  return tr(`enum.DESIGN_FILE_SOURCE_LABEL.${source}`);
}

export const DESIGN_FILE_SOURCE_COLOR: Record<DesignFileSource, string> = {
  REQUEST: "blue",
  MANUAL: "gray",
};

/** 系列のキー。null（汎用）と空文字を混同しないための 1 箇所。 */
export function seriesKey(customerBpId: string | null): string {
  return customerBpId ?? "";
}

/** 同じ系列か（null 同士は同じ系列）。 */
export function sameSeries(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  return (a ?? null) === (b ?? null);
}

/** 版のキー（系列 × 版番号）。同じ版のファイルは role が違うだけで運命を共にする。 */
export function versionKey(f: {
  customerBpId: string | null;
  version: number;
}): string {
  return `${seriesKey(f.customerBpId)}#${f.version}`;
}

/**
 * 次の版番号 — **製品ごとの通し番号**（受注元の系列をまたいで増える）。版が無ければ 1。
 *
 * 以前は系列（製品 × 受注元）ごとに数えていたので、顧客専用の系列を作ると
 * 同じ製品に v1 が何本も並び、「v1」がどの図面か言えなかった。番号だけは製品で
 * 1 本にし、系列の区別（最新図面・顧客一致 → 汎用の優先）はそのまま残す。
 * そのため系列の中では番号が飛ぶ（汎用 v1・顧客 A v2・汎用 v3）ことがある。
 */
export function nextDesignVersion(
  versions: readonly { version: number }[],
): number {
  return versions.length === 0
    ? 1
    : Math.max(...versions.map((v) => v.version)) + 1;
}

/**
 * どの系列を使うか — **顧客一致 → 汎用**。
 *
 * 他の顧客専用の系列へは決して落ちない。落としてしまうと、顧客 B の指示書に
 * 顧客 A の図面が黙って出る（気づかないまま違う物を作る）。該当が無ければ
 * null を返し、呼び出し側に「図面が無い」と言わせる。
 */
export function resolveSeriesCustomer(
  files: readonly DesignFileLike[],
  customerBpId: string | null,
): string | null | undefined {
  if (customerBpId != null) {
    if (files.some((f) => f.customerBpId === customerBpId)) return customerBpId;
  }
  if (files.some((f) => f.customerBpId == null)) return null;
  return undefined; // 該当なし
}

/**
 * その顧客に対して効いている最新版のファイル（役割で 1 枚）。
 * 見つからなければ null。
 */
export function resolveLatestFile(
  files: readonly DesignFileLike[],
  customerBpId: string | null,
  role: DesignFileRole,
): DesignFileLike | null {
  const series = resolveSeriesCustomer(files, customerBpId);
  if (series === undefined) return null;
  return (
    files.find(
      (f) =>
        sameSeries(f.customerBpId, series) && f.isLatest && f.role === role,
    ) ?? null
  );
}

export interface DesignSeries<T extends DesignFileLike> {
  customerBpId: string | null;
  /** version 降順 → 役割順（プレビュー → 図面データ → 参考資料）。 */
  files: T[];
  latestVersion: number;
}

const ROLE_ORDER: Record<DesignFileRole, number> = {
  PREVIEW: 0,
  BLUEPRINT: 1,
  MODEL: 2,
  REFERENCE: 3,
};

/** 版の中のファイルの並び（プレビュー → 2D → 3D → 参考資料）。 */
export function compareRole(a: DesignFileRole, b: DesignFileRole): number {
  return ROLE_ORDER[a] - ROLE_ORDER[b];
}

/**
 * 系列ごとにまとめる。汎用を先頭に、あとは版数の多い順
 * （よく使われている系列ほど上に出る）。
 */
export function groupBySeries<T extends DesignFileLike>(
  files: readonly T[],
): DesignSeries<T>[] {
  const byKey = new Map<string, DesignSeries<T>>();
  for (const f of files) {
    const key = seriesKey(f.customerBpId);
    let g = byKey.get(key);
    if (!g) {
      g = { customerBpId: f.customerBpId ?? null, files: [], latestVersion: 0 };
      byKey.set(key, g);
    }
    g.files.push(f);
    if (f.version > g.latestVersion) g.latestVersion = f.version;
  }
  for (const g of byKey.values()) {
    g.files.sort(
      (a, b) =>
        b.version - a.version || ROLE_ORDER[a.role] - ROLE_ORDER[b.role],
    );
  }
  return [...byKey.values()].sort((a, b) => {
    if (a.customerBpId == null) return -1;
    if (b.customerBpId == null) return 1;
    return b.latestVersion - a.latestVersion;
  });
}

/**
 * 版を編集してよいか — **確定前（下書き・差し戻し）だけ**。
 *
 * 書類と同じで、確定した版は動かない。指示書・製品マスタ・サムネイルは確定した
 * 版しか読まない（is_latest は確定で立つ）ので、確定後に中身が変わると
 * 「何を見て作ったか」が追えなくなる。承認依頼中も触らせない — 承認者が
 * 見ているものと、承認されるものが食い違う。
 */
export function isVersionEditable(status: DesignVersionStatus): boolean {
  return status === "DRAFT" || status === "REJECTED";
}

/** 確定（承認フローがあれば承認依頼）へ進めてよいか。編集できる状態と同じ。 */
export function canSubmitVersion(status: DesignVersionStatus): boolean {
  return isVersionEditable(status);
}

/**
 * 版そのものを消してよいか — 確定前だけ。確定した版は指示書や改訂依頼が指して
 * いるかもしれず、番号の欠けた系列は「どこへ行ったのか」を説明できない。
 */
export function canDeleteVersion(status: DesignVersionStatus): boolean {
  return isVersionEditable(status);
}

/** 編集できない理由（画面にそのまま出す）。編集できるときは null。 */
export function describeVersionLock(
  status: DesignVersionStatus,
  tr: Tr,
): string | null {
  if (status === "CONFIRMED") {
    return tr("production.designFileActions.lockedConfirmed");
  }
  if (status === "REQUESTED") {
    return tr("production.designFileActions.lockedPendingApproval");
  }
  return null;
}

export const DESIGN_VERSION_STATUS_COLOR: Record<DesignVersionStatus, string> =
  {
    DRAFT: "gray",
    REQUESTED: "yellow",
    CONFIRMED: "green",
    REJECTED: "red",
  };

/** 版の選び方に要るもの。 */
export interface VersionPickLike {
  customerBpId: string | null;
  version: number;
  status: DesignVersionStatus;
  /** 確定した日時（ISO 文字列 / Date）。未確定は null。 */
  confirmedAt: string | Date | null;
}

/**
 * 製品 1 つにつき 1 つの仕様が要る読み手（指示書の素材候補・製品検索・外部 API・
 * 製品マスタの表示）が、どの版の仕様を使うか。**確定済みの版だけ**から:
 *
 *   1. 受注元が一致する系列の最新版
 *   2. 汎用系列の最新版
 *   3. それも無ければ、いちばん最後に確定した版（受注元を問わない）
 *
 * 1〜2 は図面の系列の優先規則（resolveSeriesCustomer）と同じ。3 は仕様の
 * 読み手だけの規則 — 図面と違い、製品の材種・寸法は顧客をまたいでもほぼ
 * 同じなので、何も出さないより最後に確定した値を出すほうが役に立つ。
 */
export function pickSpecVersion<T extends VersionPickLike>(
  versions: readonly T[],
  customerBpId: string | null = null,
): T | null {
  const confirmed = versions.filter((v) => v.status === "CONFIRMED");
  const latestOf = (series: string | null) =>
    confirmed
      .filter((v) => sameSeries(v.customerBpId, series))
      .sort((a, b) => b.version - a.version)[0] ?? null;
  if (customerBpId != null) {
    const hit = latestOf(customerBpId);
    if (hit) return hit;
  }
  const generic = latestOf(null);
  if (generic) return generic;
  const time = (v: T) =>
    v.confirmedAt == null ? 0 : new Date(v.confirmedAt).getTime();
  return (
    [...confirmed].sort(
      (a, b) => time(b) - time(a) || b.version - a.version,
    )[0] ?? null
  );
}

export interface VersionSeries<
  T extends { customerBpId: string | null; version: number },
> {
  customerBpId: string | null;
  /** 版の降順。 */
  versions: T[];
  latestVersion: number;
}

/**
 * 版を系列ごとにまとめる。汎用を先頭に、あとは版数の多い順（groupBySeries と
 * 同じ並び — 画面によって系列の順番が変わらないように）。
 */
export function groupVersionsBySeries<
  T extends { customerBpId: string | null; version: number },
>(versions: readonly T[]): VersionSeries<T>[] {
  const byKey = new Map<string, VersionSeries<T>>();
  for (const v of versions) {
    const key = seriesKey(v.customerBpId);
    let g = byKey.get(key);
    if (!g) {
      g = {
        customerBpId: v.customerBpId ?? null,
        versions: [],
        latestVersion: 0,
      };
      byKey.set(key, g);
    }
    g.versions.push(v);
    if (v.version > g.latestVersion) g.latestVersion = v.version;
  }
  for (const g of byKey.values()) {
    g.versions.sort((a, b) => b.version - a.version);
  }
  return [...byKey.values()].sort((a, b) => {
    if (a.customerBpId == null) return -1;
    if (b.customerBpId == null) return 1;
    return b.latestVersion - a.latestVersion;
  });
}

/**
 * 「いま見せたい 1 枚」を選ぶ — 最新版の プレビュー → 図面データ の順。
 *
 * 製品マスタ・設計依頼・指示書のサムネイルが**同じ 1 枚**を指すようにする
 * ための規則。画面ごとに別々に書くと、同じ版を見ているのに出てくる絵が
 * 違う、ということが起きる。
 *
 * 参考資料は選ばない — 部品図や寸法表が主図面の代わりに出ると、
 * 「これがこの製品の形だ」と誤解させる。
 */
export function pickThumbFile<
  T extends { isLatest: boolean; role: DesignFileRole },
>(files: readonly T[]): T | null {
  const latest = files.filter((f) => f.isLatest);
  return (
    latest.find((f) => f.role === "PREVIEW") ??
    latest.find((f) => f.role === "BLUEPRINT") ??
    null
  );
}
