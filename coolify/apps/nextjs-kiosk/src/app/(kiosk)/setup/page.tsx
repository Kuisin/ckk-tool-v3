/**
 * /setup — 端末リンク画面の入口（サーバー側の門）。
 *
 * **既に登録されている端末は、コードを出す前に追い返す。** 画面が読み込まれて
 * から API の返事で気づく作りだと、登録済みの端末でも一瞬リンクコードの画面が
 * 見え、その間に読み取られると二重にリンクされかねない。ここで判定すれば
 * そもそも描かれない。
 *
 * 追い返す先:
 *   登録済み（ACTIVE）      → /login（そのまま使える）
 *   停止・失効（DISABLED/REVOKED）→ /device-error（**登録し直させない**。
 *     やり直せると、管理者が止めた端末が自分で復活し、同じ実機のプロファイルが
 *     二重にできる）
 *
 * それ以外（新品・Cookie 消失・期限切れ）は通常どおりリンク画面を出す。
 */

import { redirect } from "next/navigation";
import { getDevice } from "@/lib/kiosk-auth";
import { registrationBlocked } from "@/lib/kiosk-auth-core";
import { SetupView } from "./SetupView";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  try {
    const device = await getDevice({ skipAttest: true });
    if (device.ok) redirect("/login");
    if (registrationBlocked(device.reason)) {
      redirect(`/device-error?reason=${device.reason}`);
    }
  } catch (e) {
    // redirect() は例外で制御を移すので、そのまま投げ直す
    if (e instanceof Error && e.message === "NEXT_REDIRECT") throw e;
    if (
      typeof e === "object" &&
      e !== null &&
      "digest" in e &&
      String((e as { digest?: unknown }).digest).startsWith("NEXT_REDIRECT")
    ) {
      throw e;
    }
    // DB 不通・ビルド時は判定できない。リンク画面を出して API 側の門に任せる。
  }
  return <SetupView />;
}
