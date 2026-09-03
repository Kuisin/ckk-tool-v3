/**
 * intake-extract-error.ts — 注文請書の自動抽出（po-extract）失敗の分類と表示。
 *
 * これまで `order_acceptances.extract_error` には例外の message をそのまま
 * 入れていたため、画面には「po-extract HTTP 502」だけが出て、**何が起きたのか
 * も次に何をすればよいのかも分からなかった**。ここで失敗を分類し、
 *   1 行目 = 何が起きたか / 原因 / 対処 / 詳細 / 自動再試行の状況
 * という決まった形の文字列にして保存する。純ロジック（I/O なし）なので
 * サーバー（lib/intake.ts）とクライアント（詳細・一覧）の両方から使える。
 *
 * 保存形式を JSON にしないのは、通知やツールチップなど**そのまま出る場所**が
 * あるため。旧い行（1 行だけの素の message）も parse でそのまま扱える。
 *
 * **文言は next-intl（`messages/*.json` の `sales.orderAcceptances.extractError.*`）
 * へ移した。** ここは React コンポーネントの外（`lib/intake.ts` の抽出パイプライン
 * — リクエストスコープを持たない場合がある）から呼ばれ、`useTranslations()`も
 * `getTranslations()`も使えないため、`lib/messages.ts` の `label()`（enum/status
 * ラベルが使っているのと同じ、明示 locale 引数の next-intl 委譲 API）で引く。
 * `label()` は鍵が無くても渡した `fallback` へ倒れる（例外を投げない）ので、
 * ここでは常に**元の日本語文言そのもの**を fallback に渡し、キーがまだ
 * カタログに無くても・`locale` を渡し忘れても、これまでと同じ日本語の文言に
 * なる（壊れない）。**`locale` 省略時は既定（ja）** — `lib/intake.ts`
 * はまだこの引数を渡していない（そちらの変換は別の作業）。
 *
 * CAUSE/HINT/DETAIL/RETRY の行頭記号と `RETRY_PENDING_MARKER` は**保存形式の
 * 内部区切りであって画面に生では出ない**（`parseExtractError` が読み取って
 * 構造化フィールドに変換し、UI 側はその構造化フィールドだけを表示する）ため、
 * 翻訳対象にしていない。
 */

import type { Locale } from "./i18n";
import { label } from "./messages";

const EK = "sales.orderAcceptances.extractError";

/** `label()` へ委譲する薄いラッパ — 鍵の名前空間を省略できるようにする。 */
function t(
  key: string,
  locale: Locale | undefined,
  fallback: string,
  vars?: Record<string, unknown>,
): string {
  return label(`${EK}.${key}`, locale ?? "ja", fallback, vars);
}

/** 失敗の分類結果。 */
export interface ExtractFailure {
  /** 何が起きたか（1 行・画面のタイトルに出る）。 */
  summary: string;
  /** 分かる範囲の原因。 */
  cause?: string;
  /** 次にすること。 */
  hint: string;
  /** 技術的な手がかり（HTTP 状態・サーバーの detail・例外名）。 */
  detail?: string;
  /** もう一度試して直る見込みがあるか（自動再試行の対象）。 */
  retryable: boolean;
}

/** 画面表示用に読み戻した失敗（旧形式の 1 行メッセージも受け付ける）。 */
export interface ParsedExtractError extends ExtractFailure {
  /** 何回目の試行で失敗したか（分かる場合）。 */
  attempt?: number;
  /** 自動再試行の上限。 */
  maxAttempts?: number;
  /** 次の自動再試行を待っている最中か（= まだ諦めていない）。 */
  retrying: boolean;
}

/**
 * 「次の自動再試行を待っている」ことを示す印。画面の判定と、再起動後の
 * 拾い直し（DB 検索）の両方がこの 1 語を見る。**保存形式の内部区切り**
 * （画面に生では出ない）なので翻訳しない。
 */
export const RETRY_PENDING_MARKER = "もう一度試します"; // i18n-ignore

const CAUSE = "原因: "; // i18n-ignore
const HINT = "対処: "; // i18n-ignore
const DETAIL = "詳細: "; // i18n-ignore
const RETRY = "自動再試行: "; // i18n-ignore

const MANUAL_HINT_JA =
  "何度も失敗する場合は「手入力に切り替え」で内容を直接入力してください"; // i18n-ignore
const SY0E_JA = "システム設定 → AI プロバイダ（SY0E）"; // i18n-ignore

function manualHint(locale?: Locale): string {
  return t("manualHint", locale, MANUAL_HINT_JA);
}

function aiSettingsPath(locale?: Locale): string {
  return t("aiSettingsPath", locale, SY0E_JA);
}

/** 長い応答本文は先頭だけ残す（画面にも通知にも出るため）。 */
function clip(text: string, max = 300): string {
  const one = text.replace(/\s+/g, " ").trim();
  return one.length > max ? `${one.slice(0, max)}…` : one;
}

/**
 * FastAPI（po-extract）のエラー本文から人が読む部分を取り出す。
 * `{"detail": "..."}` が基本形。プロキシが返す HTML は捨てる
 * （タグの羅列を画面に出しても手がかりにならない）。
 */
export function extractServerDetail(
  body: string | null | undefined,
): string | null {
  if (!body) return null;
  const text = body.trim();
  if (!text) return null;
  if (text.startsWith("{") || text.startsWith("[")) {
    try {
      const parsed = JSON.parse(text) as {
        detail?: unknown;
        message?: unknown;
      };
      const detail = parsed.detail ?? parsed.message;
      if (typeof detail === "string" && detail.trim()) return clip(detail);
      if (detail != null) return clip(JSON.stringify(detail));
    } catch {
      // JSON として読めなければ素のテキストとして扱う
    }
  }
  if (text.startsWith("<")) return null; // HTML（プロキシのエラーページ）
  return clip(text);
}

/**
 * AI プロバイダ由来の失敗（po-extract が `ai_<kind>: ...` で返すもの）。
 *
 * HTTP 状態だけでは足りない — 429 は po-extract 自身の混雑でも起きるし、
 * 401 は下の総括分岐に落ちて「要求を受け付けませんでした」になってしまう。
 * どちらも**現場には手の打ちようがない文言**なので、接頭辞で分けて
 * 「鍵を直す / モデル名を直す / 待つ」を書き分ける。
 *
 * `retryable` の切り分けが肝: 鍵違い・モデル名違いを再試行しても直らないのに
 * 再試行すると、上限（既定 3 回）を使い切ってから失敗が出る。
 *
 * 当てはまらなければ null を返し、既存の分類へそのまま流す。
 */
export function aiFailureFromDetail(
  serverDetail: string | null,
  detail: string,
  locale?: Locale,
): ExtractFailure | null {
  const kind = /^ai_([a-z_]+):/.exec((serverDetail ?? "").trim())?.[1];
  if (!kind) return null;
  const sy0e = aiSettingsPath(locale);
  const table: Record<string, Omit<ExtractFailure, "detail">> = {
    auth: {
      summary: t("aiAuthSummary", locale, "AI プロバイダの認証に失敗しました"), // i18n-ignore
      cause: t("aiAuthCause", locale, "API トークンが無効か失効しています"), // i18n-ignore
      hint: `${sy0e}${t("aiAuthHintSuffix", locale, " でトークンを入力し直してください")}`,
      retryable: false,
    },
    model_not_found: {
      summary: t("aiModelNotFoundSummary", locale, "AI モデルが見つかりません"), // i18n-ignore
      cause: t(
        "aiModelNotFoundCause",
        locale,
        "指定したモデル名がプロバイダに存在しません", // i18n-ignore
      ),
      hint: `${sy0e}${t(
        "aiModelNotFoundHintSuffix",
        locale,
        " のモデル名を確認してください（「接続テスト」で確かめられます）",
      )}`,
      retryable: false,
    },
    rate_limit: {
      summary: t(
        "aiRateLimitSummary",
        locale,
        "AI プロバイダの利用上限に達しました", // i18n-ignore
      ),
      cause: t(
        "aiRateLimitCause",
        locale,
        "レート制限、または残高・プランの上限です", // i18n-ignore
      ),
      hint: t(
        "aiRateLimitHint",
        locale,
        "自動で再試行します。続く場合はプロバイダ側の上限と残高を確認してください", // i18n-ignore
      ),
      retryable: true,
    },
    unreachable: {
      summary: t(
        "aiUnreachableSummary",
        locale,
        "AI プロバイダへ接続できませんでした", // i18n-ignore
      ),
      cause: t(
        "aiUnreachableCause",
        locale,
        "po-extract から接続先へ到達できません（DNS・外向き通信の遮断）", // i18n-ignore
      ),
      hint: t("contactSystemAdmin", locale, "システム管理者へ連絡してください"), // i18n-ignore
      retryable: true,
    },
    bad_schema: {
      summary: t(
        "aiBadSchemaSummary",
        locale,
        "AI プロバイダがこの様式を受け付けませんでした", // i18n-ignore
      ),
      cause: t(
        "aiBadSchemaCause",
        locale,
        "指定のモデルが所定の JSON 形式に対応していません", // i18n-ignore
      ),
      hint: `${sy0e}${t("tryAnotherModelSuffix", locale, " で別のモデルを試してください")}`,
      retryable: false,
    },
    not_configured: {
      summary: t("aiNotConfiguredSummary", locale, "AI プロバイダが未設定です"), // i18n-ignore
      cause: t(
        "aiNotConfiguredCause",
        locale,
        "API トークンが未設定か、暗号鍵が変わって復号できません", // i18n-ignore
      ),
      hint: `${sy0e}${t(
        "aiNotConfiguredHintSuffix",
        locale,
        " でトークンを設定し直してください",
      )}`,
      retryable: false,
    },
    no_vision: {
      summary: t(
        "aiNoVisionSummary",
        locale,
        "AI モデルが画像を読み取れません", // i18n-ignore
      ),
      cause: t(
        "aiNoVisionCause",
        locale,
        "指定のモデルは文字だけで、画像入力に対応していません", // i18n-ignore
      ),
      hint: `${sy0e}${t(
        "aiNoVisionHintSuffix",
        locale,
        " で画像に対応したモデルを指定してください",
      )}`,
      retryable: false,
    },
    bad_sampling: {
      summary: t(
        "aiBadSamplingSummary",
        locale,
        "AI モデルが指定の生成パラメータを受け付けませんでした", // i18n-ignore
      ),
      cause: t(
        "aiBadSamplingCause",
        locale,
        "temperature を既定値しか受けないモデルです（自動で外して再試行しますが、それでも通りませんでした）", // i18n-ignore
      ),
      hint: `${sy0e}${t("tryAnotherModelSuffix", locale, " で別のモデルを試してください")}`,
      retryable: false,
    },
    upstream: {
      summary: t(
        "aiUpstreamSummary",
        locale,
        "AI プロバイダでエラーが起きました", // i18n-ignore
      ),
      cause: t("aiUpstreamCause", locale, "プロバイダ側の一時的な障害です"), // i18n-ignore
      hint: `${t("retriesAutomatically", locale, "自動で再試行します。")}${manualHint(locale)}`,
      retryable: true,
    },
  };
  const hit = table[kind];
  return hit ? { ...hit, detail } : null;
}

/** HTTP で返ってきた失敗を分類する。 */
export function classifyHttpFailure(
  status: number,
  body?: string | null,
  locale?: Locale,
): ExtractFailure {
  const serverDetail = extractServerDetail(body);
  const detail = `po-extract HTTP ${status}${serverDetail ? ` — ${serverDetail}` : ""}`;

  // プロバイダ由来はここで先に拾う（下の 429 / 502 分岐が ollama を名指しした
  // 文言で飲み込んでしまうため）。
  const ai = aiFailureFromDetail(serverDetail, detail, locale);
  if (ai) return ai;

  if (status === 400) {
    return {
      summary: t(
        "badFileSummary",
        locale,
        "取込ファイルを読み取れませんでした", // i18n-ignore
      ),
      cause: t(
        "badFileCause",
        locale,
        "抽出サーバーがファイルを開けませんでした（中身が空、または壊れた PDF・画像）", // i18n-ignore
      ),
      hint: t(
        "badFileHint",
        locale,
        "元のファイルが開けるか確認し、必要なら取り直して再取込してください", // i18n-ignore
      ),
      detail,
      retryable: false,
    };
  }
  if (status === 404) {
    return {
      summary: t(
        "unknownFormatSummary",
        locale,
        "抽出サーバーが注文請書の様式を知りません", // i18n-ignore
      ),
      cause: t(
        "unknownFormatCause",
        locale,
        "po-extract に order-request の様式がありません（サーバーが古い、または PO_EXTRACT_URL の向き先が違う）", // i18n-ignore
      ),
      hint: t(
        "unknownFormatHint",
        locale,
        "システム管理者へ連絡してください（po-extract の再デプロイが必要です）", // i18n-ignore
      ),
      detail,
      retryable: false,
    };
  }
  if (status === 413) {
    return {
      summary: t("tooLargeSummary", locale, "取込ファイルが大きすぎます"), // i18n-ignore
      cause: t(
        "tooLargeCause",
        locale,
        "抽出サーバーが受け付ける上限を超えています", // i18n-ignore
      ),
      hint: t(
        "tooLargeHint",
        locale,
        "ページ数を減らすか、解像度を下げて取り直してください", // i18n-ignore
      ),
      detail,
      retryable: false,
    };
  }
  if (status === 502 && serverDetail?.includes("did not return valid JSON")) {
    return {
      summary: t(
        "aiCouldNotSummarizeSummary",
        locale,
        "AI が読み取り結果をまとめられませんでした", // i18n-ignore
      ),
      cause: t(
        "aiCouldNotSummarizeCause",
        locale,
        "原稿が読み取りづらく（傾き・かすれ・手書き・複雑な表）、AI が所定の形式を返せませんでした", // i18n-ignore
      ),
      hint: `${t(
        "checkOrientationAndRetry",
        locale,
        "原稿の向き・解像度を確かめて再抽出してください。",
      )}${manualHint(locale)}`,
      detail,
      retryable: true,
    };
  }
  if (status === 502 || status === 503 || status === 504) {
    return {
      summary: t(
        "serverNotRespondingSummary",
        locale,
        "抽出サーバーが応答しませんでした", // i18n-ignore
      ),
      cause: t(
        "serverNotRespondingCause",
        locale,
        "po-extract が起動途中・再起動中か、AI（ollama）が混み合って応答を返せませんでした", // i18n-ignore
      ),
      hint: `${t("retriesAutomatically", locale, "自動で再試行します。")}${t(
        "contactSystemAdminIfPersists",
        locale,
        "続く場合はシステム管理者へ連絡してください",
      )}`,
      detail,
      retryable: true,
    };
  }
  if (status === 429) {
    return {
      summary: t("busySummary", locale, "抽出サーバーが混み合っています"), // i18n-ignore
      cause: t("busyCause", locale, "同時に処理できる件数を超えました"), // i18n-ignore
      hint: `${t("retriesAutomatically", locale, "自動で再試行します。")}${t(
        "busyHintSuffix",
        locale,
        "直らない場合は時間をおいて再抽出してください",
      )}`,
      detail,
      retryable: true,
    };
  }
  if (status >= 500) {
    return {
      summary: t(
        "serverErrorSummary",
        locale,
        "抽出サーバーでエラーが起きました", // i18n-ignore
      ),
      cause:
        serverDetail ??
        t(
          "serverErrorCause",
          locale,
          "po-extract の内部エラー（AI 呼び出しの失敗など）", // i18n-ignore
        ),
      hint: `${t("retriesAutomatically", locale, "自動で再試行します。")}${manualHint(locale)}`,
      detail,
      retryable: true,
    };
  }
  return {
    summary: t(
      "rejectedSummary",
      locale,
      `抽出サーバーが要求を受け付けませんでした（HTTP ${status}）`, // i18n-ignore
      { status },
    ),
    cause: serverDetail ?? undefined,
    hint: `${t(
      "rejectedHintPrefix",
      locale,
      "再抽出しても直らない場合はシステム管理者へ連絡してください。",
    )}${manualHint(locale)}`,
    detail,
    retryable: false,
  };
}

/** 接続そのものに失敗した（サーバーが居ない・名前が引けない・切られた）。 */
export function classifyNetworkFailure(
  error: unknown,
  endpoint: string,
  locale?: Locale,
): ExtractFailure {
  const code = networkErrorCode(error);
  const known: Record<string, string> = {
    ECONNREFUSED: t(
      "networkRefusedCause",
      locale,
      "抽出サーバーが起動していません（接続を拒否されました）", // i18n-ignore
    ),
    ENOTFOUND: t(
      "networkNotFoundCause",
      locale,
      "抽出サーバーの名前を解決できません（PO_EXTRACT_URL の設定違い）", // i18n-ignore
    ),
    EAI_AGAIN: t(
      "networkDnsCause",
      locale,
      "名前解決に失敗しました（DNS の一時障害）", // i18n-ignore
    ),
    ECONNRESET: t(
      "networkResetCause",
      locale,
      "接続が途中で切れました（サーバー再起動中の可能性）", // i18n-ignore
    ),
    UND_ERR_SOCKET: t(
      "networkResetCause",
      locale,
      "接続が途中で切れました（サーバー再起動中の可能性）", // i18n-ignore
    ),
  };
  return {
    summary: t("networkSummary", locale, "抽出サーバーに接続できませんでした"), // i18n-ignore
    cause:
      (code && known[code]) ??
      t(
        "networkDefaultCause",
        locale,
        "ネットワーク経路上の問題で到達できません", // i18n-ignore
      ),
    hint: t(
      "networkHint",
      locale,
      "自動で再試行します。続く場合はシステム管理者へ連絡してください（po-extract の稼働確認）", // i18n-ignore
    ),
    detail: `${endpoint} — ${code ?? errorName(error)}: ${errorMessage(error)}`,
    retryable: true,
  };
}

/** 待ち時間切れ（こちら側で打ち切った）。 */
export function classifyTimeoutFailure(
  timeoutMs: number,
  locale?: Locale,
): ExtractFailure {
  const minutes = Math.round(timeoutMs / 60_000);
  return {
    summary: t(
      "timeoutSummary",
      locale,
      `抽出が時間内に終わりませんでした（${minutes}分）`, // i18n-ignore
      { minutes },
    ),
    cause: t(
      "timeoutCause",
      locale,
      "ページ数が多いか、抽出サーバー（po-extract / ollama）が混み合って処理が終わりませんでした", // i18n-ignore
    ),
    hint: `${t(
      "timeoutHintPrefix",
      locale,
      "ページ数を減らすと通ることがあります。",
    )}${manualHint(locale)}`,
    detail: `timeout ${timeoutMs}ms`,
    retryable: true,
  };
}

/** 抽出の前後（ファイル読み出し・応答の解釈・正規化）で起きた失敗。 */
export function classifyLocalFailure(
  error: unknown,
  stage: "storage" | "response" | "normalize" | "unknown",
  locale?: Locale,
): ExtractFailure {
  const detail = `${errorName(error)}: ${errorMessage(error)}`;
  if (stage === "storage") {
    return {
      summary: t(
        "storageSummary",
        locale,
        "取込元ファイルを読み出せませんでした", // i18n-ignore
      ),
      cause: t(
        "storageCause",
        locale,
        "ファイル保管（SeaweedFS）から原本を取得できません", // i18n-ignore
      ),
      hint: `${t("retriesAutomatically", locale, "自動で再試行します。")}${t(
        "contactSystemAdminIfPersists",
        locale,
        "続く場合はシステム管理者へ連絡してください",
      )}`,
      detail,
      retryable: true,
    };
  }
  if (stage === "response") {
    return {
      summary: t(
        "responseSummary",
        locale,
        "抽出サーバーの応答を解釈できませんでした", // i18n-ignore
      ),
      cause: t("responseCause", locale, "JSON として読めない応答が返りました"), // i18n-ignore
      hint: `${t("retriesAutomatically", locale, "自動で再試行します。")}${manualHint(locale)}`,
      detail,
      retryable: true,
    };
  }
  if (stage === "normalize") {
    return {
      summary: t("normalizeSummary", locale, "抽出結果を取り込めませんでした"), // i18n-ignore
      cause: t("normalizeCause", locale, "抽出結果の形が想定と違います"), // i18n-ignore
      hint: manualHint(locale),
      detail,
      retryable: false,
    };
  }
  return {
    summary: t("unknownSummary", locale, "自動抽出に失敗しました"), // i18n-ignore
    cause: errorMessage(error),
    hint: `${t(
      "unknownHintPrefix",
      locale,
      "再抽出しても直らない場合は、",
    )}${manualHint(locale)}`,
    detail,
    retryable: true,
  };
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}

function errorMessage(error: unknown): string {
  return clip(error instanceof Error ? error.message : String(error), 200);
}

/** undici は原因を `cause.code` に入れる（fetch failed だけでは何も分からない）。 */
export function networkErrorCode(error: unknown): string | null {
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string") return code;
    current = (current as { cause?: unknown }).cause;
  }
  return null;
}

/**
 * 自動再試行の判断 — 「直る見込みがあり、まだ回数が残っているか」。
 * 待ち時間は回を追うごとに伸ばす（20s → 40s …）: サーバー再起動や混雑が理由
 * なら、すぐ投げ直すより少し置いた方が通る。
 */
export function retryPlan(input: {
  failure: ExtractFailure;
  attempt: number;
  maxAttempts: number;
  baseDelayMs: number;
}): { willRetry: boolean; delayMs: number } {
  const willRetry =
    input.failure.retryable && input.attempt < input.maxAttempts;
  return {
    willRetry,
    delayMs: willRetry ? input.baseDelayMs * input.attempt : 0,
  };
}

/**
 * 保存する 1 本の文字列にする。
 * `attempts` を渡すと自動再試行の状況を最後の行に足す（待機中か・打ち切りか
 * — 画面はこれを見て「再試行中」を出し、更新を続ける）。
 *
 * 回数の行（`RETRY` 行）は `parseExtractError` が読み取って
 * `attempt`/`maxAttempts`/`retrying` に変換するだけの内部形式で、画面には
 * 生の文言のまま出ないため翻訳しない。
 */
export function formatExtractError(
  failure: ExtractFailure,
  attempts?: { attempt: number; maxAttempts: number; willRetry: boolean },
): string {
  const lines = [failure.summary];
  if (failure.cause) lines.push(CAUSE + failure.cause);
  lines.push(HINT + failure.hint);
  if (failure.detail) lines.push(DETAIL + failure.detail);
  if (attempts && attempts.maxAttempts > 1) {
    lines.push(
      RETRY +
        (attempts.willRetry
          ? `${attempts.attempt}/${attempts.maxAttempts} 回目が失敗 — ${RETRY_PENDING_MARKER}` // i18n-ignore
          : `${attempts.attempt}/${attempts.maxAttempts} 回試して失敗しました`), // i18n-ignore
    );
  }
  return lines.join("\n");
}

/**
 * 保存された文字列を読み戻す。旧形式（分類前の 1 行）は summary として扱い、
 * 対処だけ添える（画面が「次に何をするか」を必ず出せるように）。
 */
export function parseExtractError(
  stored: string,
  locale?: Locale,
): ParsedExtractError {
  const lines = stored
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const parsed: ParsedExtractError = {
    summary: lines[0] ?? t("unknownSummary", locale, "自動抽出に失敗しました"), // i18n-ignore
    hint: "",
    retryable: false,
    retrying: false,
  };
  const rest: string[] = [];
  for (const line of lines.slice(1)) {
    if (line.startsWith(CAUSE)) parsed.cause = line.slice(CAUSE.length);
    else if (line.startsWith(HINT)) parsed.hint = line.slice(HINT.length);
    else if (line.startsWith(DETAIL)) parsed.detail = line.slice(DETAIL.length);
    else if (line.startsWith(RETRY)) {
      const body = line.slice(RETRY.length);
      const m = /^(\d+)\/(\d+)/.exec(body);
      if (m) {
        parsed.attempt = Number(m[1]);
        parsed.maxAttempts = Number(m[2]);
      }
      parsed.retrying = body.includes(RETRY_PENDING_MARKER);
    } else rest.push(line);
  }
  if (!parsed.hint) parsed.hint = manualHint(locale);
  if (rest.length > 0) {
    parsed.detail = [parsed.detail, ...rest].filter(Boolean).join(" / ");
  }
  parsed.retryable = parsed.retrying;
  return parsed;
}
