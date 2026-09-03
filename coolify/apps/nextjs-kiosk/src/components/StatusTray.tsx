"use client";

/**
 * StatusTray.tsx — ヘッダー常時表示のバッテリー（左）と日付時刻（右）。
 *
 * キオスクはシステムバー非表示（イマーシブ）で OS の時計・電池が見えないため、
 * アプリ内ヘッダーに常時表示する。ネットワーク状態は ConnectionIndicator が担当。
 * ヘッダー配置: 左 = タイトル + BatteryStatus / 右 = 接続ドット + 端末名 + HeaderClock
 *
 * - BatteryStatus: Battery Status API（非対応ブラウザでは非表示）。
 *   あわせて**充電中は画面をスリープさせない**（Screen Wake Lock。Battery API
 *   非対応時は常時保持 — 共有キオスクのため安全側）。専用アプリはネイティブ側の
 *   FLAG_KEEP_SCREEN_ON もあり常時 ON。
 * - HeaderClock: M/D(曜) HH:MM — 10 秒ごと更新（ハイドレーション不一致を
 *   避けるためマウント後に表示）
 */

import { Group, Text } from "@mantine/core";
import {
  IconBattery,
  IconBattery1,
  IconBattery2,
  IconBattery3,
  IconBattery4,
  IconBoltFilled,
} from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { useI18n } from "./I18nProvider";

type BatteryState = { level: number; charging: boolean };

type BatteryManagerLike = {
  level: number;
  charging: boolean;
  addEventListener: (type: string, fn: () => void) => void;
  removeEventListener: (type: string, fn: () => void) => void;
};

function batteryIcon(level: number) {
  if (level >= 0.85) return IconBattery4;
  if (level >= 0.6) return IconBattery3;
  if (level >= 0.35) return IconBattery2;
  if (level >= 0.1) return IconBattery1;
  return IconBattery;
}

/** ロケール → Intl.DateTimeFormat に渡す BCP 47 タグ。 */
function intlLocale(locale: string): string {
  if (locale === "en") return "en-US";
  if (locale === "zh") return "zh-CN";
  return "ja-JP";
}

/** 日付 + 時刻（ヘッダー右側）。 */
export function HeaderClock() {
  const { locale } = useI18n();
  const [time, setTime] = useState<string | null>(null);

  useEffect(() => {
    const weekdayFmt = new Intl.DateTimeFormat(intlLocale(locale), {
      weekday: "short",
    });
    const tick = () => {
      const d = new Date();
      setTime(
        `${d.getMonth() + 1}/${d.getDate()}(${weekdayFmt.format(d)}) ${String(
          d.getHours(),
        ).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`,
      );
    };
    tick();
    const timer = setInterval(tick, 10_000);
    return () => clearInterval(timer);
  }, [locale]);

  if (!time) return null;
  return (
    <Text fw={600} size="md" style={{ fontVariantNumeric: "tabular-nums" }}>
      {time}
    </Text>
  );
}

/** バッテリー表示 + 充電中ウェイクロック（ヘッダー左側）。 */
export function BatteryStatus() {
  const [battery, setBattery] = useState<BatteryState | null>(null);

  // バッテリー（Battery Status API — 非対応なら非表示のまま）
  useEffect(() => {
    const nav = navigator as Navigator & {
      getBattery?: () => Promise<BatteryManagerLike>;
    };
    if (!nav.getBattery) return;
    let stopped = false;
    let bm: BatteryManagerLike | null = null;
    const sync = () => {
      if (!stopped && bm) {
        setBattery({ level: bm.level, charging: bm.charging });
      }
    };
    nav
      .getBattery()
      .then((b) => {
        bm = b;
        sync();
        b.addEventListener("levelchange", sync);
        b.addEventListener("chargingchange", sync);
      })
      .catch(() => undefined);
    return () => {
      stopped = true;
      bm?.removeEventListener("levelchange", sync);
      bm?.removeEventListener("chargingchange", sync);
    };
  }, []);

  // 充電中は画面をスリープさせない（Screen Wake Lock）
  useEffect(() => {
    const nav = navigator as Navigator & {
      wakeLock?: {
        request: (type: "screen") => Promise<{ release: () => Promise<void> }>;
      };
      getBattery?: () => Promise<BatteryManagerLike>;
    };
    const wakeLock = nav.wakeLock;
    if (!wakeLock) return;
    let lock: { release: () => Promise<void> } | null = null;
    let charging = true; // Battery API 非対応時は常時保持（安全側）
    let stopped = false;

    const sync = async () => {
      if (stopped) return;
      const shouldHold = charging && document.visibilityState === "visible";
      if (shouldHold && !lock) {
        try {
          lock = await wakeLock.request("screen");
        } catch {
          lock = null; // 省電力モード等で拒否されることがある — 次の機会に再試行
        }
      } else if (!shouldHold && lock) {
        const l = lock;
        lock = null;
        void l.release().catch(() => undefined);
      }
    };

    let bm: BatteryManagerLike | null = null;
    const onCharge = () => {
      charging = bm ? bm.charging : true;
      void sync();
    };
    if (nav.getBattery) {
      nav
        .getBattery()
        .then((b) => {
          bm = b;
          onCharge();
          b.addEventListener("chargingchange", onCharge);
        })
        .catch(() => void sync());
    } else {
      void sync();
    }
    // 画面復帰時はロックが自動解放されているため取り直す
    const onVisible = () => void sync();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisible);
      bm?.removeEventListener("chargingchange", onCharge);
      if (lock) void lock.release().catch(() => undefined);
    };
  }, []);

  if (!battery) return null;
  const BatteryIcon = batteryIcon(battery.level);
  return (
    <Group gap={2} wrap="nowrap">
      {battery.charging ? (
        <IconBoltFilled color="var(--mantine-color-green-5)" size={16} />
      ) : (
        <BatteryIcon
          color={
            battery.level < 0.15
              ? "var(--mantine-color-red-5)"
              : "var(--mantine-color-gray-4)"
          }
          size={18}
        />
      )}
      <Text
        c={battery.level < 0.15 && !battery.charging ? "red" : "dimmed"}
        size="sm"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {Math.round(battery.level * 100)}%
      </Text>
    </Group>
  );
}
