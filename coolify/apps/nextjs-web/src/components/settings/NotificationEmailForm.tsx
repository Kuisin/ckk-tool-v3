"use client";

/**
 * NotificationEmailForm — 通知メールのまとめ方（SY0F）。
 *
 * 画面に出す軸は 4 つだけ:
 *   まとめるか / どれくらいの間隔で / どれだけ待ってから見逃しとみなすか /
 *   待たせない種別はどれか。
 * 「1 通に並べる件数」は溢れたときの見た目の都合なので詳細側に置く。
 */

import {
  Alert,
  MultiSelect,
  NumberInput,
  SimpleGrid,
  Stack,
  Switch,
  Text,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconInfoCircle } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { useState, useTransition } from "react";
import { updateNotificationEmailSettings } from "@/app/(dashboard)/settings/notification-email/actions";
import { FormActions, FormSection } from "@/components/ui/shells";
import { useTr } from "@/hooks/useTr";
import { notificationTypeOptions } from "@/lib/enum-labels";
import type { NotificationEmailSettings } from "@/lib/notification-email-core";
import type { NotificationType } from "@/lib/notifications-core";

export function NotificationEmailForm({
  initial,
}: {
  initial: NotificationEmailSettings;
}) {
  const tr = useTr();
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [settings, setSettings] = useState<NotificationEmailSettings>(initial);

  const patch = (next: Partial<NotificationEmailSettings>) =>
    setSettings((s) => ({ ...s, ...next }));

  const save = () => {
    startTransition(async () => {
      const result = await updateNotificationEmailSettings(settings);
      if (result.ok) {
        notifications.show({
          title: tr("保存しました"),
          message: tr("通知メールの設定を更新しました"),
          color: "green",
        });
        router.refresh();
      } else {
        notifications.show({
          title: tr("エラー"),
          message: tr(result.error),
          color: "red",
        });
      }
    });
  };

  return (
    <Stack gap="md">
      <Alert color="blue" icon={<IconInfoCircle size={16} />} variant="light">
        <Text size="sm">
          {tr(
            tr(
              "アプリやプッシュ通知で先に読んだ通知はメールされません。\n          メールが届くのは「見逃したまま残っている通知」だけです。",
            ),
          )}
        </Text>
      </Alert>

      <FormSection
        description={tr(
          tr(
            "通知 1 件ごとに 1 通ではなく、見逃した未読をまとめて 1 通にします。切ると従来どおり 1 件ずつ届きます。",
          ),
        )}
        title={tr("まとめて送る")}
      >
        <Switch
          checked={settings.digestEnabled}
          label={tr("見逃した未読をまとめて送る")}
          onChange={(e) => patch({ digestEnabled: e.currentTarget.checked })}
        />
      </FormSection>

      <FormSection
        description={tr(
          tr(
            "同じ人へ次のまとめを送るまでの最短間隔と、「見逃し」とみなすまでの待ち時間。待ち時間の間に読まれた通知はメールされません。",
          ),
        )}
        title={tr("送る間隔")}
      >
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          <NumberInput
            description={tr("この間隔より短く続けて送りません（5〜1440 分）")}
            disabled={!settings.digestEnabled}
            label={tr("送信間隔（分）")}
            max={1440}
            min={5}
            onChange={(v) => patch({ intervalMinutes: Number(v) || 5 })}
            value={settings.intervalMinutes}
          />
          <NumberInput
            description={tr(
              tr(
                "作成からこれだけ経っても未読なら見逃しとみなす（0〜1440 分）",
              ),
            )}
            disabled={!settings.digestEnabled}
            label={tr("猶予（分）")}
            max={1440}
            min={0}
            onChange={(v) => patch({ graceMinutes: Number(v) || 0 })}
            value={settings.graceMinutes}
          />
        </SimpleGrid>
      </FormSection>

      <FormSection
        description={tr(
          tr(
            "選んだ種別はまとめを待たずに 1 通で届きます。既定は「なし」— 待たせたくないものが出てきたときだけ足してください。",
          ),
        )}
        title={tr("待たせない種別")}
      >
        <MultiSelect
          clearable
          data={notificationTypeOptions(locale)}
          disabled={!settings.digestEnabled}
          label={tr("即時に送る通知の種別")}
          onChange={(v) => patch({ immediateTypes: v as NotificationType[] })}
          placeholder={settings.immediateTypes.length ? undefined : tr("なし")}
          value={settings.immediateTypes}
        />
      </FormSection>

      <FormSection
        description={tr(
          tr(
            "1 通に並べる件数の上限。超えた分は「ほか N 件」に畳まれます（畳まれた通知も送信済みとして扱われ、次の回には載りません）。",
          ),
        )}
        title={tr("1 通の件数")}
      >
        <NumberInput
          disabled={!settings.digestEnabled}
          label={tr("最大件数")}
          max={100}
          min={1}
          onChange={(v) => patch({ maxItemsPerMail: Number(v) || 1 })}
          value={settings.maxItemsPerMail}
          w={200}
        />
      </FormSection>

      <FormActions
        cancelLabel={tr("元に戻す")}
        loading={pending}
        onCancel={() => setSettings(initial)}
        onSave={save}
      />
    </Stack>
  );
}
