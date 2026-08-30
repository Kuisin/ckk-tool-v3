/**
 * model.ts — 設計図 (PD06) のクライアント安全な型と定数。
 *
 * 版は **(製品 × 受注元)** ごとの系列で育つ。判定規則そのものは
 * `lib/design-files-core.ts`（純関数・試験あり）が唯一の定義元で、ここは
 * 画面が受け取る形だけを持つ。
 *
 * 設計依頼 (SA06) から分離した理由 — 依頼は「図面を作ってほしい」という
 * 起票で、図面はその成果物。1 つの依頼から出た版もあれば、依頼を経ずに
 * 取り込んだ版もあるので、図面の型が依頼の型に従属していると後者が
 * 表現できない。
 */

/**
 * 版の中での役割。1 版 = プレビュー 0..1 + 図面データ 1 + 参考資料 0..N。
 *
 * PREVIEW と BLUEPRINT を分けているのは用途が違うから — STL は人が形を
 * 確かめるためのもの、CAD は加工プログラムを起こす元データで、片方で
 * 代用できない。製品の「最新図面」は BLUEPRINT を指す。
 */
export type DesignFileRole = "PREVIEW" | "BLUEPRINT" | "REFERENCE";

export const DESIGN_FILE_ROLE_LABEL: Record<DesignFileRole, string> = {
  PREVIEW: "プレビュー",
  BLUEPRINT: "図面データ",
  REFERENCE: "参考資料",
};

export const DESIGN_FILE_ROLE_COLOR: Record<DesignFileRole, string> = {
  PREVIEW: "grape",
  BLUEPRINT: "blue",
  REFERENCE: "gray",
};

/**
 * 版 1 行（design_files + files の抜粋）。製品マスタ (MS24)・設計依頼 (SA26)・
 * 設計図 (PD06/PD26) の 3 画面が同じ形を読む。
 *
 * 製品の最新図面は `design_files.product_id` + `is_latest` が正で、
 * `products` 側に列は無い。
 */
export interface ProductDesignFile {
  id: string;
  version: number;
  isLatest: boolean;
  role: DesignFileRole;
  mimeType: string;
  filename: string;
  /** 生成元の設計依頼（DSG-…）。手動登録の版は null。 */
  requestNumber: string | null;
  /** 依頼 id そのもの。「依頼 / 手動」の別はこれの有無から導く。 */
  designRequestId: string | null;
  /** 版系列の軸。null = 汎用（どの顧客の指示書からも使える）。 */
  customerBpId: string | null;
  customerName: string | null;
  /** 指示書がこの版を指しているか。true なら編集・削除できない。 */
  usedByWorkOrder: boolean;
  notes: string | null;
  createdAt: string;
}

/**
 * 一覧 (PD06) の 1 行 = **1 系列**（製品 × 受注元）。版そのものではない。
 *
 * 「どの製品の、どの受注元向けの図面が、いま何版か」を探す画面なので、
 * 版を 1 行ずつ並べると同じ製品が何行も出て探せなくなる。版の並びは
 * 系列を開いた先 (PD26) で見る。
 */
export interface DesignFileSeriesRow {
  /** 系列キー。`${productId}:${customerBpId ?? ""}`。 */
  key: string;
  productId: number;
  productLabel: string;
  /** null = 汎用。 */
  customerBpId: string | null;
  customerName: string | null;
  latestVersion: number;
  /** 最新版に揃っている役割（欠けているものが判る）。 */
  latestRoles: DesignFileRole[];
  /** 系列内に依頼由来の版があるか（無ければすべて手動登録）。 */
  hasRequestSourced: boolean;
  /** 系列の版数。 */
  versionCount: number;
  /** 系列でいちばん新しい版の登録日時。 */
  updatedAt: string;
}
