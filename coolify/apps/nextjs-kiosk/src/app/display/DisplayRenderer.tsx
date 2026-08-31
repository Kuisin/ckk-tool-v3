"use client";

/**
 * /display のペアリング済み状態 — 割り当てられた内容を映し続ける。
 *
 * 役割は 3 つだけ:
 *   1. /api/display/config を引いて「いま何を映すか」を知る
 *   2. WS を保ち、config_changed で引き直す / revoked で登録画面へ戻る
 *   3. 落ちている間も画面を黒くせず、状況を出して復帰し続ける
 *
 * **中身は 4 種類ともフレームに載せる**（アプリ内ページも含む）。そろえて
 * いるのは、表示の寿命管理（再読込・差し替え）をこの 1 か所に閉じ込める
 * ためで、こうしておくと生産ボード側は「ただのサーバーコンポーネント」で
 * 済む（更新のたびに自分を作り直す必要がない）。
 *
 * 文字は ja 固定 — ディスプレイに利用者は居ない。
 */

import { Center, Loader, Stack, Text, Title } from "@mantine/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { DISPLAY_HEARTBEAT_MIN_INTERVAL_MS } from "@/lib/display-core";

const WS_PATH = "/api/display/ws";
const RECONNECT_MIN_MS = 5_000;
const RECONNECT_MAX_MS = 30_000;

type Content =
  | {
      type: "APP_PAGE";
      config: { page: string; options?: Record<string, unknown> };
    }
  | { type: "METABASE"; url: string | null }
  | { type: "URL"; config: { url: string } }
  | { type: "IMAGE"; config: { fileId: string } }
  | { type: "INVALID" };

type Config = {
  display: {
    id: string;
    name: string | null;
    location: string | null;
    /** 表示倍率（%）。画面の大きさに合わせる微調整。 */
    scalePercent: number;
  };
  profile: {
    id: string;
    name: string | null;
    refreshIntervalSec: number;
    content: Content;
  } | null;
};

type Props = {
  displayId: string;
  displayName: string | null;
  location: string | null;
  scalePercent: number;
};

/** 中身 → フレームに載せる URL。載せられないものは null。 */
function contentSrc(content: Content, bust: number): string | null {
  switch (content.type) {
    case "APP_PAGE": {
      // 設定は base64url の JSON 1 つで渡す。項目ごとにクエリを増やすと、
      // テンプレートを足すたびにここを直すことになる（登録簿の意味が消える）。
      // 受け側（content/_shared/options.ts）はこれを必ず検証し直す。
      const params = new URLSearchParams();
      const options = content.config.options ?? {};
      if (Object.keys(options).length > 0) {
        params.set(
          "opt",
          btoa(
            String.fromCharCode(
              ...new TextEncoder().encode(JSON.stringify(options)),
            ),
          )
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=+$/, ""),
        );
      }
      params.set("t", String(bust));
      return `/display/content/${content.config.page}?${params.toString()}`;
    }
    case "METABASE":
      return content.url;
    case "URL":
      return content.config.url;
    case "IMAGE":
      return null; // <img> で出す
    default:
      return null;
  }
}

export function DisplayRenderer({
  displayId,
  displayName,
  location,
  scalePercent,
}: Props) {
  const [config, setConfig] = useState<Config | null>(null);
  const [failed, setFailed] = useState(false);
  /** フレームを作り直すための世代番号（再読込の合図）。 */
  const [generation, setGeneration] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef(RECONNECT_MIN_MS);

  const loadConfig = useCallback(async () => {
    try {
      const res = await fetch("/api/display/config", { cache: "no-store" });
      if (res.status === 401) {
        // 失効・停止・期限切れ。サーバーに判断させ直す = 登録画面へ戻る
        window.location.reload();
        return;
      }
      if (!res.ok) {
        setFailed(true);
        return;
      }
      setConfig((await res.json()) as Config);
      setFailed(false);
      setGeneration((g) => g + 1);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  // WS: 表示内容の差し替えと失効を受け取る。切れても指数バックオフで戻る。
  useEffect(() => {
    let closed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      if (closed) return;
      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${proto}//${window.location.host}${WS_PATH}`);
      wsRef.current = ws;

      ws.onopen = () => {
        retryRef.current = RECONNECT_MIN_MS;
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data)) as { type?: string };
          if (msg.type === "config_changed") void loadConfig();
          if (msg.type === "revoked") window.location.reload();
        } catch {
          // 壊れたメッセージは無視
        }
      };
      ws.onclose = () => {
        wsRef.current = null;
        if (closed) return;
        timer = setTimeout(connect, retryRef.current);
        retryRef.current = Math.min(retryRef.current * 2, RECONNECT_MAX_MS);
      };
      ws.onerror = () => ws.close();
    };

    connect();
    return () => {
      closed = true;
      if (timer) clearTimeout(timer);
      wsRef.current?.close();
    };
  }, [loadConfig]);

  // ハートビート: WS が張れない経路のときだけ意味を持つ（張れていれば
  // サーバー側が刻んでいるので、ここは二重に打っても同じ結果になる）。
  useEffect(() => {
    const id = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) return;
      void fetch("/api/display/heartbeat", { method: "POST" }).catch(
        () => undefined,
      );
    }, DISPLAY_HEARTBEAT_MIN_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  // プロファイルの再取得間隔（0 = 自動再取得しない）
  useEffect(() => {
    const sec = config?.profile?.refreshIntervalSec ?? 0;
    if (!sec || sec <= 0) return;
    const id = setInterval(() => void loadConfig(), sec * 1000);
    return () => clearInterval(id);
  }, [config?.profile?.refreshIntervalSec, loadConfig]);

  const name = config?.display.name ?? displayName;
  const place = config?.display.location ?? location;
  // 倍率は最新の設定を優先（変更したら再取得で即反映される）
  const scale = config?.display.scalePercent ?? scalePercent;

  /**
   * 倍率の当て方は **CSS の `zoom`** に統一する。
   *
   * `transform: scale()` だと中身の折り返しが変わらないので、拡大すると
   * ただ切れる。`zoom` は**表示領域そのものが縮んで中身が組み直される**ので、
   * 「大きい画面用に文字を大きくする」という意図どおりに効く。
   *
   * そして `zoom` を**外側の枠に当てる**のが要点 — こうすると Metabase の
   * ような別ドメインの中身にも同じように効く（向こうの CSS を触れない）。
   * 種別ごとに当て方を変えると、片方だけ効かない状態が生まれる。
   */
  const zoomStyle = scale === 100 ? undefined : { zoom: `${scale}%` };

  if (failed) {
    return (
      <Message
        detail="サーバーに接続できません。回復すると自動で表示に戻ります。"
        note={`${name ?? "この画面"}${place ? `（${place}）` : ""}`}
        title="接続できません"
      />
    );
  }

  if (!config) {
    return (
      <Center style={{ flex: 1 }}>
        <Loader size="xl" />
      </Center>
    );
  }

  if (!config.profile) {
    return (
      <Message
        detail="管理画面「ディスプレイ管理」で、この画面に表示内容を割り当ててください。"
        note={`${name ?? displayId}${place ? `（${place}）` : ""}`}
        title="表示内容が設定されていません"
      />
    );
  }

  const content = config.profile.content;

  if (content.type === "INVALID") {
    return (
      <Message
        detail="割り当てられた表示内容の設定が正しくありません。"
        note={config.profile.name ?? ""}
        title="表示内容の設定を確認してください"
      />
    );
  }

  if (content.type === "METABASE" && !content.url) {
    return (
      <Message
        detail="Metabase の接続設定（URL と署名鍵）が未設定です。"
        note={config.profile.name ?? ""}
        title="集計画面が設定されていません"
      />
    );
  }

  if (content.type === "IMAGE") {
    // 画像は「収まるように」出すので倍率を当てない — 倍率を掛けると
    // objectFit の計算とぶつかって、意図せず端が切れる
    return (
      // biome-ignore lint/performance/noImgElement: 全画面 1 枚。next/image の最適化は不要
      <img
        alt={config.profile.name ?? ""}
        src={`/api/display/image/${content.config.fileId}`}
        style={{
          flex: 1,
          width: "100%",
          height: "100dvh",
          objectFit: "contain",
          background: "#000",
        }}
      />
    );
  }

  const src = contentSrc(content, generation);
  if (!src) {
    return (
      <Message
        detail="表示内容の種別に対応していません。"
        note={config.profile.name ?? ""}
        title="表示できません"
      />
    );
  }

  return (
    <iframe
      key={`${config.profile.id}-${generation}`}
      src={src}
      style={{
        flex: 1,
        width: "100%",
        height: "100dvh",
        border: 0,
        ...zoomStyle,
      }}
      title={config.profile.name ?? "ディスプレイ"}
    />
  );
}

/** 画面いっぱいの案内。**黒画面を出さない**のがこの部品の存在理由。 */
function Message({
  title,
  detail,
  note,
}: {
  title: string;
  detail: string;
  note?: string;
}) {
  return (
    <Center p="xl" style={{ flex: 1 }}>
      <Stack align="center" gap="md" maw={900}>
        <Title order={1} ta="center">
          {title}
        </Title>
        <Text c="dimmed" size="xl" ta="center">
          {detail}
        </Text>
        {note && (
          <Text c="dimmed" size="md" ta="center">
            {note}
          </Text>
        )}
      </Stack>
    </Center>
  );
}
