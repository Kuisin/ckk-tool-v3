"use client";

/**
 * VersionSkewBanner — デプロイ跨ぎの古いタブに「再読み込み」を促すバナー。
 *
 * Coolify がデプロイすると、開きっぱなしのタブは古い JS のまま動き続ける。
 * その状態で Server Action を呼ぶと action id が新ビルドに存在せず 404 になり、
 * 画面上は「押しても反応しない / 検索が終わらない」ようにしか見えない
 * （実際に出荷書フォームで発生 — サイレントに壊れて原因が伝わらない）。
 *
 * ここでは /api/app-version の BUILD_ID を定期的（+ タブ復帰時）に見て、
 * 初回取得時と変わったら Main 最上部にオレンジのバナーを固定表示する。
 * 自動リロードは**しない** — 入力途中のフォームを黙って消さないため。
 */

import { Alert, Button, Group, Text } from "@mantine/core";
import { IconRefresh } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { useTr } from "@/hooks/useTr";

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 分

async function fetchBuildId(): Promise<string | null> {
  try {
    const res = await fetch("/api/app-version", { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as { buildId?: string };
    return typeof data.buildId === "string" ? data.buildId : null;
  } catch {
    return null; // オフライン等 — スキュー判定はしない
  }
}

export function VersionSkewBanner() {
  const tr = useTr();
  const initial = useRef<string | null>(null);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const id = await fetchBuildId();
      if (cancelled || id == null || id === "development") return;
      if (initial.current == null) {
        initial.current = id;
        return;
      }
      if (id !== initial.current) setStale(true);
    };
    check();
    const timer = setInterval(check, CHECK_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (!stale) return null;

  return (
    <Alert color="orange" mb="md" variant="filled">
      <Group justify="space-between" wrap="wrap">
        <Text fw={600} size="sm">
          {tr(
            "アプリが新しいバージョンに更新されました —\n          このページは古いまま動いています。操作が失敗する前に再読み込みしてください。",
          )}
        </Text>
        <Button
          color="orange"
          leftSection={<IconRefresh size={14} />}
          onClick={() => window.location.reload()}
          size="xs"
          variant="white"
        >
          {tr("再読み込み")}
        </Button>
      </Group>
    </Alert>
  );
}
