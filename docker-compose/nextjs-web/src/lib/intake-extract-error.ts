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
 */

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
 * 拾い直し（DB 検索）の両方がこの 1 語を見る。
 */
export const RETRY_PENDING_MARKER = "もう一度試します";

const CAUSE = "原因: ";
const HINT = "対処: ";
const DETAIL = "詳細: ";
const RETRY = "自動再試行: ";

const MANUAL_HINT =
  "何度も失敗する場合は「手入力に切り替え」で内容を直接入力してください";

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

/** HTTP で返ってきた失敗を分類する。 */
export function classifyHttpFailure(
  status: number,
  body?: string | null,
): ExtractFailure {
  const serverDetail = extractServerDetail(body);
  const detail = `po-extract HTTP ${status}${serverDetail ? ` — ${serverDetail}` : ""}`;

  if (status === 400) {
    return {
      summary: "取込ファイルを読み取れませんでした",
      cause:
        "抽出サーバーがファイルを開けませんでした（中身が空、または壊れた PDF・画像）",
      hint: "元のファイルが開けるか確認し、必要なら取り直して再取込してください",
      detail,
      retryable: false,
    };
  }
  if (status === 404) {
    return {
      summary: "抽出サーバーが注文請書の様式を知りません",
      cause:
        "po-extract に order-request の様式がありません（サーバーが古い、または PO_EXTRACT_URL の向き先が違う）",
      hint: "システム管理者へ連絡してください（po-extract の再デプロイが必要です）",
      detail,
      retryable: false,
    };
  }
  if (status === 413) {
    return {
      summary: "取込ファイルが大きすぎます",
      cause: "抽出サーバーが受け付ける上限を超えています",
      hint: "ページ数を減らすか、解像度を下げて取り直してください",
      detail,
      retryable: false,
    };
  }
  if (status === 502 && serverDetail?.includes("did not return valid JSON")) {
    return {
      summary: "AI が読み取り結果をまとめられませんでした",
      cause:
        "原稿が読み取りづらく（傾き・かすれ・手書き・複雑な表）、AI が所定の形式を返せませんでした",
      hint: `原稿の向き・解像度を確かめて再抽出してください。${MANUAL_HINT}`,
      detail,
      retryable: true,
    };
  }
  if (status === 502 || status === 503 || status === 504) {
    return {
      summary: "抽出サーバーが応答しませんでした",
      cause:
        "po-extract が起動途中・再起動中か、AI（ollama）が混み合って応答を返せませんでした",
      hint: "自動で再試行します。続く場合はシステム管理者へ連絡してください",
      detail,
      retryable: true,
    };
  }
  if (status === 429) {
    return {
      summary: "抽出サーバーが混み合っています",
      cause: "同時に処理できる件数を超えました",
      hint: "自動で再試行します。直らない場合は時間をおいて再抽出してください",
      detail,
      retryable: true,
    };
  }
  if (status >= 500) {
    return {
      summary: "抽出サーバーでエラーが起きました",
      cause: serverDetail ?? "po-extract の内部エラー（AI 呼び出しの失敗など）",
      hint: `自動で再試行します。${MANUAL_HINT}`,
      detail,
      retryable: true,
    };
  }
  return {
    summary: `抽出サーバーが要求を受け付けませんでした（HTTP ${status}）`,
    cause: serverDetail ?? undefined,
    hint: `再抽出しても直らない場合はシステム管理者へ連絡してください。${MANUAL_HINT}`,
    detail,
    retryable: false,
  };
}

/** 接続そのものに失敗した（サーバーが居ない・名前が引けない・切られた）。 */
export function classifyNetworkFailure(
  error: unknown,
  endpoint: string,
): ExtractFailure {
  const code = networkErrorCode(error);
  const known: Record<string, string> = {
    ECONNREFUSED: "抽出サーバーが起動していません（接続を拒否されました）",
    ENOTFOUND:
      "抽出サーバーの名前を解決できません（PO_EXTRACT_URL の設定違い）",
    EAI_AGAIN: "名前解決に失敗しました（DNS の一時障害）",
    ECONNRESET: "接続が途中で切れました（サーバー再起動中の可能性）",
    UND_ERR_SOCKET: "接続が途中で切れました（サーバー再起動中の可能性）",
  };
  return {
    summary: "抽出サーバーに接続できませんでした",
    cause: (code && known[code]) ?? "ネットワーク経路上の問題で到達できません",
    hint: "自動で再試行します。続く場合はシステム管理者へ連絡してください（po-extract の稼働確認）",
    detail: `${endpoint} — ${code ?? errorName(error)}: ${errorMessage(error)}`,
    retryable: true,
  };
}

/** 待ち時間切れ（こちら側で打ち切った）。 */
export function classifyTimeoutFailure(timeoutMs: number): ExtractFailure {
  const minutes = Math.round(timeoutMs / 60_000);
  return {
    summary: `抽出が時間内に終わりませんでした（${minutes}分）`,
    cause:
      "ページ数が多いか、抽出サーバー（po-extract / ollama）が混み合って処理が終わりませんでした",
    hint: `ページ数を減らすと通ることがあります。${MANUAL_HINT}`,
    detail: `timeout ${timeoutMs}ms`,
    retryable: true,
  };
}

/** 抽出の前後（ファイル読み出し・応答の解釈・正規化）で起きた失敗。 */
export function classifyLocalFailure(
  error: unknown,
  stage: "storage" | "response" | "normalize" | "unknown",
): ExtractFailure {
  const detail = `${errorName(error)}: ${errorMessage(error)}`;
  if (stage === "storage") {
    return {
      summary: "取込元ファイルを読み出せませんでした",
      cause: "ファイル保管（SeaweedFS）から原本を取得できません",
      hint: "自動で再試行します。続く場合はシステム管理者へ連絡してください",
      detail,
      retryable: true,
    };
  }
  if (stage === "response") {
    return {
      summary: "抽出サーバーの応答を解釈できませんでした",
      cause: "JSON として読めない応答が返りました",
      hint: `自動で再試行します。${MANUAL_HINT}`,
      detail,
      retryable: true,
    };
  }
  if (stage === "normalize") {
    return {
      summary: "抽出結果を取り込めませんでした",
      cause: "抽出結果の形が想定と違います",
      hint: MANUAL_HINT,
      detail,
      retryable: false,
    };
  }
  return {
    summary: "自動抽出に失敗しました",
    cause: errorMessage(error),
    hint: `再抽出しても直らない場合は、${MANUAL_HINT}`,
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
          ? `${attempts.attempt}/${attempts.maxAttempts} 回目が失敗 — ${RETRY_PENDING_MARKER}`
          : `${attempts.attempt}/${attempts.maxAttempts} 回試して失敗しました`),
    );
  }
  return lines.join("\n");
}

/**
 * 保存された文字列を読み戻す。旧形式（分類前の 1 行）は summary として扱い、
 * 対処だけ添える（画面が「次に何をするか」を必ず出せるように）。
 */
export function parseExtractError(stored: string): ParsedExtractError {
  const lines = stored
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const parsed: ParsedExtractError = {
    summary: lines[0] ?? "自動抽出に失敗しました",
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
  if (!parsed.hint) parsed.hint = MANUAL_HINT;
  if (rest.length > 0) {
    parsed.detail = [parsed.detail, ...rest].filter(Boolean).join(" / ");
  }
  parsed.retryable = parsed.retrying;
  return parsed;
}
