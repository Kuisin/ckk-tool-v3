"use client";

/**
 * StuckGuard — **登録前の画面が固まったままにならないための保険。**
 *
 * ディスプレイは誰も触らないので、何かの拍子に止まっても誰も気づけない
 * （通りがかりに見えるのは「コードが出たまま」「有効化を待っています のまま」
 * だけで、それが正常な待ちなのか詰まりなのか区別が付かない）。
 * 一定時間ごとに読み込み直せば、少なくとも**永久に固まることはなくなる**。
 *
 * ★ **中身が映っているときは動かさない。** 再読込は白い瞬間を挟むので、
 *   正常に動いている画面でやると、せっかく無くしたちらつきが戻ってくる。
 *   詰まりが起きて困るのは登録前の画面なので、そこだけに掛ける。
 *   （中身側は自前の再取得と WS の再接続で回復する。）
 *
 * ★ 時計ではなく**経過時間**で測る。端末の時刻がずれても効き方が変わらない。
 */

import { useEffect } from "react";

/** 保険の間隔。短すぎると読み取り中の QR が消えるので、5 分。 */
export const STUCK_RELOAD_MS = 5 * 60 * 1000;

export function StuckGuard({
  intervalMs = STUCK_RELOAD_MS,
}: {
  intervalMs?: number;
}) {
  useEffect(() => {
    const id = setTimeout(() => {
      window.location.reload();
    }, intervalMs);
    return () => clearTimeout(id);
  }, [intervalMs]);

  return null;
}
