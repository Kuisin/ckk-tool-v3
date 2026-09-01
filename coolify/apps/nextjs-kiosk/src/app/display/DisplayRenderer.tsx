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

import {
  Badge,
  Center,
  Group,
  Loader,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Clock } from "@/app/display/content/_shared/Clock";
import type { ImageFit } from "@/lib/display-content";
import {
  DISPLAY_HEARTBEAT_MIN_INTERVAL_MS,
  type MachineHint,
} from "@/lib/display-core";

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
  | { type: "IMAGE"; config: { fileId: string; fit: ImageFit } }
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
  /** どの機械の何枚目か（Pi が URL に載せてくる。1 枚運用では空）。 */
  hint: MachineHint;
  /** その機械につながっている画面の総数（見出しの「何枚目」に使う）。 */
  screenTotal: number;
};

/** 中身 → フレームに載せる URL。載せられないものは null。 */
function contentSrc(
  content: Content,
  bust: number,
  screenIndex: number | null,
): string | null {
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
      // 中身（iframe）も**この窓の Cookie**で引く必要がある
      if (screenIndex !== null) params.set("screen", String(screenIndex));
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
  hint,
  screenTotal,
}: Props) {
  const [config, setConfig] = useState<Config | null>(null);
  const [failed, setFailed] = useState(false);
  /** フレームを作り直すための世代番号（再読込の合図）。 */
  const [generation, setGeneration] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef(RECONNECT_MIN_MS);

  // ★ hint は毎描画で作り直されるオブジェクト。**そのまま依存に入れると
  //   再取得と WS 再接続が止まらない**ので、中身の値だけを取り出して使う。
  const screenIndex = hint.screenIndex;
  const machineId = hint.machineId;

  const loadConfig = useCallback(async () => {
    try {
      // 「どの機械の何枚目か」を毎回送る。挿し替え・入れ替えに追従させるため
      // （サーバー側の注記を参照）。1 枚運用では空なので何も付かない。
      const q = new URLSearchParams();
      if (machineId) q.set("machine", machineId);
      if (screenIndex !== null) q.set("screen", String(screenIndex));
      const res = await fetch(
        q.size > 0 ? `/api/display/config?${q}` : "/api/display/config",
        { cache: "no-store" },
      );
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
  }, [machineId, screenIndex]);

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
      // 窓ごとの Cookie を見てもらうため、画面番号を載せる
      const q = screenIndex !== null ? `?screen=${screenIndex}` : "";
      const ws = new WebSocket(
        `${proto}//${window.location.host}${WS_PATH}${q}`,
      );
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
  }, [loadConfig, screenIndex]);

  // ハートビート: WS が張れない経路のときだけ意味を持つ（張れていれば
  // サーバー側が刻んでいるので、ここは二重に打っても同じ結果になる）。
  useEffect(() => {
    const id = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) return;
      void fetch(
        screenIndex !== null
          ? `/api/display/heartbeat?screen=${screenIndex}`
          : "/api/display/heartbeat",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // 手掛かりも一緒に送る（Pi を差し替えたら追従する）
          body: JSON.stringify({ machineId, screenIndex }),
        },
      ).catch(() => undefined);
    }, DISPLAY_HEARTBEAT_MIN_INTERVAL_MS);
    return () => clearInterval(id);
  }, [machineId, screenIndex]);

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

  // どの分岐でも共通の枠（見出し + 中身）に入れて返す。見出しは
  // 「この画面がどれか」を示す唯一の手掛かりなので、失敗中も出す。
  const shell = (body: ReactNode, opts?: { zoom: boolean }) => (
    <DisplayShell
      name={name}
      place={place}
      screenIndex={screenIndex}
      screenTotal={screenTotal}
      // 画像だけは倍率を当てない（object-fit とぶつかる）
      zoomStyle={opts?.zoom === false ? undefined : zoomStyle}
    >
      {body}
    </DisplayShell>
  );

  if (failed) {
    return shell(
      <Message
        detail="サーバーに接続できません。回復すると自動で表示に戻ります。"
        note={`${name ?? "この画面"}${place ? `（${place}）` : ""}`}
        title="接続できません"
      />,
    );
  }

  if (!config) {
    return shell(
      <Center style={{ flex: 1, height: "100%" }}>
        <Loader size="xl" />
      </Center>,
    );
  }

  if (!config.profile) {
    return shell(
      <Message
        detail="管理画面「ディスプレイ管理」で、この画面に表示内容を割り当ててください。"
        note={`${name ?? displayId}${place ? `（${place}）` : ""}`}
        title="表示内容が設定されていません"
      />,
    );
  }

  const content = config.profile.content;

  if (content.type === "INVALID") {
    return shell(
      <Message
        detail="割り当てられた表示内容の設定が正しくありません。"
        note={config.profile.name ?? ""}
        title="表示内容の設定を確認してください"
      />,
    );
  }

  if (content.type === "METABASE" && !content.url) {
    return shell(
      <Message
        detail="Metabase の接続設定（URL と署名鍵）が未設定です。"
        note={config.profile.name ?? ""}
        title="集計画面が設定されていません"
      />,
    );
  }

  if (content.type === "IMAGE") {
    // 収め方は設定どおり（contain = 全体 / cover = 埋める / fill = 引き伸ばす）。
    // 倍率（zoom）は当てない — object-fit の計算とぶつかって、意図せず端が切れる。
    return shell(
      // biome-ignore lint/performance/noImgElement: 全画面 1 枚。next/image の最適化は不要
      <img
        alt={config.profile.name ?? ""}
        src={
          screenIndex !== null
            ? `/api/display/image/${content.config.fileId}?screen=${screenIndex}`
            : `/api/display/image/${content.config.fileId}`
        }
        style={{
          background: "#000",
          display: "block",
          height: "100%",
          objectFit: content.config.fit,
          width: "100%",
        }}
      />,
      { zoom: false },
    );
  }

  const src = contentSrc(content, generation, screenIndex);
  if (!src) {
    return shell(
      <Message
        detail="表示内容の種別に対応していません。"
        note={config.profile.name ?? ""}
        title="表示できません"
      />,
    );
  }

  return shell(
    <SwappingFrame src={src} title={config.profile.name ?? "ディスプレイ"} />,
  );
}

/**
 * 二重化したフレーム。**次の中身が読み終わるまで、いまの中身を出したままにする。**
 *
 * 再取得のたびに 1 枚の iframe の src（と key）を差し替えていたので、更新の
 * たびに画面が真っ白になってから描き直されていた。誰も触らない壁の画面では
 * これがいちばん目立つ壊れ方で、通りがかりに見ると「消えた」ようにしか
 * 見えない。
 *
 * 新しい URL は**裏の 1 枚**で読み込み、`load` が来たときに初めて表に出す。
 * 読み込みに失敗しても表は古い中身のまま残るので、次の再取得まで何も
 * 起きない（白い画面を出すより、少し古い情報を出し続けるほうがよい）。
 */
function SwappingFrame({ src, title }: { src: string; title: string }) {
  const [shown, setShown] = useState(src);
  const [pending, setPending] = useState<string | null>(null);

  // 表と同じ URL になったら裏は要らない（WS の合図と再取得が重なった場合）。
  useEffect(() => {
    setPending(src === shown ? null : src);
  }, [src, shown]);

  const frameStyle = {
    border: 0,
    height: "100%",
    left: 0,
    position: "absolute" as const,
    top: 0,
    width: "100%",
  };

  return (
    <div style={{ height: "100%", position: "relative", width: "100%" }}>
      {/* 表 — いま見えている中身。差し替え中も消さない */}
      <iframe key={shown} src={shown} style={frameStyle} title={title} />

      {/* 裏 — 読み込み中の次の中身。読み終わったら入れ替える */}
      {pending && pending !== shown && (
        <iframe
          key={pending}
          onLoad={() => {
            setShown(pending);
            setPending(null);
          }}
          src={pending}
          style={{ ...frameStyle, opacity: 0, pointerEvents: "none" }}
          title={title}
        />
      )}
    </div>
  );
}

/**
 * どの表示内容にも共通の枠 — **細い見出し + 残り全部が中身**。
 *
 * 見出しに端末名を出すのは、**壁に何枚も並んだときに見分けるため**。
 * 中身（生産状況・画像・外部ページ…）は種別ごとに違うので、そこに頼ると
 * 「どれがどれか」を示す場所が種別ごとにバラバラになる。枠に置けば、
 * 何を映していても必ず同じ位置に同じ形で出る。
 *
 * 中身は**残りの高さを正確に埋める**（`flex: 1` + `minHeight: 0`）。
 * minHeight を切らないと flex の子は中身より小さくならず、はみ出した分が
 * 画面の外に出る — 壁の画面はスクロールできないので、出た分は存在しないのと
 * 同じになる。
 *
 * 倍率（zoom）は**中身にだけ**当てる。見出しは中身ではなく画面の付属物なので、
 * 倍率を上げたときに一緒に太らせる意味が無い。
 */
function DisplayShell({
  name,
  place,
  screenIndex,
  screenTotal,
  zoomStyle,
  children,
}: {
  name: string | null;
  place: string | null;
  /** この機械の何枚目か（Pi の自己申告。1 枚運用では null）。 */
  screenIndex: number | null;
  /** その機械につながっている画面の総数。 */
  screenTotal: number;
  zoomStyle: { zoom: string } | undefined;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100dvh",
        overflow: "hidden",
        width: "100vw",
      }}
    >
      <Group
        gap="md"
        justify="space-between"
        style={{
          background: "var(--mantine-color-dark-9)",
          borderBottom: "1px solid var(--mantine-color-dark-5)",
          flexShrink: 0,
          padding: "0.35rem 1.25rem",
        }}
        wrap="nowrap"
      >
        <Group gap="md" style={{ minWidth: 0 }} wrap="nowrap">
          {/* 会社のロゴ。**「これは会社が出している画面だ」を一目で示す**ため
              （壁のテレビは通りがかりに見られるもので、誰の何なのかが
              分からないと私物のモニタと区別が付かない）。
              暗い背景なので dark 版（明るい色のロゴ）を使う。
              biome-ignore lint/performance/noImgElement: 静的 SVG 1 枚。next/image の最適化は不要 */}
          <img
            alt=""
            src="/design-assets/dark_logo.svg"
            style={{ display: "block", flexShrink: 0, height: "1.6rem" }}
          />
          <Text fw={700} style={{ fontSize: "1.15rem" }} truncate>
            {name ?? "（名称未設定）"}
          </Text>
          {place && (
            <Text c="dimmed" style={{ fontSize: "1rem" }} truncate>
              {place}
            </Text>
          )}
          {/* 1 台で 2 枚出しているときだけ「何枚目か」を出す。**壁に同じような
              画面が並ぶので、どれを直せばよいか言えるようにする**ため
              （「右の画面が変」ではなく「2 枚目が変」と言える）。
              1 枚運用では意味が無いので出さない。 */}
          {screenTotal > 1 && screenIndex !== null && (
            <Badge color="gray" size="lg" variant="light">
              {screenIndex} / {screenTotal} 枚目
            </Badge>
          )}
        </Group>
        <Clock fontSize="1.15rem" />
      </Group>

      <div style={{ flex: 1, minHeight: 0, ...zoomStyle }}>{children}</div>
    </div>
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
