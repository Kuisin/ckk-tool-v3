"use client";

/**
 * LinkQrScanner — リンクコードの QR をカメラで読む。**共有端末とディスプレイで
 * 同じものを使う。**
 *
 * どちらの機器も出す QR は**裸の 12 桁**で揃えてあるので、読み取り側も
 * 1 つで足りる。別々にすると「どっちのスキャナで読むのか」を現場が
 * 考えることになるし、実際ディスプレイ側にはスキャナが無く手入力しか
 * できなかった。
 *
 * qr-scanner を使うのは全ブラウザで動くため（BarcodeDetector は iOS /
 * Firefox で見えない）。キオスクの QrScannerView と同方式。
 */

import { ActionIcon, Box, Menu, Stack, Text } from "@mantine/core";
import { IconCamera, IconScan } from "@tabler/icons-react";
import QrScanner from "qr-scanner";
import { useEffect, useRef, useState } from "react";
import { SecondaryButton } from "@/components/ui/buttons";
import { useTr } from "@/hooks/useTr";
import { normalizeCode } from "@/lib/crockford";

// ── QR スキャナ（qr-scanner — 全ブラウザ対応。kiosk QrScannerView と同方式） ──

/** 機器が出す QR（ペイロード = 表示形のコード文字列）から code を抽出。 */
export function parseLinkQr(rawValue: string): string | null {
  const code = normalizeCode(rawValue);
  return code.length === 12 ? code : null;
}

export function LinkQrScanner({
  onCode,
  label = "QR をスキャン",
}: {
  onCode: (code: string) => void;
  /** ボタンの文言（端末 / ディスプレイで呼び分ける）。 */
  label?: string;
}) {
  const tr = useTr();
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameras, setCameras] = useState<QrScanner.Camera[]>([]);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerRef = useRef<QrScanner | null>(null);
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;

  // video がマウントされてから初期化する（マウント前初期化の黒画面 race を回避）
  useEffect(() => {
    if (!scanning) return;
    const video = videoRef.current;
    if (!video) return;
    setError(null);
    const scanner = new QrScanner(
      video,
      (result) => {
        const code = parseLinkQr(result.data);
        if (!code) return;
        setScanning(false); // アンマウント → クリーンアップで destroy
        onCodeRef.current(code);
      },
      {
        preferredCamera: "environment",
        highlightScanRegion: true,
        highlightCodeOutline: true,
        maxScansPerSecond: 5,
      },
    );
    scannerRef.current = scanner;
    scanner
      .start()
      .then(() => QrScanner.listCameras(true))
      .then(setCameras)
      .catch(() => {
        setError(
          tr(
            "カメラを起動できません。カメラ権限と HTTPS 接続を確認してください。",
          ),
        );
      });
    return () => {
      scanner.destroy();
      scannerRef.current = null;
    };
  }, [scanning, tr]);

  return (
    <Stack gap="xs">
      {scanning ? (
        <>
          <Box pos="relative">
            <Box
              style={{
                borderRadius: 8,
                overflow: "hidden",
                aspectRatio: "4 / 3",
                background: "#000",
              }}
            >
              <video
                muted
                playsInline
                ref={videoRef}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            </Box>
            {cameras.length > 1 && (
              <Menu position="bottom-end" shadow="md" withinPortal>
                <Menu.Target>
                  <ActionIcon
                    aria-label={tr("カメラを切替")}
                    style={{ position: "absolute", top: 8, right: 8 }}
                    variant="default"
                  >
                    <IconCamera size={16} />
                  </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Label>{tr("カメラを選択")}</Menu.Label>
                  {cameras.map((cam) => (
                    <Menu.Item
                      key={cam.id}
                      onClick={() => void scannerRef.current?.setCamera(cam.id)}
                    >
                      {cam.label || cam.id}
                    </Menu.Item>
                  ))}
                </Menu.Dropdown>
              </Menu>
            )}
          </Box>
          <SecondaryButton onClick={() => setScanning(false)}>
            {tr("スキャンを停止")}
          </SecondaryButton>
        </>
      ) : (
        <SecondaryButton
          leftSection={<IconScan size={14} />}
          onClick={() => setScanning(true)}
        >
          {label}
        </SecondaryButton>
      )}
      {error && (
        <Text c="red" size="xs">
          {error}
        </Text>
      )}
    </Stack>
  );
}
