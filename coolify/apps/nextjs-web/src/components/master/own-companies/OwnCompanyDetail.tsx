"use client";

/**
 * OwnCompanyDetail.tsx — 自社法人 詳細 (MS2I, design.md §8.2).
 *
 * サマリーに連絡先・登録番号。タブは 概要（書類にどう刷られるか + 備考）/
 * 拠点（この法人に属する拠点。付け替えは拠点マスタ MS0C）/ 振込先 / 社印。
 */

import {
  Anchor,
  Badge,
  Group,
  Image,
  Paper,
  Stack,
  Tabs,
  Text,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconCircleMinus, IconPhotoUp, IconTrash } from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { ActiveBadge } from "@/components/ui/ActiveBadge";
import { AppTabs } from "@/components/ui/AppTabs";
import { GhostButton } from "@/components/ui/buttons";
import { DocNumber } from "@/components/ui/DocNumber";
import { FieldValue } from "@/components/ui/FieldValue";
import {
  DetailShell,
  ResourceActions,
  SummaryGrid,
} from "@/components/ui/shells";
import { useTabParam } from "@/hooks/useUrlState";
import type { IssuerBlock } from "@/lib/own-company-core";
import type { ActionResult } from "@/lib/server-action";
import {
  DeleteOwnCompanyModal,
  ToggleOwnCompanyActiveModal,
} from "./OwnCompanyModals";

const BASE_PATH = "/master/own-companies";

export interface OwnCompanyDetailData {
  id: number;
  code: string;
  nameJa: string;
  nameEn: string;
  nameKana: string;
  postalCode: string;
  addressJa: string;
  addressEn: string;
  phone: string;
  fax: string;
  email: string;
  invoiceRegistrationNo: string;
  bankName: string;
  bankBranch: string;
  bankAccountType: string;
  bankAccountNumber: string;
  bankAccountHolder: string;
  fiscalYearStartMonth: number;
  hasSeal: boolean;
  /** 印影のファイル id — 差し替えたときに画像のキャッシュを外すためだけに使う。 */
  sealVersion: string | null;
  isDefault: boolean;
  isActive: boolean;
  notes: string;
  plants: { id: number; code: string; name: string; isActive: boolean }[];
  /** PDF の発行元ブロックと同じ関数で作った、書類に刷られる姿。 */
  issuerPreview: IssuerBlock;
  createdAt: string;
  updatedAt: string;
}

/** 印影の送信（Route Handler — 画像は Server Action の上限に掛かり得る）。 */
async function sendSeal(
  id: number,
  file: File | null,
  failMessage: string,
): Promise<ActionResult> {
  try {
    const url = `/api/master/own-companies/${id}/seal`;
    let res: Response;
    if (file) {
      const body = new FormData();
      body.append("file", file);
      res = await fetch(url, { method: "POST", body });
    } else {
      res = await fetch(url, { method: "DELETE" });
    }
    const json = (await res.json().catch(() => null)) as ActionResult | null;
    if (json && typeof json === "object" && "ok" in json) return json;
  } catch {
    // 通信失敗は下の共通メッセージへ
  }
  return { ok: false, error: failMessage };
}

export function OwnCompanyDetail({ record }: { record: OwnCompanyDetailData }) {
  const tr = useTranslations();
  const fmt = useFormat();
  const router = useRouter();
  const [tab, setTab] = useTabParam("overview");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [toggleOpen, setToggleOpen] = useState(false);
  const [sealPending, startSeal] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const target = {
    id: record.id,
    code: record.code,
    name: record.nameJa,
    isActive: record.isActive,
  };

  const runSeal = (file: File | null) => {
    startSeal(async () => {
      const result = await sendSeal(
        record.id,
        file,
        tr("master.ownCompanies.sealSaveFailed"),
      );
      if (result.ok) {
        notifications.show({
          title: tr("common.saved2"),
          message: file
            ? tr("master.ownCompanies.sealUploaded")
            : tr("master.ownCompanies.sealRemoved"),
          color: "green",
        });
        router.refresh();
      } else {
        notifications.show({
          title: tr("common.error2"),
          message: result.error,
          color: "red",
        });
      }
    });
  };

  const dash = (v: string) => v || "—";

  return (
    <DetailShell
      actions={
        <ResourceActions
          menuItems={
            record.isDefault
              ? []
              : [
                  {
                    label: record.isActive
                      ? tr("common.disable")
                      : tr("common.enable"),
                    icon: <IconCircleMinus size={14} />,
                    onClick: () => setToggleOpen(true),
                  },
                  {
                    label: tr("common.delete"),
                    icon: <IconTrash size={14} />,
                    color: "red",
                    divider: true,
                    onClick: () => setDeleteOpen(true),
                  },
                ]
          }
          onEdit={() => router.push(`${BASE_PATH}/${record.id}/edit`)}
        />
      }
      breadcrumbs={[
        tr("common.masterData"),
        { label: tr("master.ownCompanies.title"), href: BASE_PATH },
        record.code,
      ]}
      createdAt={fmt.dateTime(record.createdAt)}
      status={
        <Group gap="xs" wrap="nowrap">
          <ActiveBadge active={record.isActive} />
          {record.isDefault && (
            <Badge color="blue" variant="light">
              {tr("master.ownCompanies.defaultCompany")}
            </Badge>
          )}
        </Group>
      }
      title={record.nameJa}
      updatedAt={fmt.dateTime(record.updatedAt)}
    >
      <SummaryGrid>
        <FieldValue
          label={tr("master.ownCompanies.code")}
          value={<DocNumber>{record.code}</DocNumber>}
        />
        <FieldValue label={tr("common.nameJapanese")} value={record.nameJa} />
        <FieldValue
          label={tr("common.nameEnglish")}
          value={dash(record.nameEn)}
        />
        <FieldValue label={tr("common.kana2")} value={dash(record.nameKana)} />
        <FieldValue
          label={tr("master.ownCompanies.registrationNoLabel")}
          value={
            record.invoiceRegistrationNo ? (
              <DocNumber>{record.invoiceRegistrationNo}</DocNumber>
            ) : (
              "—"
            )
          }
        />
        <FieldValue
          label={tr("master.ownCompanies.fiscalYearStartMonth")}
          value={tr("master.ownCompanies.monthValue", {
            month: record.fiscalYearStartMonth,
          })}
        />
        <FieldValue
          label={tr("common.postalCode")}
          value={dash(record.postalCode)}
        />
        <FieldValue
          label={tr("common.address")}
          value={dash(record.addressJa)}
        />
        <FieldValue
          label={tr("common.phoneNumber")}
          value={dash(record.phone)}
        />
        <FieldValue
          label={tr("master.ownCompanies.fax")}
          value={dash(record.fax)}
        />
        <FieldValue
          label={tr("common.emailAddress")}
          value={dash(record.email)}
        />
      </SummaryGrid>

      <AppTabs onChange={setTab} value={tab}>
        <Tabs.List>
          <Tabs.Tab value="overview">{tr("common.overview")}</Tabs.Tab>
          <Tabs.Tab value="plants">{tr("master.ownCompanies.plants")}</Tabs.Tab>
          <Tabs.Tab value="bank">{tr("master.ownCompanies.bank")}</Tabs.Tab>
          <Tabs.Tab value="seal">{tr("master.ownCompanies.seal")}</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel pt="md" value="overview">
          <Stack gap="md">
            <Paper p="md" radius="md" withBorder>
              <Text fw={600} size="sm">
                {tr("master.ownCompanies.issuerPreview")}
              </Text>
              <Text c="dimmed" mb="sm" size="xs">
                {tr("master.ownCompanies.issuerPreviewDesc")}
              </Text>
              <Stack gap={2}>
                <Text fw={700} size="sm">
                  {record.issuerPreview.name}
                </Text>
                <Text size="sm">{dash(record.issuerPreview.address)}</Text>
                <Text size="sm">{dash(record.issuerPreview.tel)}</Text>
                <Text ff="mono" size="sm">
                  {dash(record.issuerPreview.invoice_reg)}
                </Text>
              </Stack>
            </Paper>
            <FieldValue label={tr("common.notes")} value={dash(record.notes)} />
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="plants">
          <Stack gap="xs">
            <Text c="dimmed" size="xs">
              {tr("master.ownCompanies.plantsDesc")}
            </Text>
            {record.plants.length === 0 ? (
              <Text c="dimmed" size="sm">
                {tr("master.ownCompanies.noPlants")}
              </Text>
            ) : (
              record.plants.map((p) => (
                <Group gap="sm" key={p.id} wrap="nowrap">
                  <DocNumber>{p.code}</DocNumber>
                  <Anchor
                    component={Link}
                    href={`/master/plants/${p.id}`}
                    size="sm"
                  >
                    {p.name}
                  </Anchor>
                  {!p.isActive && <ActiveBadge active={false} />}
                </Group>
              ))
            )}
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="bank">
          <SummaryGrid>
            <FieldValue
              label={tr("master.ownCompanies.bankName")}
              value={dash(record.bankName)}
            />
            <FieldValue
              label={tr("master.ownCompanies.bankBranch")}
              value={dash(record.bankBranch)}
            />
            <FieldValue
              label={tr("master.ownCompanies.bankAccountType")}
              value={dash(record.bankAccountType)}
            />
            <FieldValue
              label={tr("master.ownCompanies.bankAccountNumber")}
              value={dash(record.bankAccountNumber)}
            />
            <FieldValue
              label={tr("master.ownCompanies.bankAccountHolder")}
              value={dash(record.bankAccountHolder)}
            />
          </SummaryGrid>
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="seal">
          <Stack gap="sm">
            <Text c="dimmed" size="xs">
              {tr("master.ownCompanies.sealDesc")}
            </Text>
            {record.hasSeal ? (
              <Image
                alt={tr("master.ownCompanies.seal")}
                fit="contain"
                h={120}
                src={`/api/master/own-companies/${record.id}/seal?v=${record.sealVersion ?? ""}`}
                w={120}
              />
            ) : (
              <Text c="dimmed" size="sm">
                {record.isDefault
                  ? tr("master.ownCompanies.sealDefaultFallback")
                  : tr("master.ownCompanies.sealNoneFallback")}
              </Text>
            )}
            <Group gap="xs">
              <GhostButton
                leftSection={<IconPhotoUp size={14} />}
                loading={sealPending}
                onClick={() => fileInputRef.current?.click()}
                size="xs"
              >
                {tr("master.ownCompanies.uploadSeal")}
              </GhostButton>
              {record.hasSeal && (
                <GhostButton
                  color="red"
                  leftSection={<IconTrash size={14} />}
                  loading={sealPending}
                  onClick={() => runSeal(null)}
                  size="xs"
                >
                  {tr("master.ownCompanies.removeSeal")}
                </GhostButton>
              )}
              <input
                accept="image/png,image/jpeg"
                hidden
                onChange={(e) => {
                  const file = e.currentTarget.files?.[0] ?? null;
                  e.currentTarget.value = "";
                  if (file) runSeal(file);
                }}
                ref={fileInputRef}
                type="file"
              />
            </Group>
          </Stack>
        </Tabs.Panel>
      </AppTabs>

      <DeleteOwnCompanyModal
        onClose={() => setDeleteOpen(false)}
        onDone={() => router.push(BASE_PATH)}
        opened={deleteOpen}
        target={target}
      />
      <ToggleOwnCompanyActiveModal
        onClose={() => setToggleOpen(false)}
        onDone={() => router.refresh()}
        opened={toggleOpen}
        target={target}
      />
    </DetailShell>
  );
}
