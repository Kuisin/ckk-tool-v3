"use client";

/**
 * ToastHygiene — 成功の通知が出たら、それより前のエラーの通知を消す。
 * 規則は lib/toast-hygiene-core.ts（全画面に 1 回だけ当てる — providers.tsx）。
 * 何も描かない。
 */

import {
  type NotificationData,
  notifications,
  useNotifications,
} from "@mantine/notifications";
import { useEffect, useRef } from "react";
import { supersededErrorIds } from "@/lib/toast-hygiene-core";

export function ToastHygiene() {
  const state = useNotifications();
  const prev = useRef<NotificationData[]>([]);
  useEffect(() => {
    const all = [...state.notifications, ...state.queue];
    const stale = supersededErrorIds(
      prev.current.map((n) => ({ id: n.id, color: n.color })),
      all.map((n) => ({ id: n.id, color: n.color })),
    );
    prev.current = all;
    for (const id of stale) notifications.hide(id);
  }, [state]);
  return null;
}
