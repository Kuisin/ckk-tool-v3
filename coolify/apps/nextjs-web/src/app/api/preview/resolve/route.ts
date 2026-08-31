/**
 * GET /api/preview/resolve?url=<アプリURL>&user=<AD username>
 *
 * Nextcloud のカスタム reference provider（external/nextcloud-app/
 * ckk_link_preview）から呼ばれる、権限連動リンクプレビューの解決 API。
 *
 * 認証: 共有シークレットヘッダ `X-Preview-Token`（env PREVIEW_SHARED_SECRET。
 * 未設定なら 503 で機能ごと無効）。ユーザー識別は Nextcloud のログイン ID
 * （Samba AD で本アプリの users.username と同一）を信頼して受け取る —
 * シークレットを知る Nextcloud サーバーのみが呼べる前提。
 *
 * 応答: 対象 URL でなければ { matched: false }。対象なら常に 200 で
 * { matched, allowed, title, description? } — `user_permissions` view に
 * 該当 permission_code の READ があるときだけ業務データ入りのリッチ文
 * (description) を含める。権限なし・ユーザー不明は汎用文（種別+番号のみ）。
 */

import {
  buildPermissionSet,
  decide,
  loadPermissionRows,
  loadScopeContext,
} from "@ckk/authz-core";
import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { formatProductNumber } from "@/lib/doc-number";
import type { LocalizedText } from "@/lib/format";
import { formatMoney, localized } from "@/lib/format";
import {
  type DocPreviewTarget,
  genericPreviewTitle,
  type MasterPreviewTarget,
  type NumberedPreviewTarget,
  resolvePreviewTarget,
} from "@/lib/link-preview";
import { ORDER_TYPE_LABEL } from "@/lib/mock";
import { tokenMatches } from "@/lib/shared-token";

export const dynamic = "force-dynamic";

/**
 * READ 判定は authz-core decide()（コード ADMIN / system:ADMIN も許可 —
 * 旧実装は完全一致 READ のみで管理者を取りこぼしていた）。
 * users.is_active はビュー側で除外済みだが、username→id 解決で明示チェック。
 */
async function hasReadPermission(
  username: string,
  permissionCode: string,
): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { username },
    select: { id: true, isActive: true },
  });
  if (!user?.isActive) return false;
  const [set, ctx] = await Promise.all([
    loadPermissionRows(prisma, user.id).then(buildPermissionSet),
    loadScopeContext(prisma, user.id),
  ]);
  return decide(set, ctx, permissionCode, "READ").allowed;
}

/** 権限ありユーザー向けのリッチ本文（見つからなければ null → 汎用文のみ）。 */
async function richDescription(
  target: DocPreviewTarget | MasterPreviewTarget,
): Promise<string | null> {
  switch (target.kind) {
    case "trial-estimate": {
      const r = await prisma.estimate.findUnique({
        where: {
          yearMonth_seq: {
            yearMonth: target.docKey.yearMonth,
            seq: target.docKey.seq,
          },
        },
        include: { customerBp: true },
      });
      if (!r) return null;
      const customer = r.customerBp
        ? localized(r.customerBp.name as LocalizedText | null)
        : "顧客未設定";
      return `${r.name} / ${customer} / 状態: ${r.status}`;
    }
    case "price-list": {
      const r = await prisma.priceListEntry.findUnique({
        where: {
          yearMonth_seq: {
            yearMonth: target.docKey.yearMonth,
            seq: target.docKey.seq,
          },
        },
        include: {
          customerBp: true,
          product: true,
          variants: { orderBy: { orderType: "asc" as const } },
        },
      });
      if (!r) return null;
      const customer = localized(r.customerBp.name as LocalizedText | null);
      const product = localized(r.product.name as LocalizedText | null);
      const types = r.variants
        .map((v) => ORDER_TYPE_LABEL[v.orderType] ?? v.orderType)
        .join("・");
      return `${customer} / ${product} / ${types || "種別未設定"} / ${r.variants.length}種別`;
    }
    case "quote": {
      const r = await prisma.quote.findUnique({
        where: {
          yearMonth_seq: {
            yearMonth: target.docKey.yearMonth,
            seq: target.docKey.seq,
          },
        },
        include: { customerBp: true, items: true },
      });
      if (!r) return null;
      const customer = localized(r.customerBp.name as LocalizedText | null);
      const total = r.items.reduce((sum, it) => sum + Number(it.amount), 0);
      return `${customer} / 明細 ${r.items.length}件 / 合計 ${formatMoney(total)} / 状態: ${r.status}`;
    }
    case "material-type": {
      const r = await prisma.materialType.findUnique({
        where: { id: target.id },
      });
      if (!r) return null;
      return `${r.code ?? "未変換"} / ${localized(r.name as LocalizedText | null)}`;
    }
    case "material": {
      const r = await prisma.material.findUnique({ where: { id: target.id } });
      if (!r) return null;
      return `${r.code ?? "未変換"} / ${localized(r.name as LocalizedText | null)}`;
    }
    case "product": {
      const r = await prisma.product.findUnique({ where: { id: target.id } });
      if (!r) return null;
      const code = formatProductNumber(r.yearMonth, r.seq);
      return `${code ?? "未採番"} / ${localized(r.name as LocalizedText | null)}`;
    }
    case "order-acceptance": {
      const r = await prisma.orderAcceptance.findUnique({
        where: {
          yearMonth_seq: {
            yearMonth: target.docKey.yearMonth,
            seq: target.docKey.seq,
          },
        },
        include: { customerBp: true },
      });
      if (!r) return null;
      const customer = r.customerBp
        ? localized(r.customerBp.name as LocalizedText | null)
        : "顧客未設定";
      return `${customer} / 状態: ${r.status}`;
    }
    case "work-order": {
      const r = await prisma.workOrder.findUnique({
        where: {
          yearMonth_seq: {
            yearMonth: target.docKey.yearMonth,
            seq: target.docKey.seq,
          },
        },
        include: { product: true },
      });
      if (!r) return null;
      const product = localized(r.product.name as LocalizedText | null);
      return `${product} / 予定数量 ${r.plannedQuantity} / 状態: ${r.status}`;
    }
    case "delivery-order": {
      const r = await prisma.deliveryOrder.findUnique({
        where: {
          yearMonth_seq: {
            yearMonth: target.docKey.yearMonth,
            seq: target.docKey.seq,
          },
        },
        include: { customerBp: true },
      });
      if (!r) return null;
      const customer = localized(r.customerBp.name as LocalizedText | null);
      return `${customer} / 状態: ${r.status}`;
    }
    case "delivery-note": {
      const r = await prisma.deliveryNote.findUnique({
        where: {
          yearMonth_seq: {
            yearMonth: target.docKey.yearMonth,
            seq: target.docKey.seq,
          },
        },
        include: { recipientBp: true },
      });
      if (!r) return null;
      const recipient = localized(r.recipientBp.name as LocalizedText | null);
      return `${recipient} / 状態: ${r.status}`;
    }
    case "invoice": {
      const r = await prisma.invoice.findUnique({
        where: {
          yearMonth_seq: {
            yearMonth: target.docKey.yearMonth,
            seq: target.docKey.seq,
          },
        },
        include: { customerBp: true },
      });
      if (!r) return null;
      const customer = localized(r.customerBp.name as LocalizedText | null);
      return `${customer} / 合計 ${formatMoney(Number(r.totalAmount))} / 状態: ${r.status}`;
    }
  }
}

/** 番号列そのもので照会するテーブル（po_number / request_number）向け。 */
async function richDescriptionByNumber(
  target: NumberedPreviewTarget,
): Promise<string | null> {
  switch (target.kind) {
    case "purchase-order": {
      const r = await prisma.materialPurchaseOrder.findUnique({
        where: { poNumber: target.docNumber },
        include: { supplierBp: true },
      });
      if (!r) return null;
      const supplier = localized(r.supplierBp.name as LocalizedText | null);
      return `${supplier} / 合計 ${formatMoney(Number(r.totalAmount))} / 状態: ${r.status}`;
    }
    case "purchase-request": {
      const r = await prisma.purchaseRequest.findUnique({
        where: { requestNumber: target.docNumber },
      });
      if (!r) return null;
      return `${r.purpose ?? "目的未設定"} / 状態: ${r.status}`;
    }
    case "design-request": {
      const r = await prisma.designRequest.findUnique({
        where: { requestNumber: target.docNumber },
        include: { product: true },
      });
      if (!r) return null;
      const product = r.product
        ? localized(r.product.name as LocalizedText | null)
        : "製品未設定";
      return `${product} / 状態: ${r.status}`;
    }
  }
}

export async function GET(request: NextRequest) {
  const secret = process.env.PREVIEW_SHARED_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "preview API is not configured (PREVIEW_SHARED_SECRET)" },
      { status: 503 },
    );
  }
  if (!tokenMatches(request.headers.get("x-preview-token"), secret)) {
    return NextResponse.json({ error: "invalid token" }, { status: 401 });
  }

  const url = request.nextUrl.searchParams.get("url");
  const username = request.nextUrl.searchParams.get("user");
  if (!url) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  const target = resolvePreviewTarget(url);
  if (!target) return NextResponse.json({ matched: false });

  const generic = genericPreviewTitle(target);
  const allowed = username
    ? await hasReadPermission(username, target.permissionCode)
    : false;
  if (!allowed) {
    return NextResponse.json({ matched: true, allowed: false, title: generic });
  }
  // NumberedPreviewTarget（po_number 等）は複合キーを持たないので別経路。
  const description =
    "docKey" in target
      ? await richDescription(target)
      : "docNumber" in target
        ? await richDescriptionByNumber(target)
        : await richDescription(target);
  return NextResponse.json({
    matched: true,
    allowed: true,
    title: generic,
    ...(description ? { description } : {}),
  });
}
