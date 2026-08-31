"use client";

/**
 * PairDisplayForm — ディスプレイの登録（ペアリング）。
 *
 * Raspberry Pi の画面に出た QR をスマホで読むとここに来る。**脚立の上で
 * 片手で終わる**ことを狙って、縦 1 列・入力は最小（名前だけ必須）にする。
 *
 * コードは URL から入るが、読めなかったときのために手入力もできる。
 * 「登録」を押した瞬間に壁の画面が切り替わる（ディスプレイ側がポーリングで
 * トークンを受け取る）。
 */

import {
  Alert,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { IconDeviceTv } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { pairDisplay } from "@/app/(dashboard)/settings/displays/actions";
import { FormActions } from "@/components/ui/shells";

type Props = {
  initialCode: string;
  profiles: Array<{ id: string; name: string }>;
  plantOptions: Array<{ value: string; label: string }>;
};

/** 表示用の 4 文字区切り。DB へは正規化してから送る（サーバー側で行う）。 */
function formatForDisplay(code: string): string {
  return code
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/(.{4})(?=.)/g, "$1-");
}

export function PairDisplayForm({
  initialCode,
  profiles,
  plantOptions,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const form = useForm({
    initialValues: {
      code: formatForDisplay(initialCode),
      nameJa: "",
      location: "",
      plantId: null as string | null,
      profileId: null as string | null,
    },
    validate: {
      code: (v) =>
        v.replace(/[^A-Za-z0-9]/g, "").length === 12
          ? null
          : "登録コードは 12 文字です",
      nameJa: (v) => (v.trim() ? null : "名前を入力してください"),
    },
  });

  const submit = form.onSubmit((values) => {
    setError(null);
    startTransition(async () => {
      const result = await pairDisplay({
        code: values.code.replace(/[^A-Za-z0-9]/g, "").toUpperCase(),
        nameJa: values.nameJa,
        location: values.location || undefined,
        plantId: values.plantId ? Number(values.plantId) : null,
        profileId: values.profileId,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      notifications.show({
        title: "登録しました",
        message: "ディスプレイに表示内容が出ます",
        color: "green",
      });
      router.push(`/settings/displays/${result.data.id}`);
    });
  });

  return (
    <Stack gap="md" maw={560} mx="auto">
      <Stack align="center" gap={4}>
        <IconDeviceTv size={40} stroke={1.5} />
        <Title order={2}>ディスプレイの登録</Title>
        <Text c="dimmed" size="sm" ta="center">
          画面に出ている登録コードを確認し、この画面の名前と表示内容を決めてください。
        </Text>
      </Stack>

      {error && (
        <Alert color="red" title="登録できませんでした">
          {error}
        </Alert>
      )}

      <Paper component="form" onSubmit={submit} p="md" radius="md" withBorder>
        <Stack gap="md">
          <TextInput
            description="ディスプレイの画面に出ている 12 文字"
            label="登録コード"
            placeholder="ABCD-EFGH-JKLM"
            withAsterisk
            {...form.getInputProps("code")}
            onChange={(e) =>
              form.setFieldValue(
                "code",
                formatForDisplay(e.currentTarget.value),
              )
            }
          />

          <TextInput
            description="現場の人が呼ぶ名前（例: A ライン 入口）"
            label="ディスプレイの名前"
            placeholder="A ライン 入口"
            withAsterisk
            {...form.getInputProps("nameJa")}
          />

          <TextInput
            label="設置場所"
            placeholder="1F 加工エリア"
            {...form.getInputProps("location")}
          />

          <Select
            clearable
            data={plantOptions}
            label="拠点"
            placeholder="選択してください"
            searchable
            {...form.getInputProps("plantId")}
          />

          <Select
            clearable
            data={profiles.map((p) => ({ value: p.id, label: p.name }))}
            description="あとから変更できます。未選択のままでも登録できます"
            label="表示内容"
            placeholder="選択してください"
            searchable
            {...form.getInputProps("profileId")}
          />

          <FormActions
            loading={pending}
            onCancel={() => router.push("/settings/displays")}
            submitLabel="登録する"
          />
        </Stack>
      </Paper>
    </Stack>
  );
}
