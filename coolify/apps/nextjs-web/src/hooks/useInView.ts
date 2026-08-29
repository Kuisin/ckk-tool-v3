"use client";

/**
 * useInView — 要素が実際に見えるまで重い読み込みを始めないための門。
 *
 * Mantine の `Tabs.Panel` は既定で **keepMounted**（表に出ていないタブも DOM に
 * ある）。何もしないと、開いてもいないタブの 3D モデルを読みに行き WebGL まで
 * 起こしてしまう。表示中かどうかは `IntersectionObserver` でしか判らないので、
 * ここで見てから始める。
 *
 * 一度見えたら二度と false に戻さない（`once`）— スクロールで往復するたびに
 * モデルを捨てて読み直すほうが高くつく。
 */

import { type RefObject, useEffect, useState } from "react";

export function useInView(
  ref: RefObject<HTMLElement | null>,
  { rootMargin = "200px" }: { rootMargin?: string } = {},
): boolean {
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (inView) return;
    const el = ref.current;
    if (!el) return;
    // 未対応環境（jsdom を含む）では門を開けたままにする — 出さないより出す。
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          io.disconnect();
        }
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, rootMargin, inView]);

  return inView;
}
