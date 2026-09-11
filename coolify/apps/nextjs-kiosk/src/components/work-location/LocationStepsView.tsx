"use client";

/**
 * LocationStepsView.tsx — 作業場所で引いた工程の一覧（/work-location）。
 *
 * 「機械の前に置いたタブレットが、その機械の仕事を出す」画面。/steps が担当者で
 * 引くのに対し、こちらは**場所**で引く — 作業計画の担当者が任意になり計画日 +
 * 作業場所が必須になったので、「いつ・どこで」だけ決めた計画が普通に作られ、
 * それは担当者で引く /steps にはどこにも出てこないため。
 *
 * 見ている場所は URL に持つ（?loc / ?scope）。端末設定にしないのは、端末の既定
 * 作業場所が**実績に複写される値**だから — 表示の好みと同居させない。再ログイン
 * すると端末の既定へ戻るので、前の人のスキャンが次の人を誤らせない。
 */

import {
  Alert,
  Badge,
  Box,
  Button,
  Center,
  Group,
  Paper,
  SegmentedControl,
  Stack,
  Text,
  ThemeIcon,
  Title,
  UnstyledButton,
} from "@mantine/core";
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconMapPin,
  IconQrcode,
  IconRefresh,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { fillMessage } from "@/lib/i18n";
import {
  type BoardScope,
  boardHref,
  parseWorkLocationQr,
} from "@/lib/location-board-core";
import { playWarnSound } from "@/lib/sound";
import type { LocationStepItem } from "@/lib/steps";
import type { StepBucket } from "@/lib/steps-core";
import { ActivityMonitor } from "../ActivityMonitor";
import { useI18n } from "../I18nProvider";
import { QrScannerView } from "../QrScannerView";
import { stateColor, stateLabel } from "../steps/step-ui";

/** 画面が知っていればよい作業場所の情報（サーバーが解決済み）。 */
export type BoardLocationView = {
  code: string;
  label: string;
  groupName: string;
};

type Props = {
  /** いま見ている作業場所。null = 端末の既定も未設定で、まだ何も見ていない。 */
  location: BoardLocationView | null;
  /** 端末の既定作業場所（実績に記録される場所）。 */
  deviceDefault: BoardLocationView | null;
  /** 読み取れたが DB に無かったコード（「見つかりません」を出す）。 */
  unknownCode: string | null;
  scope: BoardScope;
  steps: LocationStepItem[];
  upcomingCount: number;
};

const SECTION_ORDER: StepBucket[] = ["OVERDUE", "TODAY", "UPCOMING"];

export function LocationStepsView({
  location,
  deviceDefault,
  unknownCode,
  scope,
  steps,
  upcomingCount,
}: Props) {
  const router = useRouter();
  const { m } = useI18n();
  const [refreshing, setRefreshing] = useState(false);
  // 端末の既定が未設定なら、開いた時点でスキャナを出す（他に進みようが無い）
  const [scanOpen, setScanOpen] = useState(location == null);
  const [scanError, setScanError] = useState<string | null>(null);

  const refresh = () => {
    setRefreshing(true);
    router.refresh();
    // router.refresh() は完了を待てないので、視覚的な二度押し防止だけ行う
    setTimeout(() => setRefreshing(false), 600);
  };

  const go = (next: { code?: string | null; scope?: BoardScope }) => {
    // replace — 1 シフト分のスキャン履歴を Back で遡らせない
    router.replace(
      boardHref({
        code: next.code !== undefined ? next.code : location?.code,
        scope: next.scope ?? scope,
        deviceDefaultCode: deviceDefault?.code ?? null,
      }),
    );
  };

  const handleScan = (payload: string) => {
    const code = parseWorkLocationQr(payload);
    if (!code) {
      // 指示書 QR やカード QR を読んでしまった場合。一覧は変えず、開いたまま
      playWarnSound();
      setScanError(m.steps.location.invalidQr);
      return;
    }
    setScanError(null);
    setScanOpen(false);
    go({ code });
  };

  const byBucket = (bucket: StepBucket) =>
    steps.filter((i) => i.step.bucket === bucket);

  // 見ている場所と、実績に記録される場所（端末の既定）が食い違っているか。
  // 一覧はフィルタでしかないので、ここを黙っていると「隣の機械の仕事を開いたら
  // 自分の機械の名前で記録された」が起きる。
  const mismatch =
    location != null &&
    deviceDefault != null &&
    location.code !== deviceDefault.code;

  return (
    <Box p="lg" style={{ flex: 1, display: "flex", flexDirection: "column" }}>
      <ActivityMonitor />

      <Stack gap="lg" maw={960} mx="auto" style={{ flex: 1, width: "100%" }}>
        <Group justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap">
            <Button
              leftSection={<IconArrowLeft size={20} />}
              onClick={() => router.push("/")}
              variant="default"
            >
              {m.workLocationBoard.back}
            </Button>
            <Title order={3}>{m.workLocationBoard.title}</Title>
            {upcomingCount > 0 && (
              <Badge color="gray" size="lg" variant="light">
                {fillMessage(m.workLocationBoard.upcoming, {
                  n: upcomingCount,
                })}
              </Badge>
            )}
          </Group>
          <Group gap="sm" wrap="nowrap">
            <Button
              leftSection={<IconQrcode size={20} />}
              onClick={() => {
                setScanError(null);
                setScanOpen((o) => !o);
              }}
              variant="default"
            >
              {scanOpen ? m.workLocationBoard.close : m.workLocationBoard.scan}
            </Button>
            <Button
              leftSection={<IconRefresh size={20} />}
              loading={refreshing}
              onClick={refresh}
              variant="default"
            >
              {m.steps.refresh}
            </Button>
          </Group>
        </Group>

        {/* いま見ている場所 + 広さの切替 */}
        {location != null && (
          <Paper p="md" radius="md" withBorder>
            <Group justify="space-between" wrap="wrap">
              <Group gap="xs" wrap="nowrap">
                <IconMapPin size={20} />
                <Text fw={600} size="lg">
                  {location.label}
                </Text>
              </Group>
              <SegmentedControl
                data={[
                  {
                    label: m.workLocationBoard.scopeLocation,
                    value: "location",
                  },
                  {
                    label: fillMessage(m.workLocationBoard.scopeGroupNamed, {
                      name: location.groupName,
                    }),
                    value: "group",
                  },
                ]}
                onChange={(v) => go({ scope: v as BoardScope })}
                size="md"
                value={scope}
              />
            </Group>
          </Paper>
        )}

        {unknownCode != null && (
          <Alert color="orange" icon={<IconAlertTriangle size={20} />}>
            {m.workLocationBoard.locationUnknown}
          </Alert>
        )}

        {scanError && (
          <Alert color="orange" icon={<IconAlertTriangle size={20} />}>
            {scanError}
          </Alert>
        )}

        {/* 一覧の場所はフィルタでしかない — 記録される場所は端末の既定のまま */}
        {mismatch && deviceDefault != null && location != null && (
          <Alert color="yellow" icon={<IconAlertTriangle size={20} />}>
            {fillMessage(m.workLocationBoard.deviceDefaultMismatch, {
              deviceLabel: deviceDefault.label,
              label: location.label,
            })}
          </Alert>
        )}

        {scanOpen && <QrScannerView onScan={handleScan} />}

        {location == null ? (
          <Center style={{ flex: 1 }}>
            <Stack align="center" gap="sm" maw={520}>
              <ThemeIcon color="blue" radius="md" size={64} variant="light">
                <IconMapPin size={36} />
              </ThemeIcon>
              <Text c="dimmed" ta="center">
                {m.workLocationBoard.noDefaultLocation}
              </Text>
            </Stack>
          </Center>
        ) : steps.length === 0 ? (
          <Center style={{ flex: 1 }}>
            <Stack align="center" gap="sm">
              <ThemeIcon color="blue" radius="md" size={64} variant="light">
                <IconMapPin size={36} />
              </ThemeIcon>
              <Text c="dimmed">{m.workLocationBoard.empty}</Text>
            </Stack>
          </Center>
        ) : (
          SECTION_ORDER.map((bucket) => {
            const rows = byBucket(bucket);
            if (rows.length === 0) return null;
            return (
              <Stack gap="sm" key={bucket}>
                <Text c="dimmed" fw={600} size="sm">
                  {bucket === "OVERDUE"
                    ? m.steps.sections.overdue
                    : bucket === "TODAY"
                      ? m.steps.sections.today
                      : m.steps.sections.upcoming}
                </Text>
                {rows.map((item) => (
                  <LocationStepCard
                    item={item}
                    key={item.step.stepId}
                    scannedCode={mismatch ? location.code : null}
                    scope={scope}
                  />
                ))}
              </Stack>
            );
          })
        )}
      </Stack>
    </Box>
  );
}

function LocationStepCard({
  item,
  scannedCode,
  scope,
}: {
  item: LocationStepItem;
  /**
   * 端末の既定と違う場所を見ているときのコード。実行画面へ持ち越して、
   * 開始時の実績にその場所が入るようにする（読み取った QR > 端末の既定 —
   * 既存の優先順位と同じ）。権威は API 側の検証。
   */
  scannedCode: string | null;
  scope: BoardScope;
}) {
  const router = useRouter();
  const { m } = useI18n();
  const { step } = item;

  const openable =
    item.canOperate &&
    (step.sessionState === "STARTABLE" ||
      step.sessionState === "WORKING" ||
      step.sessionState === "PAUSED");

  const open = () => {
    const params = new URLSearchParams({ from: "loc" });
    if (scannedCode != null) params.set("loc", scannedCode);
    if (scope === "group") params.set("scope", "group");
    router.push(`/steps/${step.stepId}?${params.toString()}`);
  };

  return (
    <UnstyledButton
      disabled={!openable}
      onClick={() => openable && open()}
      style={{ opacity: openable ? 1 : 0.6 }}
    >
      <Paper p="md" radius="md" withBorder>
        <Group align="flex-start" justify="space-between" wrap="nowrap">
          <Stack gap={4} style={{ minWidth: 0 }}>
            <Group gap="xs" wrap="nowrap">
              <Text fw={600} size="lg" truncate>
                {step.stepName}
              </Text>
              {step.executionLocation === "OUTSOURCE" && (
                <Badge color="orange" size="sm" variant="outline">
                  {m.steps.card.outsource}
                </Badge>
              )}
            </Group>
            <Text c="dimmed" size="sm" truncate>
              {fillMessage(m.steps.card.workOrder, {
                n: step.workOrderNumber,
              })}
              {` ${m.common.separator} ${step.productName}`}
            </Text>
            <Text c="dimmed" size="sm" truncate>
              {item.assigneeNames.length > 0
                ? fillMessage(m.workLocationBoard.assignees, {
                    names: item.assigneeNames.join(" / "),
                  })
                : m.woScan.unplanned}
              {step.workLocationName
                ? ` ${m.common.separator} ${step.workLocationName}`
                : ""}
            </Text>
            <Group gap="sm" mt={2} wrap="wrap">
              {step.inputQuantity != null ? (
                <Text c="dimmed" size="sm">
                  {fillMessage(m.steps.card.inputRecorded, {
                    n: step.inputQuantity,
                  })}
                </Text>
              ) : (
                step.expectedInputQuantity != null && (
                  <Text c="dimmed" size="sm">
                    {fillMessage(m.steps.card.expectedInput, {
                      n: step.expectedInputQuantity,
                    })}
                  </Text>
                )
              )}
              {step.outputSuccessQuantity != null && (
                <Text c="green" size="sm">
                  {fillMessage(m.steps.card.okOutput, {
                    n: step.outputSuccessQuantity,
                  })}
                </Text>
              )}
            </Group>
          </Stack>
          <Stack align="flex-end" gap={6} style={{ flexShrink: 0 }}>
            <Badge
              color={stateColor(step.sessionState)}
              size="lg"
              variant="light"
            >
              {stateLabel(m, step.sessionState, step.lockedByName)}
            </Badge>
            {!item.canOperate && step.sessionState !== "COMPLETED" && (
              <Badge color="gray" size="sm" variant="outline">
                {m.workLocationBoard.plannedForOthers}
              </Badge>
            )}
          </Stack>
        </Group>
      </Paper>
    </UnstyledButton>
  );
}
