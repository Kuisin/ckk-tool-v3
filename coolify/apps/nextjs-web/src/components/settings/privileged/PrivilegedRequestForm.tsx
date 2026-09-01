"use client";

/**
 * PrivilegedRequestForm — 時限昇格の申請フォーム（SY0G）。
 *
 * 「対象 → 操作 → 理由 → 期間 → 1 回の持ち時間」の順。操作を粗い単位ではなく
 * 1 つずつ選ばせるのは、承認者が「何を許すのか」を読んで判断できるようにする
 * ため（登録簿は lib/privileged-operations.ts）。
 *
 * 期間の上限（申請から 14 日）は maxDate で選べなくし、送信時にも
 * validateRequestWindow で見る。DB にも同じ CHECK があるので三重だが、
 * それぞれ役割が違う: 選ばせない / 読める理由を返す / 画面を通らない呼び出しを止める。
 */

import {
  Checkbox,
  NumberInput,
  Select,
  Stack,
  Text,
  Textarea,
} from "@mantine/core";
import { DateTimePicker } from "@mantine/dates";
import { notifications } from "@mantine/notifications";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMemo, useState, useTransition } from "react";
import { requestPrivilegedAccess } from "@/app/(dashboard)/settings/privileged-access/actions";
import { FormSection, FormShell } from "@/components/ui/shells";
import {
  MAX_DURATION_MINUTES,
  MAX_WINDOW_DAYS,
  validateRequestWindow,
} from "@/lib/privileged-access-core";
import {
  ELEVATION_CODE_LABEL,
  type ElevationCode,
  operationsForCode,
} from "@/lib/privileged-operations";

const BASE_PATH = "/settings/privileged-access";
const DAY_MS = 86_400_000;

export function PrivilegedRequestForm({
  codes,
}: {
  /** その人が申請できる権限コードだけ。 */
  codes: ElevationCode[];
}) {
  const tr = useTranslations();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [code, setCode] = useState<ElevationCode | null>(codes[0] ?? null);
  const [operations, setOperations] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const now = useMemo(() => new Date(), []);
  const [startsAt, setStartsAt] = useState<string | null>(now.toISOString());
  const [endsAt, setEndsAt] = useState<string | null>(
    new Date(now.getTime() + 7 * DAY_MS).toISOString(),
  );
  const [duration, setDuration] = useState<number>(60);

  // 上限は「申請時点から」14 日。開始を先送りしても総延長は伸びない。
  const maxEnd = useMemo(
    () => new Date(now.getTime() + MAX_WINDOW_DAYS * DAY_MS),
    [now],
  );

  const ops = code ? operationsForCode(code) : [];

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!code) return;
    if (operations.length === 0) {
      notifications.show({
        title: tr("settings.privileged.selectAtLeastOneOperation"),
        message: "",
        color: "red",
      });
      return;
    }
    if (!startsAt || !endsAt) return;
    const invalid = validateRequestWindow(
      {
        windowStartsAt: startsAt,
        windowEndsAt: endsAt,
        durationMinutes: duration,
      },
      new Date(),
    );
    if (invalid) {
      notifications.show({ title: invalid, message: "", color: "red" });
      return;
    }
    startTransition(async () => {
      const res = await requestPrivilegedAccess({
        code,
        operations,
        reason,
        windowStartsAt: startsAt,
        windowEndsAt: endsAt,
        durationMinutes: duration,
      });
      if (res.ok) {
        notifications.show({
          title: tr("settings.privileged.requested"),
          message: tr("settings.privileged.theyBecomeUsableOnceApproved"),
          color: "green",
        });
        router.push(BASE_PATH);
      } else {
        notifications.show({
          title: tr("common.error2"),
          message: res.error,
          color: "red",
        });
      }
    });
  };

  if (codes.length === 0) {
    return (
      <Text c="dimmed" p="md" size="sm">
        {tr("settings.privileged.thereAreNoPrivilegedOperationsYou")}
      </Text>
    );
  }

  return (
    <FormShell
      breadcrumbs={[
        tr("common.system"),
        { label: tr("common.privilegedAccess"), href: BASE_PATH },
        tr("settings.privileged.request"),
      ]}
      isPending={isPending}
      onCancel={() => router.push(BASE_PATH)}
      onSubmit={submit}
      submitLabel={tr("common.request2")}
      title={tr("settings.privileged.requestPrivilegedAccess2")}
    >
      <FormSection title={tr("common.target")}>
        <Select
          data={codes.map((c) => ({
            value: c,
            label: ELEVATION_CODE_LABEL[c].ja,
          }))}
          label={tr("common.permission")}
          onChange={(v) => {
            setCode(v as ElevationCode);
            setOperations([]);
          }}
          value={code}
          withAsterisk
        />
      </FormSection>

      <FormSection
        description={tr(
          "settings.privileged.theApproverReviewsEachOperationYou",
        )}
        title={tr("common.actions")}
      >
        <Checkbox.Group onChange={setOperations} value={operations}>
          <Stack gap="sm">
            {ops.map((op) => (
              <Checkbox
                description={op.description.ja}
                key={op.key}
                label={op.label.ja}
                value={op.key}
              />
            ))}
          </Stack>
        </Checkbox.Group>
      </FormSection>

      <FormSection title={tr("common.reason")}>
        <Textarea
          autosize
          description={tr("settings.privileged.writeWhyTheOperationIsNeeded")}
          label={tr("settings.privileged.reasonForTheRequest")}
          minRows={3}
          onChange={(e) => setReason(e.currentTarget.value)}
          value={reason}
          withAsterisk
        />
      </FormSection>

      <FormSection
        description={`利用できる期間は申請から最長 ${MAX_WINDOW_DAYS} 日です`}
        title={tr("common.period")}
      >
        <DateTimePicker
          label={tr("settings.privileged.startsAt")}
          minDate={now}
          onChange={setStartsAt}
          value={startsAt}
          withAsterisk
        />
        <DateTimePicker
          label={tr("settings.privileged.endsAt")}
          maxDate={maxEnd}
          minDate={now}
          onChange={setEndsAt}
          value={endsAt}
          withAsterisk
        />
        <NumberInput
          description={tr("settings.privileged.measuredFromTheFirstUseIt")}
          label={tr("settings.privileged.validTimePerUseMin")}
          max={MAX_DURATION_MINUTES}
          min={1}
          onChange={(v) => setDuration(typeof v === "number" ? v : 60)}
          value={duration}
          withAsterisk
        />
      </FormSection>
    </FormShell>
  );
}
