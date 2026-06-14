"use client";

/**
 * ComponentCatalog.tsx — /preview の本体。
 *
 * 統一コンポーネントを demo データ付きで一覧表示する確認用カタログ。
 * 各セクション = コンポーネント名ラベル + 説明 + 実働デモ。
 * 実装の参照元: src/components/ui/* ・ src/components/layout/*。
 */

import {
  Alert,
  Anchor,
  Badge,
  Button,
  Code,
  Divider,
  Group,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import {
  IconCopy,
  IconFileText,
  IconInfoCircle,
  IconSearch,
  IconTrash,
} from "@tabler/icons-react";
import Link from "next/link";
import { type ReactNode, useState } from "react";
import { AppLauncher } from "@/components/layout/AppLauncher";
import { OperationCodeJump } from "@/components/layout/OperationCodeJump";
import { ActiveBadge } from "@/components/ui/ActiveBadge";
import { type Column, DataTable } from "@/components/ui/DataTable";
import { DocNumber } from "@/components/ui/DocNumber";
import { EmptyState } from "@/components/ui/EmptyState";
import { FieldValue } from "@/components/ui/FieldValue";
import { JsonLocalizedText } from "@/components/ui/JsonLocalizedText";
import { MoneyText } from "@/components/ui/MoneyText";
import {
  ConfirmModal,
  FormModal,
  ModalShell,
  openConfirm,
} from "@/components/ui/modals";
import { NewButton } from "@/components/ui/NewButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { PdfButton } from "@/components/ui/PdfButton";
import {
  STATUS_MAPS,
  StatusBadge,
  type StatusEntity,
  statusOptions,
} from "@/components/ui/StatusBadge";
import {
  AuditTimeline,
  FormSection,
  LocalizedTextInput,
  ResourceActions,
  SummaryGrid,
} from "@/components/ui/shells";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { CUSTOMERS, ORDER_TYPE_LABEL } from "@/lib/mock";

// ── Demo data ────────────────────────────────────────────────────────────────

interface DemoQuote {
  id: string;
  quoteNumber: string;
  customer: string;
  orderType: string;
  status: string;
  amount: number;
  updatedAt: string;
}

const DEMO_QUOTES: DemoQuote[] = [
  {
    id: "q1",
    quoteNumber: "QOT-202606-00012",
    customer: "株式会社ABC製作所",
    orderType: "PRODUCTION",
    status: "ISSUED",
    amount: 250000,
    updatedAt: "2026-06-10",
  },
  {
    id: "q2",
    quoteNumber: "QOT-202606-00011",
    customer: "合同会社XYZ工業",
    orderType: "TEST",
    status: "DRAFT",
    amount: 48000,
    updatedAt: "2026-06-09",
  },
  {
    id: "q3",
    quoteNumber: "QOT-202606-00010",
    customer: "株式会社DEFエンジニアリング",
    orderType: "PRODUCTION",
    status: "ACCEPTED",
    amount: 1280000,
    updatedAt: "2026-06-08",
  },
  {
    id: "q4",
    quoteNumber: "QOT-202605-00033",
    customer: "東邦精密株式会社",
    orderType: "SAMPLE",
    status: "EXPIRED",
    amount: 0,
    updatedAt: "2026-05-28",
  },
  {
    id: "q5",
    quoteNumber: "QOT-202605-00032",
    customer: "株式会社ABC製作所",
    orderType: "PRODUCTION",
    status: "REJECTED",
    amount: 96000,
    updatedAt: "2026-05-26",
  },
  {
    id: "q6",
    quoteNumber: "QOT-202605-00031",
    customer: "合同会社XYZ工業",
    orderType: "PRODUCTION",
    status: "ACCEPTED",
    amount: 540000,
    updatedAt: "2026-05-22",
  },
  {
    id: "q7",
    quoteNumber: "QOT-202605-00030",
    customer: "東邦精密株式会社",
    orderType: "OTHER",
    status: "ISSUED",
    amount: 132000,
    updatedAt: "2026-05-20",
  },
];

const DEMO_AUDIT = [
  {
    id: 1,
    action: "UPDATE",
    user: "田中 太郎",
    at: "2026/06/10 14:30",
    detail: "ステータス: 下書き → 発行済",
  },
  {
    id: 2,
    action: "UPDATE",
    user: "鈴木 一郎",
    at: "2026/06/09 11:02",
    detail: "明細 2 行目の単価を ¥1,200 → ¥1,150 に変更",
  },
  {
    id: 3,
    action: "CREATE",
    user: "田中 太郎",
    at: "2026/06/08 09:15",
    detail: undefined,
  },
];

// ── Catalog scaffolding ──────────────────────────────────────────────────────

function DemoSection({
  name,
  source,
  description,
  children,
}: {
  name: string;
  source: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Stack gap="xs" id={name}>
      <Group align="baseline" gap="sm">
        <Title order={4}>{name}</Title>
        <Code>{source}</Code>
      </Group>
      <Text c="dimmed" size="xs">
        {description}
      </Text>
      <Paper p="md" radius="md" withBorder>
        {children}
      </Paper>
    </Stack>
  );
}

// ── Catalog ──────────────────────────────────────────────────────────────────

export function ComponentCatalog() {
  const [modalShellOpen, setModalShellOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [formModalOpen, setFormModalOpen] = useState(false);

  const form = useForm({
    initialValues: { name: { ja: "精密軸", en: "Precision shaft" } },
  });

  const quoteColumns: Column<DemoQuote>[] = [
    {
      key: "quoteNumber",
      header: "見積番号",
      render: (r) => <DocNumber>{r.quoteNumber}</DocNumber>,
      sortable: true,
      sortValue: (r) => r.quoteNumber,
    },
    {
      key: "customer",
      header: "顧客",
      render: (r) => r.customer,
      sortable: true,
    },
    {
      key: "orderType",
      header: "注文種別",
      render: (r) => ORDER_TYPE_LABEL[r.orderType],
      hideable: true,
    },
    {
      key: "status",
      header: "状態",
      render: (r) => <StatusBadge entity="Quote" status={r.status} />,
      sortable: true,
      sortValue: (r) => r.status,
    },
    {
      key: "amount",
      header: "金額",
      align: "right",
      render: (r) => <MoneyText value={r.amount} />,
      sortable: true,
      sortValue: (r) => r.amount,
    },
    {
      key: "updatedAt",
      header: "更新日",
      render: (r) => formatDate(r.updatedAt),
      sortable: true,
      sortValue: (r) => r.updatedAt,
      hideable: true,
    },
  ];

  return (
    <Stack gap="xl" maw={1080} mx="auto" p="md" w="100%">
      <PageHeader
        actions={
          <Anchor component={Link} href="/" size="sm">
            ← ダッシュボード
          </Anchor>
        }
        breadcrumbs={["開発", "コンポーネントプレビュー"]}
        title="コンポーネントプレビュー"
      />
      <Alert color="blue" icon={<IconInfoCircle size={16} />} variant="light">
        統一コンポーネントの確認用カタログです。デモデータで動作します（保存・遷移はしません）。
        ヘッダー（AppLauncher / OperationCodeJump / 通知 /
        ユーザーメニュー）とフッターは、この画面を包む AppShell 自体が実物です。
      </Alert>

      {/* ── 1. StatusBadge ───────────────────────────────────────────────── */}
      <DemoSection
        description="エンティティ × ステータス → Badge（design.md §9 の全マッピング）。"
        name="StatusBadge"
        source="components/ui/StatusBadge.tsx"
      >
        <Stack gap="sm">
          {(Object.keys(STATUS_MAPS) as StatusEntity[]).map((entity) => (
            <Group gap="xs" key={entity} wrap="wrap">
              <Text c="dimmed" ff="mono" size="xs" w={140}>
                {entity}
              </Text>
              {Object.keys(STATUS_MAPS[entity]).map((status) => (
                <StatusBadge entity={entity} key={status} status={status} />
              ))}
            </Group>
          ))}
        </Stack>
      </DemoSection>

      {/* ── 2. ActiveBadge ───────────────────────────────────────────────── */}
      <DemoSection
        description="マスタの有効/無効 boolean バッジ（design.md §14）。"
        name="ActiveBadge"
        source="components/ui/ActiveBadge.tsx"
      >
        <Group gap="sm">
          <ActiveBadge active />
          <ActiveBadge active={false} />
        </Group>
      </DemoSection>

      {/* ── 3. FieldValue + SummaryGrid ─────────────────────────────────── */}
      <DemoSection
        description="詳細ページのサマリーカード（design.md §8.2 / §10.1）。モバイルでは1列に落ちます。"
        name="FieldValue / SummaryGrid"
        source="components/ui/FieldValue.tsx · components/ui/shells.tsx"
      >
        <SummaryGrid>
          <FieldValue
            label="見積番号"
            value={<DocNumber>QOT-202606-00012</DocNumber>}
          />
          <FieldValue label="顧客" value="株式会社ABC製作所" />
          <FieldValue
            label="状態"
            value={<StatusBadge entity="Quote" status="ISSUED" />}
          />
          <FieldValue label="有効期限" value={formatDate("2026-07-10")} />
          <FieldValue
            label="合計金額"
            value={<MoneyText ta="left" value={250000} />}
          />
          <FieldValue label="備考" value={null} />
        </SummaryGrid>
      </DemoSection>

      {/* ── 4. Text primitives ──────────────────────────────────────────── */}
      <DemoSection
        description="金額（¥・右寄せ・等幅数字）、帳票番号（mono）、日付/日時フォーマット（design.md §17.3）。"
        name="MoneyText / DocNumber / format"
        source="components/ui/MoneyText.tsx · DocNumber.tsx · lib/format.ts"
      >
        <Table w="auto">
          <Table.Tbody>
            <Table.Tr>
              <Table.Td>
                <Code>MoneyText</Code>
              </Table.Td>
              <Table.Td>
                <MoneyText ta="left" value={1234567} />
              </Table.Td>
              <Table.Td>
                <Code>formatMoney(0)</Code> → {formatMoney(0)}
              </Table.Td>
            </Table.Tr>
            <Table.Tr>
              <Table.Td>
                <Code>DocNumber</Code>
              </Table.Td>
              <Table.Td>
                <DocNumber>ORD-202606-00045-01</DocNumber>
              </Table.Td>
              <Table.Td>
                <DocNumber c="dimmed">INV-202605-00021</DocNumber>
              </Table.Td>
            </Table.Tr>
            <Table.Tr>
              <Table.Td>
                <Code>formatDate</Code>
              </Table.Td>
              <Table.Td>{formatDate("2026-06-04")}</Table.Td>
              <Table.Td>
                <Code>formatDateTime</Code> →{" "}
                {formatDateTime("2026-06-04T14:30:00")}
              </Table.Td>
            </Table.Tr>
          </Table.Tbody>
        </Table>
      </DemoSection>

      {/* ── 5. JsonLocalizedText ────────────────────────────────────────── */}
      <DemoSection
        description="DB の { ja, en } JSON フィールドを現在ロケールで表示（ja フォールバック、design.md §10.6）。"
        name="JsonLocalizedText"
        source="components/ui/JsonLocalizedText.tsx"
      >
        <Group gap="xl">
          <Text size="sm">
            <JsonLocalizedText
              value={{ ja: "精密軸", en: "Precision shaft" }}
            />
          </Text>
          <Text size="sm">
            ja 空 → <JsonLocalizedText value={{ ja: "", en: "English only" }} />
          </Text>
          <Text size="sm">
            null → <JsonLocalizedText value={null} />
          </Text>
        </Group>
      </DemoSection>

      {/* ── 6. EmptyState ───────────────────────────────────────────────── */}
      <DemoSection
        description="一覧 0 件時のプレースホルダ（design.md §10.3）。"
        name="EmptyState"
        source="components/ui/EmptyState.tsx"
      >
        <EmptyState
          action={
            <Button size="sm" variant="subtle">
              新規作成
            </Button>
          }
          icon={<IconFileText size={24} />}
          message="見積書がありません"
        />
      </DemoSection>

      {/* ── 7. PageHeader ───────────────────────────────────────────────── */}
      <DemoSection
        description="パンくず + タイトル + ステータス + アクション（design.md §10.2）。モバイルではパンくず非表示。"
        name="PageHeader"
        source="components/ui/PageHeader.tsx"
      >
        <PageHeader
          actions={
            <ResourceActions
              menuItems={[
                { label: "コピー", icon: <IconCopy size={14} /> },
                {
                  label: "キャンセル",
                  icon: <IconTrash size={14} />,
                  color: "red",
                  divider: true,
                  onClick: () =>
                    openConfirm({
                      title: "キャンセルの確認",
                      onConfirm: () =>
                        notifications.show({
                          title: "キャンセルしました",
                          message: "デモ",
                          color: "green",
                        }),
                    }),
                },
              ]}
              onEdit={() =>
                notifications.show({
                  title: "編集",
                  message: "デモ: /edit へ遷移します",
                  color: "blue",
                })
              }
              pdf={{
                onClick: () =>
                  notifications.show({
                    title: "PDF",
                    message: "デモ: PDF を生成します",
                    color: "blue",
                  }),
              }}
            />
          }
          align="flex-start"
          breadcrumbs={["販売", "見積書", "QOT-202606-00012"]}
          status={<StatusBadge entity="Quote" status="ISSUED" />}
          title="QOT-202606-00012"
        />
      </DemoSection>

      {/* ── 8. Buttons ──────────────────────────────────────────────────── */}
      <DemoSection
        description="一覧の新規作成 CTA（モバイルで「新規」に短縮）と PDF ダウンロードボタン（design.md §10.5）。"
        name="NewButton / PdfButton"
        source="components/ui/NewButton.tsx · PdfButton.tsx"
      >
        <Group gap="sm">
          <NewButton />
          <NewButton label="見積書を作成" />
          <PdfButton href="#" />
          <PdfButton href="#" label="見積書 PDF" />
        </Group>
      </DemoSection>

      {/* ── 9. DataTable ────────────────────────────────────────────────── */}
      <DemoSection
        description="全一覧画面共通テーブル（design.md §14）— ソート / ページネーション / 行選択 + 一括操作 / 列表示切替 / 密度切替 / モバイルはカード表示。"
        name="DataTable"
        source="components/ui/DataTable.tsx"
      >
        <Stack gap="sm">
          <Group align="flex-end">
            <TextInput
              flex={1}
              leftSection={<IconSearch size={14} />}
              placeholder="検索（デモ・未配線）"
            />
            <Select
              clearable
              data={statusOptions("Quote")}
              placeholder="状態"
              w={160}
            />
            <Button variant="subtle">リセット</Button>
          </Group>
          <DataTable
            bulkActions={[
              {
                label: "削除",
                icon: <IconTrash size={16} />,
                color: "red",
                onAction: (rows) =>
                  notifications.show({
                    title: "一括削除",
                    message: `デモ: ${rows.length}件`,
                    color: "red",
                  }),
              },
            ]}
            columns={quoteColumns}
            data={DEMO_QUOTES}
            getRowId={(r) => r.id}
            onRowClick={(row) =>
              notifications.show({
                title: "行クリック",
                message: `デモ: ${row.quoteNumber} の詳細へ`,
                color: "blue",
              })
            }
            pageSize={5}
            rowActions={(row) => [
              { label: "編集" },
              {
                label: "削除",
                color: "red",
                onAction: () =>
                  openConfirm({
                    title: "削除の確認",
                    message: `${row.quoteNumber} を削除します。`,
                    onConfirm: () =>
                      notifications.show({
                        title: "削除しました",
                        message: "デモ",
                        color: "green",
                      }),
                  }),
              },
            ]}
            selectable
          />
        </Stack>
      </DemoSection>

      {/* ── 10. FormSection + LocalizedTextInput ────────────────────────── */}
      <DemoSection
        description="フォームページのセクション Paper と { ja, en } ペア入力（design.md §8.3 / §17.4）。"
        name="FormSection / LocalizedTextInput"
        source="components/ui/shells.tsx"
      >
        <form
          onSubmit={form.onSubmit(() => {
            notifications.show({
              title: "保存しました",
              message: "デモ: 値は送信されません",
              color: "green",
            });
          })}
        >
          <Stack gap="md">
            <FormSection description="製品マスタの例" title="基本情報">
              <Stack gap="sm">
                <LocalizedTextInput
                  enProps={form.getInputProps("name.en")}
                  jaProps={form.getInputProps("name.ja")}
                  label="名称"
                  required
                />
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                  <Select
                    data={CUSTOMERS}
                    label="顧客"
                    placeholder="顧客を選択"
                    searchable
                    withAsterisk
                  />
                  <Select
                    clearable
                    data={statusOptions("Quote")}
                    label="状態"
                    placeholder="状態を選択"
                  />
                </SimpleGrid>
              </Stack>
            </FormSection>
            <Group justify="flex-end">
              <Button variant="default">キャンセル</Button>
              <Button type="submit">保存</Button>
            </Group>
          </Stack>
        </form>
      </DemoSection>

      {/* ── 11. AuditTimeline ───────────────────────────────────────────── */}
      <DemoSection
        description="詳細ページ「履歴」タブの監査タイムライン（design.md §12.1、audit_logs 相当）。"
        name="AuditTimeline"
        source="components/ui/shells.tsx"
      >
        <AuditTimeline entries={DEMO_AUDIT} />
      </DemoSection>

      {/* ── 12. Modals ──────────────────────────────────────────────────── */}
      <DemoSection
        description="統一ダイアログ（design.md §10.4 / §16.2）。openConfirm は @mantine/modals の命令的 API。"
        name="ModalShell / ConfirmModal / FormModal / openConfirm"
        source="components/ui/modals.tsx"
      >
        <Group gap="sm">
          <Button onClick={() => setModalShellOpen(true)} variant="default">
            ModalShell
          </Button>
          <Button
            color="red"
            onClick={() => setConfirmOpen(true)}
            variant="default"
          >
            ConfirmModal
          </Button>
          <Button onClick={() => setFormModalOpen(true)} variant="default">
            FormModal
          </Button>
          <Button
            onClick={() =>
              openConfirm({
                title: "キャンセルの確認",
                onConfirm: () =>
                  notifications.show({
                    title: "実行しました",
                    message: "デモ",
                    color: "green",
                  }),
              })
            }
            variant="default"
          >
            openConfirm()
          </Button>
        </Group>

        <ModalShell
          confirmLabel="変更"
          onClose={() => setModalShellOpen(false)}
          onConfirm={() => setModalShellOpen(false)}
          opened={modalShellOpen}
          title="ステータス変更"
        >
          <Select
            data={statusOptions("SalesOrder")}
            label="新しい状態"
            placeholder="状態を選択"
          />
        </ModalShell>

        <ConfirmModal
          message="QOT-202606-00012 を削除します。この操作は取り消せません。"
          onClose={() => setConfirmOpen(false)}
          onConfirm={() =>
            notifications.show({
              title: "削除しました",
              message: "デモ",
              color: "green",
            })
          }
          opened={confirmOpen}
          title="削除の確認"
          warning="関連する注文受諾書がある場合は削除できません。"
        />

        <FormModal
          onClose={() => setFormModalOpen(false)}
          onSubmit={(e) => {
            e.preventDefault();
            setFormModalOpen(false);
            notifications.show({
              title: "作成しました",
              message: "デモ",
              color: "green",
            });
          }}
          opened={formModalOpen}
          title="不良種類 クイック登録"
        >
          <TextInput label="コード" placeholder="scratch" withAsterisk />
          <LocalizedTextInput
            enProps={{ defaultValue: "Scratch" } as never}
            jaProps={{ defaultValue: "キズ" } as never}
            label="名称"
            required
          />
        </FormModal>
      </DemoSection>

      {/* ── 13. OperationCodeJump ───────────────────────────────────────── */}
      <DemoSection
        description="操作コード入力（design.md §6）。⌘/ でフォーカス、Enter で該当画面へ実遷移します（例: PD02 → 指示書）。"
        name="OperationCodeJump"
        source="components/layout/OperationCodeJump.tsx"
      >
        <OperationCodeJump />
      </DemoSection>

      {/* ── 14. AppLauncher ─────────────────────────────────────────────── */}
      <DemoSection
        description="ヘッダーのロゴボタンから開くアプリグリッド（design.md §5）。ここではインライン表示。カードクリックで実遷移します。"
        name="AppLauncher"
        source="components/layout/AppLauncher.tsx"
      >
        <Paper mx="auto" py="sm" w={544} withBorder>
          <AppLauncher />
        </Paper>
      </DemoSection>

      {/* ── 15. Tailwind + Mantine ──────────────────────────────────────── */}
      <DemoSection
        description="Tailwind v4 と Mantine v9 の併用確認。@layer の優先順位で、Tailwind ユーティリティが Mantine を上書きできます。"
        name="Tailwind × Mantine"
        source="app/globals.css（@layer 設定）"
      >
        <Stack gap="md">
          {/* Tailwind utilities on a plain element — layout without Mantine props */}
          <div className="flex flex-wrap items-center gap-3 rounded-md border border-blue-400 border-dashed bg-blue-50 p-4">
            <span className="font-semibold text-blue-700 text-sm">
              ← この行は素の &lt;div&gt; に Tailwind クラスのみ（flex / gap /
              p-4 / bg-blue-50 …）
            </span>
          </div>

          {/* Tailwind className overriding a Mantine component's class styles —
              no `!important` needed: utilities レイヤー > mantine レイヤー */}
          <Group align="center" gap="sm">
            <Button>通常の Mantine Button</Button>
            <Button className="rounded-full bg-emerald-600 px-8 hover:bg-emerald-700">
              Tailwind で上書き（rounded-full / bg-emerald-600 / px-8）
            </Button>
          </Group>

          <Text c="dimmed" size="xs">
            Mantine コンポーネントは className を受け付けます。@layer
            の順序（utilities が mantine より上）により、ユーティリティクラスは
            Mantine の標準スタイルを
            <strong> important なしで上書き</strong>します。 ただし Mantine の
            <Code>スタイルプロップ</Code>（<Code>mt</Code> / <Code>c</Code> /{" "}
            <Code>bg</Code>{" "}
            など）はインラインスタイルを生成するため、これを上書きする 場合のみ
            Tailwind v4 の important（<Code>bg-red-600!</Code> ＝
            接尾辞）を使います。
          </Text>
        </Stack>
      </DemoSection>

      <Divider />
      <Group gap="xs">
        <Badge color="gray" variant="light">
          preview
        </Badge>
        <Text c="dimmed" size="xs">
          実装が進んだら、このカタログに各セクション固有コンポーネント（StepCard
          / ApprovalStatusPanel / InspectionRecordForm など design.md
          §12）を追加してください。
        </Text>
      </Group>
    </Stack>
  );
}
