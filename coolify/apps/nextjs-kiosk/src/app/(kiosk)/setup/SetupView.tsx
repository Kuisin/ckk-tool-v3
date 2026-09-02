"use client";

/**
 * /setup — 端末リンク画面（タブレットが QR/コードを提示する方向）。
 *
 * 1. begin でリンクコード（12桁・10分）を発行し、QR + テキストで表示
 * 2. 管理者が SY09 の「端末をリンク」でコードを入力 or スキャンし、
 *    **オープン（リンク待ち）のプロファイルにのみ**リンクできる
 * 3. link-status ポーリングでリンク成立を検知 → 有効化待ち（confirm ポーリング）
 * 4. 管理者が有効化 → 30日デバイストークン取得 → /login（フルリロード）
 *
 * Cookie 消失時は localStorage の deviceId で reactivate を先に試す。
 * **deviceId だけでは再発行されない**（監査 H2）— 専用アプリなら端末鍵で
 * nonce に署名して証明し、ブラウザ利用なら管理者が SY09 で読める端末設定
 * コード（6 桁）を入力する。どちらも無理ならリンクコードからやり直す。
 *
 * **見た目は components/LinkCodeScreen.tsx をディスプレイ（/display）と共用する。**
 * 手順が同じものは画面も同じにする — 別々だと直したつもりで片方だけ直る。
 * こちらは手に持つので variant="handheld"。
 */

import { Button, Center, Stack, Text } from "@mantine/core";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type LinkCodePhase,
  LinkCodeScreen,
} from "@/components/LinkCodeScreen";
import { PinKeypad } from "@/components/PinKeypad";
import { getBridge } from "@/lib/wrapper-bridge";

const DEVICE_ID_KEY = "kiosk_device_id";
const POLL_INTERVAL_MS = 3000;

type SetupState =
  | { phase: "loading" }
  | { phase: "showing"; code: string; expiresAt: number }
  | { phase: "linked"; deviceId: string; deviceName: string | null }
  /** Cookie 消失からの復帰: 端末設定コードの入力待ち（署名の道が無いとき）。 */
  | { phase: "reactivate"; deviceId: string; lockedUntil: string | null }
  | { phase: "expired" }
  | { phase: "error"; message: string };

type ReactivateOutcome = "OK" | "NEED_CODE" | "GONE";

/**
 * 専用アプリなら端末鍵で nonce に署名して再発行を受ける。
 * 鍵が無い / ブラウザ / 失敗 → NEED_CODE（設定コードの入力へ）。
 * 行が無い・止まっている → GONE（最初から）。
 */
async function reactivateWithKey(deviceId: string): Promise<ReactivateOutcome> {
  const bridge = getBridge();
  if (bridge) {
    try {
      const challenge = await fetch(
        `/api/kiosk/setup/reactivate?deviceId=${encodeURIComponent(deviceId)}`,
      );
      if (challenge.ok) {
        const { nonce } = (await challenge.json()) as { nonce: string };
        const res = await fetch("/api/kiosk/setup/reactivate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            deviceId,
            nonce,
            signature: bridge.sign(nonce),
          }),
        });
        if (res.ok) return "OK";
        if (res.status === 403 && (await isGone(res))) return "GONE";
      }
    } catch {
      // 署名の道が使えなくても設定コードの道は残る
    }
  }
  // 証明なしで 1 回叩き、行が生きているか（PROOF_REQUIRED）だけ確かめる
  try {
    const probe = await fetch("/api/kiosk/setup/reactivate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId }),
    });
    const data = (await probe.json().catch(() => null)) as {
      state?: string;
      status?: string;
    } | null;
    if (data?.state === "PROOF_REQUIRED") return "NEED_CODE";
  } catch {
    // 通信断 — 下で NEED_CODE にせず最初からにする
  }
  return "GONE";
}

async function isGone(res: Response): Promise<boolean> {
  const data = (await res.json().catch(() => null)) as {
    status?: string;
  } | null;
  return typeof data?.status === "string";
}

export function SetupView() {
  const [state, setState] = useState<SetupState>({ phase: "loading" });
  const [now, setNow] = useState(() => Date.now());
  const startedRef = useRef(false);

  const begin = useCallback(async () => {
    setState({ phase: "loading" });
    try {
      const res = await fetch("/api/kiosk/setup/begin", { method: "POST" });
      const data = (await res.json()) as {
        status: string;
        code?: string;
        expiresAt?: string;
        reason?: string;
      };
      if (data.status === "ALREADY_REGISTERED") {
        window.location.replace("/login");
        return;
      }
      // 止められている端末（停止・失効）。**新しいコードは出ない** —
      // 出すと停止が迂回でき、同じ実機のプロファイルが二重にできる。
      if (data.status === "BLOCKED") {
        window.location.replace(`/device-error?reason=${data.reason ?? ""}`);
        return;
      }
      if (data.status === "WAITING" && data.code && data.expiresAt) {
        setState({
          phase: "showing",
          code: data.code,
          expiresAt: new Date(data.expiresAt).getTime(),
        });
        return;
      }
      setState({ phase: "error", message: "コードを発行できませんでした" });
    } catch {
      setState({ phase: "error", message: "サーバーに接続できません" });
    }
  }, []);

  // 初期化: 登録済みなら /login へ、Cookie 消失なら reactivate → だめなら begin
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    (async () => {
      try {
        const status = await fetch("/api/kiosk/setup");
        const data = (await status.json()) as { registered: boolean };
        if (data.registered) {
          window.location.replace("/login");
          return;
        }
        const savedId = localStorage.getItem(DEVICE_ID_KEY);
        if (savedId) {
          const outcome = await reactivateWithKey(savedId);
          if (outcome === "OK") {
            window.location.replace("/login");
            return;
          }
          if (outcome === "NEED_CODE") {
            setState({
              phase: "reactivate",
              deviceId: savedId,
              lockedUntil: null,
            });
            return;
          }
          // GONE: 控えの deviceId はもう使えない
          localStorage.removeItem(DEVICE_ID_KEY);
        }
      } catch {
        // 状態確認に失敗しても begin は試す
      }
      void begin();
    })();
  }, [begin]);

  // 復帰: 端末設定コードで再発行を受ける
  const submitSettingsCode = useCallback(
    async (deviceId: string, settingsCode: string) => {
      try {
        const res = await fetch("/api/kiosk/setup/reactivate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceId, settingsCode }),
        });
        if (res.ok) {
          window.location.replace("/login");
          return;
        }
        const data = (await res.json().catch(() => null)) as {
          state?: string;
          until?: string;
        } | null;
        if (data?.state === "REACTIVATE_LOCKED") {
          setState({
            phase: "reactivate",
            deviceId,
            lockedUntil: data.until ?? null,
          });
          return;
        }
        if (data?.state === "REACTIVATE_CODE_INVALID") {
          setState({ phase: "reactivate", deviceId, lockedUntil: null });
          return;
        }
        // 行が消えた・止まった → 最初から
        localStorage.removeItem(DEVICE_ID_KEY);
        void begin();
      } catch {
        setState({ phase: "error", message: "サーバーに接続できません" });
      }
    },
    [begin],
  );

  // 表示中: リンク成立ポーリング + 期限カウントダウン
  useEffect(() => {
    if (state.phase !== "showing") return;
    const poll = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/kiosk/setup/link-status?code=${encodeURIComponent(state.code)}`,
        );
        const data = (await res.json()) as {
          status: string;
          deviceId?: string;
          deviceName?: string | null;
        };
        if (data.status === "LINKED" && data.deviceId) {
          localStorage.setItem(DEVICE_ID_KEY, data.deviceId);
          setState({
            phase: "linked",
            deviceId: data.deviceId,
            deviceName: data.deviceName ?? null,
          });
        } else if (data.status === "EXPIRED" || data.status === "NOT_FOUND") {
          setState({ phase: "expired" });
        }
      } catch {
        // 通信断は次のポーリングで再試行
      }
    }, POLL_INTERVAL_MS);
    const tick = setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= state.expiresAt) setState({ phase: "expired" });
    }, 1000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [state]);

  // リンク後: 有効化待ちポーリング
  useEffect(() => {
    if (state.phase !== "linked") return;
    const poll = setInterval(async () => {
      try {
        const res = await fetch("/api/kiosk/setup/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceId: state.deviceId }),
        });
        const data = (await res.json()) as { status: string };
        if (data.status === "CONFIRMED") {
          window.location.replace("/login");
        } else if (data.status === "ALREADY_CONFIRMED") {
          // 既に発行済み（同じ実機の別ブラウザ等）。証明を立てて取り直す。
          const outcome = await reactivateWithKey(state.deviceId);
          if (outcome === "OK") {
            window.location.replace("/login");
          } else if (outcome === "NEED_CODE") {
            setState({
              phase: "reactivate",
              deviceId: state.deviceId,
              lockedUntil: null,
            });
          }
        } else if (data.status === "PENDING") {
          // リンク解除された（プロファイルがオープンに戻った）→ 最初から
          localStorage.removeItem(DEVICE_ID_KEY);
          void begin();
        }
        // LINKED はそのまま待つ
      } catch {
        // 通信断は次のポーリングで再試行
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(poll);
  }, [state, begin]);

  if (state.phase === "reactivate") {
    const locked =
      state.lockedUntil !== null && new Date(state.lockedUntil).getTime() > now;
    return (
      <Center mih="100dvh" p="md">
        <Stack align="center" gap="lg" maw={520}>
          <PinKeypad
            maxLength={6}
            minLength={6}
            onSubmit={(code) => void submitSettingsCode(state.deviceId, code)}
            submitting={locked}
            subtitle={
              locked
                ? "試行回数の上限に達しました。しばらく待ってから入力してください。"
                : "この端末の登録を復帰します。管理者が「設定 → 端末管理」で確認できる 6 桁の端末設定コードを入力してください。"
            }
            title="端末設定コード"
          />
          <Text c="dimmed" size="sm" ta="center">
            コードが分からない場合は、リンクコードを発行して管理者に再リンクしてもらいます。
          </Text>
          <Button
            onClick={() => {
              localStorage.removeItem(DEVICE_ID_KEY);
              void begin();
            }}
            variant="default"
          >
            リンクコードを発行する
          </Button>
        </Stack>
      </Center>
    );
  }

  // 共有部品が読む形へ。linked の文面だけここで組み立てる。
  const view: LinkCodePhase =
    state.phase === "linked"
      ? {
          phase: "linked",
          message: (
            <>
              {`リンクしました${state.deviceName ? `: ${state.deviceName}` : ""}。管理者がこのプロファイルを`}
              <b>有効化</b>
              {"すると利用を開始できます。"}
            </>
          ),
        }
      : state;

  return (
    <LinkCodeScreen
      instruction="管理者に「設定 → 端末管理」でこのコードをスキャンまたは入力してもらい、端末プロファイルへリンクしてください。"
      now={now}
      onRetry={begin}
      state={view}
      title="端末リンク"
      variant="handheld"
    />
  );
}
