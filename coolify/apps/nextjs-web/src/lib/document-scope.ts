import "server-only";

/**
 * document-scope.ts — 多態的に書類を指す `(ownerType, ownerId)` が、呼び出し元の
 * **行スコープ内**かを判定する共有ロジック。
 *
 * ownerType はテーブル名（audit_logs / document_attachments / document_memos と
 * 同じ多態規約）、ownerId は画面・監査に出る**表示番号**（ORD-… / 指示書番号 …）。
 *
 * **なぜ要るか**: 証憑（/api/attachments）とメモ（document_memos）は、持ち主の
 * 書類の権限コードは見るが**その 1 件が自分の範囲か**を見ていなかった。PLANT /
 * OWN 権限の利用者が、番号を推測して他拠点・他担当の書類の証憑を読む・消す、
 * 他担当の見積に内部メモを書く、ができていた（pentest 2026-11-25 M-4 / L-7）。
 * ここは権限コードの可否に**行スコープを一段足す**だけで、可否そのものは
 * 呼び出し側が checkPermission で見ている前提。
 *
 * 判定は画面の詳細フェッチャ（fetchWorkOrder 等）と**同じ** `rowInScope` 原始関数で
 * 行う。番号が解決できない / 実在しないときは true を返す —— 後続の実処理
 * （findUnique）が空振りして no-op になるので、実在しない対象に「見える」と
 * 答えても害は無く、表示番号の書式が将来変わっても**アクセスを壊さない**
 * （閉じ込め過ぎない）。ALL 権限・form_responses 等の別認可モデル・未知の種別は
 * 行スコープを足さない（true）。
 *
 * 残課題（Low。別モデル・複合キーで安全に解決できないため据え置き、本 PR では
 * true = 従来どおり）: order_lines（明細番号の解釈）/ delivery_orders（出荷元拠点 +
 * 連結指示書による PLANT 解決）。詳細は _docs/audits/pentest-2026-11-25.md L-7。
 */

import { type Access, rowInScope } from "@ckk/authz-core";
import { prisma } from "./db";
import { parseDocKey } from "./doc-number";

/** OWN 判定用（拠点は持たない書類）。plantIds=[] なので PLANT 一致は起きない。 */
function ownScope(
  access: Access,
  createdBy: string | null,
  userId: string,
): boolean {
  return rowInScope(access, { plantIds: [], createdBy }, userId);
}

export async function documentInScope(
  access: Access,
  userId: string,
  ownerType: string,
  ownerId: string,
): Promise<boolean> {
  // ALL は無制限 — 書類を引く前に確定できる。
  if (access.kind === "ALL") return true;

  switch (ownerType) {
    // ── PLANT（工程の実施拠点 ∪ 作成者）─────────────────────────────────
    case "work_orders": {
      const n = Number(ownerId);
      if (!Number.isInteger(n)) return true;
      const wo = await prisma.workOrder.findUnique({
        where: { workOrderNumber: n },
        select: { createdBy: true, steps: { select: { plantId: true } } },
      });
      if (!wo) return true;
      return rowInScope(
        access,
        { plantIds: wo.steps.map((s) => s.plantId), createdBy: wo.createdBy },
        userId,
      );
    }

    // ── OWN（作成者）── 単一ユニーク番号 ───────────────────────────────
    case "design_requests": {
      const d = await prisma.designRequest.findUnique({
        where: { requestNumber: ownerId },
        select: { createdBy: true },
      });
      return d ? ownScope(access, d.createdBy, userId) : true;
    }

    // ── OWN（作成者）── 複合キー (year_month, seq)。表示番号を parseDocKey で割る ──
    case "quotes": {
      const k = parseDocKey(ownerId);
      if (!k) return true;
      const q = await prisma.quote.findUnique({
        where: { yearMonth_seq: k },
        select: { createdBy: true },
      });
      return q ? ownScope(access, q.createdBy, userId) : true;
    }
    case "order_acceptances": {
      const k = parseDocKey(ownerId);
      if (!k) return true;
      const oa = await prisma.orderAcceptance.findUnique({
        where: { yearMonth_seq: k },
        select: { createdBy: true },
      });
      return oa ? ownScope(access, oa.createdBy, userId) : true;
    }
    case "estimates": {
      const k = parseDocKey(ownerId);
      if (!k) return true;
      const e = await prisma.estimate.findUnique({
        where: { yearMonth_seq: k },
        select: { createdBy: true },
      });
      return e ? ownScope(access, e.createdBy, userId) : true;
    }
    case "price_list_entries": {
      const k = parseDocKey(ownerId);
      if (!k) return true;
      const p = await prisma.priceListEntry.findUnique({
        where: { yearMonth_seq: k },
        select: { createdBy: true },
      });
      return p ? ownScope(access, p.createdBy, userId) : true;
    }

    default:
      // ALL 権限 (invoices / delivery_notes / purchase_* / material_receipts) ·
      // 別認可モデル (form_responses) · 非スコープ (design_files) ·
      // 残課題 (order_lines / delivery_orders) · 未知 — 行スコープを足さない。
      return true;
  }
}
