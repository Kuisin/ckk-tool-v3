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
 *
 * **見た目は components/LinkCodeScreen.tsx をディスプレイ（/display）と共用する。**
 * 手順が同じものは画面も同じにする — 別々だと直したつもりで片方だけ直る。
 * こちらは手に持つので variant="handheld"。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type LinkCodePhase,
  LinkCodeScreen,
} from "@/components/LinkCodeScreen";

const DEVICE_ID_KEY = "kiosk_device_id";
const POLL_INTERVAL_MS = 3000;

type SetupState =
  | { phase: "loading" }
  | { phase: "showing"; code: string; expiresAt: number }
  | { phase: "linked"; deviceId: string; deviceName: string | null }
  | { phase: "expired" }
  | { phase: "error"; message: string };

export default function SetupPage() {
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
      };
      if (data.status === "ALREADY_REGISTERED") {
        window.location.replace("/login");
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
          const res = await fetch("/api/kiosk/setup/reactivate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ deviceId: savedId }),
          });
          if (res.ok) {
            window.location.replace("/login");
            return;
          }
        }
      } catch {
        // 状態確認に失敗しても begin は試す
      }
      void begin();
    })();
  }, [begin]);

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
          const re = await fetch("/api/kiosk/setup/reactivate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ deviceId: state.deviceId }),
          });
          if (re.ok) window.location.replace("/login");
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
