"use client";

/**
 * OrderRequestIntake — AI-first 受注請書 取込 (design: §2 注文受付).
 *
 * Flow: upload PDF/scan → POST /api/extract/order-request (po-extract, qwen2.5vl)
 * → show the scanned image (left) + the auto-filled form (right); the user only
 * confirms the content. On extraction failure, the same form is shown blank with
 * an error notice so the user enters every field from scratch. No DB persistence.
 */

import {
  Alert,
  Box,
  Center,
  Group,
  Loader,
  Paper,
  SimpleGrid,
  Stack,
  Text,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconAlertTriangle,
  IconFileTypePdf,
  IconRobot,
  IconUpload,
} from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import {
  GhostButton,
  PrimaryButton,
  SecondaryButton,
} from "@/components/ui/buttons";
import { PageHeader } from "@/components/ui/PageHeader";
import { useIsMobile } from "@/hooks/useViewport";
import { OrderRequestForm } from "./OrderRequestForm";
import { emptyOrderRequest, type OrderRequest } from "./types";

const BASE_PATH = "/sales/order-acceptances";
type Step = "upload" | "extracting" | "review" | "manual";

export function OrderRequestIntake({ manual = false }: { manual?: boolean }) {
  const isMobile = useIsMobile();
  const inputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>(manual ? "manual" : "upload");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [data, setData] = useState<OrderRequest>(emptyOrderRequest());
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  // Object URL for the in-browser preview; revoked on change/unmount.
  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const isPdf =
    file?.type === "application/pdf" ||
    (file?.name ?? "").toLowerCase().endsWith(".pdf");

  const pickFile = (f: File | null | undefined) => {
    if (f) setFile(f);
  };

  async function runExtraction() {
    if (!file) return;
    setStep("extracting");
    setErrorMsg(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/extract/order-request", {
        method: "POST",
        body,
      });
      const json = await res.json();
      if (!res.ok || json?.error) {
        throw new Error(json?.error ?? `HTTP ${res.status}`);
      }
      setData(json as OrderRequest);
      setStep("review");
    } catch (err) {
      // AI failure → manual full entry, with the scan still shown for reference.
      setData(emptyOrderRequest());
      setErrorMsg(err instanceof Error ? err.message : "AI読取に失敗しました");
      setStep("manual");
    }
  }

  const onConfirm = () => {
    // DB persistence is out of scope — confirm-only (no save).
    setConfirmed(true);
    notifications.show({
      title: "内容を確認しました",
      message: "受注請書の内容を確認しました（DB保存は未実装）",
      color: "green",
    });
  };

  // ── Upload step ───────────────────────────────────────────────────────────
  if (step === "upload") {
    return (
      <Stack gap="md">
        <PageHeader
          breadcrumbs={["販売", { label: "受注請書", href: BASE_PATH }, "取込"]}
          title="受注請書 取込（AI）"
        />
        <Paper p="xl" radius="md" shadow="xs">
          <Box
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              pickFile(e.dataTransfer.files?.[0]);
            }}
            style={{
              border: "2px dashed var(--mantine-color-default-border)",
              borderRadius: "var(--mantine-radius-md)",
              cursor: "pointer",
            }}
          >
            <Center p="xl">
              <Stack align="center" gap="xs">
                <IconUpload opacity={0.5} size={40} />
                <Text fw={600}>注文書PDF / スキャン画像をドロップ</Text>
                <Text c="dimmed" size="sm">
                  またはクリックしてファイルを選択（PDF・JPG・PNG）
                </Text>
                {file && (
                  <Group gap="xs" mt="sm">
                    <IconFileTypePdf size={16} />
                    <Text size="sm">
                      {file.name}（{(file.size / 1024).toFixed(0)} KB）
                    </Text>
                  </Group>
                )}
              </Stack>
            </Center>
          </Box>
          <input
            accept=".pdf,image/*"
            hidden
            onChange={(e) => pickFile(e.target.files?.[0])}
            ref={inputRef}
            type="file"
          />
          <Group justify="space-between" mt="md">
            <GhostButton onClick={() => setStep("manual")}>
              手動で入力
            </GhostButton>
            <PrimaryButton
              disabled={!file}
              leftSection={<IconRobot size={16} />}
              onClick={runExtraction}
            >
              AI読取を実行
            </PrimaryButton>
          </Group>
        </Paper>
      </Stack>
    );
  }

  // ── Extracting step ─────────────────────────────────────────────────────────
  if (step === "extracting") {
    return (
      <Stack gap="md">
        <PageHeader
          breadcrumbs={["販売", { label: "受注請書", href: BASE_PATH }, "取込"]}
          title="受注請書 取込（AI）"
        />
        <Paper p="xl" radius="md" shadow="xs">
          <Center p="xl">
            <Stack align="center" gap="sm">
              <Loader />
              <Text fw={600}>AIが読み取り中…</Text>
              <Text c="dimmed" size="sm">
                ローカルLLM（qwen2.5vl）で解析しています（約30秒）
              </Text>
            </Stack>
          </Center>
        </Paper>
      </Stack>
    );
  }

  // ── Review / manual step — preview (left) + form (right) ────────────────────
  const preview = previewUrl ? (
    <Paper
      p="xs"
      radius="md"
      style={{ position: "sticky", top: 12 }}
      withBorder
    >
      {isPdf ? (
        <iframe
          src={previewUrl}
          style={{ width: "100%", height: isMobile ? 420 : 760, border: 0 }}
          title="アップロードした注文書"
        />
      ) : (
        // biome-ignore lint/performance/noImgElement: local object-URL preview of the user's upload
        <img
          alt="アップロードした注文書"
          src={previewUrl}
          style={{ width: "100%", height: "auto", display: "block" }}
        />
      )}
    </Paper>
  ) : (
    <Paper p="xl" radius="md" withBorder>
      <Center>
        <Text c="dimmed" size="sm">
          ファイルなし（手動入力）
        </Text>
      </Center>
    </Paper>
  );

  return (
    <Stack gap="md">
      <PageHeader
        breadcrumbs={["販売", { label: "受注請書", href: BASE_PATH }, "取込"]}
        title={
          step === "review"
            ? "受注請書 取込（AI読取結果の確認）"
            : "受注請書 入力"
        }
      />

      {errorMsg && (
        <Alert
          color="red"
          icon={<IconAlertTriangle size={16} />}
          variant="light"
        >
          AI読取に失敗しました（{errorMsg}
          ）。お手数ですが全項目をご入力ください。
        </Alert>
      )}
      {step === "review" && !errorMsg && (
        <Alert color="blue" icon={<IconRobot size={16} />} variant="light">
          AIが読み取った内容です。誤りがないかご確認ください。
        </Alert>
      )}
      {confirmed && (
        <Alert color="green" variant="light">
          内容を確認しました。
        </Alert>
      )}

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        {preview}
        <Box>
          <OrderRequestForm
            confirmLabel={step === "review" ? "内容を確認" : "確認"}
            initial={data}
            key={step}
            onConfirm={onConfirm}
          />
          <Group mt="sm">
            <SecondaryButton href={BASE_PATH}>一覧へ戻る</SecondaryButton>
          </Group>
        </Box>
      </SimpleGrid>
    </Stack>
  );
}
