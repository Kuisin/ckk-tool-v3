/**
 * design-files-core.ts — 設計図の版まわりの判定規則（純関数・唯一の定義元）。
 *
 * 版は **(製品 × 受注元)** ごとに数える。同じ製品でも顧客ごとに図面が別々に
 * 育つので、顧客 A の v3 と顧客 B の v1 が同居する。`customerBpId = null` の
 * 系列は「汎用」で、顧客専用の図面が無いときのフォールバック。
 *
 * この優先規則（顧客一致 → 汎用）は製品工程ルートの `pickDefaultRoute`
 * （lib/product-routes-core.ts）と**同じ**。「製品 × 顧客」で枝分かれする
 * ものが 2 通りの読み方を持つと、どちらが効いているのか誰も判らなくなる。
 *
 * サーバー・クライアントの両方から使うので DB にも React にも触らない。
 */

export type DesignFileRole = "PREVIEW" | "BLUEPRINT" | "REFERENCE";

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

export const DESIGN_FILE_SOURCE_LABEL: Record<DesignFileSource, string> = {
  REQUEST: "依頼",
  MANUAL: "手動",
};

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

/** その系列の次の版番号。系列が空なら 1。 */
export function nextDesignVersion(
  files: readonly DesignFileLike[],
  customerBpId: string | null,
): number {
  const versions = files
    .filter((f) => sameSeries(f.customerBpId, customerBpId))
    .map((f) => f.version);
  return versions.length === 0 ? 1 : Math.max(...versions) + 1;
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
  REFERENCE: 2,
};

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
 * 版を編集・削除してよいか。
 *
 * **使われた版は動かせない。** 指示書がその版を指している = その図面で物を
 * 作った（あるいは作る）ということなので、あとから中身や番号が変わると
 * 「何を見て作ったか」が追えなくなる。承認済みの書類を書き換えないのと同じ。
 *
 * 依頼から出来た版を消せないのは別の理由 — それは完了した設計依頼の成果物
 * そのもので、消すと依頼側が成果物を失う。中身のメモは直してよい。
 */
export function canEditDesignFile(f: { usedByWorkOrder: boolean }): boolean {
  return !f.usedByWorkOrder;
}

export function canDeleteDesignFile(f: {
  usedByWorkOrder: boolean;
  designRequestId: string | null;
}): boolean {
  return !f.usedByWorkOrder && designFileSource(f) === "MANUAL";
}

/** 編集できない理由（画面にそのまま出す）。編集できるときは null。 */
export function describeLock(f: {
  usedByWorkOrder: boolean;
  designRequestId: string | null;
}): string | null {
  if (f.usedByWorkOrder) return "指示書で使用中のため変更できません";
  if (designFileSource(f) === "REQUEST") {
    return "設計依頼の成果物なので削除できません（メモは編集できます）";
  }
  return null;
}
