import { getDisplay } from "@/lib/display-auth";
import { displayRegistrationBlocked, machineHint } from "@/lib/display-core";
import { DisplayBlocked } from "./DisplayBlocked";
import { DisplayRenderer } from "./DisplayRenderer";
import { DisplaySetup } from "./DisplaySetup";

/**
 * /display — Raspberry Pi が開く唯一の URL。
 *
 * ここから先の分岐は 3 つ:
 *   未登録         → リンクコードを出して待つ（端末の /setup と同じ 4 段）
 *   登録済み       → 割り当てられた表示内容を出す
 *   停止・失効     → **理由だけを出す。リンクコードは出さない** — 出すと
 *                    その場で登録し直せてしまい、管理者が止めたはずの画面が
 *                    復活し、同じ実機のプロファイルが二重にできる
 *
 * Pi 側には設定が無いので、**この判断はすべてサーバーが持つ**。
 * 失効させると次の再読込でペアリング画面に戻る（現場に行かなくてよい）。
 */

// 端末 Cookie を毎回見るので静的化しない
export const dynamic = "force-dynamic";

export default async function DisplayPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const auth = await getDisplay();

  // Pi が URL に載せてくる手掛かり（どの機械の何枚目か）。1 枚運用では付かない。
  const params = await searchParams;
  const one = (k: string) => {
    const v = params[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const hint = machineHint(one("machine"), one("screen"));
  const screenTotal = Number(one("of")) || 1;

  if (!auth.ok) {
    // 止められている画面は登録し直させない（上の注記）。
    if (displayRegistrationBlocked(auth.reason)) {
      return <DisplayBlocked reason={auth.reason} />;
    }
    // それ以外（新品・Cookie 消失・期限切れ）は理由を出してからペアリングへ。
    // 現場の人が「壊れた」ではなく「取り消されたのだ」と分かるようにする。
    return (
      <DisplaySetup
        hint={hint}
        reason={auth.reason}
        screenTotal={screenTotal}
      />
    );
  }

  return (
    <DisplayRenderer
      displayId={auth.display.id}
      displayName={auth.display.name}
      hint={hint}
      location={auth.display.location}
      scalePercent={auth.display.scalePercent}
      screenTotal={screenTotal}
    />
  );
}
