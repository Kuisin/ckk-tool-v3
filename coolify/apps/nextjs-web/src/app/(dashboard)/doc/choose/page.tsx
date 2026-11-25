import { Anchor, Paper, Stack, Text, Title } from "@mantine/core";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
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
 */
export default async function DocChoosePage({
  searchParams,
}: {
  searchParams: Promise<{
    type?: string;
    number?: string;
    base?: string;
    suffix?: string;
  }>;
}) {
  const { type, number, base, suffix = "" } = await searchParams;
  // 転送先はアプリ内のパスだけ（外部へ飛ばす口にしない）。
  if (!type || !number || !base || !/^\/[a-z0-9/-]*$/.test(base)) notFound();
  if (suffix && !/^\/[a-z0-9/-]*$/.test(suffix)) notFound();

  const r = await resolveDocId(type, number);
  if (r.status === "notFound") notFound();
  if (r.status === "ok") {
    redirect(`${base}/${docIdOf({ docRef: r.docRef })}${suffix}`);
  }

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
      <Title order={3}>発行会社を選択</Title>
      <Text c="dimmed" size="sm">
        同じ番号の書類が複数の発行会社にあります。開く書類の発行会社を選んでください。
      </Text>
      <Stack gap="xs">
        {r.docRefs.map((ref) => {
          const parts = parseDocRef(ref);
          if (!parts) return null;
          return (
            <Paper key={ref} p="sm" radius="md" withBorder>
              <Anchor
                component={Link}
                href={`${base}/${docIdOf({ docRef: ref })}${suffix}`}
              >
                <Text fw={600} size="sm">
                  {nameOf(parts.companyCode)}
                </Text>
                <Text c="dimmed" ff="mono" size="xs">
                  {parts.companyCode} · {parts.number}
                </Text>
              </Anchor>
            </Paper>
          );
        })}
      </Stack>
    </Stack>
  );
}
