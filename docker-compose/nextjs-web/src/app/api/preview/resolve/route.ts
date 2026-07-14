/**
 * GET /api/preview/resolve?url=<アプリURL>&user=<AD username>
 *
 * Nextcloud のカスタム reference provider（docker-compose/nextcloud-app/
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

import { timingSafeEqual } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { formatProductNumber } from "@/lib/doc-number";
import type { LocalizedText } from "@/lib/format";
import { formatDate, formatMoney, localized } from "@/lib/format";
import {
  genericPreviewTitle,
  type PreviewTarget,
  resolvePreviewTarget,
} from "@/lib/link-preview";
import { ORDER_TYPE_LABEL } from "@/lib/mock";

export const dynamic = "force-dynamic";

function tokenMatches(given: string | null, expected: string): boolean {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** user_permissions view（raw relation は使わない — CLAUDE.md RBAC）。 */
async function hasReadPermission(
  username: string,
  permissionCode: string,
): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { username },
    select: { id: true, isActive: true },
  });
  if (!user?.isActive) return false;
  const rows = await prisma.$queryRaw<{ ok: number }[]>`
    SELECT 1 AS ok
    FROM app.user_permissions
    WHERE user_id = ${user.id}::uuid
      AND permission_code = ${permissionCode}
      AND action = 'READ'::app."ACTION"
    LIMIT 1`;
  return rows.length > 0;
}

/** 権限ありユーザー向けのリッチ本文（見つからなければ null → 汎用文のみ）。 */
async function richDescription(target: PreviewTarget): Promise<string | null> {
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
        include: { customerBp: true, product: true },
      });
      if (!r) return null;
      const customer = localized(r.customerBp.name as LocalizedText | null);
      const product = localized(r.product.name as LocalizedText | null);
      return `${customer} / ${product} / ${ORDER_TYPE_LABEL[r.orderType]} / 基準単価 ${formatMoney(Number(r.baseUnitPrice))} / ${formatDate(r.validFrom)}〜${r.validUntil ? formatDate(r.validUntil) : "無期限"}`;
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
  const description = await richDescription(target);
  return NextResponse.json({
    matched: true,
    allowed: true,
    title: generic,
    ...(description ? { description } : {}),
  });
}
