"use client";

/**
 * WorkingStepsBar.tsx — いま掴んでいる工程を画面の隅に常時出す丸薬。
 *
 * 1 人が複数の工程を同時に進めることは前から出来る（実績の concurrent_count が
 * 実働時間を按分する）が、**行き来する道が無かった** — 別の工程へ移るには
 * /steps まで戻るしかなく、同時に動かしていること自体が画面から読み取れなかった。
 *
 * 置き場所は AppShell の外（Affix）。ヘッダーは 56px 固定で入らないし、
 * Main は `height: calc(100dvh - 56px - 40px)` ちょうどなので、流し込むと
 * 「Center flex:1 が正確に縦中央」という性質が壊れる。
 *
 * **新しいポーリングは足さない。** 鮮度は
 *   (1) layout がサーバー描画するので遷移と router.refresh() で必ず正しくなる
 *       （工程画面は操作のたびに refresh している）
 *   (2) 経過時間はローカルの setInterval（通信しない）
 *   (3) 他端末での変化は「タブレットを持ち直した」= visibilitychange のときだけ
 *       取りに行く（30 秒に 1 回まで）
 * で足りる。足りなければ既存の /api/kiosk/activity の応答に件数を足すのが
 * 一番安い（要求の本数が増えない）。
 */

import {
  Affix,
  Badge,
  Group,
  Paper,
  Stack,
  Text,
  UnstyledButton,
} from "@mantine/core";
import { IconChevronDown, IconPlayerPlay } from "@tabler/icons-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { fillMessage } from "@/lib/i18n";
import type { WorkingStepView } from "@/lib/steps";
import { useI18n } from "../I18nProvider";
import { LOGGED_OUT_ROUTES } from "../KioskShell";
import { LiveElapsed } from "./LiveElapsed";

/** 他端末での変化を拾い直す最短間隔。 */
const REFRESH_THROTTLE_MS = 30_000;

type Props = { steps: WorkingStepView[] };

export function WorkingStepsBar({ steps }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const { m } = useI18n();
  const [open, setOpen] = useState(false);
  const lastRefreshRef = useRef(0);

  // タブレットを持ち直したときだけ取り直す（別の端末で完了された等）。
  // 定期ポーリングにしない — 画面はほとんどの時間ただ置かれている。
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastRefreshRef.current < REFRESH_THROTTLE_MS) return;
      lastRefreshRef.current = now;
      router.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [router]);

  const loggedOut = LOGGED_OUT_ROUTES.some(
    (r) => pathname === r || pathname.startsWith(`${r}/`),
  );
  if (loggedOut || steps.length === 0) return null;

  const go = (stepId: string) => {
    setOpen(false);
    router.push(`/steps/${stepId}`);
  };

  return (
    <Affix position={{ bottom: 52, right: 16 }}>
      <Stack align="flex-end" gap="xs">
        {open && (
          <Paper maw={420} p="sm" radius="md" shadow="md" withBorder>
            <Stack gap="xs">
              <Text c="dimmed" fw={600} size="sm">
                {m.steps.working.title}
              </Text>
              {steps.map((s) => (
                <UnstyledButton key={s.stepId} onClick={() => go(s.stepId)}>
                  <Paper p="sm" radius="sm" withBorder>
                    <Group gap="sm" justify="space-between" wrap="nowrap">
                      <Stack gap={2} style={{ minWidth: 0 }}>
                        <Text fw={600} size="md" truncate>
                          {s.stepName}
                        </Text>
                        <Text c="dimmed" size="sm">
                          {fillMessage(m.steps.card.workOrder, {
                            n: s.workOrderNumber,
                          })}
                        </Text>
                      </Stack>
                      <Text
                        c="dimmed"
                        size="sm"
                        style={{
                          flexShrink: 0,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        <LiveElapsed
                          baseMs={s.workedMs}
                          rate={1 / s.openConcurrentCount}
                          running
                        />
                      </Text>
                    </Group>
                  </Paper>
                </UnstyledButton>
              ))}
              {steps.length > 1 && (
                <Text c="dimmed" size="xs">
                  {fillMessage(m.steps.working.concurrentNote, {
                    n: steps.length,
                  })}
                </Text>
              )}
            </Stack>
          </Paper>
        )}

        {/* 畳んだ状態。44px 以上の当たりを確保する（タブレット前提） */}
        <UnstyledButton
          aria-label={open ? m.steps.working.close : m.steps.working.open}
          onClick={() => setOpen((o) => !o)}
        >
          <Paper px="md" py="sm" radius="xl" shadow="md" withBorder>
            <Group gap="xs" wrap="nowrap">
              {open ? (
                <IconChevronDown size={20} />
              ) : (
                <IconPlayerPlay size={20} />
              )}
              <Text fw={600} size="md">
                {fillMessage(m.steps.working.count, { n: steps.length })}
              </Text>
              {steps.length > 1 && (
                <Badge color="blue" size="sm" variant="filled">
                  {steps.length}
                </Badge>
              )}
            </Group>
          </Paper>
        </UnstyledButton>
      </Stack>
    </Affix>
  );
}
