"use client";

/**
 * 書類詳細に置く「ポータル共有」。
 *
 * 発行者がポリシーを選ぶ（利用者の判断 —「書類ごとに選べる」）。
 * **金額を含む書類で LINK_ONLY を選んだときは確認を挟む** — URL の所持だけで
 * 開けるので、転送されればその相手にも金額が見える。
 */

import {
  Alert,
  Badge,
  Button,
  Card,
  CopyButton,
  Group,
  NumberInput,
  Radio,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { useState, useTransition } from "react";
import {
  createLinkOnlyUrl,
  createVerifyLink,
  type PortalLinkInput,
  revokeLink,
} from "@/app/(dashboard)/settings/portal/actions";
import { useTr } from "@/hooks/useTr";
import type { PortalDocumentType } from "@/lib/portal-documents-core";
import type { PortalLinkRow } from "@/lib/portal-links";

/** 金額が載る書類（LINK_ONLY のとき確認を挟む）。 */
const MONEY_DOCS: PortalDocumentType[] = ["invoices", "quotes"];

export function PortalShareCard({
  resourceType,
  resourceId,
  links,
  canMintLinkOnly,
}: {
  resourceType: PortalDocumentType;
  resourceId: string;
  links: PortalLinkRow[];
  canMintLinkOnly: boolean;
}) {
  const tr = useTr();
  const [pending, start] = useTransition();
  const [policy, setPolicy] = useState<"VERIFY" | "LINK_ONLY">("VERIFY");
  const [email, setEmail] = useState("");
  const [days, setDays] = useState<number>(30);
  const [url, setUrl] = useState<string | null>(null);

  function notify(res: { ok: boolean; error?: string }, ok: string) {
    notifications.show(
      res.ok
        ? { color: "green", message: ok, title: tr("完了") }
        : {
            color: "red",
            message: res.error ?? tr("失敗しました"),
            title: tr("エラー"),
          },
    );
  }

  function submit() {
    const input: PortalLinkInput = {
      resourceType,
      resourceId,
      boundEmail: policy === "VERIFY" ? email : null,
      days,
    };
    const run = () =>
      start(async () => {
        const res =
          policy === "LINK_ONLY"
            ? await createLinkOnlyUrl(input)
            : await createVerifyLink(input);
        if (res.ok) setUrl(res.data.url);
        notify(res, tr("リンクを発行しました"));
      });

    if (policy === "LINK_ONLY" && MONEY_DOCS.includes(resourceType)) {
      modals.openConfirmModal({
        title: tr("本人確認なしのリンクを発行します"),
        children: (
          <Text size="sm">
            {tr(
              "このリンクを持つ人は誰でも、金額を含む内容を開けます。\n            転送された場合、その相手も開けます。",
            )}
          </Text>
        ),
        labels: { cancel: tr("戻る"), confirm: tr("発行する") },
        confirmProps: { color: "red" },
        onConfirm: run,
      });
      return;
    }
    run();
  }

  return (
    <Card padding="md" radius="md" withBorder>
      <Stack gap="sm">
        <Text fw={600} size="sm">
          {tr("ポータル共有")}
        </Text>
        <Text c="dimmed" size="xs">
          {tr("この書類を取引先に見せるリンクを発行します。")}
        </Text>

        <Radio.Group
          onChange={(v) => setPolicy(v as "VERIFY" | "LINK_ONLY")}
          value={policy}
        >
          <Stack gap={4}>
            <Radio
              description={tr(
                "登録アドレスへ確認コードを送ります。転送されても本人以外は開けません。",
              )}
              label={tr("本人確認あり（推奨）")}
              value="VERIFY"
            />
            <Radio
              description={
                canMintLinkOnly
                  ? tr(
                      "URL を知っていれば誰でも開けます。転送に注意してください。",
                    )
                  : tr("特権アクセス（SY0G）の承認が必要です")
              }
              disabled={!canMintLinkOnly}
              label={tr("リンクのみ")}
              value="LINK_ONLY"
            />
          </Stack>
        </Radio.Group>

        {policy === "VERIFY" ? (
          <TextInput
            description={tr("このアドレスにだけ確認コードを送ります")}
            label={tr("送信先メールアドレス")}
            onChange={(e) => setEmail(e.currentTarget.value)}
            type="email"
            value={email}
          />
        ) : null}

        <NumberInput
          label={tr("有効期間（日）")}
          max={180}
          min={1}
          onChange={(v) => setDays(Number(v) || 30)}
          value={days}
        />

        <Group justify="flex-end">
          <Button
            disabled={policy === "VERIFY" && !email}
            loading={pending}
            onClick={submit}
          >
            {tr("リンクを発行")}
          </Button>
        </Group>

        {url ? (
          <Alert color="blue" variant="light">
            <Stack gap={4}>
              <Text size="xs">
                {tr("発行しました。この URL をお渡しください。")}
              </Text>
              <Group gap="xs" wrap="nowrap">
                <Text
                  ff="monospace"
                  size="xs"
                  style={{ wordBreak: "break-all" }}
                >
                  {url}
                </Text>
                <CopyButton value={url}>
                  {({ copied, copy }) => (
                    <Button onClick={copy} size="compact-xs" variant="default">
                      {copied ? "コピーしました" : tr("コピー")}
                    </Button>
                  )}
                </CopyButton>
              </Group>
            </Stack>
          </Alert>
        ) : null}

        {links.length > 0 ? (
          <Stack gap={4}>
            <Text c="dimmed" size="xs">
              {tr("発行済みのリンク")}
            </Text>
            {links.map((l) => (
              <Group gap="xs" justify="space-between" key={l.id} wrap="nowrap">
                <Group gap="xs">
                  <Badge
                    color={l.policy === "VERIFY" ? "green" : "orange"}
                    size="xs"
                    variant="light"
                  >
                    {l.policy === "VERIFY" ? "本人確認あり" : tr("リンクのみ")}
                  </Badge>
                  <Text c="dimmed" size="xs">
                    {l.maskedEmail ?? "—"} / {l.useCount} 回 /{" "}
                    {l.expiresAt.toISOString().slice(0, 10)} まで
                  </Text>
                </Group>
                {l.revokedAt ? (
                  <Badge color="gray" size="xs" variant="light">
                    {tr("失効済み")}
                  </Badge>
                ) : (
                  <Button
                    color="red"
                    loading={pending}
                    onClick={() =>
                      start(async () =>
                        notify(await revokeLink(l.id), tr("失効させました")),
                      )
                    }
                    size="compact-xs"
                    variant="subtle"
                  >
                    {tr("失効")}
                  </Button>
                )}
              </Group>
            ))}
          </Stack>
        ) : null}
      </Stack>
    </Card>
  );
}
