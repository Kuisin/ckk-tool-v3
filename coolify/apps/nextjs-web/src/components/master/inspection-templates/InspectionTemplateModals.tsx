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
import { useLocale } from "next-intl";
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
import { useTr } from "@/hooks/useTr";
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
  const tr = useTr();
  const [isPending, startTransition] = useTransition();
  return (
    <ConfirmModal
      confirmLabel={tr("削除する")}
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
              title: tr("削除しました"),
              message: `検査表テンプレート「${label(target)}」を削除しました`,
              color: "green",
            });
            onDone?.();
          } else {
            notifications.show({
              title: tr("エラー"),
              message: tr(result.error),
              color: "red",
            });
          }
        });
      }}
      opened={opened}
      title={tr("検査表テンプレートの削除")}
      warning={tr(
        tr(
          "このバージョンを参照する指示書・検査記録が存在する場合は削除できません。無効化をご検討ください。",
        ),
      )}
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
  const tr = useTr();
  const [isPending, startTransition] = useTransition();
  const isActive = target?.isActive ?? true;
  return (
    <ConfirmModal
      confirmColor={isActive ? "red" : "blue"}
      confirmLabel={isActive ? "無効化する" : tr("有効化する")}
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
              title: isActive ? "無効化しました" : tr("有効化しました"),
              message: `検査表テンプレート「${label(target)}」を${isActive ? "無効化" : "有効化"}しました`,
              color: "green",
            });
            onDone?.();
          } else {
            notifications.show({
              title: tr("エラー"),
              message: tr(result.error),
              color: "red",
            });
          }
        });
      }}
      opened={opened}
      title={
        isActive
          ? "検査表テンプレートの無効化"
          : tr("検査表テンプレートの有効化")
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
  const tr = useTr();
  const [isPending, startTransition] = useTransition();
  return (
    <ConfirmModal
      confirmColor="blue"
      confirmLabel={tr("新バージョンを作成")}
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
              title: tr("新バージョンを作成しました"),
              message: `${target.code} v${result.data.version} を作成しました`,
              color: "green",
            });
            onClose();
            onCreated(result.data.id);
          } else {
            notifications.show({
              title: tr("エラー"),
              message: tr(result.error),
              color: "red",
            });
          }
        });
      }}
      opened={opened}
      title={tr("新バージョンの作成")}
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
  const tr = useTr();
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
              title: tr("検査承認の宛先を変更しました"),
              message: label(target),
              color: "green",
            });
            onClose();
            onDone?.();
          } else {
            notifications.show({
              title: tr("エラー"),
              message: tr(result.error),
              color: "red",
            });
          }
        });
      }}
      opened={opened}
      submitLabel={tr("保存")}
      title={tr("検査承認の宛先の変更")}
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
  const tr = useTr();
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
      next.itemNameJa = tr("項目名（日本語）を入力してください");
    }
    if (inputType === "NUMBER") {
      if (
        toleranceMin != null &&
        toleranceMax != null &&
        toleranceMin > toleranceMax
      ) {
        next.toleranceMax = tr("合格範囲の上限は下限以上にしてください");
      }
    }
    if (isSelect) {
      if (options.length === 0 || options.every((o) => !o.labelJa.trim())) {
        next.options = tr("選択肢を 1 つ以上登録してください");
      } else if (options.some((o) => !o.labelJa.trim())) {
        next.options = tr("選択肢の表示名（日本語）を入力してください");
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
          title: tr("保存しました"),
          message: isEdit
            ? `検査項目「${input.itemNameJa}」を更新しました`
            : `検査項目「${input.itemNameJa}」を追加しました`,
          color: "green",
        });
        onClose();
        onDone?.();
      } else {
        notifications.show({
          title: tr("エラー"),
          message: tr(result.error),
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
      submitLabel={isEdit ? "保存" : tr("追加")}
      title={isEdit ? "検査項目の編集" : tr("検査項目の追加")}
    >
      <Stack gap="sm">
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          <TextInput
            error={errors.itemNameJa}
            label={tr("項目名（日本語）")}
            onChange={(e) => setItemNameJa(e.currentTarget.value)}
            placeholder={tr("例: 外径")}
            value={itemNameJa}
            withAsterisk
          />
          <TextInput
            label={tr("項目名（English）")}
            onChange={(e) => setItemNameEn(e.currentTarget.value)}
            value={itemNameEn}
          />
        </SimpleGrid>

        <Select
          allowDeselect={false}
          data={inspectionItemTypeOptions(locale)}
          label={tr("入力種別")}
          onChange={(v) => {
            if (v) setInputType(v as InspectionItemType);
          }}
          value={inputType}
        />

        {inputType === "NUMBER" && (
          <SimpleGrid cols={{ base: 1, sm: 4 }} spacing="sm">
            <TextInput
              label={tr("単位")}
              onChange={(e) => setUnit(e.currentTarget.value)}
              placeholder={tr("例: mm")}
              value={unit}
            />
            <NumberInput
              decimalScale={4}
              label={tr("合格範囲（下限）")}
              onChange={(val) =>
                setToleranceMin(val === "" || val == null ? null : Number(val))
              }
              value={toleranceMin ?? ""}
            />
            <NumberInput
              decimalScale={4}
              error={errors.toleranceMax}
              label={tr("合格範囲（上限）")}
              onChange={(val) =>
                setToleranceMax(val === "" || val == null ? null : Number(val))
              }
              value={toleranceMax ?? ""}
            />
            <NumberInput
              decimalScale={4}
              description={tr("狙い値（合否には影響しません）")}
              label={tr("目標値")}
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
              {tr(
                tr(
                  "旧帳票（基本値・公差 Top/Bottom）—\n              入力すると合格範囲（下限/上限）を\n              目標値からの差分で自動計算します。直接入力する場合は空欄のままで\n              構いません。",
                ),
              )}
            </Text>
            <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
              <NumberInput
                decimalScale={4}
                description={tr("図面等の基準値（表示のみ）")}
                label={tr("基本値")}
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
                label={tr("公差 Top（上振れ許容）")}
                onChange={(val) =>
                  setToleranceTopDelta(
                    val === "" || val == null ? null : Number(val),
                  )
                }
                value={toleranceTopDelta ?? ""}
              />
              <NumberInput
                decimalScale={4}
                label={tr("公差 Bottom（下振れ許容）")}
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
                {tr("合格とする回答")}
              </Text>
              <SegmentedControl
                data={BOOL_SEGMENT}
                onChange={(v) => setAcceptBool(v === "true")}
                value={String(acceptBool)}
              />
            </Stack>
            <Stack gap={4}>
              <Text fw={500} size="sm">
                {tr("目標回答（任意）")}
              </Text>
              <SegmentedControl
                data={[{ value: "none", label: tr("未設定") }, ...BOOL_SEGMENT]}
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
              {tr("選択肢")}
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
                  placeholder={tr("表示名（日本語）")}
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
                <Tooltip label={tr("選択肢を削除")} withinPortal>
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
                {tr("選択肢を追加")}
              </GhostButton>
            </Group>
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
              <MultiSelect
                data={selectData}
                description={tr("未設定の場合は手動で合否を判定します")}
                label={tr("合格とする選択肢")}
                onChange={setAcceptOptions}
                value={acceptOptions.filter((v) =>
                  selectData.some((d) => d.value === v),
                )}
              />
              {inputType === "SELECT_SINGLE" ? (
                <Select
                  clearable
                  data={selectData}
                  label={tr("目標（任意）")}
                  onChange={(v) => setGoalOptions(v ? [v] : [])}
                  value={goalOptions[0] ?? null}
                />
              ) : (
                <MultiSelect
                  data={selectData}
                  label={tr("目標（任意）")}
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
            tr(
              "オフにすると合格基準からの自動判定のみ（基準未設定の項目は常に手動）",
            ),
          )}
          label={tr("合否の手動上書きを許可")}
          onChange={(e) => setAllowManualOverride(e.currentTarget.checked)}
        />

        <SimpleGrid
          cols={{ base: 1, sm: layoutStyle === "CHECKLIST" ? 3 : 2 }}
          spacing="sm"
        >
          <Select
            allowDeselect={false}
            data={inspectionItemSectionOptions(locale)}
            description={tr("形状欄は主表と別枠のフリーフォーム欄に載ります")}
            label={tr("掲載区分")}
            onChange={(v) => {
              if (v) setSection(v as InspectionItemSection);
            }}
            value={section}
          />
          {layoutStyle === "CHECKLIST" && (
            <Select
              clearable
              data={inspectionDepartmentOptions(locale)}
              label={tr("部門")}
              onChange={(v) => setDepartment(v as InspectionDepartment | null)}
              value={department}
            />
          )}
          <TextInput
            description={tr(
              tr("LE/PR/P/S/K/H/M/N/Z 等（列見出しの接尾辞・凡例に使用）"),
            )}
            label={tr("測定機器コード")}
            onChange={(e) => setMeasurementEquipment(e.currentTarget.value)}
            value={measurementEquipment}
          />
        </SimpleGrid>

        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          <NumberInput
            description={tr("小さい順に表示されます")}
            label={tr("表示順")}
            onChange={(val) =>
              setSortOrder(val === "" || val == null ? 0 : Number(val))
            }
            value={sortOrder}
          />
          <Switch
            checked={isRequired}
            label={tr("必須項目")}
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
  const tr = useTr();
  const [isPending, startTransition] = useTransition();
  return (
    <ConfirmModal
      confirmLabel={tr("削除する")}
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
              title: tr("削除しました"),
              message: `検査項目「${item.itemNameJa}」を削除しました`,
              color: "green",
            });
            onDone?.();
          } else {
            notifications.show({
              title: tr("エラー"),
              message: tr(result.error),
              color: "red",
            });
          }
        });
      }}
      opened={opened}
      title={tr("検査項目の削除")}
    />
  );
}
