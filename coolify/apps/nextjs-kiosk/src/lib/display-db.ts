/**
 * display-db.ts — ディスプレイが業務データを読むための入口。**読み取り専用**。
 *
 * 壁のテレビは誰でも見える場所にあり、誰も見張っていない。そこに繋がる
 * コードが業務データを書き換えられる必要は一切ないので、**書ける手段を
 * 最初から持たせない**。
 *
 * 守り方は 2 軸あって、どちらも「うっかり」を型で止めることを狙っている:
 *
 *   ① **操作の絞り込み** — 公開するのは find 系・count・集計だけ。
 *      create / update / delete / upsert は**この型に存在しない**ので、
 *      新しい画面がうっかり書こうとすると `tsc` が落ちる。実行時に例外を
 *      投げる方式より強い（レビューやテストを待たずに、書いた瞬間に判る）。
 *   ② **表の絞り込み** — ここに並べた表しか触れない。将来の画面が
 *      `users` や `login_attempts` を読もうとしても、まずこの一覧に足す
 *      必要があり、その差分がレビューに出る。
 *
 * **例外は「自分の生存」だけ** — last_seen_at とトークンの発行は
 * display-auth.ts / setup ルートが通常の `prisma` で行う。あれは業務データ
 * ではなく端末自身の台帳で、書けないと死活が分からなくなる。
 * 仕様（デバイス API は heartbeat 以外 read-only）もその線で引いてある。
 *
 * ※ ここは DB のロールを分けているわけではない。役割の分離はアプリ層で、
 *   より深く守るなら `display_ro` ロールを切って接続を分ける手はあるが、
 *   現状は「書くコードが書けない」ことで担保している。
 */

import { prisma } from "./db";

/** 公開する読み取り操作。ここに無いものは触れない。 */
const READ_OPERATIONS = [
  "findMany",
  "findUnique",
  "findFirst",
  "count",
  "aggregate",
  "groupBy",
] as const;

type ReadOperation = (typeof READ_OPERATIONS)[number];

/** 読み取り操作だけを残した型（書き込みメソッドは型として存在しない）。 */
type ReadOnlyDelegate<T> = Pick<T, Extract<keyof T, ReadOperation>>;

type PrismaLike = typeof prisma;

/**
 * モデル 1 つぶんの読み取り専用ファサード。
 *
 * `prisma` は遅延プロキシで、**プロパティに触った時点でクライアントを作る**
 * （`next build` のページデータ収集は DATABASE_URL 無しで走るので、
 * import 時に触ってはいけない）。だから委譲は呼び出しの瞬間に行う。
 */
function readOnly<K extends keyof PrismaLike>(
  model: K,
): ReadOnlyDelegate<PrismaLike[K]> {
  const facade: Record<string, unknown> = {};
  for (const op of READ_OPERATIONS) {
    facade[op] = (...args: unknown[]) => {
      const delegate = prisma[model] as unknown as Record<
        string,
        (...a: unknown[]) => unknown
      >;
      return delegate[op](...args);
    };
  }
  return facade as ReadOnlyDelegate<PrismaLike[K]>;
}

/**
 * ディスプレイの画面が読んでよい表。
 *
 * **個人データを持つ表は載せない** — users / login_attempts / kiosk_cards
 * などは、壁に映してよい情報ではないし、映す理由も無い。担当者名のように
 * 人の名前が要る場面は、指示書の計画（work_order_step_plans）越しに
 * 限定して引く。
 */
export const displayDb = {
  // 生産
  workOrder: readOnly("workOrder"),
  workOrderStep: readOnly("workOrderStep"),
  workOrderStepPlan: readOnly("workOrderStepPlan"),
  processStepCatalog: readOnly("processStepCatalog"),
  defectRecord: readOnly("defectRecord"),
  defectType: readOnly("defectType"),
  inspectionRecord: readOnly("inspectionRecord"),
  // 販売・出荷
  orderLine: readOnly("orderLine"),
  orderAcceptance: readOnly("orderAcceptance"),
  deliveryOrder: readOnly("deliveryOrder"),
  deliveryOrderItem: readOnly("deliveryOrderItem"),
  // マスタ
  product: readOnly("product"),
  plant: readOnly("plant"),
  businessPartner: readOnly("businessPartner"),
} as const;

export type DisplayDb = typeof displayDb;
