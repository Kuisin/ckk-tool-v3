"use client";

/**
 * TaxCategoriesManager.tsx — 税区分マスタ (MS0F) 単一管理画面。
 *
 * 税区分（課税 / 軽減税率 / 非課税 …）ごとのカードに、率の履歴をテーブルで出し、
 * すべてモーダルで追加・編集・削除する（MS0D 作業場所と同型）。
 *
 * 率の履歴は**終了日を持たない** — 終わりは「次に始まる行の前日」なので、区間へ
 * 組み直すのは model.ts の `ratePeriods`（純ロジック・試験あり）。ここは描画だけ。
 */

import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Group,
  Menu,
  NumberInput,
  Paper,
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
  IconAlertTriangle,
  IconDotsVertical,
  IconEdit,
  IconPercentage,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import {
  createTaxCategory,
  createTaxRate,
  deleteTaxCategory,
  deleteTaxRate,
  type TaxCategoryInput,
  type TaxRateInput,
  updateTaxCategory,
  updateTaxRate,
} from "@/app/(dashboard)/master/tax-categories/actions";
import { ActiveBadge } from "@/components/ui/ActiveBadge";
import { PrimaryButton, SecondaryButton } from "@/components/ui/buttons";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  ConfirmModal,
  FormModal,
  type ModalBaseProps,
} from "@/components/ui/modals";
import { PageHeader } from "@/components/ui/PageHeader";
import { LocalizedTextInput } from "@/components/ui/shells";
import { useIsMobile } from "@/hooks/useViewport";
import type { Tr } from "@/lib/i18n";
import {
  isBackdatedRate,
  type RateRow,
  ratePercentLabel,
  ratePeriods,
} from "./model";

export interface TaxCategoryRow {
  id: number;
  code: string;
  nameJa: string;
  nameTranslations: Record<string, string>;
  shortLabelJa: string;
  shortLabelTranslations: Record<string, string>;
  isDefault: boolean;
  sortOrder: number;
  isActive: boolean;
  notes: string;
  /** 削除可否の目安（FK は RESTRICT なので DB でも止まる）。 */
  productCount: number;
  customerCount: number;
  documentCount: number;
  rates: RateRow[];
}

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

// ── 税区分の追加/編集 ────────────────────────────────────────────────────────

function CategoryModal({
  opened,
  onClose,
  category,
  onDone,
}: ModalBaseProps & {
  category: TaxCategoryRow | null;
  onDone: () => void;
}) {
  const tr = useTranslations();
  const [isPending, startTransition] = useTransition();
  const isEdit = !!category;
  const [code, setCode] = useState("");
  const [nameJa, setNameJa] = useState("");
  const [nameTranslations, setNameTranslations] = useState<
    Record<string, string>
  >({});
  const [shortLabelJa, setShortLabelJa] = useState("");
  const [shortLabelTranslations, setShortLabelTranslations] = useState<
    Record<string, string>
  >({});
  const [isDefault, setIsDefault] = useState(false);
  const [sortOrder, setSortOrder] = useState(0);
  const [isActive, setIsActive] = useState(true);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!opened) return;
    setCode(category?.code ?? "");
    setNameJa(category?.nameJa ?? "");
    setNameTranslations(category?.nameTranslations ?? {});
    setShortLabelJa(category?.shortLabelJa ?? "");
    setShortLabelTranslations(category?.shortLabelTranslations ?? {});
    setIsDefault(category?.isDefault ?? false);
    setSortOrder(category?.sortOrder ?? 0);
    setIsActive(category?.isActive ?? true);
    setNotes(category?.notes ?? "");
  }, [opened, category]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    startTransition(async () => {
      const input: TaxCategoryInput = {
        code,
        nameJa,
        nameTranslations,
        shortLabelJa,
        shortLabelTranslations,
        isDefault,
        sortOrder,
        isActive,
        notes,
      };
      const result = isEdit
        ? await updateTaxCategory(category.id, input)
        : await createTaxCategory(input);
      notifyResult(
        tr,
        result,
        isEdit
          ? tr("master.taxCategories.categoryUpdated")
          : tr("master.taxCategories.categoryCreated"),
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
          ? tr("master.taxCategories.editCategory")
          : tr("master.taxCategories.addCategory")
      }
    >
      <Stack gap="sm">
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          <TextInput
            description={tr("master.taxCategories.codeHint")}
            label={tr("master.taxCategories.code")}
            onChange={(e) => setCode(e.currentTarget.value)}
            value={code}
            withAsterisk
          />
          <NumberInput
            label={tr("common.sortOrder")}
            onChange={(v) =>
              setSortOrder(v === "" || v == null ? 0 : Number(v))
            }
            value={sortOrder}
          />
        </SimpleGrid>
        <LocalizedTextInput
          jaProps={{
            value: nameJa,
            onChange: (e) => setNameJa(e.currentTarget.value),
          }}
          label={tr("common.name2")}
          required
          translationsProps={{
            value: nameTranslations,
            onChange: setNameTranslations,
          }}
        />
        <LocalizedTextInput
          jaProps={{
            value: shortLabelJa,
            onChange: (e) => setShortLabelJa(e.currentTarget.value),
          }}
          label={tr("master.taxCategories.shortLabel")}
          placeholder={tr("master.taxCategories.shortLabelHint")}
          translationsProps={{
            value: shortLabelTranslations,
            onChange: setShortLabelTranslations,
          }}
        />
        <TextInput
          label={tr("common.notes")}
          onChange={(e) => setNotes(e.currentTarget.value)}
          value={notes}
        />
        <Switch
          checked={isDefault}
          description={tr("master.taxCategories.isDefaultHint")}
          label={tr("master.taxCategories.isDefault")}
          onChange={(e) => setIsDefault(e.currentTarget.checked)}
        />
        <Switch
          checked={isActive}
          label={tr("common.enabled")}
          onChange={(e) => setIsActive(e.currentTarget.checked)}
        />
      </Stack>
    </FormModal>
  );
}

// ── 税率の追加/編集 ──────────────────────────────────────────────────────────

function RateModal({
  opened,
  onClose,
  categoryId,
  rate,
  today,
  onDone,
}: ModalBaseProps & {
  categoryId: number;
  rate: RateRow | null;
  today: string;
  onDone: () => void;
}) {
  const tr = useTranslations();
  const [isPending, startTransition] = useTransition();
  const isEdit = !!rate;
  const [effectiveFrom, setEffectiveFrom] = useState(today);
  const [ratePercent, setRatePercent] = useState<number | string>(10);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!opened) return;
    setEffectiveFrom(rate?.effectiveFrom ?? today);
    setRatePercent(rate ? Number((rate.rate * 100).toFixed(4)) : 10);
    setNotes(rate?.notes ?? "");
  }, [opened, rate, today]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    startTransition(async () => {
      const input: TaxRateInput = {
        categoryId,
        effectiveFrom,
        ratePercent: Number(ratePercent),
        notes,
      };
      const result = isEdit
        ? await updateTaxRate(rate.id, input)
        : await createTaxRate(input);
      notifyResult(
        tr,
        result,
        isEdit
          ? tr("master.taxCategories.rateUpdated")
          : tr("master.taxCategories.rateCreated"),
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
      size="md"
      submitLabel={isEdit ? tr("common.save") : tr("common.create2")}
      title={
        isEdit
          ? tr("master.taxCategories.editRate")
          : tr("master.taxCategories.addRate")
      }
    >
      <Stack gap="sm">
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          <TextInput
            label={tr("master.taxCategories.effectiveFrom")}
            onChange={(e) => setEffectiveFrom(e.currentTarget.value)}
            type="date"
            value={effectiveFrom}
            withAsterisk
          />
          <NumberInput
            decimalScale={2}
            description={tr("master.taxCategories.rateHint")}
            label={tr("master.taxCategories.ratePercent")}
            max={100}
            min={0}
            onChange={setRatePercent}
            suffix="%"
            value={ratePercent}
            withAsterisk
          />
        </SimpleGrid>
        {/* 過去日の率は「まだ確定していない書類」だけをさかのぼって動かす。
            毎回出すと読まれなくなるので、実際に過去日のときだけ出す。 */}
        {isBackdatedRate(effectiveFrom, today) ? (
          <Alert color="orange" icon={<IconAlertTriangle size={16} />}>
            {tr("master.taxCategories.pastRateWarning")}
          </Alert>
        ) : null}
        <TextInput
          label={tr("common.notes")}
          onChange={(e) => setNotes(e.currentTarget.value)}
          value={notes}
        />
      </Stack>
    </FormModal>
  );
}

// ── 率のテーブル ─────────────────────────────────────────────────────────────

function RateTable({
  category,
  today,
  onEdit,
  onDelete,
}: {
  category: TaxCategoryRow;
  today: string;
  onEdit: (rate: RateRow) => void;
  onDelete: (rate: RateRow) => void;
}) {
  const tr = useTranslations();
  const periods = ratePeriods(category.rates, today);
  if (periods.length === 0) {
    return (
      <Text c="dimmed" size="sm">
        {tr("master.taxCategories.emptyRates")}
      </Text>
    );
  }
  return (
    <Table highlightOnHover striped withTableBorder>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>{tr("master.taxCategories.effectiveFrom")}</Table.Th>
          <Table.Th>{tr("master.taxCategories.ratePercent")}</Table.Th>
          <Table.Th>{tr("common.notes")}</Table.Th>
          <Table.Th w={90} />
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {periods.map((p) => (
          <Table.Tr key={p.id}>
            <Table.Td>
              <Group gap="xs" wrap="nowrap">
                <Text size="sm" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {p.effectiveFrom}{" "}
                  {p.effectiveUntil
                    ? tr("master.taxCategories.until", {
                        date: p.effectiveUntil,
                      })
                    : tr("master.taxCategories.until", {
                        date: tr("master.taxCategories.openEnded"),
                      })}
                </Text>
                {p.isCurrent ? (
                  <Badge color="blue" size="xs" variant="light">
                    {tr("master.taxCategories.currentRate")}
                  </Badge>
                ) : null}
              </Group>
            </Table.Td>
            <Table.Td style={{ fontVariantNumeric: "tabular-nums" }}>
              {ratePercentLabel(p.rate)}
            </Table.Td>
            <Table.Td>
              <Text c="dimmed" size="xs">
                {p.notes}
              </Text>
            </Table.Td>
            <Table.Td>
              <Group gap={4} justify="flex-end" wrap="nowrap">
                <Tooltip label={tr("master.taxCategories.editRate")}>
                  <ActionIcon
                    aria-label={tr("master.taxCategories.editRate")}
                    color="gray"
                    onClick={() => onEdit(p)}
                    variant="subtle"
                  >
                    <IconEdit size={16} />
                  </ActionIcon>
                </Tooltip>
                <Tooltip label={tr("master.taxCategories.deleteRate")}>
                  <ActionIcon
                    aria-label={tr("master.taxCategories.deleteRate")}
                    color="red"
                    onClick={() => onDelete(p)}
                    variant="subtle"
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                </Tooltip>
              </Group>
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

// ── 画面 ─────────────────────────────────────────────────────────────────────

export function TaxCategoriesManager({
  categories,
  today,
}: {
  categories: TaxCategoryRow[];
  today: string;
}) {
  const tr = useTranslations();
  const router = useRouter();
  const isMobile = useIsMobile();
  const [isPending, startTransition] = useTransition();
  const [categoryModal, setCategoryModal] = useState<{
    opened: boolean;
    category: TaxCategoryRow | null;
  }>({ opened: false, category: null });
  const [rateModal, setRateModal] = useState<{
    opened: boolean;
    categoryId: number;
    rate: RateRow | null;
  }>({ opened: false, categoryId: 0, rate: null });
  const [confirm, setConfirm] = useState<{
    opened: boolean;
    title: string;
    message: string;
    run: () => Promise<{ ok: boolean; error?: string }>;
    done: string;
  } | null>(null);

  const refresh = () => router.refresh();

  const runConfirmed = () => {
    if (confirm == null) return;
    const { run, done } = confirm;
    startTransition(async () => {
      const result = await run();
      notifyResult(tr, result, done, refresh);
      setConfirm(null);
    });
  };

  return (
    <Stack gap="md">
      <PageHeader
        actions={
          <PrimaryButton
            leftSection={<IconPlus size={14} />}
            onClick={() => setCategoryModal({ opened: true, category: null })}
            px={isMobile ? "xs" : undefined}
          >
            {isMobile
              ? tr("common.add")
              : tr("master.taxCategories.addCategory")}
          </PrimaryButton>
        }
        breadcrumbs={[
          tr("common.masterData"),
          tr("master.taxCategories.title"),
        ]}
        title={tr("master.taxCategories.title")}
      />

      <Text c="dimmed" size="sm">
        {tr("master.taxCategories.description")}
      </Text>

      {categories.length === 0 ? (
        <EmptyState
          icon={<IconPercentage size={24} />}
          message={tr("master.taxCategories.emptyCategories")}
        />
      ) : (
        categories.map((category) => {
          const periods = ratePeriods(category.rates, today);
          const current = periods.find((p) => p.isCurrent);
          const usageCount =
            category.productCount +
            category.customerCount +
            category.documentCount;
          return (
            <Paper key={category.id} p="md" radius="md" withBorder>
              <Group align="flex-start" justify="space-between" wrap="nowrap">
                <Box style={{ minWidth: 0 }}>
                  <Group gap="xs" wrap="wrap">
                    <Text fw={600}>{category.nameJa}</Text>
                    <Text c="dimmed" ff="mono" size="xs">
                      {category.code}
                    </Text>
                    {category.isDefault ? (
                      <Badge color="blue" size="sm" variant="light">
                        {tr("master.taxCategories.defaultBadge")}
                      </Badge>
                    ) : null}
                    <ActiveBadge active={category.isActive} />
                    <Badge
                      color={usageCount > 0 ? "gray" : "gray"}
                      size="sm"
                      variant="outline"
                    >
                      {usageCount > 0
                        ? tr("master.taxCategories.inUse")
                        : tr("master.taxCategories.notUsed")}
                    </Badge>
                  </Group>
                  <Group gap="md" mt={4}>
                    <Text
                      size="sm"
                      style={{ fontVariantNumeric: "tabular-nums" }}
                    >
                      {tr("master.taxCategories.currentRate")}:{" "}
                      {current ? (
                        ratePercentLabel(current.rate)
                      ) : (
                        <Text c="orange" component="span" size="sm">
                          {tr("master.taxCategories.noRate")}
                        </Text>
                      )}
                    </Text>
                    {category.notes ? (
                      <Text c="dimmed" size="xs">
                        {category.notes}
                      </Text>
                    ) : null}
                  </Group>
                </Box>
                <Menu position="bottom-end" shadow="sm" withinPortal>
                  <Menu.Target>
                    <ActionIcon
                      aria-label={tr("common.actionMenu")}
                      color="gray"
                      variant="subtle"
                    >
                      <IconDotsVertical size={16} />
                    </ActionIcon>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Item
                      leftSection={<IconEdit size={14} />}
                      onClick={() =>
                        setCategoryModal({ opened: true, category })
                      }
                    >
                      {tr("master.taxCategories.editCategory")}
                    </Menu.Item>
                    <Menu.Item
                      color="red"
                      leftSection={<IconTrash size={14} />}
                      onClick={() =>
                        setConfirm({
                          opened: true,
                          title: tr("master.taxCategories.deleteCategory"),
                          message: category.nameJa,
                          run: () => deleteTaxCategory(category.id),
                          done: tr("master.taxCategories.categoryDeleted"),
                        })
                      }
                    >
                      {tr("master.taxCategories.deleteCategory")}
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              </Group>

              <Group justify="space-between" mb="xs" mt="md">
                <Text fw={500} size="sm">
                  {tr("master.taxCategories.rates")}
                </Text>
                <SecondaryButton
                  leftSection={<IconPlus size={14} />}
                  onClick={() =>
                    setRateModal({
                      opened: true,
                      categoryId: category.id,
                      rate: null,
                    })
                  }
                >
                  {tr("master.taxCategories.addRate")}
                </SecondaryButton>
              </Group>
              <RateTable
                category={category}
                onDelete={(rate) =>
                  setConfirm({
                    opened: true,
                    title: tr("master.taxCategories.deleteRate"),
                    message: `${rate.effectiveFrom} — ${ratePercentLabel(rate.rate)}`,
                    run: () => deleteTaxRate(rate.id),
                    done: tr("master.taxCategories.rateDeleted"),
                  })
                }
                onEdit={(rate) =>
                  setRateModal({ opened: true, categoryId: category.id, rate })
                }
                today={today}
              />
            </Paper>
          );
        })
      )}

      <CategoryModal
        category={categoryModal.category}
        onClose={() => setCategoryModal({ opened: false, category: null })}
        onDone={refresh}
        opened={categoryModal.opened}
      />
      <RateModal
        categoryId={rateModal.categoryId}
        onClose={() =>
          setRateModal({ opened: false, categoryId: 0, rate: null })
        }
        onDone={refresh}
        opened={rateModal.opened}
        rate={rateModal.rate}
        today={today}
      />
      <ConfirmModal
        loading={isPending}
        message={confirm?.message ?? ""}
        onClose={() => setConfirm(null)}
        onConfirm={runConfirmed}
        opened={confirm?.opened ?? false}
        title={confirm?.title ?? ""}
      />
    </Stack>
  );
}
