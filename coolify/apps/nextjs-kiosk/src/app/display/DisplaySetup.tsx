"use client";

/**
 * /display の未登録状態 — リンクコードを出して待つ。
 *
 * **キオスク端末の /setup と同じ 4 段**（覚えることを増やさないため、
 * 手順も画面の言い方も揃えてある）:
 *   1. begin でリンクコード（12桁・10分）を発行し、QR + テキストで表示
 *   2. 管理者が SY09 の「リンク」でコードを入力 or スキャンし、
 *      **オープン（リンク待ち）のプロファイルにのみ**リンクできる
 *   3. link-status ポーリングでリンク成立を検知 → 有効化待ちへ
 *   4. 管理者が有効化 → 365日トークン取得 → 表示開始（フルリロード）
 *
 * Cookie 消失時は localStorage の deviceId で reactivate を先に試す。
 *
 * QR の中身は**裸のコード**（キオスクと同一）。SY09 のスキャナを 1 つに
 * 保つため — 詳細は lib/display-core.ts の extractLinkCode。
 *
 * **見た目は components/LinkCodeScreen.tsx を共有端末と共用する。** 手順を
 * 揃えたのに画面が別々だと 2 つ覚えることになるし、実際に余白も文字の
 * 大きさも見出しの段もずれていた。違うのは見る距離だけなので variant="wall"
 * を渡す（テレビは数 m 離れて見る）。
 *
 * 文字は **ja 固定**。ディスプレイに利用者は居ないので言語設定が無い。
 */

import { Badge } from "@mantine/core";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type LinkCodePhase,
  LinkCodeScreen,
} from "@/components/LinkCodeScreen";
import type { DisplayAuthFailReason } from "@/lib/display-auth";
import type { MachineHint } from "@/lib/display-core";
import { claimScreenSlot } from "@/lib/screen-slot";

/**
 * 端末 id の控え（Cookie 消失時の復帰用）。**窓ごとに分ける** —
 * localStorage はブラウザのプロファイル単位で共有されるので、1 つの鍵にすると
 * 2 枚目の窓が 1 枚目の控えを上書きし、復帰で取り違える。
 */
function deviceIdKey(screenIndex: number | null): string {
  return screenIndex === null || screenIndex <= 1
    ? "ckk_display_device_id"
    : `ckk_display_device_id_${screenIndex}`;
}
const POLL_INTERVAL_MS = 3000;
/** 何枚開いているかを見直す間隔（増減はゆっくりなので長めで足りる）。 */
const SLOT_WATCH_MS = 5000;

/**
 * 失効・停止のときに現場へ出す一言（「壊れた」と誤解させない）。
 *
 * ★ 失効（取り消し）は **NOT_FOUND として届く**。取り消しはトークンの
 *   ハッシュごと消すので、こちら側からは「その Cookie に対応する行が無い」
 *   としか見えないため。だから NOT_FOUND の文言は「削除されました」ではなく、
 *   取り消し・行削除のどちらでも正しい言い方にしてある。
 */
const REASON_NOTE: Partial<Record<DisplayAuthFailReason, string>> = {
  NOT_FOUND: "この画面の登録は無効になりました。もう一度登録してください。",
  EXPIRED: "登録の有効期限が切れました。もう一度登録してください。",
  DISABLED: "この画面は一時停止されています。管理者にお問い合わせください。",
  REVOKED: "この画面の登録は取り消されました。もう一度登録してください。",
};

type SetupState =
  | { phase: "loading" }
  | { phase: "showing"; code: string; expiresAt: number }
  | { phase: "linked"; deviceId: string; deviceName: string | null }
  | { phase: "expired" }
  | { phase: "error"; message: string };

type Props = {
  reason: DisplayAuthFailReason;
  /** どの機械の何枚目か（Pi が URL に載せてくる。1 枚運用では空）。 */
  hint: MachineHint;
  /** この機械につながっている画面の総数。 */
  screenTotal: number;
};

/**
 * この窓が何枚目で、いま何枚開いているか。**開いたあとに増減するので見張る。**
 * Web Locks が使えないブラウザでは null（URL の値に任せる）。
 */
function useScreenSlot(
  explicitScreen: number | null,
): { index: number; total: number } | null {
  const [slot, setSlot] = useState<{ index: number; total: number } | null>(
    null,
  );

  useEffect(() => {
    let stopped = false;
    const look = async () => {
      try {
        // 既に錠を握っていれば同じ番号が返る（何度呼んでも動かない）
        const got = await claimScreenSlot(explicitScreen);
        if (!stopped) setSlot({ index: got.index, total: got.total });
      } catch {
        // 使えないブラウザ・拒否されたときは URL の値のまま
      }
    };
    void look();
    const id = setInterval(look, SLOT_WATCH_MS);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [explicitScreen]);

  return slot;
}

export function DisplaySetup({ reason, hint, screenTotal }: Props) {
  const storageKey = deviceIdKey(hint.screenIndex);
  // 窓ごとの登録にするため、どの経路にも画面番号を載せる
  const screenQuery =
    hint.screenIndex !== null ? `?screen=${hint.screenIndex}` : "";
  const [state, setState] = useState<SetupState>({ phase: "loading" });
  const [now, setNow] = useState(() => Date.now());
  const startedRef = useRef(false);

  const begin = useCallback(async () => {
    setState({ phase: "loading" });
    try {
      const res = await fetch(`/api/display/setup/begin${screenQuery}`, {
        method: "POST",
      });
      const data = (await res.json()) as {
        status: string;
        code?: string;
        expiresAt?: string;
      };
      if (data.status === "ALREADY_REGISTERED") {
        window.location.reload();
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
  }, [screenQuery]);

  // 初期化: Cookie 消失なら reactivate → だめなら begin（キオスクと同じ）
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    (async () => {
      try {
        const savedId = localStorage.getItem(storageKey);
        if (savedId) {
          const res = await fetch(
            `/api/display/setup/reactivate${screenQuery}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ deviceId: savedId }),
            },
          );
          if (res.ok) {
            window.location.reload();
            return;
          }
        }
      } catch {
        // 復帰に失敗しても begin は試す
      }
      void begin();
    })();
  }, [begin, screenQuery, storageKey]);

  // 表示中: リンク成立ポーリング + 期限カウントダウン
  useEffect(() => {
    if (state.phase !== "showing") return;
    const poll = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/display/setup/link-status?code=${encodeURIComponent(state.code)}`,
        );
        const data = (await res.json()) as {
          status: string;
          deviceId?: string;
          deviceName?: string | null;
        };
        if (data.status === "LINKED" && data.deviceId) {
          localStorage.setItem(storageKey, data.deviceId);
          setState({
            phase: "linked",
            deviceId: data.deviceId,
            deviceName: data.deviceName ?? null,
          });
        } else if (data.status === "EXPIRED" || data.status === "NOT_FOUND") {
          setState({ phase: "expired" });
        }
      } catch {
        // 通信断は次のポーリングで再試行（画面はそのまま）
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
  }, [state, storageKey]);

  // リンク後: 有効化待ちポーリング。
  //
  // ★ **入った直後に 1 回見る。** 間隔だけだと、管理者がリンクと有効化を続けて
  //   行ったときに最初の 1 回ぶん（3 秒）待たされ、しかもそこで取りこぼすと
  //   「有効化を待っています」から進まないように見える。
  // ★ **どの分岐でも必ず次の手を打つ。** 以前は再有効化に失敗すると何もせず
  //   待ち続けていたので、そこで永久に止まっていた（黙って詰まるのが一番悪い）。
  useEffect(() => {
    if (state.phase !== "linked") return;
    let stopped = false;

    const check = async () => {
      if (stopped) return;
      try {
        const res = await fetch("/api/display/setup/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            deviceId: state.deviceId,
            machineId: hint.machineId,
            screenIndex: hint.screenIndex,
          }),
        });
        const data = (await res.json().catch(() => null)) as {
          status?: string;
        } | null;

        if (data?.status === "CONFIRMED") {
          window.location.reload();
          return;
        }
        if (data?.status === "ALREADY_CONFIRMED") {
          const re = await fetch(
            `/api/display/setup/reactivate${screenQuery}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ deviceId: state.deviceId }),
            },
          );
          if (re.ok) {
            window.location.reload();
            return;
          }
          // 取り直せない = この控えはもう使えない。最初からやり直す。
          localStorage.removeItem(storageKey);
          void begin();
          return;
        }
        if (data?.status === "PENDING" || data?.status === "NOT_FOUND") {
          // リンク解除された / 行が消えた → 最初から
          localStorage.removeItem(storageKey);
          void begin();
          return;
        }
        // LINKED（有効化待ち）はそのまま待つ。それ以外の見慣れない返事も、
        // 次の周回で見直す（勝手に登録をやり直さない）。
      } catch {
        // 通信断は次の周回で再試行
      }
    };

    void check(); // まず 1 回
    const poll = setInterval(check, POLL_INTERVAL_MS);
    return () => {
      stopped = true;
      clearInterval(poll);
    };
  }, [state, begin, hint, screenQuery, storageKey]);

  const note = REASON_NOTE[reason];
  // 1 台に複数つないでいるときは「何枚目か」を出す。**同時に 2 枚が同じような
  // コード画面を出すので、これが無いとどちらのコードを入力しているのか
  // 分からなくなる。**
  //
  // URL の `of` は開いた時点の数なので当てにしない — 1 枚目は「自分だけ」の
  // つもりで開いており、あとから 2 枚目が増えても URL は変わらない。
  // 実際に握られている錠を数えて、**両方の窓が自分の番号を出せる**ようにする。
  const live = useScreenSlot(hint.screenIndex);
  const index = live?.index ?? hint.screenIndex;
  const total = Math.max(live?.total ?? 1, screenTotal);
  const screenLabel =
    total > 1 && index ? `この機械の ${total} 枚中 ${index} 枚目` : null;

  // 共有部品が読む形へ。linked の文面だけここで組み立てる（端末は
  // 「利用を開始できます」、ディスプレイは「表示を開始します」）。
  const view: LinkCodePhase =
    state.phase === "linked"
      ? {
          phase: "linked",
          message: (
            <>
              {`リンクしました${state.deviceName ? `: ${state.deviceName}` : ""}。管理者がこのディスプレイを`}
              <b>有効化</b>
              {"すると表示を開始します。"}
            </>
          ),
        }
      : state;

  return (
    <LinkCodeScreen
      badge={
        screenLabel ? (
          <Badge color="blue" size="lg" variant="light">
            {screenLabel}
          </Badge>
        ) : undefined
      }
      brand={
        // 登録前の画面こそ「誰の何なのか」が分からない。ロゴを出しておく。
        // biome-ignore lint/performance/noImgElement: 静的 SVG 1 枚
        <img
          alt=""
          src="/design-assets/dark_logo.svg"
          style={{ display: "block", height: "3rem" }}
        />
      }
      instruction="管理者に「設定 → 端末管理 → ディスプレイ」でこのコードをスキャンまたは入力してもらい、登録してください。"
      notice={note}
      now={now}
      onRetry={begin}
      state={view}
      title="ディスプレイの登録"
      variant="wall"
    />
  );
}
