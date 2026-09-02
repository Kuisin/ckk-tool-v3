"use client";

/**
 * RespondForm — フォームに答える画面（/f/<code> と、自分の回答の編集）。
 *
 * 受付前・受付終了のときは送信させないが、**これは UI の親切に過ぎない** —
 * 本当の判定はサーバ (actions.ts) が同じ関数でやり直す。
 */

import { Alert, Anchor, Group, Paper, Stack, Text, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconClock, IconLock } from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { discardDraft } from "@/app/(dashboard)/general/forms/actions";
import {
  CancelButton,
  GhostButton,
  PrimaryButton,
  SecondaryButton,
} from "@/components/ui/buttons";
import { openConfirm } from "@/components/ui/modals";
import { useIsMobile } from "@/hooks/useViewport";
import {
  AVAILABILITY_LABEL,
  type FormAnswerValue,
  type FormAvailability,
  type FormFieldDef,
  validateAnswers,
} from "@/lib/form-schema";
import { FormFieldInput } from "./FormFieldInput";

export function RespondForm({
  title,
  description,
  fields,
  availability,
  submittable,
  initialAnswers = {},
  closesAtLabel,
  allowDraft = true,
  drafts = [],
  submitLabel,
  embedded = false,
  onSubmit,
  onCancel,
}: {
  title: string;
  description?: string | null;
  fields: FormFieldDef[];
  availability: FormAvailability;
  /**
   * いま送信してよいか。**受付中かどうかとは別物** — 「編集は指定日時まで」の
   * 設定だと、受付が終わったあとでも自分の回答は直せる。ここを availability
   * だけで決めると、その編集画面がまるごと無効になる。
   */
  submittable: boolean;
  initialAnswers?: Record<string, FormAnswerValue>;
  closesAtLabel?: string | null;
  allowDraft?: boolean;
  /** 書きかけの下書き（新規回答画面でだけ渡す）。 */
  drafts?: { responseNumber: string; href: string }[];
  /**
   * 詳細画面のタブに埋め込むとき true。**見出しと外枠を出さない** — 画面には
   * 既に書類のタイトルがあり、2 つ目のタイトルと中央寄せの幅制限が並ぶと
   * どこを読んでいるのか分からなくなる（ApprovalFlowEditor の embedded と同じ）。
   */
  embedded?: boolean;
  submitLabel?: string;
  onSubmit: (
    answers: Record<string, FormAnswerValue>,
    asDraft: boolean,
  ) => Promise<{ ok: boolean; error?: string }>;
  onCancel?: () => void;
}) {
  const tr = useTranslations();
  const router = useRouter();
  const isMobile = useIsMobile();
  const [isPending, startTransition] = useTransition();
  const [answers, setAnswers] = useState(initialAnswers);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const effectiveSubmitLabel =
    submitLabel ?? tr("forms.respondFormClient.send");

  const open = submittable;

  const submit = (asDraft: boolean) => {
    if (!asDraft) {
      const found = validateAnswers(fields, answers);
      setErrors(found);
      if (Object.keys(found).length > 0) {
        notifications.show({
          title: tr("forms.respondForm.checkWhatYouEntered"),
          message: Object.values(found)[0],
          color: "red",
        });
        return;
      }
    }
    startTransition(async () => {
      const result = await onSubmit(answers, asDraft);
      if (result.ok) {
        notifications.show({
          message: asDraft
            ? tr("forms.respondForm.draftSaved")
            : tr("forms.respondForm.sent"),
          color: "green",
        });
        router.refresh();
      } else {
        notifications.show({
          title: tr("common.error2"),
          message: result.error ?? tr("common.couldNotSave"),
          color: "red",
        });
      }
    });
  };

  return (
    <Stack
      gap="md"
      maw={embedded ? undefined : 840}
      mx={embedded ? undefined : "auto"}
      p={embedded ? undefined : "md"}
    >
      {!embedded && (
        <Stack gap={4}>
          <Title order={3}>{title}</Title>
          {description && (
            <Text c="dimmed" size="sm" style={{ whiteSpace: "pre-wrap" }}>
              {description}
            </Text>
          )}
        </Stack>
      )}

      {drafts.length > 0 && <DraftResumeList drafts={drafts} />}

      {!open && availability !== "OPEN" && (
        <Alert
          color={availability === "SCHEDULED" ? "yellow" : "gray"}
          icon={
            availability === "SCHEDULED" ? (
              <IconClock size={16} />
            ) : (
              <IconLock size={16} />
            )
          }
        >
          {availability === "SCHEDULED"
            ? tr("forms.respondForm.thisFormIsNotOpenYet")
            : tr("forms.respondForm.receptionClosedWithLabel", {
                label: AVAILABILITY_LABEL[availability],
              })}
        </Alert>
      )}

      {open && closesAtLabel && (
        <Text c="dimmed" size="xs">
          {tr("forms.respondForm.receptionClosesAt")}: {closesAtLabel}
        </Text>
      )}

      <Paper p="md" radius="md" shadow="xs">
        <Stack gap="md">
          {fields.map((field) => (
            <FormFieldInput
              disabled={!open || isPending}
              error={errors[field.key]}
              field={field}
              key={field.key}
              onChange={(v) => setAnswers({ ...answers, [field.key]: v })}
              value={answers[field.key]}
            />
          ))}
        </Stack>
      </Paper>

      {/* モバイルは主操作（送信）を上に、全幅で積む（design.md §8.3 — 画面下は
          ソフトキーボードに取られる）。PC は右寄せの 1 行。 */}
      <div className="form-actions">
        {isMobile ? (
          <Stack gap="xs">
            <PrimaryButton
              disabled={!open}
              fullWidth
              loading={isPending}
              onClick={() => submit(false)}
              type="button"
            >
              {effectiveSubmitLabel}
            </PrimaryButton>
            {allowDraft && (
              <SecondaryButton
                disabled={!open}
                fullWidth
                loading={isPending}
                onClick={() => submit(true)}
              >
                {tr("forms.respondForm.saveAsDraft")}
              </SecondaryButton>
            )}
            {onCancel && <CancelButton fullWidth onClick={onCancel} />}
          </Stack>
        ) : (
          <Group justify="flex-end">
            {onCancel && <CancelButton onClick={onCancel} />}
            {allowDraft && (
              <SecondaryButton
                disabled={!open}
                loading={isPending}
                onClick={() => submit(true)}
              >
                {tr("forms.respondForm.saveAsDraft")}
              </SecondaryButton>
            )}
            <PrimaryButton
              disabled={!open}
              loading={isPending}
              onClick={() => submit(false)}
              type="button"
            >
              {effectiveSubmitLabel}
            </PrimaryButton>
          </Group>
        )}
      </div>
    </Stack>
  );
}

/**
 * 書きかけの下書きを続きから開くための一覧。
 *
 * 下書きは**何本でも持てる**（訪問先ごとに書きかけを残す、といった使い方）。
 * 一覧に出さないと、URL を控えていない限り二度とたどり着けず、次に開いた
 * ときには空のフォームが出るだけ — 実際そうなっていた。
 */
function DraftResumeList({
  drafts,
}: {
  drafts: { responseNumber: string; href: string }[];
}) {
  const tr = useTranslations();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  const discard = (responseNumber: string) =>
    openConfirm({
      title: tr("forms.respondForm.deleteTheDraft"),
      message: tr("forms.respondForm.thisDiscardsTheDraftWhatYou"),
      confirmLabel: tr("common.delete2"),
      onConfirm: async () => {
        setBusy(responseNumber);
        const result = await discardDraft(responseNumber);
        setBusy(null);
        if (result.ok) {
          notifications.show({
            message: tr("forms.respondForm.theDraftWasDeleted"),
            color: "green",
          });
          router.refresh();
        } else {
          notifications.show({
            title: tr("common.error2"),
            message: result.error ?? tr("forms.respondForm.couldNotBeDeleted"),
            color: "red",
          });
        }
      },
    });

  return (
    <Paper p="sm" radius="md" withBorder>
      <Stack gap="xs">
        <Text fw={600} size="sm">
          {tr("forms.respondForm.draftsInProgressWithCount", {
            count: drafts.length,
          })}
        </Text>
        {drafts.map((d) => (
          <Group
            gap="xs"
            justify="space-between"
            key={d.responseNumber}
            wrap="nowrap"
          >
            <Anchor component={Link} ff="mono" href={d.href} size="sm">
              {d.responseNumber}
            </Anchor>
            <GhostButton
              loading={busy === d.responseNumber}
              onClick={() => discard(d.responseNumber)}
            >
              {tr("common.delete")}
            </GhostButton>
          </Group>
        ))}
        <Text c="dimmed" size="xs">
          {tr("forms.respondForm.fillInTheBlankFormBelow")}
        </Text>
      </Stack>
    </Paper>
  );
}
