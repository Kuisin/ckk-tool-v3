"use client";

/**
 * RespondForm — フォームに答える画面（/f/<code> と、自分の回答の編集）。
 *
 * 受付前・受付終了のときは送信させないが、**これは UI の親切に過ぎない** —
 * 本当の判定はサーバ (actions.ts) が同じ関数でやり直す。
 *
 * **セクション（複数ページ）は既定オフ** — `sections` が空なら今までどおり
 * 全項目を 1 ページに描く。セクションがあるときは 1 セクションずつ描き、
 * 「次へ」を押すたびに lib/form-branching.ts resolveNextSection で次の
 * 遷移先を計算する（回答による分岐＝スキップはここで効く）。
 *
 * **どのセクションを通ったかは常にサーバが computeVisitedPath で再計算する**
 * （actions.ts submitResponse/updateResponse）。ここでの「次へ」の判定は
 * 画面の親切であって、最終的な必須項目チェックの権威ではない — スキップした
 * セクションの必須項目が提出をブロックしないことの保証は、サーバ側の同じ
 * 純関数呼び出しが担う。
 */

import { Alert, Anchor, Group, Paper, Stack, Text, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconClock, IconLock } from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMemo, useState, useTransition } from "react";
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
  computeVisitedPath,
  type FormSectionDef,
  fieldsOnPath,
  resolveNextSection,
  SECTION_SUBMIT,
} from "@/lib/form-branching";
import {
  availabilityLabel,
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
  sections = [],
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
  /** 空 = セクション未使用（従来どおり 1 ページに全項目）。 */
  sections?: FormSectionDef[];
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

  const orderedSections = useMemo(
    () => [...sections].sort((a, b) => a.order - b.order),
    [sections],
  );
  const sectioned = orderedSections.length > 0;

  // 現在のセクション（未使用なら null）。「戻る」履歴とは別に持つ —
  // 履歴は表示のためだけで、検証は毎回 computeVisitedPath で作り直す。
  const [currentSectionKey, setCurrentSectionKey] = useState<string | null>(
    orderedSections[0]?.key ?? null,
  );
  const [historyStack, setHistoryStack] = useState<string[]>([]);

  const currentSection = sectioned
    ? (orderedSections.find((s) => s.key === currentSectionKey) ??
      orderedSections[0])
    : null;
  const visibleFields =
    sectioned && currentSection
      ? fields.filter((f) => f.sectionKey === currentSection.key)
      : fields;

  const nextTarget =
    sectioned && currentSection
      ? resolveNextSection(currentSection, orderedSections, fields, answers)
      : SECTION_SUBMIT;
  const isLastStep = !sectioned || nextTarget === SECTION_SUBMIT;

  const submit = (asDraft: boolean) => {
    if (!asDraft) {
      // 実際に通ったセクションだけを検証する — スキップしたセクションの
      // 必須項目に足止めされない。最終判定はサーバが同じ関数で作り直す。
      const visited = computeVisitedPath(orderedSections, fields, answers);
      const relevant = fieldsOnPath(fields, orderedSections, visited);
      const found = validateAnswers(relevant, answers, tr);
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

  const goNext = () => {
    if (!currentSection) return;
    // このセクション分だけを検証してから進む（次のページへ行けるかどうかの
    // 足元チェック。最終的な提出可否は submit() 側の全体検証が決める）。
    const found = validateAnswers(visibleFields, answers, tr);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      notifications.show({
        title: tr("forms.respondForm.checkWhatYouEntered"),
        message: Object.values(found)[0],
        color: "red",
      });
      return;
    }
    if (nextTarget === SECTION_SUBMIT) {
      submit(false);
      return;
    }
    setHistoryStack((prev) => [...prev, currentSection.key]);
    setCurrentSectionKey(nextTarget);
    setErrors({});
  };

  const goBack = () => {
    setHistoryStack((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      if (last) setCurrentSectionKey(last);
      return prev.slice(0, -1);
    });
    setErrors({});
  };

  const primaryLabel =
    sectioned && !isLastStep
      ? tr("forms.respondForm.next")
      : effectiveSubmitLabel;
  const primaryAction = () =>
    sectioned && !isLastStep ? goNext() : submit(false);

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
                label: availabilityLabel(tr)[availability],
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
          {sectioned && currentSection && (
            <Title order={5}>{currentSection.title.ja}</Title>
          )}
          {visibleFields.map((field) => (
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

      {/* モバイルは主操作（送信/次へ）を上に、全幅で積む（design.md §8.3 —
          画面下はソフトキーボードに取られる）。PC は右寄せの 1 行。 */}
      <div className="form-actions">
        {isMobile ? (
          <Stack gap="xs">
            <PrimaryButton
              disabled={!open}
              fullWidth
              loading={isPending}
              onClick={primaryAction}
              type="button"
            >
              {primaryLabel}
            </PrimaryButton>
            {sectioned && historyStack.length > 0 && (
              <SecondaryButton fullWidth onClick={goBack}>
                {tr("forms.respondForm.back")}
              </SecondaryButton>
            )}
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
          <Group justify="space-between">
            <Group>
              {sectioned && historyStack.length > 0 && (
                <SecondaryButton onClick={goBack}>
                  {tr("forms.respondForm.back")}
                </SecondaryButton>
              )}
            </Group>
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
                onClick={primaryAction}
                type="button"
              >
                {primaryLabel}
              </PrimaryButton>
            </Group>
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
