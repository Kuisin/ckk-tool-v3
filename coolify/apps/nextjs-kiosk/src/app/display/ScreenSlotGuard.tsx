"use client";

/**
 * ScreenSlotGuard — **窓を開くだけで「何枚目か」を決める。**
 *
 * `?screen=` が付いていないときだけ働く。同じブラウザで既に 1 枚目が開いて
 * いれば、この窓は 2 枚目として `?screen=2` へ移る（＝別の Cookie になり、
 * 別のディスプレイとして登録できる）。URL を手で書かなくても多画面にできる。
 *
 * 1 枚目のときは**何もしない**。移動すると URL に余計な印が付くし、
 * Cookie の名前も変わらない（1 枚目は従来どおりの名前）ので、動かす意味が無い。
 *
 * ★ 番号は「何番目に開いたか」であって、**どの物理モニタかではない**。
 *   左右を決め打ちしたいときは `?screen=` を明示する（明示が常に優先）。
 *
 * ★ 錠は**ページが生きている間ずっと**握る。ここでのマウントは 1 回きりで、
 *   窓を閉じればブラウザが自動で外す。
 */

import { useEffect, useRef } from "react";
import { claimScreenSlot } from "@/lib/screen-slot";

export function ScreenSlotGuard({
  /** URL で明示された画面番号（無ければ null＝自動割り当ての対象）。 */
  explicitScreen,
}: {
  explicitScreen: number | null;
}) {
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    void (async () => {
      const slot = await claimScreenSlot(explicitScreen);
      // 明示されているときは動かさない（錠は押さえたので、他の窓が
      // その番号を取らない）
      if (explicitScreen !== null) return;
      // 1 枚目ならそのまま（URL を汚さない）
      if (slot.index <= 1) return;

      // 2 枚目以降だけ、自分の番号を URL に入れて開き直す。
      // **再読込が要る** — どの Cookie を見るかはサーバーが URL から決めるため。
      const url = new URL(window.location.href);
      url.searchParams.set("screen", String(slot.index));
      url.searchParams.set("of", String(Math.max(slot.total, slot.index)));
      window.location.replace(url.toString());
    })();
  }, [explicitScreen]);

  return null;
}
