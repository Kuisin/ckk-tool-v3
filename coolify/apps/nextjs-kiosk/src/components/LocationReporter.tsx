"use client";

/**
 * LocationReporter.tsx — 端末の GPS 位置を 5 分ごとにサーバーへ報告する
 * （見た目なし。DevicePresence と同様に registered のときだけ layout がマウント）。
 *
 * - navigator.geolocation.getCurrentPosition を各サイクルで 1 回だけ実行
 * - 権限拒否・非対応・タイムアウトは黙ってスキップ（次サイクルで再試行）
 * - 専用アプリ（v0.5.0 以降）は WebView が位置権限を自動許可する。
 *   通常ブラウザでは初回にブラウザの許可ダイアログが出る
 */

import { useEffect } from "react";

const REPORT_INTERVAL_MS = 5 * 60 * 1000;
const GEO_TIMEOUT_MS = 20_000;
// 直前のサイクルで取れた位置の再利用を許す（インターバルより短く）
const GEO_MAX_AGE_MS = 4 * 60 * 1000;

export function LocationReporter() {
  useEffect(() => {
    let stopped = false;

    const report = () => {
      if (stopped || !("geolocation" in navigator)) return;
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (stopped) return;
          void fetch("/api/kiosk/location", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracyM: pos.coords.accuracy,
            }),
          }).catch(() => undefined);
        },
        () => undefined, // 拒否・取得失敗は無視（位置は任意情報）
        {
          enableHighAccuracy: true,
          timeout: GEO_TIMEOUT_MS,
          maximumAge: GEO_MAX_AGE_MS,
        },
      );
    };

    report();
    const timer = setInterval(report, REPORT_INTERVAL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, []);

  return null;
}
