/** GET /api/healthz — デプロイ疎通確認（DB 接続は見ない軽量版）。 */

import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    ok: true,
    app: "nextjs-kiosk",
    version: process.env.NEXT_PUBLIC_APP_VERSION ?? "dev",
  });
}
