"use client";

/**
 * CommonRoutesPanel — 共通の工程リスト（準備 / 再研磨）の一覧ページ（工程マスタ
 * MS08 配下）。
 *
 * 中身は製品詳細の工程タブ（ProductRoutesPanel）と同じ部品で、行き先だけが
 * 工程マスタ配下になる。ここにあるリストは製品にも受注元にも紐づかず、指示書
 * ビルダーの「準備工程リスト」/「再研磨工程リスト」欄に全部並ぶ。
 * 種別で変わるのは文言と行き先だけなので、1 つの部品に kind を渡す。
 */

import { Alert, Stack } from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import {
  PREP_ROUTE_LINKS,
  ProductRoutesPanel,
  REGRIND_ROUTE_LINKS,
} from "@/components/master/products/ProductRoutesPanel";
import { DetailShell } from "@/components/ui/shells";
import type { RouteView } from "@/lib/product-routes-core";

export function CommonRoutesPanel({
  kind,
  routes,
}: {
  kind: "PREP" | "REGRIND";
  routes: RouteView[];
}) {
  const tr = useTranslations();
  const ns = kind === "REGRIND" ? "master.regrindRoutes" : "master.prepRoutes";
  return (
    <DetailShell
      breadcrumbs={[
        tr("common.masterData"),
        { label: tr("common.processSteps"), href: "/master/process-steps" },
        tr(`${ns}.title`),
      ]}
      title={tr(`${ns}.title`)}
    >
      <Stack gap="md">
        <Alert
          color="gray"
          icon={<IconInfoCircle size={16} />}
          p="xs"
          variant="light"
        >
          {tr(`${ns}.intro`)}
        </Alert>
        <ProductRoutesPanel
          emptyMessage={tr(`${ns}.empty`)}
          links={kind === "REGRIND" ? REGRIND_ROUTE_LINKS : PREP_ROUTE_LINKS}
          routes={routes}
          title={tr(`${ns}.title`)}
        />
      </Stack>
    </DetailShell>
  );
}
