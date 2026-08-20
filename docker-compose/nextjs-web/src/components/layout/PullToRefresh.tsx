"use client";

/**
 * PullToRefresh.tsx — モバイル PWA の「引き下げて更新」ジェスチャ。
 *
 * ホーム画面から起動した PWA（display-mode: standalone）には、ブラウザの
 * ツールバーが無いぶん pull-to-refresh も無い。ページ最上部から下に引くと
 * インジケータが降りてきて、しきい値を超えて離すとページを更新する
 * — モバイルブラウザ標準の挙動をそのままアプリ内で再現する。
 *
 * ブラウザのタブで開いているときは**何もしない** — ブラウザ自身の
 * pull-to-refresh が効くので、二重に出さない。
 *
 * 更新は `router.refresh()`（RSC の再取得）。ダッシュボード配下は
 * `dynamic = "force-dynamic"` なのでサーバーデータは必ず取り直され、かつ
 * 入力途中のフォーム（クライアント state）は消えない — 完全リロードだと
 * NavigationGuard が守っている未保存の入力を黙って捨ててしまう。
 *
 * 無効化したい領域（独自のドラッグ操作を持つ UI など）は、その要素に
 * `data-pull-refresh="off"` を付ける。
 */

import { IconRefresh } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

/** 発火に必要な引き下げ量（px）。 */
const THRESHOLD = 72;
/** 表示上の最大引き下げ量（px） — これ以上引いても伸びない。 */
const MAX_PULL = 120;
/** 指の移動量に対する追従率（ゴムのような手応え）。 */
const RESISTANCE = 0.5;
/** 更新中にインジケータを留める位置（px）。 */
const SPINNER_REST = 56;
/** 更新が一瞬で終わったときの、インジケータの最低表示時間（ms）。 */
const MIN_SPIN_MS = 400;
/** 戻りアニメーション（CSS の transition）と揃える待ち時間（ms）。 */
const SETTLE_MS = 260;

/** ホーム画面 PWA（スタンドアロン）として起動しているか。 */
function isStandaloneDisplay(): boolean {
  const nav = window.navigator as Navigator & { standalone?: boolean };
  // iOS はホーム画面 PWA でのみ true（display-mode を長く実装しなかった）。
  if (nav.standalone) return true;
  return window.matchMedia(
    "(display-mode: standalone), (display-mode: fullscreen), (display-mode: minimal-ui)",
  ).matches;
}

/**
 * このタッチ開始位置ではジェスチャを始めない条件。
 * 「最上部から引いたときだけ」というブラウザの規則をそのまま写す。
 */
function isBlocked(target: EventTarget | null): boolean {
  const el = target instanceof Element ? target : null;
  if (!el) return true;
  // モーダル / ドロワーを開いている間は無効（背面のページは更新しない）。
  if (document.querySelector("[role='dialog']")) return true;
  // 明示的な除外領域。
  if (el.closest("[data-pull-refresh='off']")) return true;
  // ページ本体が最上部でない（iOS はバウンド中に負値になるので > 0 で見る）。
  if (window.scrollY > 0 || document.documentElement.scrollTop > 0) return true;
  // 内側のスクロール領域（テーブル・ScrollArea 等）が最上部でない。
  for (let node: Element | null = el; node; node = node.parentElement) {
    if (node.scrollTop > 0) return true;
  }
  return false;
}

/**
 * iOS ではバウンドが途中で止まると、文書のスクロール位置が負のまま残ることが
 * あり、固定要素（ヘッダー / フッター）が本来より上にずれて描かれる。
 * ジェスチャの終わりに最上部へ寄せ直して打ち消す（負値を報告しない
 * ブラウザでは何も起きない）。
 */
function settleViewport(): void {
  if (window.scrollY < 0) window.scrollTo(0, 0);
}

export function PullToRefresh() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [refreshing, setRefreshing] = useState(false);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const refreshingRef = useRef(false);
  const startedAtRef = useRef(0);
  const idleTimerRef = useRef(0);
  const drag = useRef({
    active: false,
    engaged: false,
    startX: 0,
    startY: 0,
    pull: 0,
  });

  useEffect(() => {
    refreshingRef.current = refreshing;
  }, [refreshing]);

  /**
   * インジケータを直接 DOM で動かす（指の動きごとの再レンダを避ける）。
   * `settle` = 指を離した後のアニメーション付き移動。
   *
   * `data-active` は「いま画面に出ている」印。動いていない間は CSS 側で
   * visibility: hidden + will-change 無しに落ちる — 常時 will-change を
   * 付けたままにすると合成レイヤーが残り続け、iOS で固定ヘッダー /
   * フッターの描画位置がずれることがあるため。
   */
  const paint = useCallback((pull: number, settle: boolean) => {
    const el = indicatorRef.current;
    if (!el) return;
    window.clearTimeout(idleTimerRef.current);
    el.toggleAttribute("data-settling", settle);
    el.toggleAttribute("data-ready", pull >= THRESHOLD);
    el.style.setProperty("--ptr-y", `${Math.min(pull, MAX_PULL)}px`);
    el.style.setProperty("--ptr-opacity", `${Math.min(1, pull / THRESHOLD)}`);
    el.style.setProperty("--ptr-rotate", `${(pull / THRESHOLD) * 180}deg`);
    if (pull > 0) {
      el.toggleAttribute("data-active", true);
      return;
    }
    // 0 に戻すときは、戻りアニメーションが終わってからレイヤーを畳む。
    idleTimerRef.current = window.setTimeout(
      () => el.removeAttribute("data-active"),
      settle ? SETTLE_MS : 0,
    );
  }, []);

  useEffect(() => {
    if (!isStandaloneDisplay()) return;

    let moveAttached = false;

    function detachMove() {
      if (!moveAttached) return;
      document.removeEventListener("touchmove", onMove);
      moveAttached = false;
    }

    function reset(settle: boolean) {
      drag.current.active = false;
      drag.current.engaged = false;
      drag.current.pull = 0;
      detachMove();
      paint(0, settle);
      settleViewport();
    }

    function onStart(e: TouchEvent) {
      if (drag.current.active || refreshingRef.current) return;
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      if (!touch || isBlocked(e.target)) return;
      drag.current = {
        active: true,
        engaged: false,
        startX: touch.clientX,
        startY: touch.clientY,
        pull: 0,
      };
      // preventDefault したいのは「縦に引き下げている間」だけなので、
      // 非パッシブの touchmove はジェスチャ開始後にだけ張る
      // （常時張るとページ全体のスクロール最適化が効かなくなる）。
      document.addEventListener("touchmove", onMove, { passive: false });
      moveAttached = true;
    }

    function onMove(e: TouchEvent) {
      const state = drag.current;
      if (!state.active) return;
      const touch = e.touches[0];
      if (e.touches.length !== 1 || !touch) {
        reset(true);
        return;
      }
      const dy = touch.clientY - state.startY;
      const dx = touch.clientX - state.startX;

      if (!state.engaged) {
        // 最初の touchmove で決める。ここで preventDefault を逃すと、iOS は
        // 以降その一連のジェスチャで preventDefault を無視する — バウンドが
        // 始まってしまい、固定ヘッダー / フッターが道連れでずれる。なので
        // 「遊び」を置かず、下方向と判った瞬間に押さえる。
        if (dy <= 0 || Math.abs(dx) > Math.abs(dy)) {
          // 上方向スクロール / 横スワイプ — ブラウザに任せて降りる。
          reset(false);
          return;
        }
        state.engaged = true;
      }

      // 引き下げ中にページがスクロールし始めたら中止（慣性スクロール等）。
      if (window.scrollY > 0) {
        reset(true);
        return;
      }
      // 最上部からの下方向 = ブラウザ側では overscroll（iOS のバウンド）に
      // しかならない動き。常に押さえてよい。
      e.preventDefault();
      // 引き戻して開始位置より上に戻ったら 0 に張り付かせる（負値にしない）。
      state.pull = Math.max(0, dy * RESISTANCE);
      paint(state.pull, false);
    }

    function onEnd() {
      const state = drag.current;
      if (!state.active) return;
      const shouldRefresh = state.engaged && state.pull >= THRESHOLD;
      if (!shouldRefresh) {
        reset(true);
        return;
      }
      state.active = false;
      state.engaged = false;
      state.pull = SPINNER_REST;
      detachMove();
      settleViewport();
      refreshingRef.current = true;
      startedAtRef.current = performance.now();
      setRefreshing(true);
      paint(SPINNER_REST, true);
      startTransition(() => {
        router.refresh();
      });
    }

    // touchcancel（OS がジェスチャを引き取った等）は「離した」ではないので
    // 更新せずに戻すだけ。
    function onCancel() {
      if (drag.current.active) reset(true);
    }

    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchend", onEnd, { passive: true });
    document.addEventListener("touchcancel", onCancel, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onCancel);
      detachMove();
      window.clearTimeout(idleTimerRef.current);
    };
  }, [paint, router]);

  // 再取得が終わったらインジケータをしまう。一瞬で終わったときだけ、点滅して
  // 見えないよう最低表示時間まで待つ。
  useEffect(() => {
    if (!refreshing || pending) return;
    const elapsed = performance.now() - startedAtRef.current;
    const timer = window.setTimeout(
      () => {
        refreshingRef.current = false;
        setRefreshing(false);
        paint(0, true);
      },
      Math.max(0, MIN_SPIN_MS - elapsed),
    );
    return () => window.clearTimeout(timer);
  }, [refreshing, pending, paint]);

  return (
    <div
      aria-hidden="true"
      className="ptr-indicator"
      data-spinning={refreshing || undefined}
      ref={indicatorRef}
    >
      <span className="ptr-icon">
        <IconRefresh size={18} stroke={2} />
      </span>
    </div>
  );
}
