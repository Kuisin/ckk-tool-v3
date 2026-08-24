"use client";

/**
 * NavigationGuard.tsx — 未保存の変更がある状態でのページ離脱を確認する共通ガード
 * (design.md §10.4 の確認ダイアログ方針に沿う)。
 *
 * 仕組み:
 * - フォーム等が `useUnsavedChanges(form.isDirty())` で「未保存あり」を登録する。
 * - 未保存中は、
 *     1. アプリ内リンククリック（ランチャー・パンくず・戻るボタン・各種 <Link>）を
 *        document の capture フェーズで捕捉し、確認モーダルを挟む。
 *     2. リロード / タブ閉じ / 外部遷移は `beforeunload` でブラウザ標準の確認を出す。
 * - `guard(proceed)` は任意のプログラム遷移（router.back() 等）を確認付きで実行する。
 *
 * 注意: 送信成功後の `router.push`（プログラム遷移）は捕捉しない。保存直後の
 * リダイレクトを妨げないため、ガードはアンカークリックと明示的な `guard()` のみ
 * を対象とする。ブラウザの「戻る/進む」(popstate) は確実な取り消しができないため
 * 対象外（ヘッダーの「戻る」ボタンはガード対象）。
 */

import { Text } from "@mantine/core";
import { modals } from "@mantine/modals";
import { useRouter } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react";

interface NavGuardValue {
  /** 未保存フラグを更新する（true = 離脱時に確認）。 */
  setDirty: (dirty: boolean) => void;
  /**
   * 任意の遷移を確認付きで実行する。未保存が無ければ即実行。
   * ヘッダーの「戻る」ボタン等、アンカーでない遷移に使う。
   */
  guard: (proceed: () => void) => void;
}

const NavigationGuardContext = createContext<NavGuardValue>({
  setDirty: () => {},
  guard: (proceed) => proceed(),
});

const LEAVE_CONFIRM = {
  title: "保存されていない変更があります",
  message:
    "このページを離れると、入力した内容は保存されません。移動してもよろしいですか？",
  confirm: "移動する",
  cancel: "このページに留まる",
} as const;

export function NavigationGuardProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  // リスナー内から常に最新値を読むため ref で保持（再購読を避ける）。
  const dirtyRef = useRef(false);

  const confirmLeave = useCallback((proceed: () => void) => {
    modals.openConfirmModal({
      title: LEAVE_CONFIRM.title,
      children: <Text size="sm">{LEAVE_CONFIRM.message}</Text>,
      labels: { confirm: LEAVE_CONFIRM.confirm, cancel: LEAVE_CONFIRM.cancel },
      confirmProps: { color: "red" },
      onConfirm: proceed,
    });
  }, []);

  const setDirty = useCallback((dirty: boolean) => {
    dirtyRef.current = dirty;
  }, []);

  const guard = useCallback(
    (proceed: () => void) => {
      if (!dirtyRef.current) {
        proceed();
        return;
      }
      confirmLeave(() => {
        dirtyRef.current = false;
        proceed();
      });
    },
    [confirmLeave],
  );

  // アプリ内リンククリックの捕捉（capture フェーズで Next の遷移より先に止める）。
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!dirtyRef.current || e.defaultPrevented) return;
      // 修飾キー付き / 中クリックは新規タブなので対象外。
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return;
      }
      const target = e.target as HTMLElement | null;
      const anchor = target?.closest?.("a");
      if (!anchor) return;
      const rawHref = anchor.getAttribute("href");
      if (!rawHref || rawHref.startsWith("#")) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;

      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return; // 外部は beforeunload 側
      // 同一 URL への遷移は無視（実質ページ移動でない）。
      if (
        url.pathname === window.location.pathname &&
        url.search === window.location.search
      ) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();
      confirmLeave(() => {
        dirtyRef.current = false;
        router.push(`${url.pathname}${url.search}${url.hash}`);
      });
    }

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [router, confirmLeave]);

  // リロード / タブ閉じ / 外部遷移: ブラウザ標準の確認。
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (!dirtyRef.current) return;
      e.preventDefault();
      // 一部ブラウザ互換のため returnValue も設定。
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  const value = useMemo<NavGuardValue>(
    () => ({ setDirty, guard }),
    [setDirty, guard],
  );

  return (
    <NavigationGuardContext.Provider value={value}>
      {children}
    </NavigationGuardContext.Provider>
  );
}

/** ガードの `guard()`（確認付き遷移）にアクセスする。 */
export function useNavigationGuard(): NavGuardValue {
  return useContext(NavigationGuardContext);
}

/**
 * 未保存の変更を登録するフック。`dirty` が true の間、ページ離脱時に確認が出る。
 * アンマウント時は自動で未保存フラグを解除する。
 *
 *   const form = useForm(...);
 *   useUnsavedChanges(form.isDirty());
 */
export function useUnsavedChanges(dirty: boolean): void {
  const { setDirty } = useContext(NavigationGuardContext);
  useEffect(() => {
    setDirty(dirty);
    return () => setDirty(false);
  }, [dirty, setDirty]);
}
