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
 * 映せるものは 2 種類:
 *   アプリの画面（APP_PAGE） … 登録簿のテンプレート + その設定
 *   画像（IMAGE）            … 画像 1 枚。掲示・お知らせのポスターなど
 *
 * **画像は別経路**（POST /api/displays/[id]/image）で送る。Server Action の
 * ボディは 1MB 上限で、画像は自分のコードに届く前に 413 になるため。
 * 保存した時点で表示内容も IMAGE に切り替わるので、「上げたのに映らない」
 * という状態を作らない。
 *
 * ★ 保存すると、対象の画面はその場で切り替わる（updateDisplay が合図を送る）。
 *   壁まで行って再起動する必要は無い。
 */

import {
  Alert,
  Box,
  FileButton,
  Group,
  NumberInput,
  SegmentedControl,
  Select,
  Stack,
  Text,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { updateDisplay } from "@/app/(dashboard)/settings/kiosk-devices/displays/actions";
import { SecondaryButton } from "@/components/ui/buttons";
import { FieldValue } from "@/components/ui/FieldValue";
import { FormActions, SummaryGrid } from "@/components/ui/shells";
import type { ImageFit } from "@/lib/display-content";
import { uploadDisplayImage } from "@/lib/display-image-client";
import { findLocalizedDisplayTemplate } from "@/lib/display-template-labels";
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
  const tr = useTranslations();
  const locale = useLocale();
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
  // 画像の収め方。保存済みの値から開く（未設定は「全体を表示」）。
  const [fit, setFit] = useState<ImageFit>(() => {
    const saved = (display.contentConfig as { fit?: unknown } | null)?.fit;
    return typeof saved === "string" &&
      fitChoices(tr).some((c) => c.value === saved)
      ? (saved as ImageFit)
      : "contain";
  });
  // 「アプリの画面」か「画像」か。保存されている種別から開く。
  const [mode, setMode] = useState<"APP_PAGE" | "IMAGE">(
    display.contentType === "IMAGE" ? "IMAGE" : "APP_PAGE",
  );

  const template = findLocalizedDisplayTemplate(templateKey, locale);

  /**
   * テンプレートを替えたら設定も作り直す。前の設定を持ち回すと、たまたま
   * 同じキー（rows など）だけが残って「どこから来た値か分からない」状態になる。
   */
  const pickTemplate = (key: string) => {
    setTemplateKey(key);
    const next = findDisplayTemplate(key);
    setOptions(next ? defaultTemplateOptions(next) : {});
  };

  /** 画像を選んだらすぐ送る。**選ぶ = 映す**（別に保存を押させない）。 */
  const uploadImage = (file: File | null) => {
    if (!file) return;
    startTransition(async () => {
      const result = await uploadDisplayImage(display.id, file, tr);
      if (!result.ok) {
        notifications.show({
          title: tr("common.error2"),
          message: result.error ?? tr("settings.displays.couldNotSaveTheImage"),
          color: "red",
        });
        return;
      }
      notifications.show({
        message: tr("settings.displays.theImageWasSet"),
        color: "green",
      });
      router.refresh();
      onDone();
    });
  };

  /**
   * 収め方だけを変えて保存する。画像と同じく**選んだ時点で効く** —
   * 「選んだのに保存を押していないから変わらない」を作らない。
   */
  const saveFit = (next: ImageFit) => {
    setFit(next);
    const fileId = (display.contentConfig as { fileId?: unknown } | null)
      ?.fileId;
    if (typeof fileId !== "string") return; // 画像未設定なら保存するものが無い
    startTransition(async () => {
      const result = await updateDisplay({
        id: display.id,
        nameJa: display.nameJson?.ja ?? display.name ?? "",
        nameEn: display.nameJson?.en,
        location: display.location ?? undefined,
        plantId: display.plantId,
        contentType: "IMAGE",
        contentConfig: { fileId, fit: next },
      });
      if (!result.ok) {
        notifications.show({
          title: tr("common.error2"),
          message: result.error ?? tr("common.couldNotSave"),
          color: "red",
        });
        return;
      }
      router.refresh();
    });
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
          title: tr("common.error2"),
          message: result.error ?? tr("common.couldNotSave"),
          color: "red",
        });
        return;
      }
      notifications.show({ message: tr("common.saved2"), color: "green" });
      router.refresh();
      onDone();
    });

  return (
    <Stack gap="md">
      {/* ★ FormSection（= Paper）は使わない。この編集画面は既に詳細ページの
          Paper の中に置かれているので、節ごとに Paper を足すとカードが
          入れ子になり、さらにテンプレートの見本カードで 3 枚重なる。
          見出しだけの軽い節にする。 */}
      <Section title={tr("common.whatToShow")}>
        <SegmentedControl
          data={[
            { value: "APP_PAGE", label: tr("settings.displays.anAppScreen") },
            { value: "IMAGE", label: tr("settings.displays.image") },
          ]}
          onChange={(v) => setMode(v as "APP_PAGE" | "IMAGE")}
          value={mode}
        />
      </Section>

      {mode === "IMAGE" && (
        <Section title={tr("settings.displays.image")}>
          <ImageContent
            display={display}
            fit={fit}
            onFitChange={saveFit}
            onPick={uploadImage}
            pending={pending}
          />
        </Section>
      )}

      {mode === "APP_PAGE" && (
        <Section title={tr("common.screenToShow")}>
          <TemplatePicker onChange={pickTemplate} value={templateKey} />
        </Section>
      )}

      {mode === "APP_PAGE" && template && template.options.length > 0 && (
        <Section
          title={tr("settings.displayContentEditor.templateSettings", {
            name: template.label,
          })}
        >
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

      {/* 更新間隔は「アプリの画面」だけの設定 — 画像は変わらないので
          取り直す意味が無い（0 と同じ扱いで害は無いが、出すと迷わせる）。 */}
      {mode === "APP_PAGE" && (
        <Section title={tr("settings.displayContentEditor.refresh")}>
          <NumberInput
            description={tr("settings.displays.itRefetchesAtThisIntervalSet")}
            label={tr("settings.displays.refreshInterval")}
            max={86_400}
            min={0}
            onChange={(v) => setRefreshSec(Number(v) || 0)}
            suffix={` ${tr("settings.displayContentEditor.seconds")}`}
            value={refreshSec}
          />
        </Section>
      )}

      {/* 画像は選んだ時点で保存済みなので、保存ボタンは出さない。
          onSave を省いた FormActions は type="submit" のボタンを描くが、
          ここは <form> の中ではないので押しても何も起きない = 出してはいけない。 */}
      {mode === "APP_PAGE" ? (
        <FormActions loading={pending} onCancel={onDone} onSave={save} />
      ) : (
        <FormActions>
          <SecondaryButton onClick={onDone}>
            {tr("common.close2")}
          </SecondaryButton>
        </FormActions>
      )}
    </Stack>
  );
}

/**
 * 画像の収め方。**CSS の値ではなく、起きることで説明する** — テレビと画像の
 * 縦横比はまず一致しないので、選ぶ人が知りたいのは「余白が出るのか、端が
 * 切れるのか、歪むのか」だけ。
 */
function fitChoices(
  tr: ReturnType<typeof useTranslations>,
): Array<{ value: ImageFit; label: string; help: string }> {
  return [
    {
      value: "contain",
      label: tr("settings.displayContentEditor.fitContainLabel"),
      help: tr("settings.displayContentEditor.fitContainHelp"),
    },
    {
      value: "cover",
      label: tr("settings.displayContentEditor.fitCoverLabel"),
      help: tr("settings.displayContentEditor.fitCoverHelp"),
    },
    {
      value: "fill",
      label: tr("settings.displayContentEditor.fitFillLabel"),
      help: tr("settings.displayContentEditor.fitFillHelp"),
    },
  ];
}

/** 保存済みの画像を admin 経由で引く URL（キオスクの口は端末 Cookie が要る）。 */
export function displayImageUrl(storageKey: string): string {
  return `/api/admin/files/raw?key=${encodeURIComponent(storageKey)}`;
}

/**
 * 画像 1 枚を映す設定。
 *
 * **選んだ時点で保存され、その画面は画像表示に切り替わる。** 「上げる」と
 * 「映す」を分けると、上げただけで何も変わらない状態が作れてしまい、
 * 現場からは「反映されない」としか見えない。
 */
function ImageContent({
  display,
  onPick,
  pending,
  fit,
  onFitChange,
}: {
  display: DisplayDetail;
  onPick: (file: File | null) => void;
  pending: boolean;
  fit: ImageFit;
  onFitChange: (fit: ImageFit) => void;
}) {
  const tr = useTranslations();
  const current = display.contentType === "IMAGE" ? display.image : null;
  const choices = fitChoices(tr);
  const fitHelp = choices.find((c) => c.value === fit)?.help;

  return (
    <Stack gap="sm">
      {current ? (
        <Stack gap={4}>
          {/* 枠を先に確保しておく（読み終えた瞬間に高さが変わると下が飛ぶ） */}
          <Box
            bg="var(--mantine-color-default-hover)"
            style={{
              aspectRatio: "16 / 9",
              borderRadius: "var(--mantine-radius-sm)",
              overflow: "hidden",
            }}
          >
            {/* 見本にも同じ収め方を当てる — 選んだ結果がその場で分かる */}
            {/* biome-ignore lint/performance/noImgElement: 保存済みオブジェクトの実体をそのまま出す（next/image の最適化対象ではない） */}
            <img
              alt={current.filename}
              src={displayImageUrl(current.storageKey)}
              style={{
                display: "block",
                height: "100%",
                objectFit: fit,
                width: "100%",
              }}
            />
          </Box>
          <Text c="dimmed" size="xs" truncate>
            {current.filename}
          </Text>
        </Stack>
      ) : (
        <Alert color="gray" variant="light">
          {tr("settings.displays.noImageIsSetYetChoosing")}
        </Alert>
      )}

      {current && (
        <Select
          data={choices.map((c) => ({ value: c.value, label: c.label }))}
          description={fitHelp}
          label={tr("settings.displays.howItFitsTheScreen")}
          onChange={(v) => v && onFitChange(v as ImageFit)}
          value={fit}
        />
      )}

      <Group gap="xs">
        <FileButton
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={onPick}
        >
          {(props) => (
            <SecondaryButton {...props} loading={pending}>
              {current
                ? tr("settings.displayContentEditor.replaceTheImage")
                : tr("settings.displays.chooseAnImage")}
            </SecondaryButton>
          )}
        </FileButton>
        <Text c="dimmed" size="xs">
          {tr("settings.displays.pNGJpgWebpGifSvgUp")}
        </Text>
      </Group>
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
  const tr = useTranslations();
  const locale = useLocale();
  // 画像表示のときはテンプレートではないので、先に分けて出す。
  if (display.contentType === "IMAGE") {
    return display.image ? (
      <Stack gap={4}>
        <Box
          bg="var(--mantine-color-default-hover)"
          style={{
            aspectRatio: "16 / 9",
            borderRadius: "var(--mantine-radius-sm)",
            overflow: "hidden",
            maxWidth: 480,
          }}
        >
          {/* biome-ignore lint/performance/noImgElement: 保存済みオブジェクトの実体をそのまま出す */}
          <img
            alt={display.image.filename}
            src={displayImageUrl(display.image.storageKey)}
            style={{
              display: "block",
              height: "100%",
              objectFit: "contain",
              width: "100%",
            }}
          />
        </Box>
        <Text c="dimmed" size="xs">
          {tr("settings.displayContentEditor.imagePrefix")}
          {display.image.filename}
          {" / "}
          {fitChoices(tr).find(
            (c) =>
              c.value ===
              ((display.contentConfig as { fit?: unknown } | null)?.fit ??
                "contain"),
          )?.label ?? tr("settings.displays.showAll")}
        </Text>
      </Stack>
    ) : (
      <Text c="dimmed" size="sm">
        {tr("settings.displays.noImageIsSetTheOriginal")}
      </Text>
    );
  }

  const config = display.contentConfig as {
    page?: unknown;
    options?: Record<string, unknown>;
  } | null;
  const template = findLocalizedDisplayTemplate(
    typeof config?.page === "string" ? config.page : null,
    locale,
  );
  const options = config?.options ?? {};

  if (!template) {
    return (
      <Text c="dimmed" size="sm">
        {tr("settings.displays.noScreenIsChosenPickOne")}
      </Text>
    );
  }

  return (
    <SummaryGrid cols={2}>
      <FieldValue label={tr("common.screenToShow")} value={template.label} />
      {template.options.map((spec) => (
        <FieldValue
          key={spec.key}
          label={spec.label}
          value={describeOption(tr, spec, options[spec.key], plantOptions)}
        />
      ))}
      <FieldValue
        label={tr("settings.displays.refreshInterval")}
        value={
          display.refreshIntervalSec > 0
            ? `${display.refreshIntervalSec} ${tr("settings.displayContentEditor.seconds")}`
            : tr("settings.displays.doNotRefreshAutomatically")
        }
      />
    </SummaryGrid>
  );
}

/** 設定 1 つを読める文字にする（生の JSON を見せない）。 */
function describeOption(
  tr: ReturnType<typeof useTranslations>,
  spec: DisplayOptionSpec,
  value: unknown,
  plantOptions: Array<{ value: string; label: string }>,
): string {
  switch (spec.kind) {
    case "plant":
      if (typeof value !== "number")
        return tr("settings.displayContentEditor.thisScreensSite");
      return (
        plantOptions.find((p) => p.value === String(value))?.label ??
        tr("settings.displayContentEditor.siteNumber", { id: value })
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
        ? tr("common.yes")
        : tr("common.no");
    case "text": {
      const v = typeof value === "string" ? value : spec.default;
      return v.trim() ? v : "—";
    }
  }
}
