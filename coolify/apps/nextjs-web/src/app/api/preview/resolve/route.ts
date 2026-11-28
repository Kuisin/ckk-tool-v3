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
 * 書類の URL は id（`…/sales/quotes/CKK~QOT-2026-00001`）で書類を指す。
 * 古いリンク（番号だけ `QOT-2026-00001`・旧番号 `QOT-202607-00001`）も受け、
 * DB を引いて 1 件に決まればその書類を返す。同じ番号が複数の法人にあれば
 * 中身は出さず、候補の法人コード（companyCodes）だけ返す。
 *
 * 応答: 対象 URL でなければ { matched: false }。対象なら常に 200 で
 * { matched, allowed, title, description?, companyCode?, companyCodes? } —
 * `user_permissions` view に
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
import { resolveDocId } from "@/lib/doc-ref";
import { docRefCompany } from "@/lib/doc-ref-core";
import type { LocalizedText } from "@/lib/format";
import { formatMoney, localized } from "@/lib/format";
import {
  type DocPreviewTarget,
  genericPreviewTitle,
  type MasterPreviewTarget,
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
  docRef: string,
): Promise<string | null> {
  switch (target.kind) {
    case "trial-estimate": {
      const r = await prisma.estimate.findUnique({
        where: { docRef },
        include: { customerBp: true },
      });
      // 原価試算は estimate_cost の持ち主にしか見せない書類。ここは READ の
      // 権限コード 1 つしか見ていないので、中身を語らず汎用文に落とす。
      if (!r || r.kind === "COST") return null;
      const customer = r.customerBp
        ? localized(r.customerBp.name as LocalizedText | null)
        : "顧客未設定";
      return `${r.name} / ${customer} / 状態: ${r.status}`;
    }
    case "price-list": {
      const r = await prisma.priceListEntry.findUnique({
        where: { docRef },
        include: {
          customerBp: true,
          // 品目統合 第 2 段 C — 価格表の製品名は品目側から読む。
          item: true,
          variants: { orderBy: { orderType: "asc" as const } },
        },
      });
      if (!r) return null;
      const customer = localized(r.customerBp.name as LocalizedText | null);
      const product = localized(r.item?.name as LocalizedText | null);
      const types = r.variants
        .map((v) => ORDER_TYPE_LABEL[v.orderType] ?? v.orderType)
        .join("・");
      return `${customer} / ${product} / ${types || "種別未設定"} / ${r.variants.length}種別`;
    }
    case "quote": {
      const r = await prisma.quote.findUnique({
        where: { docRef },
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
    // 製品・素材マスタの URL id は品目 (items.id) — 品目統合 第 3 段。
    case "material": {
      const r = await prisma.item.findFirst({
        where: { id: target.id, itemType: "MATERIAL" },
      });
      if (!r) return null;
      return `${r.code ?? "未変換"} / ${localized(r.name as LocalizedText | null)}`;
    }
    case "product": {
      const r = await prisma.item.findFirst({
        where: { id: target.id, itemType: "PRODUCT" },
      });
      if (!r) return null;
      return `${r.code ?? "未採番"} / ${localized(r.name as LocalizedText | null)}`;
    }
    case "order-acceptance": {
      const r = await prisma.orderAcceptance.findUnique({
        where: { docRef },
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
        where: { docRef },
        include: { productItem: true },
      });
      if (!r) return null;
      const product = localized(r.productItem.name as LocalizedText | null);
      return `${product} / 予定数量 ${r.plannedQuantity} / 状態: ${r.status}`;
    }
    case "delivery-order": {
      const r = await prisma.deliveryOrder.findUnique({
        where: { docRef },
        include: { customerBp: true },
      });
      if (!r) return null;
      const customer = localized(r.customerBp.name as LocalizedText | null);
      return `${customer} / 状態: ${r.status}`;
    }
    case "delivery-note": {
      const r = await prisma.deliveryNote.findUnique({
        where: { docRef },
        include: { recipientBp: true },
      });
      if (!r) return null;
      const recipient = localized(r.recipientBp.name as LocalizedText | null);
      return `${recipient} / 状態: ${r.status}`;
    }
    case "invoice": {
      const r = await prisma.invoice.findUnique({
        where: { docRef },
        include: { customerBp: true },
      });
      if (!r) return null;
      const customer = localized(r.customerBp.name as LocalizedText | null);
      return `${customer} / 合計 ${formatMoney(Number(r.totalAmount))} / 状態: ${r.status}`;
    }
    case "purchase-order": {
      const r = await prisma.materialPurchaseOrder.findUnique({
        where: { docRef },
        include: { supplierBp: true },
      });
      if (!r) return null;
      const supplier = localized(r.supplierBp.name as LocalizedText | null);
      return `${supplier} / 合計 ${formatMoney(Number(r.totalAmount))} / 状態: ${r.status}`;
    }
    case "purchase-request": {
      const r = await prisma.purchaseRequest.findUnique({
        where: { docRef },
      });
      if (!r) return null;
      return `${r.purpose ?? "目的未設定"} / 状態: ${r.status}`;
    }
    case "design-request": {
      const r = await prisma.designRequest.findUnique({
        where: { docRef },
        include: { item: true },
      });
      if (!r) return null;
      const product = r.item
        ? localized(r.item.name as LocalizedText | null)
        : "製品未設定";
      return `${product} / 状態: ${r.status}`;
    }
  }
}

/**
 * 対象の書類を 1 件に決める。URL の id が法人コード付き（`CKK~QOT-2026-00001`）
 * ならそのまま。番号だけ・旧番号（古いリンク）は DB を引く。
 *
 * 同じ番号が複数の法人にあるときは **決めない**（null）— 呼び出し元は
 * 1 つの URL に 1 枚のプレビューしか描けないので、どれかを黙って選ぶと
 * 別の法人の書類の中身を見せることになる。候補の法人コードだけ返して、
 * 汎用文に添える。
 */
async function resolveTargetRef(
  target: DocPreviewTarget,
): Promise<{ docRef: string | null; companyCodes: string[] }> {
  if (target.docKey) return { docRef: target.docKey.docRef, companyCodes: [] };
  const r = await resolveDocId(target.table, target.rawId);
  if (r.status === "ok") return { docRef: r.docRef, companyCodes: [] };
  if (r.status === "ambiguous") {
    return {
      docRef: null,
      companyCodes: r.docRefs.flatMap((x) => docRefCompany(x) ?? []),
    };
  }
  return { docRef: null, companyCodes: [] };
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
  if (!("docKey" in target)) {
    // マスタ（内部 id の URL）— 参照は使わない。
    const description = await richDescription(target, "");
    return NextResponse.json({
      matched: true,
      allowed: true,
      title: generic,
      ...(description ? { description } : {}),
    });
  }
  const { docRef, companyCodes } = await resolveTargetRef(target);
  if (!docRef) {
    // 該当なし、または番号だけでは法人が決まらない。後者は候補の法人を
    // 文で添える（`companyCodes` は新しい項目 — 古い provider は無視する）。
    return NextResponse.json({
      matched: true,
      allowed: true,
      title: generic,
      ...(companyCodes.length > 0
        ? {
            description: `同じ番号の書類が複数の法人にあります（${companyCodes.join(" / ")}）`, // i18n-ignore
            companyCodes,
          }
        : {}),
    });
  }
  const description = await richDescription(target, docRef);
  return NextResponse.json({
    matched: true,
    allowed: true,
    title: generic,
    // 発行した自社法人のコード（番号は法人ごとの連番）。
    companyCode: docRefCompany(docRef),
    ...(description ? { description } : {}),
  });
}
