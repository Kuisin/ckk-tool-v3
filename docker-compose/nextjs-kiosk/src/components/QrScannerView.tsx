"use client";

/**
 * QrScannerView.tsx — カメラ QR スキャナ（qr-scanner ラッパー）。
 *
 * - 背面カメラ優先。歯車メニューでカメラ切替（選択は localStorage に永続化）
 * - デコード成功で onScan(payload) — 連続発火は 2 秒デバウンス
 */

import {
  ActionIcon,
  Alert,
  Box,
  Center,
  Loader,
  Menu,
  Text,
} from "@mantine/core";
import { IconCameraOff, IconSettings } from "@tabler/icons-react";
import QrScanner from "qr-scanner";
import { useEffect, useRef, useState } from "react";

const CAMERA_KEY = "kiosk_camera_id";

type Props = {
  onScan: (payload: string) => void;
  /** 一時停止（PIN 入力中など） */
  paused?: boolean;
};

export function QrScannerView({ onScan, paused = false }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<QrScanner | null>(null);
  const lastScanRef = useRef<{ value: string; at: number }>({
    value: "",
    at: 0,
  });
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  const [cameras, setCameras] = useState<QrScanner.Camera[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const scanner = new QrScanner(
      video,
      (result) => {
        const now = Date.now();
        const last = lastScanRef.current;
        if (result.data === last.value && now - last.at < 2000) return;
        lastScanRef.current = { value: result.data, at: now };
        onScanRef.current(result.data);
      },
      {
        preferredCamera: localStorage.getItem(CAMERA_KEY) ?? "environment",
        highlightScanRegion: true,
        highlightCodeOutline: true,
        maxScansPerSecond: 5,
      },
    );
    scannerRef.current = scanner;

    scanner
      .start()
      .then(() => {
        setStarting(false);
        return QrScanner.listCameras(true);
      })
      .then((list) => setCameras(list))
      .catch(() => {
        setStarting(false);
        setError(
          "カメラを起動できません。カメラ権限と HTTPS 接続を確認してください。",
        );
      });

    return () => {
      scanner.destroy();
      scannerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const scanner = scannerRef.current;
    if (!scanner) return;
    if (paused) {
      scanner.stop();
    } else {
      void scanner.start().catch(() => {});
    }
  }, [paused]);

  const selectCamera = (id: string) => {
    localStorage.setItem(CAMERA_KEY, id);
    void scannerRef.current?.setCamera(id);
  };

  return (
    <Box maw={560} mx="auto" pos="relative" w="100%">
      <Box
        style={{
          borderRadius: "var(--mantine-radius-md)",
          overflow: "hidden",
          aspectRatio: "4 / 3",
          background: "var(--mantine-color-dark-8)",
        }}
      >
        {/* biome-ignore lint/a11y/useMediaCaption: カメラプレビューに字幕は不要 */}
        <video
          ref={videoRef}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
        {starting && (
          <Center inset={0} pos="absolute">
            <Loader color="white" />
          </Center>
        )}
      </Box>

      {error && (
        <Alert color="red" icon={<IconCameraOff size={20} />} mt="md">
          {error}
        </Alert>
      )}

      {cameras.length > 1 && (
        <Menu position="bottom-end" shadow="md" withinPortal>
          <Menu.Target>
            <ActionIcon
              aria-label="カメラ設定"
              size="xl"
              style={{ position: "absolute", top: 12, right: 12 }}
              variant="default"
            >
              <IconSettings size={22} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Label>カメラを選択</Menu.Label>
            {cameras.map((cam) => (
              <Menu.Item key={cam.id} onClick={() => selectCamera(cam.id)}>
                <Text size="sm">{cam.label || cam.id}</Text>
              </Menu.Item>
            ))}
          </Menu.Dropdown>
        </Menu>
      )}
    </Box>
  );
}
