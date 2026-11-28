/**
 * 自社法人のロゴ画像 API（MS0I）。PDF の見出しに刷るロゴ。
 *
 *   GET    /api/master/own-companies/{id}/logo  → 画像（詳細画面のプレビュー）
 *   POST   /api/master/own-companies/{id}/logo  → 差し替え（multipart: file）
 *   DELETE /api/master/own-companies/{id}/logo  → 外す
 *
 * 本体は社印（…/seal）と共通 — lib/own-company-image-route.ts。
 */

import {
  deleteOwnCompanyImage,
  getOwnCompanyImage,
  postOwnCompanyImage,
  type RouteContext,
} from "@/lib/own-company-image-route";

export const dynamic = "force-dynamic";

export function GET(_request: Request, ctx: RouteContext): Promise<Response> {
  return getOwnCompanyImage("logo", ctx);
}

export function POST(request: Request, ctx: RouteContext): Promise<Response> {
  return postOwnCompanyImage("logo", request, ctx);
}

export function DELETE(
  _request: Request,
  ctx: RouteContext,
): Promise<Response> {
  return deleteOwnCompanyImage("logo", ctx);
}
