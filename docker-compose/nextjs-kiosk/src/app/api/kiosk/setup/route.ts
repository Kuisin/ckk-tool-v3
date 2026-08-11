/**
 * GET /api/kiosk/setup — 端末 Cookie の状態確認（login/setup 画面の初期チェック）。
 *
 * 端末の新規登録は profile-first フロー（/api/kiosk/setup/link 参照）:
 * SY09 でプロファイル作成 → タブレットがリンクコード入力 → 管理者が有効化。
 * ここではタブレット側から行を作らない（旧: 自己登録 POST は廃止）。
 */

import { NextResponse } from "next/server";
import { attestationRequired } from "@/lib/attest-core";
import { getDevice } from "@/lib/kiosk-auth";

export async function GET() {
  // 登録状態の確認はアテステーション前でも可能（skipAttest）— 代わりに
  // attestation フィールドで「アテスト済みか」をクライアントへ返す。
  const device = await getDevice({ skipAttest: true });
  if (device.ok) {
    const attested = (await getDevice()).ok;
    return NextResponse.json({
      registered: true,
      deviceId: device.device.id,
      deviceName: device.device.name,
      attestation: { required: attestationRequired(), attested },
    });
  }
  return NextResponse.json({ registered: false, reason: device.reason });
}
