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
  Badge,
  Group,
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
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { updateNotificationEmailSettings } from "@/app/(dashboard)/settings/notification-email/actions";
import { EditablePanel } from "@/components/ui/EditablePanel";
import { FieldValue } from "@/components/ui/FieldValue";
import { FormActions, FormSection, SummaryGrid } from "@/components/ui/shells";
import { notificationTypeOptions } from "@/lib/enum-labels";
import type { NotificationEmailSettings } from "@/lib/notification-email-core";
import type { NotificationType } from "@/lib/notifications-core";

function NotificationEmailEditor({
  initial,
  onCancel,
  onSaved,
}: {
  initial: NotificationEmailSettings;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const tr = useTranslations();
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
          title: tr("common.saved2"),
          message: tr(
            "settings.notificationEmailForm.theNotificationEmailSettingsWereUpdated",
          ),
          color: "green",
        });
        router.refresh();
        onSaved();
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
    <Stack gap="md">
      <Alert color="blue" icon={<IconInfoCircle size={16} />} variant="light">
        <Text size="sm">
          {tr(
            "settings.notificationEmailForm.notificationsYouAlreadyReadInThe",
          )}
        </Text>
      </Alert>

      <FormSection
        description={tr(
          "settings.notificationEmailForm.insteadOfOneEmailPerNotification",
        )}
        title={tr("settings.notificationEmailForm.digest")}
      >
        <Switch
          checked={settings.digestEnabled}
          label={tr(
            "settings.notificationEmailForm.sendMissedUnreadItemsTogether",
          )}
          onChange={(e) => patch({ digestEnabled: e.currentTarget.checked })}
        />
      </FormSection>

      <FormSection
        description={tr(
          "settings.notificationEmailForm.theMinimumGapBeforeTheNext",
        )}
        title={tr("settings.notificationEmailForm.sendInterval")}
      >
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          <NumberInput
            description={tr(
              "settings.notificationEmailForm.itWillNotSendAgainSooner",
            )}
            disabled={!settings.digestEnabled}
            label={tr("settings.notificationEmailForm.sendIntervalMin")}
            max={1440}
            min={5}
            onChange={(v) => patch({ intervalMinutes: Number(v) || 5 })}
            value={settings.intervalMinutes}
          />
          <NumberInput
            description={tr(
              "settings.notificationEmailForm.ifStillUnreadThisLongAfter",
            )}
            disabled={!settings.digestEnabled}
            label={tr("settings.notificationEmailForm.gracePeriodMin")}
            max={1440}
            min={0}
            onChange={(v) => patch({ graceMinutes: Number(v) || 0 })}
            value={settings.graceMinutes}
          />
        </SimpleGrid>
      </FormSection>

      <FormSection
        description={tr(
          "settings.notificationEmailForm.theTypesYouPickArriveIn",
        )}
        title={tr("settings.notificationEmailForm.typesSentImmediately")}
      >
        <MultiSelect
          clearable
          data={notificationTypeOptions(locale)}
          disabled={!settings.digestEnabled}
          label={tr(
            "settings.notificationEmailForm.notificationTypesSentImmediately",
          )}
          onChange={(v) => patch({ immediateTypes: v as NotificationType[] })}
          placeholder={
            settings.immediateTypes.length ? undefined : tr("common.none2")
          }
          value={settings.immediateTypes}
        />
      </FormSection>

      <FormSection
        description={tr(
          "settings.notificationEmailForm.theMaximumListedInOneEmail",
        )}
        title={tr("settings.notificationEmailForm.itemsPerEmail")}
      >
        <NumberInput
          disabled={!settings.digestEnabled}
          label={tr("settings.notificationEmailForm.maxItems")}
          max={100}
          min={1}
          onChange={(v) => patch({ maxItemsPerMail: Number(v) || 1 })}
          value={settings.maxItemsPerMail}
          w={200}
        />
      </FormSection>

      <FormActions loading={pending} onCancel={onCancel} onSave={save} />
    </Stack>
  );
}

/** 通知メール設定の閲覧モード（EditablePanel の view）。 */
function NotificationEmailView({
  settings,
}: {
  settings: NotificationEmailSettings;
}) {
  const tr = useTranslations();
  const locale = useLocale();
  const typeLabel = (type: NotificationType) =>
    notificationTypeOptions(locale).find((o) => o.value === type)?.label ??
    type;

  return (
    <Stack gap="md">
      <SummaryGrid>
        <FieldValue
          label={tr("settings.notificationEmailForm.digest")}
          value={
            <Badge color={settings.digestEnabled ? "green" : "gray"}>
              {settings.digestEnabled
                ? tr("common.enabled")
                : tr("common.disabled")}
            </Badge>
          }
        />
        <FieldValue
          label={tr("settings.notificationEmailForm.sendIntervalMin")}
          value={settings.intervalMinutes}
        />
        <FieldValue
          label={tr("settings.notificationEmailForm.gracePeriodMin")}
          value={settings.graceMinutes}
        />
        <FieldValue
          label={tr("settings.notificationEmailForm.maxItems")}
          value={settings.maxItemsPerMail}
        />
        <FieldValue
          fullWidth
          label={tr(
            "settings.notificationEmailForm.notificationTypesSentImmediately",
          )}
          value={
            settings.immediateTypes.length === 0 ? (
              tr("common.none2")
            ) : (
              <Group gap="xs">
                {settings.immediateTypes.map((t) => (
                  <Badge key={t} variant="light">
                    {typeLabel(t)}
                  </Badge>
                ))}
              </Group>
            )
          }
        />
      </SummaryGrid>
    </Stack>
  );
}

/**
 * 通知メールのまとめ方（SY0F）。既定は閲覧、編集は「編集」ボタンから
 * （design.md §10.10）。
 */
export function NotificationEmailForm({
  initial,
}: {
  initial: NotificationEmailSettings;
}) {
  const tr = useTranslations();
  return (
    <Stack gap="md">
      <Alert color="blue" icon={<IconInfoCircle size={16} />} variant="light">
        <Text size="sm">
          {tr(
            "settings.notificationEmailForm.notificationsYouAlreadyReadInThe",
          )}
        </Text>
      </Alert>
      <EditablePanel
        canEdit
        edit={({ close }) => (
          <NotificationEmailEditor
            initial={initial}
            onCancel={close}
            onSaved={close}
          />
        )}
        view={<NotificationEmailView settings={initial} />}
      />
    </Stack>
  );
}
