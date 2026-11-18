"use client";

/**
 * AccountingExportForm — 会計連携（SY0J）の設定。
 *
 * 画面の軸は 4 つ:
 *   ① 出力形式（文字コード・改行・日付・囲み方・ファイル名）
 *   ② 列レイアウト（何を、どの順で、どんな見出しで出すか）
 *   ③ 既定の科目コード（マスタが空のときのフォールバック）
 *   ④ 税率別の消費税コード
 * その下に**プレビュー**を置く。組み立ては純粋関数なので、保存前の見た目を
 * サーバーへ問い合わせずに出せる（設定を触りながら結果を確かめられる）。
 *
 * 既定は閲覧モードで開く（`_specs/design.md` §10.10）— 読みに来ただけの人に
 * 入力欄を並べない。
 */

import {
  ActionIcon,
  Alert,
  Code,
  Group,
  NumberInput,
  Paper,
  ScrollArea,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconArrowDown,
  IconArrowUp,
  IconInfoCircle,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMemo, useState, useTransition } from "react";
import { updateAccountingSettings } from "@/app/(dashboard)/settings/accounting/actions";
import { GhostButton } from "@/components/ui/buttons";
import { EditablePanel } from "@/components/ui/EditablePanel";
import { FieldValue } from "@/components/ui/FieldValue";
import { FormActions, FormSection, SummaryGrid } from "@/components/ui/shells";
import {
  ACCOUNTING_FIELD_IDS,
  type AccountingColumn,
  type AccountingExportSettings,
  type AccountingField,
  buildAccountingCsvText,
  type JournalInvoiceInput,
} from "@/lib/accounting-export-core";

/**
 * プレビュー用の作り話の請求書（10% と 8% が混ざった 1 通）。
 *
 * 顧客名だけは画面に出る文言なので呼び出し側から渡す（他は番号・金額なので
 * 言語に依らない）。
 */
const sampleInvoice = (customerName: string): JournalInvoiceInput => ({
  invoiceNumber: "INV-202607-00001",
  customerName,
  customerCode: "C-0001",
  receivableSubAccountCode: "0123",
  slipNo: 1,
  date: "2026-07-31T00:00:00.000Z",
  totalAmount: 18_600,
  taxLines: [
    { taxRate: 0.1, taxableBase: 12_000, taxAmount: 1_200 },
    { taxRate: 0.08, taxableBase: 5_000, taxAmount: 400 },
  ],
});

function CsvPreview({ settings }: { settings: AccountingExportSettings }) {
  const tr = useTranslations();
  const sampleCustomer = tr("settings.accounting.sampleCustomerName");
  const text = useMemo(() => {
    try {
      return buildAccountingCsvText(sampleInvoice(sampleCustomer), settings);
    } catch {
      return "";
    }
  }, [settings, sampleCustomer]);
  return (
    <Stack gap="xs">
      <Text c="dimmed" size="xs">
        {tr("settings.accounting.previewNote")}
      </Text>
      <ScrollArea.Autosize mah={220} type="auto">
        <Code block>{text}</Code>
      </ScrollArea.Autosize>
    </Stack>
  );
}

function ColumnsTable({ columns }: { columns: AccountingColumn[] }) {
  const tr = useTranslations();
  return (
    <Table highlightOnHover striped withTableBorder>
      <Table.Thead>
        <Table.Tr>
          <Table.Th w={60}>#</Table.Th>
          <Table.Th>{tr("settings.accounting.columnHeader")}</Table.Th>
          <Table.Th>{tr("settings.accounting.columnField")}</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {columns.map((c, i) => (
          <Table.Tr key={c.id}>
            <Table.Td>{i + 1}</Table.Td>
            <Table.Td>{c.header || "—"}</Table.Td>
            <Table.Td>
              <Text ff="mono" size="xs">
                {c.field}
                {c.field === "constant" ? `（${c.constant ?? ""}）` : ""}
              </Text>
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

function AccountingExportView({
  settings,
}: {
  settings: AccountingExportSettings;
}) {
  const tr = useTranslations();
  const a = settings.accounts;
  const dash = (v: string) => (v === "" ? "—" : v);
  return (
    <Stack gap="md">
      <SummaryGrid>
        <FieldValue
          label={tr("settings.accounting.encoding")}
          value={settings.encoding}
        />
        <FieldValue
          label={tr("settings.accounting.newline")}
          value={settings.newline.toUpperCase()}
        />
        <FieldValue
          label={tr("settings.accounting.dateFormat")}
          value={settings.dateFormat}
        />
        <FieldValue
          label={tr("settings.accounting.headerRow")}
          value={settings.headerRow ? tr("common.yes") : tr("common.no")}
        />
        <FieldValue
          label={tr("settings.accounting.quoteMode")}
          value={settings.quoteMode}
        />
        <FieldValue
          label={tr("settings.accounting.amountStyle")}
          value={settings.amountStyle}
        />
        <FieldValue
          label={tr("settings.accounting.receivableAccountCode")}
          value={dash(a.receivableAccountCode)}
        />
        <FieldValue
          label={tr("settings.accounting.salesAccountCode")}
          value={dash(a.salesAccountCode)}
        />
        <FieldValue
          label={tr("settings.accounting.taxAccountCode")}
          value={dash(a.taxAccountCode)}
        />
        <FieldValue
          label={tr("settings.accounting.deptCode")}
          value={dash(a.deptCode)}
        />
        <FieldValue
          label={tr("settings.accounting.defaultTaxCode")}
          value={dash(a.taxCode)}
        />
        <FieldValue
          label={tr("settings.accounting.filenameSuffix")}
          value={`INV-…_${settings.filenameSuffix}.csv`}
        />
      </SummaryGrid>

      <ColumnsTable columns={settings.columns} />

      {settings.taxCodeRules.length > 0 && (
        <Table withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{tr("settings.accounting.taxRate")}</Table.Th>
              <Table.Th>{tr("settings.accounting.debitTaxCode")}</Table.Th>
              <Table.Th>{tr("settings.accounting.creditTaxCode")}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {settings.taxCodeRules.map((r) => (
              <Table.Tr key={r.taxRate}>
                <Table.Td>{Number((r.taxRate * 100).toFixed(4))}%</Table.Td>
                <Table.Td>{dash(r.debitTaxCode)}</Table.Td>
                <Table.Td>{dash(r.creditTaxCode)}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      <CsvPreview settings={settings} />
    </Stack>
  );
}

function AccountingExportEditor({
  initial,
  onCancel,
  onSaved,
}: {
  initial: AccountingExportSettings;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const tr = useTranslations();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [settings, setSettings] = useState<AccountingExportSettings>(initial);

  const patch = (next: Partial<AccountingExportSettings>) =>
    setSettings((s) => ({ ...s, ...next }));
  const patchAccounts = (next: Partial<AccountingExportSettings["accounts"]>) =>
    setSettings((s) => ({ ...s, accounts: { ...s.accounts, ...next } }));

  const setColumn = (index: number, next: Partial<AccountingColumn>) =>
    setSettings((s) => ({
      ...s,
      columns: s.columns.map((c, i) => (i === index ? { ...c, ...next } : c)),
    }));
  const moveColumn = (index: number, delta: number) =>
    setSettings((s) => {
      const to = index + delta;
      if (to < 0 || to >= s.columns.length) return s;
      const columns = [...s.columns];
      const [moved] = columns.splice(index, 1);
      columns.splice(to, 0, moved);
      return { ...s, columns };
    });
  const removeColumn = (index: number) =>
    setSettings((s) => ({
      ...s,
      columns: s.columns.filter((_, i) => i !== index),
    }));
  const addColumn = () =>
    setSettings((s) => ({
      ...s,
      columns: [
        ...s.columns,
        // id は React の key と並べ替えのためだけのもの。重複しなければ何でもよい。
        { id: `c${Date.now()}`, field: "empty" as AccountingField, header: "" },
      ],
    }));

  const fieldOptions = ACCOUNTING_FIELD_IDS.map((f) => ({
    value: f,
    label: `${tr(`settings.accountingField.${f}` as never)}（${f}）`,
  }));

  const save = () => {
    startTransition(async () => {
      const result = await updateAccountingSettings(settings);
      if (result.ok) {
        notifications.show({
          title: tr("common.saved2"),
          message: tr("settings.accounting.saved"),
          color: "green",
        });
        router.refresh();
        onSaved();
      } else {
        notifications.show({
          title: tr("common.error2"),
          message: result.error,
          color: "red",
        });
      }
    });
  };

  return (
    <Stack gap="md">
      <Alert color="blue" icon={<IconInfoCircle size={16} />} variant="light">
        <Text size="sm">{tr("settings.accounting.notYetVendorLayout")}</Text>
      </Alert>

      <FormSection
        description={tr("settings.accounting.formatDescription")}
        title={tr("settings.accounting.format")}
      >
        <SummaryGrid cols={2}>
          <Select
            data={["utf8-bom", "utf8", "shift_jis"]}
            label={tr("settings.accounting.encoding")}
            onChange={(v) =>
              patch({ encoding: (v ?? "utf8-bom") as typeof settings.encoding })
            }
            value={settings.encoding}
          />
          <Select
            data={["crlf", "lf"]}
            label={tr("settings.accounting.newline")}
            onChange={(v) =>
              patch({ newline: (v ?? "crlf") as typeof settings.newline })
            }
            value={settings.newline}
          />
          <Select
            data={["YYYY/MM/DD", "YYYYMMDD", "YYYY-MM-DD", "YY/MM/DD"]}
            label={tr("settings.accounting.dateFormat")}
            onChange={(v) =>
              patch({
                dateFormat: (v ?? "YYYY/MM/DD") as typeof settings.dateFormat,
              })
            }
            value={settings.dateFormat}
          />
          <Select
            data={["minimal", "all", "all-text"]}
            label={tr("settings.accounting.quoteMode")}
            onChange={(v) =>
              patch({
                quoteMode: (v ?? "minimal") as typeof settings.quoteMode,
              })
            }
            value={settings.quoteMode}
          />
          <Select
            data={["plain", "grouped"]}
            label={tr("settings.accounting.amountStyle")}
            onChange={(v) =>
              patch({
                amountStyle: (v ?? "plain") as typeof settings.amountStyle,
              })
            }
            value={settings.amountStyle}
          />
          <TextInput
            label={tr("settings.accounting.filenameSuffix")}
            onChange={(e) => patch({ filenameSuffix: e.currentTarget.value })}
            value={settings.filenameSuffix}
          />
        </SummaryGrid>
        <Switch
          checked={settings.headerRow}
          label={tr("settings.accounting.headerRow")}
          mt="sm"
          onChange={(e) => patch({ headerRow: e.currentTarget.checked })}
        />
      </FormSection>

      <FormSection
        description={tr("settings.accounting.columnsDescription")}
        title={tr("settings.accounting.columns")}
      >
        <Stack gap="xs">
          {settings.columns.map((c, i) => (
            <Paper key={c.id} p="xs" radius="sm" withBorder>
              <Group align="flex-end" gap="xs" wrap="wrap">
                <TextInput
                  flex={1}
                  label={tr("settings.accounting.columnHeader")}
                  miw={120}
                  onChange={(e) =>
                    setColumn(i, { header: e.currentTarget.value })
                  }
                  value={c.header}
                />
                <Select
                  data={fieldOptions}
                  flex={2}
                  label={tr("settings.accounting.columnField")}
                  miw={200}
                  onChange={(v) =>
                    setColumn(i, { field: (v ?? "empty") as AccountingField })
                  }
                  searchable
                  value={c.field}
                />
                {c.field === "constant" && (
                  <TextInput
                    label={tr("settings.accounting.constant")}
                    miw={100}
                    onChange={(e) =>
                      setColumn(i, { constant: e.currentTarget.value })
                    }
                    value={c.constant ?? ""}
                  />
                )}
                <Group gap={4}>
                  <ActionIcon
                    aria-label={tr("common.moveUp")}
                    disabled={i === 0}
                    onClick={() => moveColumn(i, -1)}
                    variant="default"
                  >
                    <IconArrowUp size={16} />
                  </ActionIcon>
                  <ActionIcon
                    aria-label={tr("common.moveDown")}
                    disabled={i === settings.columns.length - 1}
                    onClick={() => moveColumn(i, 1)}
                    variant="default"
                  >
                    <IconArrowDown size={16} />
                  </ActionIcon>
                  <ActionIcon
                    aria-label={tr("common.delete")}
                    color="red"
                    disabled={settings.columns.length <= 1}
                    onClick={() => removeColumn(i)}
                    variant="subtle"
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                </Group>
              </Group>
            </Paper>
          ))}
          <GhostButton leftSection={<IconPlus size={16} />} onClick={addColumn}>
            {tr("settings.accounting.addColumn")}
          </GhostButton>
        </Stack>
      </FormSection>

      <FormSection
        description={tr("settings.accounting.accountsDescription")}
        title={tr("settings.accounting.accounts")}
      >
        <SummaryGrid cols={2}>
          <TextInput
            label={tr("settings.accounting.receivableAccountCode")}
            onChange={(e) =>
              patchAccounts({ receivableAccountCode: e.currentTarget.value })
            }
            value={settings.accounts.receivableAccountCode}
          />
          <TextInput
            label={tr("settings.accounting.salesAccountCode")}
            onChange={(e) =>
              patchAccounts({ salesAccountCode: e.currentTarget.value })
            }
            value={settings.accounts.salesAccountCode}
          />
          <TextInput
            label={tr("settings.accounting.taxAccountCode")}
            onChange={(e) =>
              patchAccounts({ taxAccountCode: e.currentTarget.value })
            }
            value={settings.accounts.taxAccountCode}
          />
          <TextInput
            label={tr("settings.accounting.deptCode")}
            onChange={(e) => patchAccounts({ deptCode: e.currentTarget.value })}
            value={settings.accounts.deptCode}
          />
          <TextInput
            label={tr("settings.accounting.defaultTaxCode")}
            onChange={(e) => patchAccounts({ taxCode: e.currentTarget.value })}
            value={settings.accounts.taxCode}
          />
        </SummaryGrid>
      </FormSection>

      <FormSection
        description={tr("settings.accounting.taxCodeRulesDescription")}
        title={tr("settings.accounting.taxCodeRules")}
      >
        <Stack gap="xs">
          {settings.taxCodeRules.map((rule, i) => (
            <Paper key={`${rule.taxRate}-${i}`} p="xs" radius="sm" withBorder>
              <Group align="flex-end" gap="xs" wrap="wrap">
                <NumberInput
                  decimalScale={2}
                  label={tr("settings.accounting.taxRatePercent")}
                  max={100}
                  min={0}
                  onChange={(v) =>
                    patch({
                      taxCodeRules: settings.taxCodeRules.map((r, j) =>
                        j === i ? { ...r, taxRate: Number(v || 0) / 100 } : r,
                      ),
                    })
                  }
                  value={Number((rule.taxRate * 100).toFixed(4))}
                  w={120}
                />
                <TextInput
                  label={tr("settings.accounting.debitTaxCode")}
                  onChange={(e) =>
                    patch({
                      taxCodeRules: settings.taxCodeRules.map((r, j) =>
                        j === i
                          ? { ...r, debitTaxCode: e.currentTarget.value }
                          : r,
                      ),
                    })
                  }
                  value={rule.debitTaxCode}
                  w={140}
                />
                <TextInput
                  label={tr("settings.accounting.creditTaxCode")}
                  onChange={(e) =>
                    patch({
                      taxCodeRules: settings.taxCodeRules.map((r, j) =>
                        j === i
                          ? { ...r, creditTaxCode: e.currentTarget.value }
                          : r,
                      ),
                    })
                  }
                  value={rule.creditTaxCode}
                  w={140}
                />
                <ActionIcon
                  aria-label={tr("common.delete")}
                  color="red"
                  onClick={() =>
                    patch({
                      taxCodeRules: settings.taxCodeRules.filter(
                        (_, j) => j !== i,
                      ),
                    })
                  }
                  variant="subtle"
                >
                  <IconTrash size={16} />
                </ActionIcon>
              </Group>
            </Paper>
          ))}
          <GhostButton
            leftSection={<IconPlus size={16} />}
            onClick={() =>
              patch({
                taxCodeRules: [
                  ...settings.taxCodeRules,
                  { taxRate: 0.1, debitTaxCode: "", creditTaxCode: "" },
                ],
              })
            }
          >
            {tr("settings.accounting.addTaxCodeRule")}
          </GhostButton>
        </Stack>
      </FormSection>

      <FormSection title={tr("settings.accounting.preview")}>
        <CsvPreview settings={settings} />
      </FormSection>

      <FormActions loading={pending} onCancel={onCancel} onSave={save} />
    </Stack>
  );
}

export function AccountingExportForm({
  initial,
}: {
  initial: AccountingExportSettings;
}) {
  const tr = useTranslations();
  return (
    <EditablePanel
      canEdit
      description={tr("settings.accounting.description")}
      edit={({ close }) => (
        <AccountingExportEditor
          initial={initial}
          onCancel={close}
          onSaved={close}
        />
      )}
      title={tr("settings.accounting.accounting")}
      view={<AccountingExportView settings={initial} />}
    />
  );
}
