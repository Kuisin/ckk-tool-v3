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
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 分

/**
 * 取れなかったときは**投げる**（null を返さない）— 失敗した回で直前の結果を
 * 上書きすると、一度出したバナーがオフラインになった瞬間に消える。
 */
async function fetchBuildId(): Promise<string> {
  const res = await fetch("/api/app-version", { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as { buildId?: string };
  if (typeof data.buildId !== "string") throw new Error("no buildId");
  return data.buildId;
}

export function VersionSkewBanner() {
  const tr = useTranslations();
  // 5 分ごと + タブへ戻ったときに確認する。タブが裏にある間は止まる
  // （TanStack Query の既定）。取れなかった回は直前の結果のまま = 判定を変えない。
  const { data: buildId } = useQuery({
    queryKey: ["app-version"],
    queryFn: fetchBuildId,
    refetchInterval: CHECK_INTERVAL_MS,
    // 画面遷移でバナーが載り直すたびに確認しに行かない（確認は間隔どおり）。
    staleTime: CHECK_INTERVAL_MS,
    // ただしタブへ戻ったときは必ず確認する — 古いタブを見つける本命の場面。
    refetchOnWindowFocus: "always",
    retry: false,
  });
  // 最初に取れた BUILD_ID が「このタブが読み込んだ版」。以後それと違えば古い。
  // （レンダー中の setState は「外の値に合わせて state を調整する」定石。）
  const [initial, setInitial] = useState<string | null>(null);
  const known = buildId != null && buildId !== "development";
  if (known && initial == null) setInitial(buildId);
  const stale = known && initial != null && buildId !== initial;

  if (!stale) return null;

  return (
    <Alert color="orange" mb="md" variant="filled">
      <Group justify="space-between" wrap="wrap">
        <Text fw={600} size="sm">
          {tr("layout.versionSkewBanner.theAppWasUpdatedThisPage")}
        </Text>
        <Button
          color="orange"
          leftSection={<IconRefresh size={14} />}
          onClick={() => window.location.reload()}
          size="xs"
          variant="white"
        >
          {tr("layout.versionSkewBanner.reload")}
        </Button>
      </Group>
    </Alert>
  );
}
