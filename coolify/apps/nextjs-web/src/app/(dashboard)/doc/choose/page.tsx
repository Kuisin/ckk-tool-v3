import { Paper, Stack, Text, Title } from "@mantine/core";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { LinkAnchor } from "@/components/ui/LinkAnchor";
import { appList } from "@/lib/app-list";
import { requireAppRead } from "@/lib/authz-page";
import { prisma } from "@/lib/db";
import { docIdOf } from "@/lib/doc-number";
import { resolveDocId } from "@/lib/doc-ref";
import { parseDocRef } from "@/lib/doc-ref-core";
import { type LocalizedText, localized } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * 法人を選ぶ画面 — 番号だけの URL（`/sales/quotes/QOT-2026-00001`）で来たが、
 * 同じ番号の書類が複数の自社法人にあるとき（番号は法人ごとの連番なので起きる）。
 * lib/doc-param.ts がここへ転送する。選んだ先は正規の URL（法人コード + 番号）。
 *
 * ここでは書類の中身を一切見せない（番号と法人名だけ）。開いた先の詳細ページが
 * 通常どおり権限を見る。
 *
 * ■ READ ゲート
 * この画面自体は app-list に載らないが、「その番号の書類がどの法人に在るか」は
 * 見せるので、**転送元のアプリ**（`base` = そのアプリの一覧のパス）の READ を
 * 要求する。`base` が app-list のどのアプリの一覧でもなければ 404 —
 * 転送先を app-list にあるパスだけへ絞ることにもなる。
 */
export default async function DocChoosePage({
  searchParams,
}: {
  searchParams: Promise<{
    type?: string;
    number?: string;
    base?: string;
    suffix?: string;
    query?: string;
  }>;
}) {
  const { type, number, base, suffix = "", query = "" } = await searchParams;
  // 元の URL に付いていたクエリ（?tab= など）。組み直して、値だけを引き継ぐ。
  const tail = query ? `?${new URLSearchParams(query).toString()}` : "";
  // 転送先はアプリ内のパスだけ（外部へ飛ばす口にしない）。
  // 何も指さずに開かれた（URL を直に打った等）— 選ぶものが無いのでホームへ。
  if (!type || !number || !base) redirect("/");
  if (!/^\/[a-z0-9/-]*$/.test(base)) notFound();
  if (suffix && !/^\/[a-z0-9/-]*$/.test(suffix)) notFound();
  const app = appList.find((a) => a.href === base);
  if (!app) notFound();
  const denied = await requireAppRead(app.key);
  if (denied) return denied;

  const r = await resolveDocId(type, number);
  if (r.status === "notFound") notFound();
  if (r.status === "ok") {
    redirect(`${base}/${docIdOf({ docRef: r.docRef })}${suffix}${tail}`);
  }

  const tr = await getTranslations();
  const companies = await prisma.ownCompany.findMany({
    select: { code: true, name: true },
  });
  const nameOf = (code: string) =>
    localized(
      (companies.find((c) => c.code === code)?.name ??
        null) as LocalizedText | null,
    ) || code;

  return (
    <Stack gap="md" maw={560} p="md">
      <Title order={3}>{tr("common.selectIssuingCompany")}</Title>
      <Text c="dimmed" size="sm">
        {tr("common.selectIssuingCompanyDesc")}
      </Text>
      <Stack gap="xs">
        {r.docRefs.map((ref) => {
          const parts = parseDocRef(ref);
          if (!parts) return null;
          return (
            <Paper key={ref} p="sm" radius="md" withBorder>
              <LinkAnchor
                href={`${base}/${docIdOf({ docRef: ref })}${suffix}${tail}`}
              >
                <Text fw={600} size="sm">
                  {nameOf(parts.companyCode)}
                </Text>
                <Text c="dimmed" ff="mono" size="xs">
                  {parts.companyCode} · {parts.number}
                </Text>
              </LinkAnchor>
            </Paper>
          );
        })}
      </Stack>
    </Stack>
  );
}
