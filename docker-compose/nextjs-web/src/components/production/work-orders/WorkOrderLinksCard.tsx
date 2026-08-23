"use client";

/**
 * WorkOrderLinksCard — 指示書→指示書リンク（work_order_links）の表示・操作。
 *
 * 先行指示書（この指示書へ完成数を渡す — 完了まで先頭工程は開始不可）と
 * 後続指示書（この指示書の完成数を受け取る）を一覧し、未着手のうちは
 * 先行リンクの追加・解除ができる。例: リブ母材の指示書 → 製品の指示書。
 */

import {
  ActionIcon,
  Badge,
  Group,
  NumberInput,
  Paper,
  Stack,
  Text,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconArrowDown,
  IconArrowUp,
  IconLink,
  IconX,
} from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  addWorkOrderLinkAction,
  removeWorkOrderLinkAction,
} from "@/app/(dashboard)/production/work-orders/actions";
import { SecondaryButton } from "@/components/ui/buttons";
import { DocNumber } from "@/components/ui/DocNumber";
import { ModalShell } from "@/components/ui/modals";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { WoLinkView } from "./model";

const BASE_PATH = "/production/work-orders";

function LinkRow({
  link,
  direction,
  onRemove,
  removing,
}: {
  link: WoLinkView;
  direction: "incoming" | "outgoing";
  onRemove?: () => void;
  removing?: boolean;
}) {
  return (
    <Group gap="sm" wrap="nowrap">
      {direction === "incoming" ? (
        <IconArrowDown color="var(--mantine-color-teal-6)" size={14} />
      ) : (
        <IconArrowUp color="var(--mantine-color-blue-6)" size={14} />
      )}
      <Link href={`${BASE_PATH}/${link.workOrderNumber}`}>
        <DocNumber c="blue">{link.docNumber}</DocNumber>
      </Link>
      <StatusBadge entity="WorkOrder" status={link.status} />
      <Badge color="gray" variant="light">
        {link.quantity != null ? `${link.quantity} 本` : "完成数全量"}
      </Badge>
      {onRemove && (
        <ActionIcon
          aria-label="リンク解除"
          color="red"
          loading={removing}
          onClick={onRemove}
          size="sm"
          variant="subtle"
        >
          <IconX size={14} />
        </ActionIcon>
      )}
    </Group>
  );
}

export function WorkOrderLinksCard({
  workOrderNumber,
  status,
  incoming,
  outgoing,
}: {
  workOrderNumber: number;
  status: string;
  incoming: WoLinkView[];
  outgoing: WoLinkView[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [addOpen, setAddOpen] = useState(false);
  const [sourceNumber, setSourceNumber] = useState<number | "">("");
  const [quantity, setQuantity] = useState<number | "">("");

  // 先行リンクの追加は未着手のうちだけ（開始後は受入が確定済み）。
  const canAdd = ["DRAFT", "PENDING_APPROVAL", "APPROVED"].includes(status);
  // 解除は完了前ならいつでも（source キャンセルで詰まったゲートを外せるように）。
  const canRemove = status !== "COMPLETED";

  if (incoming.length === 0 && outgoing.length === 0 && !canAdd) return null;

  const handleAdd = () => {
    if (sourceNumber === "") return;
    startTransition(async () => {
      const result = await addWorkOrderLinkAction({
        sourceWorkOrderNumber: Number(sourceNumber),
        targetWorkOrderNumber: workOrderNumber,
        quantity: quantity === "" ? null : Number(quantity),
      });
      if (result.ok) {
        notifications.show({
          title: "先行指示書をリンクしました",
          message: `#${sourceNumber} の完了後にこの指示書を開始できます`,
          color: "green",
        });
        setAddOpen(false);
        setSourceNumber("");
        setQuantity("");
        router.refresh();
      } else {
        notifications.show({
          title: "エラー",
          message: result.error,
          color: "red",
        });
      }
    });
  };

  const handleRemove = (linkId: string) => {
    startTransition(async () => {
      const result = await removeWorkOrderLinkAction(linkId, workOrderNumber);
      if (result.ok) {
        notifications.show({
          title: "リンクを解除しました",
          message: "",
          color: "green",
        });
        router.refresh();
      } else {
        notifications.show({
          title: "エラー",
          message: result.error,
          color: "red",
        });
      }
    });
  };

  return (
    <Paper p="md" radius="md" withBorder>
      <Stack gap="sm">
        <Group justify="space-between">
          <Group gap="xs">
            <IconLink size={16} />
            <Text fw={600} size="sm">
              関連指示書（数量受け渡し）
            </Text>
          </Group>
          {canAdd && (
            <SecondaryButton onClick={() => setAddOpen(true)} size="xs">
              先行指示書を追加
            </SecondaryButton>
          )}
        </Group>

        {incoming.length > 0 && (
          <Stack gap={6}>
            <Text c="dimmed" size="xs">
              先行（完了までこの指示書の先頭工程は開始不可・完成数が受入に渡る）
            </Text>
            {incoming.map((l) => (
              <LinkRow
                direction="incoming"
                key={l.id}
                link={l}
                onRemove={canRemove ? () => handleRemove(l.id) : undefined}
                removing={isPending}
              />
            ))}
          </Stack>
        )}

        {outgoing.length > 0 && (
          <Stack gap={6}>
            <Text c="dimmed" size="xs">
              後続（この指示書の完成数を受け取る）
            </Text>
            {outgoing.map((l) => (
              <LinkRow direction="outgoing" key={l.id} link={l} />
            ))}
          </Stack>
        )}

        {incoming.length === 0 && outgoing.length === 0 && (
          <Text c="dimmed" size="sm">
            リンクなし — 先行指示書（例: 母材の製造）を追加すると、その完了を
            待ってから開始し、完成数を受入として引き継ぎます
          </Text>
        )}
      </Stack>

      <ModalShell
        confirmDisabled={sourceNumber === ""}
        confirmLabel="リンク追加"
        loading={isPending}
        onClose={() => setAddOpen(false)}
        onConfirm={handleAdd}
        opened={addOpen}
        title="先行指示書を追加"
      >
        <Stack gap="sm">
          <NumberInput
            allowDecimal={false}
            allowNegative={false}
            description="この指示書より先に完了すべき指示書（ロット番号）"
            label="先行指示書番号"
            min={1}
            onChange={(v) => setSourceNumber(typeof v === "number" ? v : "")}
            value={sourceNumber}
            withAsterisk
          />
          <NumberInput
            allowDecimal={false}
            allowNegative={false}
            description="未入力 = 先行指示書の完了時の完成数を全量受け取る"
            label="受け渡し数量（任意）"
            min={1}
            onChange={(v) => setQuantity(typeof v === "number" ? v : "")}
            value={quantity}
          />
        </Stack>
      </ModalShell>
    </Paper>
  );
}
