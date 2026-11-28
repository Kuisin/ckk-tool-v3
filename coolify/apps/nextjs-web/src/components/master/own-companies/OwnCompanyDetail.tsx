"use client";

/**
 * OwnCompanyDetail.tsx — 自社法人 詳細 (MS2I, design.md §8.2).
 *
 * サマリーに連絡先・登録番号。タブは 概要（書類にどう刷られるか + 備考）/
 * 拠点（この法人に属する拠点。付け替えは拠点マスタ MS0C）/ 振込先 / 社印 / ロゴ。
 */

import {
  Anchor,
  Badge,
  Box,
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
import type { BrandLogoSource, IssuerBlock } from "@/lib/own-company-core";
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
  hasLogo: boolean;
  /** ロゴのファイル id — 同じくキャッシュを外すためだけ。 */
  logoVersion: string | null;
  /** PDF の見出しにどのロゴが刷られるか（lib/own-company-core.ts brandLogoSource）。 */
  logoSource: BrandLogoSource;
  isDefault: boolean;
  isActive: boolean;
  notes: string;
  plants: { id: number; code: string; name: string; isActive: boolean }[];
  /** PDF の発行元ブロックと同じ関数で作った、書類に刷られる姿。 */
  issuerPreview: IssuerBlock;
  createdAt: string;
  updatedAt: string;
}

type ImageKind = "seal" | "logo";

/** 画像（印影・ロゴ）の送信（Route Handler — 画像は Server Action の上限に掛かり得る）。 */
async function sendImage(
  kind: ImageKind,
  id: number,
  file: File | null,
  failMessage: string,
): Promise<ActionResult> {
  try {
    const url = `/api/master/own-companies/${id}/${kind}`;
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

/**
 * 社印・ロゴのタブ 1 枚。2 つは置き場所と文言が違うだけで、操作（差し替え /
 * 外す）も既定の法人だけ同梱の画像へ落ちる約束も同じ。
 */
function CompanyImagePanel({
  kind,
  record,
}: {
  kind: ImageKind;
  record: OwnCompanyDetailData;
}) {
  const tr = useTranslations();
  const router = useRouter();
  const [pending, start] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const t =
    kind === "seal"
      ? {
          title: tr("master.ownCompanies.seal"),
          desc: tr("master.ownCompanies.sealDesc"),
          upload: tr("master.ownCompanies.uploadSeal"),
          remove: tr("master.ownCompanies.removeSeal"),
          defaultFallback: tr("master.ownCompanies.sealDefaultFallback"),
          noneFallback: tr("master.ownCompanies.sealNoneFallback"),
          saveFailed: tr("master.ownCompanies.sealSaveFailed"),
          uploaded: tr("master.ownCompanies.sealUploaded"),
          removed: tr("master.ownCompanies.sealRemoved"),
        }
      : {
          title: tr("master.ownCompanies.logo"),
          desc: tr("master.ownCompanies.logoDesc"),
          upload: tr("master.ownCompanies.uploadLogo"),
          remove: tr("master.ownCompanies.removeLogo"),
          defaultFallback: tr("master.ownCompanies.logoDefaultFallback"),
          noneFallback: tr("master.ownCompanies.logoNoneFallback"),
          saveFailed: tr("master.ownCompanies.logoSaveFailed"),
          uploaded: tr("master.ownCompanies.logoUploaded"),
          removed: tr("master.ownCompanies.logoRemoved"),
        };
  const has = kind === "seal" ? record.hasSeal : record.hasLogo;
  const version = kind === "seal" ? record.sealVersion : record.logoVersion;

  const run = (file: File | null) => {
    start(async () => {
      const result = await sendImage(kind, record.id, file, t.saveFailed);
      if (result.ok) {
        notifications.show({
          title: tr("common.saved2"),
          message: file ? t.uploaded : t.removed,
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

  return (
    <Stack gap="sm">
      <Text c="dimmed" size="xs">
        {t.desc}
      </Text>
      {has ? (
        <Image
          alt={t.title}
          fit="contain"
          h={120}
          src={`/api/master/own-companies/${record.id}/${kind}?v=${version ?? ""}`}
          w={kind === "seal" ? 120 : 240}
        />
      ) : (
        <Text c="dimmed" size="sm">
          {record.isDefault ? t.defaultFallback : t.noneFallback}
        </Text>
      )}
      <Group gap="xs">
        <GhostButton
          leftSection={<IconPhotoUp size={14} />}
          loading={pending}
          onClick={() => fileInputRef.current?.click()}
          size="xs"
        >
          {t.upload}
        </GhostButton>
        {has && (
          <GhostButton
            color="red"
            leftSection={<IconTrash size={14} />}
            loading={pending}
            onClick={() => run(null)}
            size="xs"
          >
            {t.remove}
          </GhostButton>
        )}
        <input
          accept="image/png,image/jpeg"
          aria-label={t.upload}
          hidden
          onChange={(e) => {
            const file = e.currentTarget.files?.[0] ?? null;
            e.currentTarget.value = "";
            if (file) run(file);
          }}
          ref={fileInputRef}
          type="file"
        />
      </Group>
    </Stack>
  );
}

export function OwnCompanyDetail({ record }: { record: OwnCompanyDetailData }) {
  const tr = useTranslations();
  const fmt = useFormat();
  const router = useRouter();
  const [tab, setTab] = useTabParam("overview");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [toggleOpen, setToggleOpen] = useState(false);

  const target = {
    id: record.id,
    code: record.code,
    name: record.nameJa,
    isActive: record.isActive,
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
          <Tabs.Tab value="logo">{tr("master.ownCompanies.logo")}</Tabs.Tab>
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
              {/* PDF の見出しと同じ並び — 左にロゴ、右に発行元。 */}
              <Group align="flex-start" gap="lg" justify="space-between">
                <Box data-logo-source={record.logoSource} miw={0}>
                  {record.logoSource === "none" ? (
                    <Text c="dimmed" size="xs">
                      {tr("master.ownCompanies.previewNoLogo")}
                    </Text>
                  ) : (
                    <Image
                      alt={record.issuerPreview.name}
                      fit="contain"
                      h={48}
                      src={
                        record.logoSource === "own"
                          ? `/api/master/own-companies/${record.id}/logo?v=${record.logoVersion ?? ""}`
                          : "/design-assets/logo.svg"
                      }
                      w="auto"
                    />
                  )}
                </Box>
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
              </Group>
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
          <CompanyImagePanel kind="seal" record={record} />
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="logo">
          <CompanyImagePanel kind="logo" record={record} />
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
