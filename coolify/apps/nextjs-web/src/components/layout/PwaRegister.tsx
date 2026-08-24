"use client";

/**
 * PwaRegister — Service Worker をアプリ読み込み時に登録する（描画なし）。
 *
 * 購読（PushManager.subscribe）はユーザー操作（設定 → 通知設定）で行うが、
 * SW 自体は常に最新版へ更新しておく — sw.js を変更しても全デバイスが
 * 次回アクセスで追従する。
 */

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // 未対応・プライベートモード等は無視
      });
    }
  }, []);
  return null;
}
