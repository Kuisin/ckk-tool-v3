/**
 * status-map.ts — Status enum → color/label registry（**素の TypeScript**）。
 *
 * `_specs/design.md` §9 と 1:1（entity / status / color / ja・en・zh のラベル。
 * 訳語の正は `_specs/i18n-glossary.md` §3.12）。
 *
 * **ここが `"use client"` ではないことが要点。** 以前この表と `statusLabel()` /
 * `statusOptions()` は `components/ui/StatusBadge.tsx`（`"use client"`）に
 * 同居していた。`"use client"` モジュールの**すべての export** はサーバから
 * 見るとクライアント参照（proxy）になるので、サーバ側（Route Handler・
 * `server-only` の帳票組み立て）から `statusLabel()` を**呼ぶ**と本番ビルドで
 *   Attempted to call statusLabel() from the server but statusLabel is on the client.
 * を投げて 500 になる。dev では通ってしまうので、本番だけ壊れる。
 * 実際に フォーム回答の PDF（`lib/form-response-pdf.ts`）と Excel 書き出し
 * （`api/forms/[code]/responses/export`）がこれで落ちていた。
 *
 * したがって:
 *   - 値（`STATUS_MAPS` / `statusLabel` / `statusOptions`）はこのファイルから import する
 *   - `<StatusBadge>` を**描画**したいときだけ `components/ui/StatusBadge.tsx`
 *
 * この約束は `status-map.test.ts` が見張る。
 */

import type { Locale } from "@/lib/i18n";

export interface StatusDef {
  label: Record<Locale, string>;
  color: string;
}

export type StatusMap = Record<string, StatusDef>;

/** Per-entity status → { color, label } maps. Keys match DB enum values. */
export const STATUS_MAPS = {
  Estimate: {
    DRAFT: { label: { ja: "下書き", en: "Draft", zh: "草稿" }, color: "gray" },
    CONFIRMED: {
      label: { ja: "確定", en: "Confirmed", zh: "已确定" },
      color: "blue",
    },
    REGISTERED: {
      label: { ja: "価格表登録済", en: "Registered", zh: "已登记价格表" },
      color: "green",
    },
  },
  Quote: {
    DRAFT: { label: { ja: "下書き", en: "Draft", zh: "草稿" }, color: "gray" },
    ISSUED: {
      label: { ja: "発行済", en: "Issued", zh: "已发行" },
      color: "blue",
    },
    ACCEPTED: {
      label: { ja: "受諾済", en: "Accepted", zh: "已接受" },
      color: "green",
    },
    REJECTED: {
      label: { ja: "却下", en: "Rejected", zh: "已拒绝" },
      color: "red",
    },
    EXPIRED: {
      label: { ja: "期限切れ", en: "Expired", zh: "已过期" },
      color: "orange",
    },
  },
  OrderAcceptance: {
    PENDING: {
      label: { ja: "照合中", en: "Matching", zh: "核对中" },
      color: "yellow",
    },
    PRICE_DIFF: {
      label: { ja: "価格差異", en: "Price mismatch", zh: "价格差异" },
      color: "orange",
    },
    CONFIRMED: {
      label: { ja: "確定", en: "Confirmed", zh: "已确定" },
      color: "green",
    },
  },
  /** 注文請書 intake（app.order_acceptances — 取込→下書き→承認→確定）。 */
  OrderAcceptanceIntake: {
    IMPORT: {
      label: { ja: "取込中", en: "Importing", zh: "导入中" },
      color: "gray",
    },
    DRAFT: { label: { ja: "下書き", en: "Draft", zh: "草稿" }, color: "blue" },
    REQUESTED: {
      label: { ja: "承認依頼中", en: "Pending approval", zh: "审批中" },
      color: "yellow",
    },
    APPROVED: {
      label: { ja: "承認済", en: "Approved", zh: "已批准" },
      color: "green",
    },
    COMPLETED: {
      label: { ja: "確定", en: "Confirmed", zh: "已确定" },
      color: "teal",
    },
    ARCHIVED: {
      label: { ja: "アーカイブ", en: "Archived", zh: "已归档" },
      color: "dark",
    },
    CANCELLED: {
      label: { ja: "キャンセル", en: "Cancelled", zh: "已取消" },
      color: "red",
    },
  },
  MaterialPurchaseOrder: {
    DRAFT: { label: { ja: "下書き", en: "Draft", zh: "草稿" }, color: "gray" },
    REQUESTED: {
      label: { ja: "承認依頼中", en: "Pending approval", zh: "审批中" },
      color: "yellow",
    },
    APPROVED: {
      label: { ja: "承認済", en: "Approved", zh: "已批准" },
      color: "blue",
    },
    ORDERED: {
      label: { ja: "発注済", en: "Ordered", zh: "已下单" },
      color: "violet",
    },
    COMPLETED: {
      label: { ja: "入荷完了", en: "Received", zh: "已入库" },
      color: "green",
    },
    CANCELLED: {
      label: { ja: "キャンセル", en: "Cancelled", zh: "已取消" },
      color: "red",
    },
  },
  /** 購買依頼 (app.purchase_requests — 発注書の前段, PU01)。 */
  // フォーム (CM02)。受付中/受付終了は status ではなく日時から導出するので
  // ここには置かない（lib/form-schema.ts formAvailability の AVAILABILITY_LABEL）。
  Form: {
    DRAFT: { label: { ja: "下書き", en: "Draft", zh: "草稿" }, color: "gray" },
    PUBLISHED: {
      label: { ja: "公開中", en: "Published", zh: "已发布" },
      color: "blue",
    },
    ARCHIVED: {
      label: { ja: "アーカイブ", en: "Archived", zh: "已归档" },
      color: "dark",
    },
  },
  // 社内文書 (CM03)。DRAFT は「公開版より新しい編集がある」も含む。
  InternalPage: {
    DRAFT: { label: { ja: "下書き", en: "Draft", zh: "草稿" }, color: "gray" },
    PENDING: {
      label: {
        ja: "公開承認依頼中",
        en: "Pending publish approval",
        zh: "待发布审批",
      },
      color: "yellow",
    },
    PUBLISHED: {
      label: { ja: "公開中", en: "Published", zh: "已发布" },
      color: "green",
    },
    ARCHIVED: {
      label: { ja: "アーカイブ", en: "Archived", zh: "已归档" },
      color: "dark",
    },
  },
  FormResponse: {
    DRAFT: { label: { ja: "下書き", en: "Draft", zh: "草稿" }, color: "gray" },
    SUBMITTED: {
      label: { ja: "提出済", en: "Submitted", zh: "已提交" },
      color: "blue",
    },
    REQUESTED: {
      label: { ja: "承認依頼中", en: "Pending approval", zh: "审批中" },
      color: "yellow",
    },
    APPROVED: {
      label: { ja: "承認済", en: "Approved", zh: "已批准" },
      color: "green",
    },
    REJECTED: {
      label: { ja: "差し戻し", en: "Sent back", zh: "已退回" },
      color: "red",
    },
  },
  PurchaseRequest: {
    DRAFT: { label: { ja: "下書き", en: "Draft", zh: "草稿" }, color: "gray" },
    REQUESTED: {
      label: { ja: "承認依頼中", en: "Pending approval", zh: "审批中" },
      color: "yellow",
    },
    APPROVED: {
      label: { ja: "承認済", en: "Approved", zh: "已批准" },
      color: "blue",
    },
    REJECTED: {
      label: { ja: "差し戻し", en: "Sent back", zh: "已退回" },
      color: "red",
    },
    ORDERED: {
      label: { ja: "発注済", en: "Ordered", zh: "已下单" },
      color: "violet",
    },
    CANCELLED: {
      label: { ja: "キャンセル", en: "Cancelled", zh: "已取消" },
      color: "red",
    },
  },
  OrderLine: {
    DRAFT: { label: { ja: "下書き", en: "Draft", zh: "草稿" }, color: "gray" },
    CONFIRMED: {
      label: { ja: "確定", en: "Confirmed", zh: "已确定" },
      color: "blue",
    },
    IN_PRODUCTION: {
      label: { ja: "製造中", en: "In production", zh: "生产中" },
      color: "violet",
    },
    PARTIAL_SHIPPED: {
      label: { ja: "一部出荷", en: "Partially shipped", zh: "部分出货" },
      color: "orange",
    },
    SHIPPED: {
      label: { ja: "出荷済", en: "Shipped", zh: "已出货" },
      color: "green",
    },
    CANCELLED: {
      label: { ja: "キャンセル", en: "Cancelled", zh: "已取消" },
      color: "red",
    },
  },
  WorkOrder: {
    DRAFT: { label: { ja: "下書き", en: "Draft", zh: "草稿" }, color: "gray" },
    PENDING_APPROVAL: {
      label: { ja: "承認依頼中", en: "Pending approval", zh: "审批中" },
      color: "yellow",
    },
    APPROVED: {
      label: { ja: "承認済", en: "Approved", zh: "已批准" },
      color: "blue",
    },
    IN_PROGRESS: {
      label: { ja: "進行中", en: "In progress", zh: "进行中" },
      color: "violet",
    },
    COMPLETED: {
      label: { ja: "完了", en: "Completed", zh: "已完成" },
      color: "green",
    },
    CANCELLED: {
      label: { ja: "キャンセル", en: "Cancelled", zh: "已取消" },
      color: "red",
    },
  },
  // 段数は承認設定 (MS0B) が書類種別ごとに決めるので、ここは局面だけを表す。
  // 何段目かは承認カード / Stepper が依頼のスナップショットから出す。
  WorkOrderApproval: {
    NONE: { label: { ja: "—", en: "—", zh: "—" }, color: "gray" },
    PENDING: {
      label: { ja: "承認依頼中", en: "Pending approval", zh: "审批中" },
      color: "yellow",
    },
    APPROVED: {
      label: { ja: "承認済", en: "Approved", zh: "已批准" },
      color: "green",
    },
    REJECTED: {
      label: { ja: "差し戻し", en: "Sent back", zh: "已退回" },
      color: "red",
    },
  },
  Step: {
    PENDING: {
      label: { ja: "未着手", en: "Not started", zh: "未开始" },
      color: "gray",
    },
    IN_PROGRESS: {
      label: { ja: "進行中", en: "In progress", zh: "进行中" },
      color: "blue",
    },
    COMPLETED: {
      label: { ja: "完了", en: "Completed", zh: "已完成" },
      color: "green",
    },
    CANCELLED: {
      label: { ja: "キャンセル", en: "Cancelled", zh: "已取消" },
      color: "red",
    },
  },
  DeliveryOrder: {
    DRAFT: { label: { ja: "下書き", en: "Draft", zh: "草稿" }, color: "gray" },
    CONFIRMED: {
      label: { ja: "確定", en: "Confirmed", zh: "已确定" },
      color: "blue",
    },
    SHIPPED: {
      label: { ja: "出荷済", en: "Shipped", zh: "已出货" },
      color: "green",
    },
  },
  DeliveryNote: {
    DRAFT: { label: { ja: "下書き", en: "Draft", zh: "草稿" }, color: "gray" },
    ISSUED: {
      label: { ja: "発行済", en: "Issued", zh: "已发行" },
      color: "blue",
    },
    DELIVERED: {
      label: { ja: "納品済", en: "Delivered", zh: "已交货" },
      color: "green",
    },
  },
  Invoice: {
    DRAFT: { label: { ja: "下書き", en: "Draft", zh: "草稿" }, color: "gray" },
    ISSUED: {
      label: { ja: "発行済", en: "Issued", zh: "已发行" },
      color: "blue",
    },
    SENT: {
      label: { ja: "送付済", en: "Sent", zh: "已寄送" },
      color: "violet",
    },
    PAID: { label: { ja: "支払済", en: "Paid", zh: "已付款" }, color: "green" },
  },
  InspectionRecord: {
    PENDING: {
      label: { ja: "未実施", en: "Not performed", zh: "未实施" },
      color: "gray",
    },
    PASS: { label: { ja: "合格", en: "Pass", zh: "合格" }, color: "green" },
    FAIL: { label: { ja: "不合格", en: "Fail", zh: "不合格" }, color: "red" },
    APPROVED: {
      label: { ja: "承認済", en: "Approved", zh: "已批准" },
      color: "teal",
    },
  },
  DesignRequest: {
    DRAFT: { label: { ja: "下書き", en: "Draft", zh: "草稿" }, color: "gray" },
    REQUESTED: {
      label: { ja: "承認依頼中", en: "Pending approval", zh: "审批中" },
      color: "yellow",
    },
    // 承認済・着手待ち。承認フロー導入前からある値で、意味を引き継いでいる。
    PENDING: {
      label: { ja: "未着手", en: "Not started", zh: "未开始" },
      color: "blue",
    },
    IN_PROGRESS: {
      label: { ja: "進行中", en: "In progress", zh: "进行中" },
      color: "violet",
    },
    COMPLETED: {
      label: { ja: "完了", en: "Completed", zh: "已完成" },
      color: "green",
    },
    REJECTED: {
      label: { ja: "差し戻し", en: "Sent back", zh: "已退回" },
      color: "red",
    },
    CANCELLED: {
      label: { ja: "キャンセル", en: "Cancelled", zh: "已取消" },
      color: "red",
    },
  },
  BillingClosing: {
    PENDING: {
      label: { ja: "未処理", en: "Unprocessed", zh: "未处理" },
      color: "gray",
    },
    PROCESSED: {
      label: { ja: "処理済", en: "Processed", zh: "已处理" },
      color: "blue",
    },
    EXPORTED: {
      label: { ja: "エクスポート済", en: "Exported", zh: "已导出" },
      color: "green",
    },
  },
  ApprovalRequest: {
    PENDING: {
      label: { ja: "承認依頼中", en: "Pending approval", zh: "审批中" },
      color: "yellow",
    },
    APPROVED: {
      label: { ja: "承認済", en: "Approved", zh: "已批准" },
      color: "green",
    },
    REJECTED: {
      label: { ja: "差し戻し", en: "Sent back", zh: "已退回" },
      color: "red",
    },
  },
  /** QRカード（共有端末 — app.kiosk_cards — SY08）。 */
  KioskCard: {
    UNASSIGNED: {
      label: { ja: "未割当", en: "Unassigned", zh: "未分配" },
      color: "gray",
    },
    ASSIGNED: {
      label: { ja: "割当済", en: "Assigned", zh: "已分配" },
      color: "green",
    },
    SUSPENDED: {
      label: { ja: "一時停止", en: "Suspended", zh: "已停用" },
      color: "orange",
    },
    REVOKED: {
      label: { ja: "取り消し", en: "Revoked", zh: "已撤销" },
      color: "red",
    },
  },
  /** 共有端末（app.kiosk_devices — SY09）。 */
  KioskDevice: {
    PENDING: {
      label: { ja: "リンク待ち", en: "Awaiting link", zh: "待关联" },
      color: "gray",
    },
    LINKED: {
      label: { ja: "有効化待ち", en: "Awaiting activation", zh: "待启用" },
      color: "yellow",
    },
    ACTIVE: { label: { ja: "有効", en: "Active", zh: "启用" }, color: "green" },
    DISABLED: {
      label: { ja: "無効", en: "Disabled", zh: "停用" },
      color: "gray",
    },
    REVOKED: {
      label: { ja: "取り消し", en: "Revoked", zh: "已撤销" },
      color: "red",
    },
  },
  /**
   * 管理ディスプレイ（app.display_devices — SY09 の「ディスプレイ」タブ）。
   *
   * **共有端末と同じ状態・同じ言葉にする。** 隣り合うタブに並ぶのに、同じ DB の
   * 値が片方で「一時停止」・もう片方で「無効」だと、別の状態なのか同じ状態なのかを
   * 読む人が判断できない（i18n-glossary §3.12「端末は Active / Disabled」）。
   */
  DisplayDevice: {
    PENDING: {
      label: { ja: "リンク待ち", en: "Awaiting link", zh: "待关联" },
      color: "gray",
    },
    LINKED: {
      label: { ja: "有効化待ち", en: "Awaiting activation", zh: "待启用" },
      color: "yellow",
    },
    ACTIVE: { label: { ja: "有効", en: "Active", zh: "启用" }, color: "green" },
    DISABLED: {
      label: { ja: "無効", en: "Disabled", zh: "停用" },
      color: "gray",
    },
    REVOKED: {
      label: { ja: "取り消し", en: "Revoked", zh: "已撤销" },
      color: "red",
    },
  },
} satisfies Record<string, StatusMap>;

export type StatusEntity = keyof typeof STATUS_MAPS;

/**
 * 状態のラベルだけ欲しいとき用（手続き状況の補足文など）。未知の値はそのまま。
 * `locale` を渡さない呼び出しは日本語のまま（次第に呼び出し側で
 * `useLocale()` を渡すよう更新していく — 表示は `<StatusBadge>` を優先）。
 */
export function statusLabel(
  entity: StatusEntity,
  status: string,
  locale: Locale = "ja",
): string {
  const def = (STATUS_MAPS[entity] as StatusMap)[status];
  return def ? (def.label[locale] ?? def.label.ja) : status;
}

/** Build Select options from a status map (for filter bars). */
export function statusOptions(
  entity: StatusEntity,
  locale: Locale = "ja",
): { value: string; label: string }[] {
  return Object.entries(STATUS_MAPS[entity] as StatusMap)
    .filter(([, def]) => def.label.ja !== "—")
    .map(([value, def]) => ({
      value,
      label: def.label[locale] ?? def.label.ja,
    }));
}
