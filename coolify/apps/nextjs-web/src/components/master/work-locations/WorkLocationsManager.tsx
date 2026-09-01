"use client";

/**
 * WorkLocationsManager.tsx — 作業場所マスタ (MS0D) 単一管理画面。
 *
 * グループ（= 同型機械のまとまり・エリア区分。種別 + 拠点 + 状態）ごとの
 * カードに配下の場所（1 台の機械・1 区画。capacity = 同時に割り当て可能な
 * 作業数）をテーブル表示し、すべてモーダルで追加・編集・削除する。
 * 種別（machine / area + 管理者定義）は「種別管理」モーダルで編集する。
 * 場所は指示書の作業計画（work_order_step_plans）から選択される。
 */

import {
  ActionIcon,
  Badge,
  Box,
  Divider,
  Group,
  Menu,
  NumberInput,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconAdjustments,
  IconBuildingFactory2,
  IconDotsVertical,
  IconEdit,
  IconMapPin,
  IconPlus,
  IconQrcode,
  IconTrash,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import {
  addWorkLocation,
  createWorkLocationGroup,
  deleteWorkLocation,
  deleteWorkLocationGroup,
  saveWorkLocationTypes,
  updateWorkLocation,
  updateWorkLocationGroup,
  type WorkLocationGroupInput,
  type WorkLocationInput,
} from "@/app/(dashboard)/master/work-locations/actions";
import { ActiveBadge } from "@/components/ui/ActiveBadge";
import {
  GhostButton,
  PrimaryButton,
  SecondaryButton,
} from "@/components/ui/buttons";
import { DocNumber } from "@/components/ui/DocNumber";
import { EmptyState } from "@/components/ui/EmptyState";
import { HelpLabel } from "@/components/ui/HelpLabel";
import {
  ConfirmModal,
  FormModal,
  type ModalBaseProps,
} from "@/components/ui/modals";
import { PageHeader } from "@/components/ui/PageHeader";
import { LocalizedTextInput } from "@/components/ui/shells";
import { useIsMobile } from "@/hooks/useViewport";
import { fieldHelp, fieldHelpTip } from "@/lib/field-help";
import type { Tr } from "@/lib/i18n";
import { openInNewContext } from "@/lib/pwa-display";

/**
 * QR ラベル印刷シートを新しいタブで開く（SY08 と同じ `openInNewContext` —
 * `window.open` のブロックに掛からず、PWA でもアプリ内ブラウザで開く）。
 */
function openQrPrintSheet(ids: number[]) {
  openInNewContext(
    `/master/work-locations/print?ids=${encodeURIComponent(ids.join(","))}`,
  );
}

export interface WorkLocationRow {
  id: number;
  code: string;
  nameJa: string;
  nameEn: string;
  nameTranslations: Record<string, string>;
  capacity: number | null;
  sortOrder: number;
  isActive: boolean;
  notes: string;
  /** この場所を参照する作業計画数（削除可否の目安）。 */
  planCount: number;
  /** この場所を参照する作業実績数（削除可否の目安）。 */
  actualCount: number;
}

export interface WorkLocationGroupRow {
  id: number;
  code: string;
  nameJa: string;
  nameEn: string;
  nameTranslations: Record<string, string>;
  typeKey: string;
  plantId: number | null;
  plantName: string | null;
  sortOrder: number;
  isActive: boolean;
  notes: string;
  locations: WorkLocationRow[];
}

export interface WorkLocationTypeRow {
  key: string;
  labelJa: string;
  labelEn: string;
  builtin: boolean;
}

interface Option {
  value: string;
  label: string;
}

// フックを使えない素の関数なので、解決済みの `tr` を引数で受ける
// （lib/format.ts の Formatters と同じ約束）。
function notifyResult(
  tr: Tr,
  result: { ok: boolean; error?: string },
  message: string,
  onOk: () => void,
) {
  if (result.ok) {
    notifications.show({ title: tr("common.saved2"), message, color: "green" });
    onOk();
  } else {
    notifications.show({
      title: tr("common.error2"),
      message: result.error ?? tr("common.theOperationFailed"),
      color: "red",
    });
  }
}

// ── グループ追加/編集モーダル ────────────────────────────────────────────────

function GroupModal({
  opened,
  onClose,
  group,
  types,
  plantOptions,
  onDone,
}: ModalBaseProps & {
  group: WorkLocationGroupRow | null;
  types: WorkLocationTypeRow[];
  plantOptions: Option[];
  onDone: () => void;
}) {
  const tr = useTranslations();
  const [isPending, startTransition] = useTransition();
  const isEdit = !!group;
  const [code, setCode] = useState("");
  const [nameJa, setNameJa] = useState("");
  const [nameTranslations, setNameTranslations] = useState<
    Record<string, string>
  >({});
  const [typeKey, setTypeKey] = useState("machine");
  const [plantId, setPlantId] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState(0);
  const [isActive, setIsActive] = useState(true);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!opened) return;
    setCode(group?.code ?? "");
    setNameJa(group?.nameJa ?? "");
    setNameTranslations(group?.nameTranslations ?? {});
    setTypeKey(group?.typeKey ?? "machine");
    setPlantId(group?.plantId != null ? String(group.plantId) : null);
    setSortOrder(group?.sortOrder ?? 0);
    setIsActive(group?.isActive ?? true);
    setNotes(group?.notes ?? "");
  }, [opened, group]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    startTransition(async () => {
      const input: WorkLocationGroupInput = {
        code,
        nameJa,
        nameTranslations,
        typeKey,
        plantId: plantId ? Number(plantId) : null,
        sortOrder,
        isActive,
        notes,
      };
      const result = isEdit
        ? await updateWorkLocationGroup(group.id, input)
        : await createWorkLocationGroup(input);
      notifyResult(
        tr,
        result,
        isEdit
          ? tr("master.workLocationsManager.theGroupWasUpdated")
          : tr("master.workLocations.theGroupWasCreated"),
        () => {
          onClose();
          onDone();
        },
      );
    });
  };

  return (
    <FormModal
      loading={isPending}
      onClose={onClose}
      onSubmit={handleSubmit}
      opened={opened}
      size="lg"
      submitLabel={isEdit ? tr("common.save") : tr("common.create2")}
      title={
        isEdit
          ? tr("master.workLocationsManager.editGroup")
          : tr("master.workLocations.addAGroup")
      }
    >
      <Stack gap="sm">
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          <TextInput
            label={
              <HelpLabel
                {...fieldHelp("workLocation", "code", {
                  label: tr("master.workLocationsManager.code"),
                })}
              />
            }
            onChange={(e) => setCode(e.currentTarget.value)}
            placeholder={tr("master.workLocations.eGNcLathe")}
            value={code}
            withAsterisk
          />
          <Select
            allowDeselect={false}
            data={types.map((t) => ({ value: t.key, label: t.labelJa }))}
            label={<HelpLabel {...fieldHelp("workLocation", "type")} />}
            onChange={(v) => v && setTypeKey(v)}
            value={typeKey}
            withAsterisk
          />
          <Select
            clearable
            data={plantOptions}
            label={<HelpLabel {...fieldHelp("workLocation", "plant")} />}
            onChange={setPlantId}
            searchable
            value={plantId}
          />
          <NumberInput
            label={
              <HelpLabel
                {...fieldHelp("workLocation", "sortOrder", {
                  label: tr("common.sortOrder"),
                })}
              />
            }
            onChange={(v) =>
              setSortOrder(v === "" || v == null ? 0 : Number(v))
            }
            value={sortOrder}
          />
        </SimpleGrid>
        <LocalizedTextInput
          help={fieldHelpTip("workLocation", "code")}
          jaProps={{
            value: nameJa,
            onChange: (e) => setNameJa(e.currentTarget.value),
          }}
          label={tr("common.name2")}
          placeholder={tr("master.workLocations.eGNcLathe2")}
          required
          translationsProps={{
            value: nameTranslations,
            onChange: setNameTranslations,
          }}
        />
        <TextInput
          label={
            <HelpLabel
              {...fieldHelp("workLocation", "sortOrder", {
                label: tr("common.notes"),
              })}
            />
          }
          onChange={(e) => setNotes(e.currentTarget.value)}
          value={notes}
        />
        <Switch
          checked={isActive}
          label={
            <HelpLabel
              {...fieldHelp("workLocation", "sortOrder", {
                label: tr("common.enabled"),
              })}
            />
          }
          onChange={(e) => setIsActive(e.currentTarget.checked)}
        />
      </Stack>
    </FormModal>
  );
}

// ── 場所追加/編集モーダル ────────────────────────────────────────────────────

function LocationModal({
  opened,
  onClose,
  groupId,
  location,
  defaultSortOrder,
  onDone,
}: ModalBaseProps & {
  groupId: number;
  location: WorkLocationRow | null;
  defaultSortOrder: number;
  onDone: () => void;
}) {
  const tr = useTranslations();
  const [isPending, startTransition] = useTransition();
  const isEdit = !!location;
  const [code, setCode] = useState("");
  const [nameJa, setNameJa] = useState("");
  const [nameTranslations, setNameTranslations] = useState<
    Record<string, string>
  >({});
  const [capacity, setCapacity] = useState<number | null>(null);
  const [sortOrder, setSortOrder] = useState(defaultSortOrder);
  const [isActive, setIsActive] = useState(true);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!opened) return;
    setCode(location?.code ?? "");
    setNameJa(location?.nameJa ?? "");
    setNameTranslations(location?.nameTranslations ?? {});
    setCapacity(location?.capacity ?? null);
    setSortOrder(location?.sortOrder ?? defaultSortOrder);
    setIsActive(location?.isActive ?? true);
    setNotes(location?.notes ?? "");
  }, [opened, location, defaultSortOrder]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    startTransition(async () => {
      const input: WorkLocationInput = {
        code,
        nameJa,
        nameTranslations,
        capacity,
        sortOrder,
        isActive,
        notes,
      };
      const result = isEdit
        ? await updateWorkLocation(location.id, input)
        : await addWorkLocation(groupId, input);
      notifyResult(
        tr,
        result,
        isEdit
          ? tr("master.workLocationsManager.theWorkLocationWasUpdated")
          : tr("master.workLocations.theWorkLocationWasAdded"),
        () => {
          onClose();
          onDone();
        },
      );
    });
  };

  return (
    <FormModal
      loading={isPending}
      onClose={onClose}
      onSubmit={handleSubmit}
      opened={opened}
      size="lg"
      submitLabel={isEdit ? tr("common.save") : tr("common.add")}
      title={
        isEdit
          ? tr("master.workLocationsManager.editWorkLocation")
          : tr("master.workLocations.addAWorkLocation")
      }
    >
      <Stack gap="sm">
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          <TextInput
            label={
              <HelpLabel
                {...fieldHelp("workLocation", "code", {
                  label: tr("master.workLocationsManager.code"),
                })}
              />
            }
            onChange={(e) => setCode(e.currentTarget.value)}
            placeholder={tr("master.workLocations.eGNc01")}
            value={code}
            withAsterisk
          />
          <NumberInput
            description={tr("master.workLocations.howManyJobsCanBeAssigned")}
            label={<HelpLabel {...fieldHelp("workLocation", "capacity")} />}
            min={1}
            onChange={(v) =>
              setCapacity(v === "" || v == null ? null : Number(v))
            }
            value={capacity ?? ""}
          />
          <NumberInput
            label={
              <HelpLabel
                {...fieldHelp("workLocation", "sortOrder", {
                  label: tr("common.sortOrder"),
                })}
              />
            }
            onChange={(v) =>
              setSortOrder(v === "" || v == null ? 0 : Number(v))
            }
            value={sortOrder}
          />
          <Switch
            checked={isActive}
            label={
              <HelpLabel
                {...fieldHelp("workLocation", "sortOrder", {
                  label: tr("common.enabled"),
                })}
              />
            }
            mt="lg"
            onChange={(e) => setIsActive(e.currentTarget.checked)}
          />
        </SimpleGrid>
        <LocalizedTextInput
          help={fieldHelpTip("workLocation", "code")}
          jaProps={{
            value: nameJa,
            onChange: (e) => setNameJa(e.currentTarget.value),
          }}
          label={tr("common.name2")}
          placeholder={tr("master.workLocations.eGNcLatheNo1")}
          required
          translationsProps={{
            value: nameTranslations,
            onChange: setNameTranslations,
          }}
        />
        <TextInput
          label={
            <HelpLabel
              {...fieldHelp("workLocation", "sortOrder", {
                label: tr("common.notes"),
              })}
            />
          }
          onChange={(e) => setNotes(e.currentTarget.value)}
          value={notes}
        />
      </Stack>
    </FormModal>
  );
}

// ── 種別管理モーダル ─────────────────────────────────────────────────────────

function TypesModal({
  opened,
  onClose,
  types,
  onDone,
}: ModalBaseProps & { types: WorkLocationTypeRow[]; onDone: () => void }) {
  const tr = useTranslations();
  const [isPending, startTransition] = useTransition();
  const isMobile = useIsMobile();
  const [rows, setRows] = useState<WorkLocationTypeRow[]>(types);

  useEffect(() => {
    if (opened) setRows(types);
  }, [opened, types]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    startTransition(async () => {
      const result = await saveWorkLocationTypes(
        rows
          .filter((r) => !r.builtin && r.key.trim())
          .map((r) => ({
            key: r.key.trim(),
            labelJa: r.labelJa,
            labelEn: r.labelEn,
          })),
      );
      notifyResult(
        tr,
        result,
        tr("master.workLocations.theTypeWasSaved"),
        () => {
          onClose();
          onDone();
        },
      );
    });
  };

  return (
    <FormModal
      loading={isPending}
      onClose={onClose}
      onSubmit={handleSubmit}
      opened={opened}
      size="lg"
      submitLabel={tr("common.save2")}
      title={tr("master.workLocations.typeManagement")}
    >
      <Stack gap="xs">
        <Text c="dimmed" size="xs">
          {tr("master.workLocations.machineAndAreaAreBuiltIn")}
        </Text>
        {rows.map((r, idx) => (
          // 携帯では 3 つの入力を横に並べると 1 つ 60px 程度になり、
          // 何を打っているのか読めない。1 行 = 1 カードで縦に積む
          // （design.md §20.2 の「編集可能な表 → カード」）。
          <Paper
            key={r.builtin ? r.key : `row-${idx}`}
            p={isMobile ? "xs" : 0}
            radius="sm"
            withBorder={isMobile}
          >
            <Group
              align={isMobile ? "stretch" : "flex-end"}
              gap="xs"
              wrap={isMobile ? "wrap" : "nowrap"}
            >
              <TextInput
                aria-label={tr("master.workLocations.typeKey")}
                disabled={r.builtin}
                label={isMobile ? tr("common.key") : undefined}
                onChange={(e) => {
                  const key = e.currentTarget.value;
                  setRows((prev) =>
                    prev.map((p, i) => (i === idx ? { ...p, key } : p)),
                  );
                }}
                placeholder={tr("master.workLocations.keyEGLine")}
                value={r.key}
                w={isMobile ? "100%" : 150}
              />
              <TextInput
                aria-label={tr("master.workLocations.typeDisplayNameJapanese")}
                disabled={r.builtin}
                label={isMobile ? tr("common.displayNameJapanese") : undefined}
                onChange={(e) => {
                  const labelJa = e.currentTarget.value;
                  setRows((prev) =>
                    prev.map((p, i) => (i === idx ? { ...p, labelJa } : p)),
                  );
                }}
                placeholder={tr("common.displayNameJapanese")}
                style={isMobile ? { width: "100%" } : { flex: 1 }}
                value={r.labelJa}
              />
              <TextInput
                aria-label={tr("master.workLocations.typeDisplayNameEnglish")}
                disabled={r.builtin}
                label={
                  isMobile
                    ? tr("master.workLocations.displayNameEnglish")
                    : undefined
                }
                onChange={(e) => {
                  const labelEn = e.currentTarget.value;
                  setRows((prev) =>
                    prev.map((p, i) => (i === idx ? { ...p, labelEn } : p)),
                  );
                }}
                placeholder="English"
                style={isMobile ? { width: "100%" } : { flex: 1 }}
                value={r.labelEn}
              />
              {r.builtin ? (
                <Badge color="gray" variant="light">
                  {tr("common.builtIn")}
                </Badge>
              ) : (
                <Tooltip label={tr("common.delete")} withinPortal>
                  <ActionIcon
                    aria-label={tr("master.workLocations.deleteTheType")}
                    color="red"
                    onClick={() =>
                      setRows((prev) => prev.filter((_, i) => i !== idx))
                    }
                    variant="subtle"
                  >
                    <IconTrash size={14} />
                  </ActionIcon>
                </Tooltip>
              )}
            </Group>
          </Paper>
        ))}
        <Group>
          <GhostButton
            fullWidth={isMobile}
            leftSection={<IconPlus size={14} />}
            onClick={() =>
              setRows((prev) => [
                ...prev,
                { key: "", labelJa: "", labelEn: "", builtin: false },
              ])
            }
          >
            {tr("common.addAType")}
          </GhostButton>
        </Group>
      </Stack>
    </FormModal>
  );
}

// ── 本体 ─────────────────────────────────────────────────────────────────────

export function WorkLocationsManager({
  groups,
  types,
  plantOptions,
}: {
  groups: WorkLocationGroupRow[];
  types: WorkLocationTypeRow[];
  plantOptions: Option[];
}) {
  const tr = useTranslations();
  const router = useRouter();
  const isMobile = useIsMobile();
  const [, startTransition] = useTransition();

  const [groupModal, setGroupModal] = useState<{
    opened: boolean;
    group: WorkLocationGroupRow | null;
  }>({ opened: false, group: null });
  const [locationModal, setLocationModal] = useState<{
    opened: boolean;
    groupId: number;
    location: WorkLocationRow | null;
    defaultSortOrder: number;
  }>({ opened: false, groupId: 0, location: null, defaultSortOrder: 10 });
  const [typesOpen, setTypesOpen] = useState(false);
  const [deleteGroup, setDeleteGroup] = useState<WorkLocationGroupRow | null>(
    null,
  );
  const [deleteLocation, setDeleteLocation] = useState<WorkLocationRow | null>(
    null,
  );

  const refresh = () => router.refresh();
  const typeLabel = (key: string) =>
    types.find((t) => t.key === key)?.labelJa ?? key;

  return (
    <Stack gap="md">
      <PageHeader
        actions={
          // 携帯では題と並ぶ 1 行に入らないので文字を詰める（SY09 と同じ流儀）。
          <Group gap="xs" wrap="nowrap">
            <SecondaryButton
              leftSection={<IconAdjustments size={14} />}
              onClick={() => setTypesOpen(true)}
              px={isMobile ? "xs" : undefined}
            >
              {isMobile
                ? tr("common.type2")
                : tr("master.workLocations.typeManagement")}
            </SecondaryButton>
            <PrimaryButton
              leftSection={<IconPlus size={14} />}
              onClick={() => setGroupModal({ opened: true, group: null })}
              px={isMobile ? "xs" : undefined}
            >
              {isMobile
                ? tr("common.add")
                : tr("master.workLocations.addAGroup2")}
            </PrimaryButton>
          </Group>
        }
        breadcrumbs={[
          tr("common.masterData"),
          tr("master.workLocationsManager.pageTitle"),
        ]}
        title={tr("master.workLocationsManager.pageTitle")}
      />

      {groups.length === 0 ? (
        <EmptyState
          icon={<IconMapPin size={24} />}
          message={tr(
            "master.workLocations.noWorkLocationsAreRegisteredCreate",
          )}
        />
      ) : (
        groups.map((group) => {
          // 新しい場所の表示順（末尾 + 10）。操作は携帯のメニューと
          // デスクトップのボタン列で共有するので、ここで 1 つだけ作る。
          const nextSortOrder =
            group.locations.length > 0
              ? Math.max(...group.locations.map((l) => l.sortOrder)) + 10
              : 10;
          const addLocation = () =>
            setLocationModal({
              opened: true,
              groupId: group.id,
              location: null,
              defaultSortOrder: nextSortOrder,
            });
          const editLocation = (loc: WorkLocationRow) =>
            setLocationModal({
              opened: true,
              groupId: group.id,
              location: loc,
              defaultSortOrder: loc.sortOrder,
            });
          const noLocations = group.locations.length === 0;

          return (
            <Paper key={group.id} p="md" radius="md" withBorder>
              <Stack gap="sm">
                <Group align="flex-start" justify="space-between" wrap="nowrap">
                  {/* 携帯では 5 つの情報が 1 行に入らないので折り返す。
                      truncate は横並びのときだけ効かせる（折り返す側で
                      切り詰めると名称が読めなくなる）。 */}
                  <Group
                    gap="xs"
                    style={{ minWidth: 0 }}
                    wrap={isMobile ? "wrap" : "nowrap"}
                  >
                    <DocNumber>{group.code}</DocNumber>
                    <Text fw={600} size="sm" truncate={!isMobile}>
                      {group.nameJa}
                    </Text>
                    <Badge color="grape" size="sm" variant="light">
                      {typeLabel(group.typeKey)}
                    </Badge>
                    {group.plantName && (
                      <Group gap={4} wrap="nowrap">
                        <IconBuildingFactory2 size={14} />
                        <Text c="dimmed" size="xs">
                          {group.plantName}
                        </Text>
                      </Group>
                    )}
                    <ActiveBadge active={group.isActive} />
                  </Group>
                  {isMobile ? (
                    // 操作 4 つを横に並べると幅を食い切るので「⋯」に畳む
                    // （design.md §20.2 の「ボタン列 → メニュー」）。
                    <Menu position="bottom-end" shadow="sm" withinPortal>
                      <Menu.Target>
                        <ActionIcon
                          aria-label={tr("common.actions2")}
                          color="gray"
                          style={{ flexShrink: 0 }}
                          variant="subtle"
                        >
                          <IconDotsVertical size={16} />
                        </ActionIcon>
                      </Menu.Target>
                      <Menu.Dropdown>
                        <Menu.Item
                          leftSection={<IconPlus size={14} />}
                          onClick={addLocation}
                        >
                          {tr("master.workLocations.addALocation")}
                        </Menu.Item>
                        <Menu.Item
                          disabled={noLocations}
                          leftSection={<IconQrcode size={14} />}
                          onClick={() =>
                            openQrPrintSheet(group.locations.map((l) => l.id))
                          }
                        >
                          {tr("master.workLocations.printTheQrCode")}
                        </Menu.Item>
                        <Menu.Item
                          leftSection={<IconEdit size={14} />}
                          onClick={() => setGroupModal({ opened: true, group })}
                        >
                          {tr("common.edit2")}
                        </Menu.Item>
                        <Menu.Divider />
                        <Menu.Item
                          color="red"
                          leftSection={<IconTrash size={14} />}
                          onClick={() => setDeleteGroup(group)}
                        >
                          {tr("common.delete")}
                        </Menu.Item>
                      </Menu.Dropdown>
                    </Menu>
                  ) : (
                    <Group gap="xs" wrap="nowrap">
                      <GhostButton
                        leftSection={<IconPlus size={14} />}
                        onClick={addLocation}
                        size="xs"
                      >
                        {tr("master.workLocations.addALocation")}
                      </GhostButton>
                      <GhostButton
                        disabled={noLocations}
                        leftSection={<IconQrcode size={14} />}
                        onClick={() =>
                          openQrPrintSheet(group.locations.map((l) => l.id))
                        }
                        size="xs"
                      >
                        {tr("master.workLocations.printTheQrCode")}
                      </GhostButton>
                      <GhostButton
                        leftSection={<IconEdit size={14} />}
                        onClick={() => setGroupModal({ opened: true, group })}
                        size="xs"
                      >
                        {tr("common.edit2")}
                      </GhostButton>
                      <GhostButton
                        color="red"
                        leftSection={<IconTrash size={14} />}
                        onClick={() => setDeleteGroup(group)}
                        size="xs"
                      >
                        {tr("common.delete")}
                      </GhostButton>
                    </Group>
                  )}
                </Group>

                {noLocations ? (
                  <Text c="dimmed" size="sm">
                    {tr("master.workLocations.noLocationsAreRegisteredAddOne")}
                  </Text>
                ) : isMobile ? (
                  // 6 列の表は 390px では 1 列 40px になって読めない。
                  // 区切り線で分けた 1 行 = 1 件へ落とす（design.md §8.1）。
                  <Stack gap={0}>
                    {group.locations.map((loc, i) => (
                      <Box key={loc.id}>
                        {i > 0 && <Divider />}
                        <Group
                          align="flex-start"
                          gap="sm"
                          py="sm"
                          wrap="nowrap"
                        >
                          <Stack className="min-w-0 flex-1" gap={3}>
                            <Group gap="xs" wrap="nowrap">
                              <DocNumber>{loc.code}</DocNumber>
                              <ActiveBadge active={loc.isActive} />
                            </Group>
                            <Text fw={500} size="sm">
                              {loc.nameJa}
                            </Text>
                            {loc.notes && (
                              <Text c="dimmed" size="xs">
                                {loc.notes}
                              </Text>
                            )}
                            <Group gap="md" wrap="wrap">
                              <Text
                                c="dimmed"
                                className="tabular-nums"
                                size="xs"
                              >
                                {tr("master.workLocations.capacity")}{" "}
                                {loc.capacity != null
                                  ? tr(
                                      "master.workLocationsManager.jobsWithCount",
                                      { count: loc.capacity },
                                    )
                                  : tr("master.workLocations.noLimit")}
                              </Text>
                              <Text
                                c="dimmed"
                                className="tabular-nums"
                                size="xs"
                              >
                                {tr("master.workLocations.plannedActual")}{" "}
                                {loc.planCount} / {loc.actualCount}
                              </Text>
                            </Group>
                          </Stack>
                          <Menu position="bottom-end" shadow="sm" withinPortal>
                            <Menu.Target>
                              <ActionIcon
                                aria-label={tr("common.actions")}
                                color="gray"
                                style={{ flexShrink: 0 }}
                                variant="subtle"
                              >
                                <IconDotsVertical size={16} />
                              </ActionIcon>
                            </Menu.Target>
                            <Menu.Dropdown>
                              <Menu.Item
                                leftSection={<IconQrcode size={14} />}
                                onClick={() => openQrPrintSheet([loc.id])}
                              >
                                {tr("master.workLocations.printQrLabels")}
                              </Menu.Item>
                              <Menu.Item
                                leftSection={<IconEdit size={14} />}
                                onClick={() => editLocation(loc)}
                              >
                                {tr("common.edit2")}
                              </Menu.Item>
                              <Menu.Divider />
                              <Menu.Item
                                color="red"
                                leftSection={<IconTrash size={14} />}
                                onClick={() => setDeleteLocation(loc)}
                              >
                                {tr("common.delete")}
                              </Menu.Item>
                            </Menu.Dropdown>
                          </Menu>
                        </Group>
                      </Box>
                    ))}
                  </Stack>
                ) : (
                  <Table striped withTableBorder>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th w={140}>
                          {tr("master.workLocationsManager.code")}
                        </Table.Th>
                        <Table.Th>{tr("common.name2")}</Table.Th>
                        <Table.Th w={120}>
                          {tr("master.workLocations.capacity")}
                        </Table.Th>
                        <Table.Th w={110}>
                          {tr("master.workLocations.plannedActual")}
                        </Table.Th>
                        <Table.Th w={80}>{tr("common.status")}</Table.Th>
                        <Table.Th w={80} />
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {group.locations.map((loc) => (
                        <Table.Tr key={loc.id}>
                          <Table.Td>
                            <DocNumber>{loc.code}</DocNumber>
                          </Table.Td>
                          <Table.Td>
                            <Text size="sm">{loc.nameJa}</Text>
                            {loc.notes && (
                              <Text c="dimmed" size="xs">
                                {loc.notes}
                              </Text>
                            )}
                          </Table.Td>
                          <Table.Td>
                            <Text className="tabular-nums" size="sm">
                              {loc.capacity != null
                                ? tr(
                                    "master.workLocationsManager.jobsWithCount",
                                    { count: loc.capacity },
                                  )
                                : tr("master.workLocations.noLimit")}
                            </Text>
                          </Table.Td>
                          <Table.Td>
                            <Text c="dimmed" className="tabular-nums" size="sm">
                              {loc.planCount} / {loc.actualCount}
                            </Text>
                          </Table.Td>
                          <Table.Td>
                            <ActiveBadge active={loc.isActive} />
                          </Table.Td>
                          <Table.Td>
                            <Group gap={4} justify="flex-end" wrap="nowrap">
                              <Tooltip
                                label={tr("master.workLocations.printQrLabels")}
                                withinPortal
                              >
                                <ActionIcon
                                  aria-label={tr(
                                    "master.workLocations.printWorkLocationQrLabels",
                                  )}
                                  color="gray"
                                  onClick={() => openQrPrintSheet([loc.id])}
                                  variant="subtle"
                                >
                                  <IconQrcode size={14} />
                                </ActionIcon>
                              </Tooltip>
                              <Tooltip label={tr("common.edit2")} withinPortal>
                                <ActionIcon
                                  aria-label={tr(
                                    "master.workLocations.editTheWorkLocation",
                                  )}
                                  color="gray"
                                  onClick={() => editLocation(loc)}
                                  variant="subtle"
                                >
                                  <IconEdit size={14} />
                                </ActionIcon>
                              </Tooltip>
                              <Tooltip label={tr("common.delete")} withinPortal>
                                <ActionIcon
                                  aria-label={tr(
                                    "master.workLocations.deleteTheWorkLocation",
                                  )}
                                  color="red"
                                  onClick={() => setDeleteLocation(loc)}
                                  variant="subtle"
                                >
                                  <IconTrash size={14} />
                                </ActionIcon>
                              </Tooltip>
                            </Group>
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                )}
              </Stack>
            </Paper>
          );
        })
      )}

      <GroupModal
        group={groupModal.group}
        onClose={() => setGroupModal({ opened: false, group: null })}
        onDone={refresh}
        opened={groupModal.opened}
        plantOptions={plantOptions}
        types={types}
      />
      <LocationModal
        defaultSortOrder={locationModal.defaultSortOrder}
        groupId={locationModal.groupId}
        location={locationModal.location}
        onClose={() => setLocationModal((s) => ({ ...s, opened: false }))}
        onDone={refresh}
        opened={locationModal.opened}
      />
      <TypesModal
        onClose={() => setTypesOpen(false)}
        onDone={refresh}
        opened={typesOpen}
        types={types}
      />
      <ConfirmModal
        confirmLabel={tr("common.delete2")}
        message={
          deleteGroup
            ? tr("master.workLocationsManager.deleteGroupConfirm", {
                name: deleteGroup.nameJa,
                count: deleteGroup.locations.length,
              })
            : ""
        }
        onClose={() => setDeleteGroup(null)}
        onConfirm={() => {
          const target = deleteGroup;
          if (!target) return;
          startTransition(async () => {
            const result = await deleteWorkLocationGroup(target.id);
            notifyResult(
              tr,
              result,
              tr("master.workLocationsManager.groupDeleted", {
                name: target.nameJa,
              }),
              () => {
                setDeleteGroup(null);
                refresh();
              },
            );
          });
        }}
        opened={!!deleteGroup}
        title={tr("master.workLocations.deleteTheGroup")}
        warning={tr("master.workLocations.itCannotBeDeletedIfIt")}
      />
      <ConfirmModal
        confirmLabel={tr("common.delete2")}
        message={
          deleteLocation
            ? tr("master.workLocationsManager.deleteWorkLocationConfirm", {
                name: deleteLocation.nameJa,
              })
            : ""
        }
        onClose={() => setDeleteLocation(null)}
        onConfirm={() => {
          const target = deleteLocation;
          if (!target) return;
          startTransition(async () => {
            const result = await deleteWorkLocation(target.id);
            notifyResult(
              tr,
              result,
              tr("master.workLocationsManager.workLocationDeleted", {
                name: target.nameJa,
              }),
              () => {
                setDeleteLocation(null);
                refresh();
              },
            );
          });
        }}
        opened={!!deleteLocation}
        title={tr("master.workLocations.deleteTheWorkLocation2")}
        warning={
          deleteLocation &&
          deleteLocation.planCount + deleteLocation.actualCount > 0
            ? tr("master.workLocationsManager.workLocationInUse", {
                planCount: deleteLocation.planCount,
                actualCount: deleteLocation.actualCount,
              })
            : undefined
        }
      />
    </Stack>
  );
}
