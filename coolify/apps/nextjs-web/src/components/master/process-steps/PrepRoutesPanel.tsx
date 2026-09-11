"use client";

/**
 * PrepRoutesPanel — 準備工程リスト（共通）の一覧ページ（工程マスタ MS08 配下）。
 *
 * 中身は製品詳細の工程タブ（ProductRoutesPanel）と同じ部品で、行き先だけが
 * 工程マスタ配下になる。ここにあるリストは製品にも受注元にも紐づかず、指示書
 * ビルダーの「準備工程リスト」欄に全部並ぶ。
 */

import { Alert, Stack } from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import {
  PREP_ROUTE_LINKS,
  ProductRoutesPanel,
} from "@/components/master/products/ProductRoutesPanel";
import { DetailShell } from "@/components/ui/shells";
import type { RouteView } from "@/lib/product-routes-core";

export function PrepRoutesPanel({ routes }: { routes: RouteView[] }) {
  const tr = useTranslations();
  return (
    <DetailShell
      breadcrumbs={[
        tr("common.masterData"),
        { label: tr("common.processSteps"), href: "/master/process-steps" },
        tr("master.prepRoutes.title"),
      ]}
      title={tr("master.prepRoutes.title")}
    >
      <Stack gap="md">
        <Alert
          color="gray"
          icon={<IconInfoCircle size={16} />}
          p="xs"
          variant="light"
        >
          {tr("master.prepRoutes.intro")}
        </Alert>
        <ProductRoutesPanel
          emptyMessage={tr("master.prepRoutes.empty")}
          links={PREP_ROUTE_LINKS}
          routes={routes}
          title={tr("master.prepRoutes.title")}
        />
      </Stack>
    </DetailShell>
  );
}
