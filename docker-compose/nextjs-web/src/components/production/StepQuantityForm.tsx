"use client";

/**
 * StepQuantityForm — 工程の数量・不良入力 (design.md §12.3)。
 *
 * タブレット最優先: すべての入力・ボタンは size="lg"（§20.1）。
 * 受入数（既定 = 想定受入）/ 良品数 / 不良内訳（半製品・廃棄・手直し）を入力し、
 * validateQuantities（純関数）でライブに保存則（良品 + 不良 = 受入）を警告する。
 * 「工程完了」で completeStep アクションを呼ぶ（サーバー側でも再検証される）。
 */

import {
  Alert,
  Button,
  Group,
  List,
  NumberInput,
  Paper,
  Stack,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconAlertTriangle, IconCheck } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { completeStep } from "@/app/(dashboard)/production/work-orders/[id]/steps/[stepId]/actions";
import { validateQuantities } from "@/lib/workflow-core";

const num = (v: number | string) =>
  typeof v === "number" ? v : Number(v) || 0;

export function StepQuantityForm({
  workOrderNumber,
  stepId,
  defaultInputQuantity,
  disabled,
}: {
  workOrderNumber: number;
  stepId: string;
  /** 受入数の既定値（前工程の良品数 / Σ流入エッジ / 予定数量）。 */
  defaultInputQuantity: number | null;
  /** 他ユーザーのセッションロック中など、操作不可のとき true。 */
  disabled?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [input, setInput] = useState<number | string>(
    defaultInputQuantity ?? 0,
  );
  const [success, setSuccess] = useState<number | string>(
    defaultInputQuantity ?? 0,
  );
  const [semiFinished, setSemiFinished] = useState<number | string>(0);
  const [scrap, setScrap] = useState<number | string>(0);
  const [rework, setRework] = useState<number | string>(0);

  // ライブ保存則チェック（良品 + 半製品 + 廃棄 + 手直し = 受入）
  const issues = validateQuantities({
    inputQuantity: num(input),
    outputSuccess: num(success),
    defectSemiFinished: num(semiFinished),
    defectScrap: num(scrap),
    defectRework: num(rework),
  });

  const handleComplete = () => {
    startTransition(async () => {
      const result = await completeStep(workOrderNumber, stepId, {
        inputQuantity: num(input),
        outputSuccessQuantity: num(success),
        outputDefectSemiFinished: num(semiFinished),
        outputDefectScrap: num(scrap),
        outputDefectRework: num(rework),
      });
      if (result.ok) {
        notifications.show({
          title: "工程を完了しました",
          message: `良品 ${num(success)} / 受入 ${num(input)}`,
          color: "green",
        });
        router.refresh();
      } else {
        notifications.show({
          title: "エラー",
          message: result.errors?.join(" / ") ?? "工程の完了に失敗しました",
          color: "red",
        });
      }
    });
  };

  return (
    <Paper p="lg" radius="md" withBorder>
      <Stack gap="md">
        <Title order={4}>数量・不良</Title>
        <NumberInput
          description="既定値は前工程の良品数（分岐工程は分岐数量）"
          disabled={disabled}
          label="受入数"
          min={0}
          onChange={setInput}
          size="lg"
          value={input}
          withAsterisk
        />
        <NumberInput
          description="次工程へ渡る数量"
          disabled={disabled}
          label="良品数"
          min={0}
          onChange={setSuccess}
          size="lg"
          value={success}
          withAsterisk
        />
        <Group grow>
          <NumberInput
            description="半製品在庫へ"
            disabled={disabled}
            label="半製品"
            min={0}
            onChange={setSemiFinished}
            size="lg"
            value={semiFinished}
          />
          <NumberInput
            disabled={disabled}
            label="廃棄"
            min={0}
            onChange={setScrap}
            size="lg"
            value={scrap}
          />
          <NumberInput
            description="手直し・追加工程へ"
            disabled={disabled}
            label="手直し"
            min={0}
            onChange={setRework}
            size="lg"
            value={rework}
          />
        </Group>

        {issues.length > 0 && (
          <Alert
            color="orange"
            icon={<IconAlertTriangle size={16} />}
            title="数量が整合していません"
            variant="light"
          >
            <List size="sm">
              {issues.map((i) => (
                <List.Item key={i.message}>{i.message}</List.Item>
              ))}
            </List>
          </Alert>
        )}

        <Group justify="center" mt="sm">
          <Button
            color="green"
            disabled={disabled || issues.length > 0}
            leftSection={<IconCheck size={20} />}
            loading={isPending}
            onClick={handleComplete}
            size="lg"
          >
            工程完了
          </Button>
        </Group>
      </Stack>
    </Paper>
  );
}
