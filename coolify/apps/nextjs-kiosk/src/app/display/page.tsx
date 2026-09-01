import { getDisplay } from "@/lib/display-auth";
import { displayRegistrationBlocked, machineHint } from "@/lib/display-core";
import { DisplayBlocked } from "./DisplayBlocked";
import { DisplayRenderer } from "./DisplayRenderer";
import { DisplaySetup } from "./DisplaySetup";
import { ScreenSlotGuard } from "./ScreenSlotGuard";
import { StuckGuard } from "./StuckGuard";

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
 * `?screen=` が無いときは、同じブラウザで開いている窓を見て**自分で番号を取る**
 * （ScreenSlotGuard）。普通のパソコンで窓を 2 つ開くだけで多画面にできる。
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
  // 手掛かり（どの機械の何枚目か）。Pi が URL に載せてくるが、**普通の
  // パソコンでも手で付ければ同じように多画面にできる**（窓ごとに別の Cookie）。
  const params = await searchParams;
  const one = (k: string) => {
    const v = params[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const hint = machineHint(one("machine"), one("screen"));
  const screenTotal = Number(one("of")) || 1;

  // 認証は**この窓の画面番号**で引く（窓ごとに別の登録になる）
  const auth = await getDisplay(hint.screenIndex);

  // `?screen=` が無い窓だけ、自分で番号を取りに行く（2 枚目以降は開き直す）。
  // 明示されているときは何もしない = Pi や固定運用の指定を勝手に変えない。
  const slotGuard = <ScreenSlotGuard explicitScreen={hint.screenIndex} />;

  if (!auth.ok) {
    // 止められている画面は登録し直させない（上の注記）。
    if (displayRegistrationBlocked(auth.reason)) {
      return (
        <>
          <StuckGuard />
          <DisplayBlocked reason={auth.reason} />
        </>
      );
    }
    // それ以外（新品・Cookie 消失・期限切れ）は理由を出してからペアリングへ。
    // 現場の人が「壊れた」ではなく「取り消されたのだ」と分かるようにする。
    return (
      <>
        {slotGuard}
        {/* 登録前は誰も気づけないまま止まりうるので、一定時間で読み込み直す */}
        <StuckGuard />
        <DisplaySetup
          hint={hint}
          reason={auth.reason}
          screenTotal={screenTotal}
        />
      </>
    );
  }

  return (
    <>
      {slotGuard}
      <DisplayRenderer
        displayId={auth.display.id}
        displayName={auth.display.name}
        hint={hint}
        location={auth.display.location}
        scalePercent={auth.display.scalePercent}
        screenTotal={screenTotal}
      />
    </>
  );
}
