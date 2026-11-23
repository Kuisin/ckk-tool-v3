"use client";

/**
 * ManualVideo.tsx — マニュアルに業務の通し操作の動画を置く。
 *
 * 本文の ```video フェンス（中身は動画の id 1 行）を source.config.ts の
 * remarkManualVideo が `<ManualVideo id="…" />` に置き換え、mdx-components.tsx が
 * この部品を当てる。書く側は Markdown にフェンスを 1 つ置くだけ。
 *
 * **動画はビルドに入っていない**ので、あるかどうかは開いてから分かる:
 *   - マニュアルのページはビルド時に HTML になる（SSG）。一方、動画はデプロイ後に
 *     録画アプリがホストへ書き出す（lib/manual-videos.ts）。だからサーバーで
 *     描かず、開いたときに /manual-media/manifest.json を見て決める。
 *   - **無ければ何も描かない。** 手元・CI・録画アプリを入れる前の環境では動画が
 *     無いのが普通で、そのときページは静止画だけで今までどおり読める
 *     （「動画を読み込めません」の枠を全ページに出さない）。
 *
 * 約束ごと:
 *   - `preload="none"` — 押すまで動画本体（数 MB）を取りに行かない。サムネイルだけ出す。
 *   - 枠は 16:9 で先に確保する（読み込みで下の本文が飛ばない）。寸法は rem / %。
 *   - 字幕（.vtt）= 手順の説明。既定で出す。同じ手順を下に一覧でも出し、
 *     押すとその場面へ飛ぶ（シークは /manual-media が Range に応える）。
 *   - 文言は閲覧者の表示設定ではなく **docs の言語（URL の lang）** で決まる
 *     （DocsShell の BACK_TO_APP_LABEL と同じ流儀。公開ページの next-intl は
 *     ja 固定なので使えない）。語は `_specs/i18n-glossary.md` §3.17。
 *   - 録画は日本語の画面だけ。en / zh のページではその旨を一言添える。
 */

import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  formatTimestamp,
  type ManualVideo as ManualVideoMeta,
  parseManifest,
} from "@/lib/manual-videos-core";

const LABELS = {
  ja: {
    steps: "手順",
    recorded: (d: string) => `${d} 録画`,
    jaOnly: "",
    jumpTo: (t: string) => `${t} へ移動`,
  },
  en: {
    steps: "Steps",
    recorded: (d: string) => `Recorded ${d}`,
    jaOnly: "This video was recorded with the Japanese interface.",
    jumpTo: (t: string) => `Jump to ${t}`,
  },
  zh: {
    steps: "步骤",
    recorded: (d: string) => `录制于 ${d}`,
    jaOnly: "本视频以日语界面录制。",
    jumpTo: (t: string) => `跳转到 ${t}`,
  },
} as const;

/** 字幕トラックの言語名。録画は日本語だけなので、どの言語のページでもこの名前。 */
const CAPTION_LANGUAGE = "日本語"; // i18n-ignore

type Loaded = { video: ManualVideoMeta; version: string; recordedOn: string };

/** 同じページに動画が複数あっても manifest は 1 回だけ取る。 */
let manifestRequest: Promise<unknown> | null = null;

function loadManifest(): Promise<unknown> {
  manifestRequest ??= fetch("/manual-media/manifest.json")
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  return manifestRequest;
}

export function ManualVideo({ id }: { id: string }) {
  const params = useParams<{ lang?: string }>();
  const lang =
    params.lang === "en" || params.lang === "zh" ? params.lang : "ja";
  const t = LABELS[lang];
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    let alive = true;
    loadManifest().then((json) => {
      const manifest = parseManifest(json);
      const video = manifest?.videos.find((v) => v.id === id);
      if (!alive || !manifest || !video) return;
      setLoaded({
        video,
        // 撮り直すと URL ごと変わる（古い動画がキャッシュから出ない）。
        version: encodeURIComponent(manifest.recordedAt),
        // 録画時刻は JST のオフセット付き ISO。日付の部分をそのまま出す
        // （Date を通すと閲覧者の TZ で前日・翌日にずれる）。
        recordedOn: manifest.recordedAt.slice(0, 10).replaceAll("-", "/"),
      });
    });
    return () => {
      alive = false;
    };
  }, [id]);

  if (!loaded) return null;
  const { video, version, recordedOn } = loaded;
  const src = (ext: string) => `/manual-media/${video.id}.${ext}?v=${version}`;

  const jump = (sec: number) => {
    const el = ref.current;
    if (!el) return;
    el.currentTime = sec;
    void el.play().catch(() => undefined);
  };

  return (
    <figure style={{ margin: "1.5rem 0" }}>
      <div
        style={{
          aspectRatio: "16 / 9",
          width: "100%",
          background: "#000",
          borderRadius: "0.5rem",
          overflow: "hidden",
        }}
      >
        <video
          controls
          playsInline
          poster={src("jpg")}
          preload="none"
          ref={ref}
          style={{ width: "100%", height: "100%", display: "block" }}
        >
          <source src={src("webm")} type="video/webm" />
          <track
            default
            kind="captions"
            label={CAPTION_LANGUAGE}
            src={src("vtt")}
            srcLang="ja"
          />
        </video>
      </div>
      <figcaption style={{ marginTop: "0.5rem", fontSize: "0.875rem" }}>
        <div style={{ fontWeight: 600 }}>{video.title}</div>
        <div style={{ opacity: 0.7, fontSize: "0.8125rem" }}>
          {t.recorded(recordedOn)}
          {t.jaOnly ? ` · ${t.jaOnly}` : ""}
        </div>
        {video.chapters.length > 0 && (
          <details style={{ marginTop: "0.5rem" }}>
            <summary style={{ cursor: "pointer", fontWeight: 600 }}>
              {t.steps}（{video.chapters.length}）
            </summary>
            <ol style={{ margin: "0.5rem 0 0", paddingLeft: "1.25rem" }}>
              {video.chapters.map((c) => {
                const time = formatTimestamp(c.startSec);
                return (
                  <li key={c.startSec} style={{ margin: "0.25rem 0" }}>
                    <button
                      aria-label={t.jumpTo(time)}
                      onClick={() => jump(c.startSec)}
                      style={{
                        all: "unset",
                        cursor: "pointer",
                        fontVariantNumeric: "tabular-nums",
                        color: "var(--color-fd-primary, #1c7ed6)",
                        marginRight: "0.5rem",
                        // タッチでも押せる当たり判定
                        padding: "0.25rem 0",
                      }}
                      type="button"
                    >
                      {time}
                    </button>
                    {c.title}
                  </li>
                );
              })}
            </ol>
          </details>
        )}
      </figcaption>
    </figure>
  );
}
