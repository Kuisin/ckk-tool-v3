/**
 * 自社法人の社印（電子印影）画像 API（MS0I）。
 *
 *   GET    /api/master/own-companies/{id}/seal  → 画像（詳細画面のプレビュー）
 *   POST   /api/master/own-companies/{id}/seal  → 差し替え（multipart: file）
 *   DELETE /api/master/own-companies/{id}/seal  → 外す
 *
 * 本体はロゴ（…/logo）と共通 — lib/own-company-image-route.ts。
 */

import {
  deleteOwnCompanyImage,
  getOwnCompanyImage,
  postOwnCompanyImage,
  type RouteContext,
} from "@/lib/own-company-image-route";

export const dynamic = "force-dynamic";

export function GET(_request: Request, ctx: RouteContext): Promise<Response> {
  return getOwnCompanyImage("seal", ctx);
}

export function POST(request: Request, ctx: RouteContext): Promise<Response> {
  return postOwnCompanyImage("seal", request, ctx);
}

export function DELETE(
  _request: Request,
  ctx: RouteContext,
): Promise<Response> {
  return deleteOwnCompanyImage("seal", ctx);
}
