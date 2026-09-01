"use client";

/**
 * DisplayContentEditor — **この画面が何を映すか**を決める。
 *
 * 以前は「表示内容」を別レコードとして作ってから画面に結びつけていた。
 * 掲示板は 1 枚ずつ違うもの（この壁は生産状況、あの壁は出荷予定）を映すので、
 * 共有される表示内容はほとんど生まれず、1 枚増やすたびに「表示内容を作る →
 * 画面を作る → 結ぶ」の 3 手順を踏むことになっていた。いまは画面の設定として
 * ここで直接編集する。
 *
 * 出す欄は**登録簿（lib/display-templates.ts）から自動で組み立てる**ので、
 * 画面を増やす作業はテンプレートを 1 つ足すだけで済む。
 *
 * ★ 保存すると、対象の画面はその場で切り替わる（updateDisplay が合図を送る）。
 *   壁まで行って再起動する必要は無い。
 */

import { NumberInput, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updateDisplay } from "@/app/(dashboard)/settings/kiosk-devices/displays/actions";
import { FieldValue } from "@/components/ui/FieldValue";
import { FormActions, SummaryGrid } from "@/components/ui/shells";
import {
  type DisplayOptionSpec,
  type DisplayTemplateOptions,
  defaultTemplateOptions,
  findDisplayTemplate,
  templateOptionsSchema,
} from "@/lib/display-templates";
import type { DisplayDetail } from "@/lib/displays-admin";
import { TemplateOptionFields } from "./TemplateOptionFields";
import { TemplatePicker } from "./TemplatePicker";

/** 何も選ばれていないときに開くテンプレート（DB の既定と同じもの）。 */
const FALLBACK_TEMPLATE = "production";

type Props = {
  display: DisplayDetail;
  plantOptions: Array<{ value: string; label: string }>;
  /** 保存後に閲覧へ戻す（EditablePanel が渡す）。 */
  onDone: () => void;
};

/** 保存されている設定を、いま選ばれているテンプレートの形へ寄せる。 */
function initialOptions(
  templateKey: string,
  config: unknown,
): DisplayTemplateOptions {
  const template = findDisplayTemplate(templateKey);
  if (!template) return {};
  const saved = (config as { options?: unknown } | null)?.options ?? {};
  // 検証を通す = 知らないキーは落ち、欠けた項目は既定で埋まる。
  // テンプレートを切り替えた直後でも、フォームが空欄だらけにならない。
  const parsed = templateOptionsSchema(template).safeParse(saved);
  return parsed.success
    ? (parsed.data as DisplayTemplateOptions)
    : defaultTemplateOptions(template);
}

export function DisplayContentEditor({ display, plantOptions, onDone }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const savedPage =
    (display.contentConfig as { page?: unknown } | null)?.page ?? null;
  const [templateKey, setTemplateKey] = useState<string>(
    typeof savedPage === "string" && findDisplayTemplate(savedPage)
      ? savedPage
      : FALLBACK_TEMPLATE,
  );
  const [options, setOptions] = useState<DisplayTemplateOptions>(() =>
    initialOptions(templateKey, display.contentConfig),
  );
  const [refreshSec, setRefreshSec] = useState(display.refreshIntervalSec);

  const template = findDisplayTemplate(templateKey);

  /**
   * テンプレートを替えたら設定も作り直す。前の設定を持ち回すと、たまたま
   * 同じキー（rows など）だけが残って「どこから来た値か分からない」状態になる。
   */
  const pickTemplate = (key: string) => {
    setTemplateKey(key);
    const next = findDisplayTemplate(key);
    setOptions(next ? defaultTemplateOptions(next) : {});
  };

  const save = () =>
    startTransition(async () => {
      const result = await updateDisplay({
        id: display.id,
        nameJa: display.nameJson?.ja ?? display.name ?? "",
        nameEn: display.nameJson?.en,
        location: display.location ?? undefined,
        plantId: display.plantId,
        contentType: "APP_PAGE",
        contentConfig: { page: templateKey, options },
        refreshIntervalSec: refreshSec,
      });
      if (!result.ok) {
        notifications.show({
          title: "エラー",
          message: result.error ?? "保存に失敗しました",
          color: "red",
        });
        return;
      }
      notifications.show({ message: "保存しました", color: "green" });
      router.refresh();
      onDone();
    });

  return (
    <Stack gap="md">
      {/* ★ FormSection（= Paper）は使わない。この編集画面は既に詳細ページの
          Paper の中に置かれているので、節ごとに Paper を足すとカードが
          入れ子になり、さらにテンプレートの見本カードで 3 枚重なる。
          見出しだけの軽い節にする。 */}
      <Section title="映す画面">
        <TemplatePicker onChange={pickTemplate} value={templateKey} />
      </Section>

      {template && template.options.length > 0 && (
        <Section title={`${template.label}の設定`}>
          <TemplateOptionFields
            onChange={(key, value) =>
              setOptions((prev) => ({ ...prev, [key]: value }))
            }
            plantOptions={plantOptions}
            template={template}
            values={options}
          />
        </Section>
      )}

      <Section title="更新">
        <NumberInput
          description="この間隔で内容を取り直します。0 にすると自動更新しません"
          label="更新間隔"
          max={86_400}
          min={0}
          onChange={(v) => setRefreshSec(Number(v) || 0)}
          suffix=" 秒"
          value={refreshSec}
        />
      </Section>

      <FormActions loading={pending} onCancel={onDone} onSave={save} />
    </Stack>
  );
}

/** 枠を持たない節（見出し + 中身）。カードを入れ子にしないための最小の器。 */
function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Stack gap="xs">
      <Text fw={600} size="sm">
        {title}
      </Text>
      {children}
    </Stack>
  );
}

/**
 * 閲覧モードの中身（EditablePanel の `view`）。
 *
 * 無効化した入力欄を並べない — 読みに来た人が知りたいのは「いま何が
 * 設定されているか」で、フォームの形ではない（design.md §10.10）。
 */
export function DisplayContentView({
  display,
  plantOptions,
}: {
  display: DisplayDetail;
  plantOptions: Array<{ value: string; label: string }>;
}) {
  const config = display.contentConfig as {
    page?: unknown;
    options?: Record<string, unknown>;
  } | null;
  const template = findDisplayTemplate(
    typeof config?.page === "string" ? config.page : null,
  );
  const options = config?.options ?? {};

  if (!template) {
    return (
      <Text c="dimmed" size="sm">
        映す画面が選ばれていません。「編集」から選んでください。
      </Text>
    );
  }

  return (
    <SummaryGrid cols={2}>
      <FieldValue label="映す画面" value={template.label} />
      {template.options.map((spec) => (
        <FieldValue
          key={spec.key}
          label={spec.label}
          value={describeOption(spec, options[spec.key], plantOptions)}
        />
      ))}
      <FieldValue
        label="更新間隔"
        value={
          display.refreshIntervalSec > 0
            ? `${display.refreshIntervalSec} 秒`
            : "自動更新しない"
        }
      />
    </SummaryGrid>
  );
}

/** 設定 1 つを読める文字にする（生の JSON を見せない）。 */
function describeOption(
  spec: DisplayOptionSpec,
  value: unknown,
  plantOptions: Array<{ value: string; label: string }>,
): string {
  switch (spec.kind) {
    case "plant":
      if (typeof value !== "number") return "この画面の拠点";
      return (
        plantOptions.find((p) => p.value === String(value))?.label ??
        `拠点 #${value}`
      );
    case "number": {
      const n = typeof value === "number" ? value : spec.default;
      return spec.suffix ? `${n} ${spec.suffix}` : String(n);
    }
    case "select": {
      const v = typeof value === "string" ? value : spec.default;
      return spec.choices.find((c) => c.value === v)?.label ?? v;
    }
    case "boolean":
      return (typeof value === "boolean" ? value : spec.default)
        ? "はい"
        : "いいえ";
    case "text": {
      const v = typeof value === "string" ? value : spec.default;
      return v.trim() ? v : "—";
    }
  }
}
