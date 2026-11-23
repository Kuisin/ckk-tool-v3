"use client";

/**
 * Mermaid.tsx — マニュアル本文の ```mermaid フェンスを図として描く。
 *
 * source.config.ts の remarkMdxMermaid が ```mermaid を `<Mermaid chart="…" />`
 * に置き換え、mdx-components.tsx がこの部品を当てる。書く側は Markdown に
 * フェンスを 1 つ置くだけ（生成物もビルド手順も無い）。
 *
 * **スイムレーン図（tools/swimlane）とは役割が違う** — あちらは「誰が・どの順で」を
 * 段ごとの説明つきで見せるプロセス編の図で、ビルド時に SVG になる。こちらは
 * 操作ページの中に置く小さな図（状態の移り変わり・承認の流れ）で、本文と同じ
 * ファイルに書けることを優先している。
 *
 * 約束ごと:
 *   - **mermaid は図のあるページを開いたときだけ読む**（動的 import）。本体は
 *     数百 KB あるので、図の無いページとアプリ本体には載せない。
 *   - **原寸で描き、入らなければ横スクロール**（useMaxWidth: false）。既定は
 *     入れ物の幅へ縮めるので、スマホでは文字が読めない大きさになる。
 *   - 描けなかったら（構文エラー）図のソースをそのまま出す。何も出ないより、
 *     書いた人がすぐ気づける。構文は CI でも見ている（docs-mermaid.test.ts）。
 *   - securityLevel は strict（既定）— ラベルの HTML とクリック操作を無効にする。
 *     ソースは自分たちのリポジトリの Markdown だが、緩める理由が無い。
 */

import { useEffect, useId, useState } from "react";
import {
  MERMAID_THEME_VARIABLES,
  mermaidDomId,
  withStatusClasses,
} from "@/lib/docs-mermaid";

type Rendered = { svg: string } | { error: string } | null;

/** initialize はページ内の全図で 1 回だけ。 */
let mermaidReady: Promise<typeof import("mermaid").default> | null = null;

function loadMermaid() {
  mermaidReady ??= import("mermaid").then(({ default: mermaid }) => {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: "base",
      themeVariables: MERMAID_THEME_VARIABLES,
      flowchart: {
        useMaxWidth: false,
        curve: "basis",
        nodeSpacing: 36,
        rankSpacing: 30,
        padding: 12,
      },
      sequence: {
        useMaxWidth: false,
        // 下にも登場人物を繰り返さない（3 人程度の短い図では高さが増えるだけ）。
        mirrorActors: false,
        diagramMarginX: 8,
        actorMargin: 24,
        width: 120,
        height: 44,
      },
      state: { useMaxWidth: false },
    });
    return mermaid;
  });
  return mermaidReady;
}

export function Mermaid({ chart }: { chart: string }) {
  const id = mermaidDomId(useId());
  const [rendered, setRendered] = useState<Rendered>(null);

  useEffect(() => {
    let cancelled = false;
    loadMermaid()
      .then((mermaid) => mermaid.render(id, withStatusClasses(chart)))
      .then(({ svg }) => {
        if (!cancelled) setRendered({ svg });
      })
      .catch((e: unknown) => {
        // render が失敗すると mermaid は body 直下にエラー用の要素を残す。
        document.getElementById(`d${id}`)?.remove();
        if (!cancelled) {
          setRendered({ error: e instanceof Error ? e.message : String(e) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [chart, id]);

  if (rendered && "error" in rendered) {
    return (
      <pre className="docs-mermaid-error" title={rendered.error}>
        {chart}
      </pre>
    );
  }

  return (
    <figure
      aria-busy={rendered === null}
      className="docs-mermaid not-prose"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: mermaid が strict で生成した SVG（中で DOMPurify 済み）。ソースは content/ の Markdown。
      dangerouslySetInnerHTML={rendered ? { __html: rendered.svg } : undefined}
    />
  );
}
