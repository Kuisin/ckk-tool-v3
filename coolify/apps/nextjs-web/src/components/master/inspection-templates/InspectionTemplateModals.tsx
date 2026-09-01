"use client";

/**
 * InspectionTemplateModals.tsx — 検査表テンプレートの削除 / 有効・無効切替 /
 * 新バージョン作成と、検査項目のインライン追加・編集・削除ポップアップ
 * (MS09, design.md §13.4)。
 *
 * 検査項目は入力種別（真偽/数値/単一選択/複数選択）ごとに合格基準・目標値の
 * 入力欄を切り替える。抜取検査（全数/割合/本数）は種別共通。
 * 監査はテンプレート行に記録される（actions.ts 参照）。
 */

import {
  ActionIcon,
  Group,
  MultiSelect,
  NumberInput,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { searchUserOptions } from "@/app/(dashboard)/_shared/option-search";
import {
  addTemplateItem,
  createInspectionTemplateVersion,
  deleteInspectionTemplates,
  deleteTemplateItem,
  type InspectionTemplateItemInput,
  setInspectionTemplateApprovers,
  setInspectionTemplatesActive,
  updateTemplateItem,
} from "@/app/(dashboard)/master/inspection-templates/actions";
import { GhostButton } from "@/components/ui/buttons";
import {
  ConfirmModal,
  FormModal,
  type ModalBaseProps,
} from "@/components/ui/modals";
import {
  inspectionDepartmentOptions,
  inspectionItemSectionOptions,
  inspectionItemTypeOptions,
} from "@/lib/enum-labels";
import type { InspectionItemType } from "@/lib/inspection-core";
import {
  ApprovalTargetField,
  type ApproverOption,
} from "./ApprovalTargetField";

export interface InspectionTemplateModalTarget {
  id: number;
  code: string;
  version: number;
  name: string;
  isActive: boolean;
}

function label(t: InspectionTemplateModalTarget) {
  const code = `${t.code} v${t.version}`;
  return t.name ? `${t.name}（${code}）` : code;
}

export function DeleteInspectionTemplateModal({
  opened,
  onClose,
  target,
  onDone,
}: ModalBaseProps & {
  target: InspectionTemplateModalTarget | null;
  onDone?: () => void;
}) {
  const tr = useTranslations();
  const [isPending, startTransition] = useTransition();
  return (
    <ConfirmModal
      confirmLabel={tr("common.delete2")}
      loading={isPending}
      message={
        target
          ? `検査表テンプレート「${label(target)}」を削除します。検査項目も同時に削除されます。この操作は取り消せません。`
          : ""
      }
      onClose={onClose}
      onConfirm={() => {
        if (!target) return;
        startTransition(async () => {
          const result = await deleteInspectionTemplates([target.id]);
          if (result.ok) {
            notifications.show({
              title: tr("common.deleted"),
              message: `検査表テンプレート「${label(target)}」を削除しました`,
              color: "green",
            });
            onDone?.();
          } else {
            notifications.show({
              title: tr("common.error2"),
              message: result.error,
              color: "red",
            });
          }
        });
      }}
      opened={opened}
      title={tr("master.inspectionTemplates.deleteTheInspectionTemplate")}
      warning={tr("master.inspectionTemplates.itCannotBeDeletedWhileWork")}
    />
  );
}

export function ToggleInspectionTemplateActiveModal({
  opened,
  onClose,
  target,
  onDone,
}: ModalBaseProps & {
  target: InspectionTemplateModalTarget | null;
  onDone?: () => void;
}) {
  const tr = useTranslations();
  const [isPending, startTransition] = useTransition();
  const isActive = target?.isActive ?? true;
  return (
    <ConfirmModal
      confirmColor={isActive ? "red" : "blue"}
      confirmLabel={isActive ? "無効化する" : tr("common.enable2")}
      loading={isPending}
      message={
        target
          ? isActive
            ? `検査表テンプレート「${label(target)}」を無効化します。新規の指示書で選択できなくなります。`
            : `検査表テンプレート「${label(target)}」を有効化します。再び指示書で選択できるようになります。`
          : ""
      }
      onClose={onClose}
      onConfirm={() => {
        if (!target) return;
        startTransition(async () => {
          const result = await setInspectionTemplatesActive(
            [target.id],
            !isActive,
          );
          if (result.ok) {
            notifications.show({
              title: isActive ? "無効化しました" : tr("common.enabled2"),
              message: `検査表テンプレート「${label(target)}」を${isActive ? "無効化" : "有効化"}しました`,
              color: "green",
            });
            onDone?.();
          } else {
            notifications.show({
              title: tr("common.error2"),
              message: result.error,
              color: "red",
            });
          }
        });
      }}
      opened={opened}
      title={
        isActive
          ? tr("master.inspectionTemplates.disableTheInspectionTemplate")
          : tr("master.inspectionTemplates.enableTheInspectionTemplate")
      }
    />
  );
}

/** 新バージョン作成の確認 — 作成後は新バージョンの詳細へ。 */
export function CreateVersionModal({
  opened,
  onClose,
  target,
  onCreated,
}: ModalBaseProps & {
  target: InspectionTemplateModalTarget | null;
  onCreated: (newId: number) => void;
}) {
  const tr = useTranslations();
  const [isPending, startTransition] = useTransition();
  return (
    <ConfirmModal
      confirmColor="blue"
      confirmLabel={tr("common.createANewVersion")}
      loading={isPending}
      message={
        target
          ? `「${label(target)}」の検査項目をコピーして v${target.version + 1} 以降の新バージョンを作成します。既存の指示書・検査記録は現在のバージョンのまま変わりません。`
          : ""
      }
      onClose={onClose}
      onConfirm={() => {
        if (!target) return;
        startTransition(async () => {
          const result = await createInspectionTemplateVersion(target.id);
          if (result.ok) {
            notifications.show({
              title: tr("common.aNewVersionWasCreated"),
              message: `${target.code} v${result.data.version} を作成しました`,
              color: "green",
            });
            onClose();
            onCreated(result.data.id);
          } else {
            notifications.show({
              title: tr("common.error2"),
              message: result.error,
              color: "red",
            });
          }
        });
      }}
      opened={opened}
      title={tr("master.inspectionTemplates.createANewVersion")}
    />
  );
}

/**
 * 検査承認グループの変更（ロック中でも可 — 測定定義に触れないため）。
 * 承認設定 MS0B の approval_groups から選ぶ。未設定 = 誰でも検収できる。
 */
export function SetApproversModal({
  opened,
  onClose,
  target,
  currentGroupId,
  currentApprovers,
  groupOptions,
  onDone,
}: ModalBaseProps & {
  target: InspectionTemplateModalTarget | null;
  currentGroupId: string | null;
  currentApprovers: ApproverOption[];
  groupOptions: { value: string; label: string }[];
  onDone?: () => void;
}) {
  const tr = useTranslations();
  const [isPending, startTransition] = useTransition();
  const [groupId, setGroupId] = useState<string | null>(currentGroupId);
  const [approvers, setApprovers] =
    useState<ApproverOption[]>(currentApprovers);

  // biome-ignore lint/correctness/useExhaustiveDependencies: 開いた瞬間の値だけでよい
  useEffect(() => {
    if (opened) {
      setGroupId(currentGroupId);
      setApprovers(currentApprovers);
    }
  }, [opened]);

  return (
    <FormModal
      loading={isPending}
      onClose={onClose}
      onSubmit={(e) => {
        e.preventDefault();
        if (!target) return;
        startTransition(async () => {
          const result = await setInspectionTemplateApprovers(
            target.id,
            groupId ? Number(groupId) : null,
            approvers.map((a) => a.value),
          );
          if (result.ok) {
            notifications.show({
              title: tr(
                "master.inspectionTemplates.theInspectionApprovalRecipientWasChanged",
              ),
              message: label(target),
              color: "green",
            });
            onClose();
            onDone?.();
          } else {
            notifications.show({
              title: tr("common.error2"),
              message: result.error,
              color: "red",
            });
          }
        });
      }}
      opened={opened}
      submitLabel={tr("common.save2")}
      title={tr(
        "master.inspectionTemplates.changeTheInspectionApprovalRecipient2",
      )}
    >
      <ApprovalTargetField
        approvers={approvers}
        groupId={groupId}
        groupOptions={groupOptions}
        onApproversChange={setApprovers}
        onGroupChange={setGroupId}
        onSearchApprovers={searchUserOptions}
      />
    </FormModal>
  );
}

// ── 検査項目 ─────────────────────────────────────────────────────────────────

export interface InspectionOptionRow {
  value: string;
  labelJa: string;
  labelEn: string;
}

export type InspectionItemSection = "MEASUREMENT" | "SHAPE";
export type InspectionDepartment = "MANUFACTURING" | "QUALITY_ASSURANCE";

export interface InspectionTemplateItemRow {
  id: number;
  itemNameJa: string;
  itemNameEn: string;
  inputType: InspectionItemType;
  unit: string;
  toleranceMin: number | null;
  toleranceMax: number | null;
  options: InspectionOptionRow[];
  acceptBool: boolean | null;
  acceptOptions: string[];
  goalNumber: number | null;
  goalBool: boolean | null;
  goalOptions: string[];
  allowManualOverride: boolean;
  isRequired: boolean;
  sortOrder: number;
  section: InspectionItemSection;
  department: InspectionDepartment | null;
  measurementEquipment: string;
  nominalValue: number | null;
  toleranceTopDelta: number | null;
  toleranceBottomDelta: number | null;
}

/** 追加行の value 採番（既存の "oN" の最大 + 1。ラベル変更でも value は不変）。 */
function nextOptionValue(options: InspectionOptionRow[]): string {
  const max = options.reduce((acc, o) => {
    const m = /^o(\d+)$/.exec(o.value);
    return m ? Math.max(acc, Number(m[1])) : acc;
  }, 0);
  return `o${max + 1}`;
}

const BOOL_SEGMENT = [
  { value: "true", label: "はい" },
  { value: "false", label: "いいえ" },
];

/** 検査項目の追加・編集（item = null で追加モード）。 */
export function InspectionTemplateItemModal({
  opened,
  onClose,
  templateId,
  item,
  defaultSortOrder = 10,
  layoutStyle = "DIMENSIONAL",
  onDone,
}: ModalBaseProps & {
  templateId: number;
  item: InspectionTemplateItemRow | null;
  /** 追加時の表示順初期値（既存項目の最大 + 10）。 */
  defaultSortOrder?: number;
  /** 部門欄（製造課管轄/品証課管轄）は CHECKLIST レイアウトのときだけ出す。 */
  layoutStyle?: "DIMENSIONAL" | "CHECKLIST";
  onDone?: () => void;
}) {
  const tr = useTranslations();
  const locale = useLocale();
  const [isPending, startTransition] = useTransition();
  const isEdit = !!item;

  const [itemNameJa, setItemNameJa] = useState("");
  const [itemNameEn, setItemNameEn] = useState("");
  const [inputType, setInputType] = useState<InspectionItemType>("NUMBER");
  const [unit, setUnit] = useState("");
  const [toleranceMin, setToleranceMin] = useState<number | null>(null);
  const [toleranceMax, setToleranceMax] = useState<number | null>(null);
  const [options, setOptions] = useState<InspectionOptionRow[]>([]);
  const [acceptBool, setAcceptBool] = useState(true);
  const [acceptOptions, setAcceptOptions] = useState<string[]>([]);
  const [goalNumber, setGoalNumber] = useState<number | null>(null);
  const [goalBool, setGoalBool] = useState<boolean | null>(null);
  const [goalOptions, setGoalOptions] = useState<string[]>([]);
  const [allowManualOverride, setAllowManualOverride] = useState(true);
  const [isRequired, setIsRequired] = useState(true);
  const [sortOrder, setSortOrder] = useState(defaultSortOrder);
  const [section, setSection] = useState<InspectionItemSection>("MEASUREMENT");
  const [department, setDepartment] = useState<InspectionDepartment | null>(
    null,
  );
  const [measurementEquipment, setMeasurementEquipment] = useState("");
  const [nominalValue, setNominalValue] = useState<number | null>(null);
  const [toleranceTopDelta, setToleranceTopDelta] = useState<number | null>(
    null,
  );
  const [toleranceBottomDelta, setToleranceBottomDelta] = useState<
    number | null
  >(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // 開くたびに対象項目（または追加の初期値）でフォームをリセットする
  useEffect(() => {
    if (!opened) return;
    setItemNameJa(item?.itemNameJa ?? "");
    setItemNameEn(item?.itemNameEn ?? "");
    setInputType(item?.inputType ?? "NUMBER");
    setUnit(item?.unit ?? "");
    setToleranceMin(item?.toleranceMin ?? null);
    setToleranceMax(item?.toleranceMax ?? null);
    setOptions(item?.options ?? []);
    setAcceptBool(item?.acceptBool ?? true);
    setAcceptOptions(item?.acceptOptions ?? []);
    setGoalNumber(item?.goalNumber ?? null);
    setGoalBool(item?.goalBool ?? null);
    setGoalOptions(item?.goalOptions ?? []);
    setAllowManualOverride(item?.allowManualOverride ?? true);
    setIsRequired(item?.isRequired ?? true);
    setSortOrder(item?.sortOrder ?? defaultSortOrder);
    setSection(item?.section ?? "MEASUREMENT");
    setDepartment(item?.department ?? null);
    setMeasurementEquipment(item?.measurementEquipment ?? "");
    setNominalValue(item?.nominalValue ?? null);
    setToleranceTopDelta(item?.toleranceTopDelta ?? null);
    setToleranceBottomDelta(item?.toleranceBottomDelta ?? null);
    setErrors({});
  }, [opened, item, defaultSortOrder]);

  // 基本値+目標値+公差Top/Bottom が揃っているときのプレビュー（保存時の
  // toleranceMin/Max 自動計算と同じ規則 — actions.ts itemData() を参照）。
  const computedRange =
    inputType === "NUMBER" &&
    goalNumber != null &&
    toleranceTopDelta != null &&
    toleranceBottomDelta != null
      ? {
          min: goalNumber + toleranceBottomDelta,
          max: goalNumber + toleranceTopDelta,
        }
      : null;

  const isSelect =
    inputType === "SELECT_SINGLE" || inputType === "SELECT_MULTI";
  const selectData = options
    .filter((o) => o.labelJa.trim())
    .map((o) => ({ value: o.value, label: o.labelJa }));

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!itemNameJa.trim()) {
      next.itemNameJa = tr("common.enterTheItemNameInJapanese");
    }
    if (inputType === "NUMBER") {
      if (
        toleranceMin != null &&
        toleranceMax != null &&
        toleranceMin > toleranceMax
      ) {
        next.toleranceMax = tr(
          "master.inspectionTemplates.theUpperLimitMustBeAt",
        );
      }
    }
    if (isSelect) {
      if (options.length === 0 || options.every((o) => !o.labelJa.trim())) {
        next.options = tr(
          "master.inspectionTemplates.registerAtLeastOneOption",
        );
      } else if (options.some((o) => !o.labelJa.trim())) {
        next.options = tr(
          "master.inspectionTemplates.enterTheOptionSDisplayName",
        );
      }
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!validate()) return;
    startTransition(async () => {
      const input: InspectionTemplateItemInput = {
        itemNameJa: itemNameJa.trim(),
        itemNameEn,
        inputType,
        unit,
        toleranceMin,
        toleranceMax,
        goalNumber,
        nominalValue,
        toleranceTopDelta,
        toleranceBottomDelta,
        acceptBool: inputType === "BOOLEAN" ? acceptBool : null,
        goalBool,
        options: options
          .filter((o) => o.labelJa.trim())
          .map((o) => ({
            value: o.value,
            labelJa: o.labelJa.trim(),
            labelEn: o.labelEn,
          })),
        acceptOptions,
        goalOptions,
        allowManualOverride,
        isRequired,
        sortOrder,
        section,
        department: layoutStyle === "CHECKLIST" ? department : null,
        measurementEquipment,
      };
      const result = isEdit
        ? await updateTemplateItem(item.id, input)
        : await addTemplateItem(templateId, input);
      if (result.ok) {
        notifications.show({
          title: tr("common.saved2"),
          message: isEdit
            ? `検査項目「${input.itemNameJa}」を更新しました`
            : `検査項目「${input.itemNameJa}」を追加しました`,
          color: "green",
        });
        onClose();
        onDone?.();
      } else {
        notifications.show({
          title: tr("common.error2"),
          message: result.error,
          color: "red",
        });
      }
    });
  };

  const removeOption = (value: string) => {
    setOptions((prev) => prev.filter((o) => o.value !== value));
    setAcceptOptions((prev) => prev.filter((v) => v !== value));
    setGoalOptions((prev) => prev.filter((v) => v !== value));
  };

  return (
    <FormModal
      loading={isPending}
      onClose={onClose}
      onSubmit={handleSubmit}
      opened={opened}
      size="lg"
      submitLabel={isEdit ? "保存" : tr("common.add")}
      title={
        isEdit
          ? "検査項目の編集"
          : tr("master.inspectionTemplates.addAnInspectionItem")
      }
    >
      <Stack gap="sm">
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          <TextInput
            error={errors.itemNameJa}
            label={tr("common.itemNameJapanese")}
            onChange={(e) => setItemNameJa(e.currentTarget.value)}
            placeholder={tr("master.inspectionTemplates.eGOuterDiameter")}
            value={itemNameJa}
            withAsterisk
          />
          <TextInput
            label={tr("master.inspectionTemplates.itemNameEnglish")}
            onChange={(e) => setItemNameEn(e.currentTarget.value)}
            value={itemNameEn}
          />
        </SimpleGrid>

        <Select
          allowDeselect={false}
          data={inspectionItemTypeOptions(locale)}
          label={tr("master.inspectionTemplates.inputType")}
          onChange={(v) => {
            if (v) setInputType(v as InspectionItemType);
          }}
          value={inputType}
        />

        {inputType === "NUMBER" && (
          <SimpleGrid cols={{ base: 1, sm: 4 }} spacing="sm">
            <TextInput
              label={tr("common.unit")}
              onChange={(e) => setUnit(e.currentTarget.value)}
              placeholder={tr("master.inspectionTemplates.eGMm")}
              value={unit}
            />
            <NumberInput
              decimalScale={4}
              label={tr("master.inspectionTemplates.passRangeLower")}
              onChange={(val) =>
                setToleranceMin(val === "" || val == null ? null : Number(val))
              }
              value={toleranceMin ?? ""}
            />
            <NumberInput
              decimalScale={4}
              error={errors.toleranceMax}
              label={tr("master.inspectionTemplates.passRangeUpper")}
              onChange={(val) =>
                setToleranceMax(val === "" || val == null ? null : Number(val))
              }
              value={toleranceMax ?? ""}
            />
            <NumberInput
              decimalScale={4}
              description={tr(
                "master.inspectionTemplates.targetValueDoesNotAffectPass",
              )}
              label={tr("master.inspectionTemplates.targetValue")}
              onChange={(val) =>
                setGoalNumber(val === "" || val == null ? null : Number(val))
              }
              value={goalNumber ?? ""}
            />
          </SimpleGrid>
        )}

        {inputType === "NUMBER" && (
          <Stack gap="xs">
            <Text c="dimmed" size="xs">
              {tr("master.inspectionTemplates.theLegacyFormBaseValueTolerance")}
            </Text>
            <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
              <NumberInput
                decimalScale={4}
                description={tr(
                  "master.inspectionTemplates.referenceValueFromTheDrawingDisplay",
                )}
                label={tr("master.inspectionTemplates.baseValue")}
                onChange={(val) =>
                  setNominalValue(
                    val === "" || val == null ? null : Number(val),
                  )
                }
                value={nominalValue ?? ""}
              />
              <NumberInput
                decimalScale={4}
                error={errors.toleranceTopDelta}
                label={tr(
                  "master.inspectionTemplates.toleranceTopUpperAllowance",
                )}
                onChange={(val) =>
                  setToleranceTopDelta(
                    val === "" || val == null ? null : Number(val),
                  )
                }
                value={toleranceTopDelta ?? ""}
              />
              <NumberInput
                decimalScale={4}
                label={tr(
                  "master.inspectionTemplates.toleranceBottomLowerAllowance",
                )}
                onChange={(val) =>
                  setToleranceBottomDelta(
                    val === "" || val == null ? null : Number(val),
                  )
                }
                value={toleranceBottomDelta ?? ""}
              />
            </SimpleGrid>
            {computedRange && (
              <Text c="dimmed" size="xs">
                自動計算: 下限 {computedRange.min} 〜 上限 {computedRange.max}
                {unit ? ` ${unit}` : ""}
              </Text>
            )}
          </Stack>
        )}

        {inputType === "BOOLEAN" && (
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
            <Stack gap={4}>
              <Text fw={500} size="sm">
                {tr("master.inspectionTemplates.answersCountedAsAPass")}
              </Text>
              <SegmentedControl
                data={BOOL_SEGMENT}
                onChange={(v) => setAcceptBool(v === "true")}
                value={String(acceptBool)}
              />
            </Stack>
            <Stack gap={4}>
              <Text fw={500} size="sm">
                {tr("master.inspectionTemplates.targetAnswerOptional")}
              </Text>
              <SegmentedControl
                data={[
                  { value: "none", label: tr("common.notSet2") },
                  ...BOOL_SEGMENT,
                ]}
                onChange={(v) =>
                  setGoalBool(v === "none" ? null : v === "true")
                }
                value={goalBool == null ? "none" : String(goalBool)}
              />
            </Stack>
          </SimpleGrid>
        )}

        {isSelect && (
          <Stack gap="xs">
            <Text fw={500} size="sm">
              {tr("common.options")}
            </Text>
            {options.map((o, idx) => (
              <Group gap="xs" key={o.value} wrap="nowrap">
                <TextInput
                  aria-label={`選択肢 ${idx + 1}（日本語）`}
                  onChange={(e) => {
                    const labelJa = e.currentTarget.value;
                    setOptions((prev) =>
                      prev.map((p) =>
                        p.value === o.value ? { ...p, labelJa } : p,
                      ),
                    );
                  }}
                  placeholder={tr("common.displayNameJapanese")}
                  style={{ flex: 1 }}
                  value={o.labelJa}
                />
                <TextInput
                  aria-label={`選択肢 ${idx + 1}（English）`}
                  onChange={(e) => {
                    const labelEn = e.currentTarget.value;
                    setOptions((prev) =>
                      prev.map((p) =>
                        p.value === o.value ? { ...p, labelEn } : p,
                      ),
                    );
                  }}
                  placeholder="English"
                  style={{ flex: 1 }}
                  value={o.labelEn}
                />
                <Tooltip label={tr("common.removeOption")} withinPortal>
                  <ActionIcon
                    aria-label={`選択肢 ${idx + 1} を削除`}
                    color="red"
                    onClick={() => removeOption(o.value)}
                    variant="subtle"
                  >
                    <IconTrash size={14} />
                  </ActionIcon>
                </Tooltip>
              </Group>
            ))}
            {errors.options && (
              <Text c="red" size="xs">
                {errors.options}
              </Text>
            )}
            <Group>
              <GhostButton
                leftSection={<IconPlus size={14} />}
                onClick={() =>
                  setOptions((prev) => [
                    ...prev,
                    { value: nextOptionValue(prev), labelJa: "", labelEn: "" },
                  ])
                }
              >
                {tr("common.addAnOption")}
              </GhostButton>
            </Group>
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
              <MultiSelect
                data={selectData}
                description={tr(
                  "master.inspectionTemplates.ifNotSetPassFailIs",
                )}
                label={tr("master.inspectionTemplates.optionsCountedAsAPass")}
                onChange={setAcceptOptions}
                value={acceptOptions.filter((v) =>
                  selectData.some((d) => d.value === v),
                )}
              />
              {inputType === "SELECT_SINGLE" ? (
                <Select
                  clearable
                  data={selectData}
                  label={tr("master.inspectionTemplates.targetOptional")}
                  onChange={(v) => setGoalOptions(v ? [v] : [])}
                  value={goalOptions[0] ?? null}
                />
              ) : (
                <MultiSelect
                  data={selectData}
                  label={tr("master.inspectionTemplates.targetOptional")}
                  onChange={setGoalOptions}
                  value={goalOptions.filter((v) =>
                    selectData.some((d) => d.value === v),
                  )}
                />
              )}
            </SimpleGrid>
          </Stack>
        )}

        <Switch
          checked={allowManualOverride}
          description={tr(
            "master.inspectionTemplates.turningItOffLeavesOnlyAutomatic",
          )}
          label={tr(
            "master.inspectionTemplates.allowManuallyOverridingPassFail",
          )}
          onChange={(e) => setAllowManualOverride(e.currentTarget.checked)}
        />

        <SimpleGrid
          cols={{ base: 1, sm: layoutStyle === "CHECKLIST" ? 3 : 2 }}
          spacing="sm"
        >
          <Select
            allowDeselect={false}
            data={inspectionItemSectionOptions(locale)}
            description={tr("master.inspectionTemplates.theShapeFieldGoesInA")}
            label={tr("master.inspectionTemplates.listingType")}
            onChange={(v) => {
              if (v) setSection(v as InspectionItemSection);
            }}
            value={section}
          />
          {layoutStyle === "CHECKLIST" && (
            <Select
              clearable
              data={inspectionDepartmentOptions(locale)}
              label={tr("master.inspectionTemplates.department")}
              onChange={(v) => setDepartment(v as InspectionDepartment | null)}
              value={department}
            />
          )}
          <TextInput
            description={tr("master.inspectionTemplates.lEPrPSKH")}
            label={tr("master.inspectionTemplates.measuringInstrumentCode")}
            onChange={(e) => setMeasurementEquipment(e.currentTarget.value)}
            value={measurementEquipment}
          />
        </SimpleGrid>

        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          <NumberInput
            description={tr(
              "master.inspectionTemplates.theyAreShownSmallestFirst",
            )}
            label={tr("common.sortOrder")}
            onChange={(val) =>
              setSortOrder(val === "" || val == null ? 0 : Number(val))
            }
            value={sortOrder}
          />
          <Switch
            checked={isRequired}
            label={tr("master.inspectionTemplates.requiredFields")}
            mt="lg"
            onChange={(e) => setIsRequired(e.currentTarget.checked)}
          />
        </SimpleGrid>
      </Stack>
    </FormModal>
  );
}

export function DeleteInspectionTemplateItemModal({
  opened,
  onClose,
  item,
  onDone,
}: ModalBaseProps & {
  item: InspectionTemplateItemRow | null;
  onDone?: () => void;
}) {
  const tr = useTranslations();
  const [isPending, startTransition] = useTransition();
  return (
    <ConfirmModal
      confirmLabel={tr("common.delete2")}
      loading={isPending}
      message={
        item
          ? `検査項目「${item.itemNameJa}」を削除します。この操作は取り消せません。`
          : ""
      }
      onClose={onClose}
      onConfirm={() => {
        if (!item) return;
        startTransition(async () => {
          const result = await deleteTemplateItem(item.id);
          if (result.ok) {
            notifications.show({
              title: tr("common.deleted"),
              message: `検査項目「${item.itemNameJa}」を削除しました`,
              color: "green",
            });
            onDone?.();
          } else {
            notifications.show({
              title: tr("common.error2"),
              message: result.error,
              color: "red",
            });
          }
        });
      }}
      opened={opened}
      title={tr("master.inspectionTemplates.deleteTheInspectionItem2")}
    />
  );
}
