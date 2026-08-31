import { getDisplay } from "@/lib/display-auth";
import { DisplayPairing } from "./DisplayPairing";
import { DisplayRenderer } from "./DisplayRenderer";

/**
 * /display — Raspberry Pi が開く唯一の URL。
 *
 * ここから先の分岐は 2 つだけ:
 *   未ペアリング → QR とコードを出して待つ
 *   ペアリング済 → 割り当てられた表示内容を出す
 *
 * Pi 側には設定が無いので、**この判断はすべてサーバーが持つ**。
 * 失効させると次の再読込でペアリング画面に戻る（現場に行かなくてよい）。
 */

// 端末 Cookie を毎回見るので静的化しない
export const dynamic = "force-dynamic";

export default async function DisplayPage() {
  const auth = await getDisplay();

  if (!auth.ok) {
    // NO_COOKIE 以外（失効・停止・期限切れ）は理由を出してからペアリングへ。
    // 現場の人が「壊れた」ではなく「取り消されたのだ」と分かるようにする。
    return <DisplayPairing reason={auth.reason} />;
  }

  return (
    <DisplayRenderer
      displayId={auth.display.id}
      displayName={auth.display.name}
      location={auth.display.location}
    />
  );
}
