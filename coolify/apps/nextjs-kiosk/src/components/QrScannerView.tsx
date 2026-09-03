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
import { fillMessage } from "@/lib/i18n";
import { useI18n } from "./I18nProvider";

const CAMERA_KEY = "kiosk_camera_id";

/**
 * カメラ一覧を取る。**取れなくてもスキャナ本体は動く**ので、失敗は空配列に畳む。
 *
 * `listCameras(true)`（ラベル付き）は getUserMedia をもう一度呼ぶ。Android の
 * WebView ではこの 2 回目が拒否されることがあり、以前はその失敗が start() と
 * 同じ catch に落ちて「カメラを起動できません」を出していた — 実際にはカメラは
 * 映っているのにエラーが出て、しかも一覧が空なので**カメラ切替も消える**という
 * 症状になっていた（実機 TB330FU で確認）。
 *
 * ラベルが取れないときはラベル無しで引き直す。id さえあれば切替はできる。
 */
async function listCamerasSafely(): Promise<QrScanner.Camera[]> {
  try {
    return await QrScanner.listCameras(true);
  } catch {
    try {
      return await QrScanner.listCameras(false);
    } catch {
      return [];
    }
  }
}

type Props = {
  onScan: (payload: string) => void;
  /** 一時停止（PIN 入力中など） */
  paused?: boolean;
};

export function QrScannerView({ onScan, paused = false }: Props) {
  const { m } = useI18n();
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<QrScanner | null>(null);
  const lastScanRef = useRef<{ value: string; at: number }>({
    value: "",
    at: 0,
  });
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;
  // スキャナ初期化 effect はマウント時 1 回だけ動かす（言語切替で
  // カメラを再初期化させない）ので、文言は ref 経由で読む。
  const cannotStartRef = useRef(m.qrScanner.cannotStart);
  cannotStartRef.current = m.qrScanner.cannotStart;

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
      .catch(async (e: unknown) => {
        // 保存済みカメラ id は権限リセットやブラウザ再起動で変わることがある。
        // 消えた id での起動失敗は既定（背面カメラ）でリトライする。
        if (localStorage.getItem(CAMERA_KEY)) {
          localStorage.removeItem(CAMERA_KEY);
          await scanner.setCamera("environment");
          return scanner.start();
        }
        throw e;
      })
      .then(async () => {
        // ここまで来ていればスキャナは動いている。以降の一覧取得は「おまけ」で、
        // 失敗してもエラー表示に落とさない。
        setStarting(false);
        setError(null);
        setCameras(await listCamerasSafely());
      })
      .catch(() => {
        setStarting(false);
        setError(cannotStartRef.current);
      });

    return () => {
      scanner.destroy();
      scannerRef.current = null;
    };
  }, []);

  // 一時停止/再開。初回マウントでは何もしない — ここで start() を呼ぶと
  // 直上の初期化中の start() と並走して video.play() が中断され、
  // カメラ切替まで黒画面のままになることがある。
  const pausedRef = useRef(paused);
  useEffect(() => {
    if (pausedRef.current === paused) return;
    pausedRef.current = paused;
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
              aria-label={m.qrScanner.cameraSettings}
              size="xl"
              style={{ position: "absolute", top: 12, right: 12 }}
              variant="default"
            >
              <IconSettings size={22} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Label>{m.qrScanner.selectCamera}</Menu.Label>
            {cameras.map((cam, i) => (
              <Menu.Item key={cam.id} onClick={() => selectCamera(cam.id)}>
                {/* ラベル無しで引いたときは id が入る（人が読めないので通し番号） */}
                <Text size="sm">
                  {cam.label || fillMessage(m.qrScanner.cameraN, { n: i + 1 })}
                </Text>
              </Menu.Item>
            ))}
          </Menu.Dropdown>
        </Menu>
      )}
    </Box>
  );
}
