"use client";

/**
 * CustomerProductCodesPanel — 顧客専用の製品コード（MS04「顧客品番」タブ）。
 *
 * 相手は自分の品番で注文を出し、自分の品番で納品書・請求書を照合する。ここが
 * 埋まっていると (1) 注文書の AI 突合がその顧客ぶんだけ品番で 1 発で決まり、
 * (2) 納品書・請求書の品名欄に相手の品番を併記できる。
 *
 * 閲覧が既定・押して編集（design.md §10.10）。編集中は 1 行 = 1 顧客の表で、
 * モバイルでは 1 行 = 1 カードに落とす（§20.2 — 列が 4 つあると Select が
 * 何を選んでいるか読めない）。
 */

import {
  Group,
  Paper,
  Stack,
  Switch,
  Table,
  TagsInput,
  Text,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { searchCustomerOptions } from "@/app/(dashboard)/_shared/option-search";
import { saveCustomerProductCodes } from "@/app/(dashboard)/master/products/customer-code-actions";
import { KeywordBadges } from "@/components/master/MasterKeywordsField";
import { ActiveBadge } from "@/components/ui/ActiveBadge";
import { GhostButton, SecondaryButton } from "@/components/ui/buttons";
import { DocNumber } from "@/components/ui/DocNumber";
import { EditablePanel } from "@/components/ui/EditablePanel";
import { customerF4 } from "@/components/ui/f4-presets";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { FormActions } from "@/components/ui/shells";
import { useIsMobile } from "@/hooks/useViewport";

/** 表示・編集で扱う 1 行（顧客 1 人ぶん）。 */
export interface CustomerProductCodeRow {
  customerBpId: string;
  customerName: string;
  code: string;
  name: string;
  aliases: string[];
  isActive: boolean;
}

interface Draft extends CustomerProductCodeRow {
  /** 描画キー（顧客未選択の新規行でも安定させる）。 */
  key: number;
}

export function CustomerProductCodesPanel({
  productId,
  rows,
  canEdit,
}: {
  productId: number;
  rows: CustomerProductCodeRow[];
  canEdit: boolean;
}) {
  const tr = useTranslations();
  return (
    <EditablePanel
      canEdit={canEdit}
      description={
        <Text c="dimmed" size="xs">
          {tr("master.customerProductCodes.help")}
        </Text>
      }
      edit={({ close }) => (
        <CustomerProductCodesEditor
          initial={rows}
          onClose={close}
          productId={productId}
        />
      )}
      title={tr("master.customerProductCodes.title")}
      view={<CustomerProductCodesView rows={rows} />}
    />
  );
}

function CustomerProductCodesView({
  rows,
}: {
  rows: CustomerProductCodeRow[];
}) {
  const tr = useTranslations();
  const isMobile = useIsMobile();

  if (rows.length === 0) {
    return (
      <Text c="dimmed" size="sm">
        {tr("master.customerProductCodes.empty")}
      </Text>
    );
  }

  if (isMobile) {
    return (
      <Stack gap="xs">
        {rows.map((r) => (
          <Paper key={r.customerBpId} p="sm" radius="sm" withBorder>
            <Group justify="space-between" wrap="nowrap">
              <Text fw={600} size="sm">
                {r.customerName}
              </Text>
              <ActiveBadge active={r.isActive} />
            </Group>
            <DocNumber>{r.code}</DocNumber>
            {r.name && <Text size="sm">{r.name}</Text>}
            {r.aliases.length > 0 && <KeywordBadges values={r.aliases} />}
          </Paper>
        ))}
      </Stack>
    );
  }

  return (
    <Table highlightOnHover striped withTableBorder>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>{tr("common.customer")}</Table.Th>
          <Table.Th>{tr("master.customerProductCodes.code")}</Table.Th>
          <Table.Th>{tr("master.customerProductCodes.name")}</Table.Th>
          <Table.Th>{tr("master.customerProductCodes.aliases")}</Table.Th>
          <Table.Th>{tr("common.status")}</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {rows.map((r) => (
          <Table.Tr key={r.customerBpId}>
            <Table.Td>{r.customerName}</Table.Td>
            <Table.Td>
              <DocNumber>{r.code}</DocNumber>
            </Table.Td>
            <Table.Td>{r.name || "—"}</Table.Td>
            <Table.Td>
              <KeywordBadges values={r.aliases} />
            </Table.Td>
            <Table.Td>
              <ActiveBadge active={r.isActive} />
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

function CustomerProductCodesEditor({
  productId,
  initial,
  onClose,
}: {
  productId: number;
  initial: CustomerProductCodeRow[];
  onClose: () => void;
}) {
  const tr = useTranslations();
  const router = useRouter();
  const isMobile = useIsMobile();
  const [pending, startTransition] = useTransition();
  // props からドラフトを作る（キャンセル = アンマウント = サーバの値へ戻る）。
  const [drafts, setDrafts] = useState<Draft[]>(() =>
    initial.map((r, i) => ({ ...r, key: i })),
  );
  const [nextKey, setNextKey] = useState(initial.length);

  const patch = (key: number, part: Partial<Draft>) =>
    setDrafts((d) => d.map((r) => (r.key === key ? { ...r, ...part } : r)));
  const remove = (key: number) =>
    setDrafts((d) => d.filter((r) => r.key !== key));
  const add = () => {
    setDrafts((d) => [
      ...d,
      {
        aliases: [],
        code: "",
        customerBpId: "",
        customerName: "",
        isActive: true,
        key: nextKey,
        name: "",
      },
    ]);
    setNextKey((k) => k + 1);
  };

  const save = () => {
    if (drafts.some((r) => !r.customerBpId || !r.code.trim())) {
      notifications.show({
        color: "red",
        message: tr("master.customerProductCodes.everyRowNeedsCustomerAndCode"),
        title: tr("common.error"),
      });
      return;
    }
    startTransition(async () => {
      const result = await saveCustomerProductCodes({
        productId,
        rows: drafts.map((r) => ({
          aliases: r.aliases,
          code: r.code.trim(),
          customerBpId: r.customerBpId,
          isActive: r.isActive,
          name: r.name.trim(),
          notes: "",
        })),
      });
      if (!result.ok) {
        notifications.show({
          color: "red",
          message: result.error,
          title: tr("common.error"),
        });
        return;
      }
      notifications.show({
        color: "green",
        message: tr("common.saved"),
        title: tr("common.saved"),
      });
      onClose();
      router.refresh();
    });
  };

  const customerField = (r: Draft) => (
    <SearchSelect
      aria-label={tr("common.customer")}
      f4={customerF4(tr)}
      initialOption={
        r.customerBpId ? { label: r.customerName, value: r.customerBpId } : null
      }
      onChange={(v, option) =>
        patch(r.key, {
          customerBpId: v ?? "",
          customerName: option?.label ?? "",
        })
      }
      onSearch={searchCustomerOptions}
      placeholder={tr("common.searchCustomers")}
      size="xs"
      storageKey="customer"
      value={r.customerBpId || null}
    />
  );
  const codeField = (r: Draft) => (
    <TextInput
      aria-label={tr("master.customerProductCodes.code")}
      onChange={(e) => patch(r.key, { code: e.currentTarget.value })}
      placeholder={tr("master.customerProductCodes.codePlaceholder")}
      size="xs"
      value={r.code}
    />
  );
  const nameField = (r: Draft) => (
    <TextInput
      aria-label={tr("master.customerProductCodes.name")}
      onChange={(e) => patch(r.key, { name: e.currentTarget.value })}
      placeholder={tr("master.customerProductCodes.namePlaceholder")}
      size="xs"
      value={r.name}
    />
  );
  const aliasesField = (r: Draft) => (
    <TagsInput
      aria-label={tr("master.customerProductCodes.aliases")}
      clearable
      onChange={(v) => patch(r.key, { aliases: v })}
      placeholder={tr("master.customerProductCodes.aliasesPlaceholder")}
      size="xs"
      value={r.aliases}
    />
  );

  return (
    <Stack gap="sm">
      {drafts.length === 0 && (
        <Text c="dimmed" size="sm">
          {tr("master.customerProductCodes.empty")}
        </Text>
      )}

      {isMobile
        ? drafts.length > 0 && (
            <Stack gap="sm">
              {drafts.map((r) => (
                <Paper key={r.key} p="sm" radius="sm" withBorder>
                  <Stack gap="xs">
                    {customerField(r)}
                    {codeField(r)}
                    {nameField(r)}
                    {aliasesField(r)}
                    <Group justify="space-between">
                      <Switch
                        checked={r.isActive}
                        label={tr("common.enabled")}
                        onChange={(e) =>
                          patch(r.key, { isActive: e.currentTarget.checked })
                        }
                        size="xs"
                      />
                      <GhostButton
                        color="red"
                        leftSection={<IconTrash size={14} />}
                        onClick={() => remove(r.key)}
                      >
                        {tr("common.removeRow")}
                      </GhostButton>
                    </Group>
                  </Stack>
                </Paper>
              ))}
            </Stack>
          )
        : drafts.length > 0 && (
            <Table withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th w={240}>{tr("common.customer")}</Table.Th>
                  <Table.Th w={180}>
                    {tr("master.customerProductCodes.code")}
                  </Table.Th>
                  <Table.Th>{tr("master.customerProductCodes.name")}</Table.Th>
                  <Table.Th w={220}>
                    {tr("master.customerProductCodes.aliases")}
                  </Table.Th>
                  <Table.Th w={90}>{tr("common.enabled")}</Table.Th>
                  <Table.Th w={48} />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {drafts.map((r) => (
                  <Table.Tr key={r.key}>
                    <Table.Td>{customerField(r)}</Table.Td>
                    <Table.Td>{codeField(r)}</Table.Td>
                    <Table.Td>{nameField(r)}</Table.Td>
                    <Table.Td>{aliasesField(r)}</Table.Td>
                    <Table.Td>
                      <Switch
                        aria-label={tr("common.enabled")}
                        checked={r.isActive}
                        onChange={(e) =>
                          patch(r.key, { isActive: e.currentTarget.checked })
                        }
                        size="xs"
                      />
                    </Table.Td>
                    <Table.Td>
                      <GhostButton
                        aria-label={tr("common.removeRow")}
                        color="red"
                        onClick={() => remove(r.key)}
                        px="xs"
                      >
                        <IconTrash size={14} />
                      </GhostButton>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}

      <SecondaryButton
        fullWidth={isMobile}
        leftSection={<IconPlus size={14} />}
        onClick={add}
      >
        {tr("master.customerProductCodes.addRow")}
      </SecondaryButton>

      <FormActions loading={pending} onCancel={onClose} onSave={save} />
    </Stack>
  );
}
