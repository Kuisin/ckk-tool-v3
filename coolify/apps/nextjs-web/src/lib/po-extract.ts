import "server-only";

/**
 * po-extract.ts — 自前 AI サービス（po-extract）への入口。server-only.
 *
 * po-extract は 2 種類の口を持つ:
 *   - `/extract*` … 紙 → JSON（OCR + vision + LLM の 3 段）。注文請書の取込が使う
 *     （lib/intake.ts。重いので待ち行列を通す）。
 *   - `/generate*` … **紙のない**補助タスク。LLM を 1 回叩くだけで数秒。
 *     アプリ側の道具（マスタのキーワード生成など）はこちらを使う。
 *
 * ここは接続先（PO_EXTRACT_URL）と `/generate` の呼び出しだけを持つ。
 *
 * **どのモデルを使うかは呼び出しごとに決まる** — 管理画面（SY0E）の設定を
 * `ai-provider.ts` が復号し、`X-AI-Config` ヘッダに載せて渡す。設定が既定
 * （ローカル ollama）ならヘッダは付かず、po-extract は env どおりに動く。
 * 環境ごとに別インスタンス（po-extract-dev / po-extract-main）が立っており、
 * GPU の ollama だけを共有している — 詳細はルート CLAUDE.md。
 */

import { AiProviderConfigError, aiConfigHeaders } from "./ai-provider";

export const PO_EXTRACT_URL = (
  process.env.PO_EXTRACT_URL ?? "http://po-extract:8000"
).replace(/\/$/, "");

/**
 * 補助タスクの待ち上限（既定 3 分 / PO_EXTRACT_TASK_TIMEOUT_MS）。
 *
 * 文書抽出（15 分）とは別に短く取る。こちらは人がボタンを押して**画面の前で
 * 待っている**ので、GPU が抽出で埋まっていて順番が回ってこないなら、黙って
 * 待たせ続けるより「混んでいる」と返したほうがよい。
 */
const TASK_TIMEOUT_MS = Number(
  process.env.PO_EXTRACT_TASK_TIMEOUT_MS ?? 3 * 60_000,
);

/** 呼び出し側にそのまま見せてよい日本語メッセージを持つ失敗。 */
export class PoExtractError extends Error {}

/**
 * `/generate/<task>` を叩いて、そのタスクのスキーマどおりの JSON を得る。
 *
 * スキーマ拘束はサーバー側（ollama の format）でかかるので、形が崩れた応答は
 * 基本的に来ない。それでも壊れていたら PoExtractError にして返す — 呼び出し側は
 * message をそのまま画面に出せる。
 */
export async function generateJson<T>(
  task: string,
  input: unknown,
  opts?: { prompt?: string; timeoutMs?: number },
): Promise<T> {
  const endpoint = `${PO_EXTRACT_URL}/generate/${task}`;
  let aiHeaders: Record<string, string>;
  try {
    aiHeaders = await aiConfigHeaders();
  } catch (e) {
    // 設定側の問題（鍵が変わった等）。プロバイダに届く前なので、そのまま見せる。
    if (e instanceof AiProviderConfigError) throw new PoExtractError(e.message);
    throw e;
  }
  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...aiHeaders },
      body: JSON.stringify({ input, prompt: opts?.prompt }),
      signal: AbortSignal.timeout(opts?.timeoutMs ?? TASK_TIMEOUT_MS),
    });
  } catch (e) {
    if (e instanceof Error && e.name === "TimeoutError") {
      throw new PoExtractError(
        "AI の応答が時間内に返りませんでした（混雑している可能性があります）。しばらく待ってからもう一度お試しください。",
      );
    }
    console.error(`[po-extract] ${endpoint} へ接続できません`, e);
    throw new PoExtractError(
      "AI サービスに接続できませんでした。時間をおいてもう一度お試しください。",
    );
  }
  if (!res.ok) {
    const body = await res.text().catch(() => null);
    console.error(`[po-extract] ${endpoint} HTTP ${res.status}`, body);
    const ai = aiErrorMessage(body);
    throw new PoExtractError(
      ai ??
        (res.status === 404
          ? "AI サービスがこの機能に対応していません（更新が必要です）。"
          : "AI サービスの処理に失敗しました。時間をおいてもう一度お試しください。"),
    );
  }
  try {
    return (await res.json()) as T;
  } catch {
    throw new PoExtractError("AI の応答を読み取れませんでした。");
  }
}

/**
 * po-extract が返す `ai_<kind>: ...`（= プロバイダ由来の失敗）を日本語にする。
 * 当てはまらなければ null を返し、呼び出し側の既定文言に任せる。
 *
 * 分類の集合は `intake-extract-error.ts` と同じ（あちらは取込の失敗票、
 * こちらは画面へ即返すメッセージ）。
 */
export function aiErrorMessage(body: string | null): string | null {
  if (!body) return null;
  let detail = body;
  try {
    const parsed = JSON.parse(body) as { detail?: unknown };
    if (typeof parsed.detail === "string") detail = parsed.detail;
  } catch {
    // 素のテキストとして扱う
  }
  const kind = /^ai_([a-z_]+):/.exec(detail.trim())?.[1];
  if (!kind) return null;
  const messages: Record<string, string> = {
    auth: "AI プロバイダに API トークンを拒否されました。システム設定 → AI プロバイダ で確認してください。",
    model_not_found:
      "AI プロバイダに指定のモデルがありません。システム設定 → AI プロバイダ でモデル名を確認してください。",
    rate_limit:
      "AI プロバイダの利用上限に達しました。時間をおいてもう一度お試しください。",
    unreachable:
      "AI プロバイダへ接続できませんでした。システム管理者へ連絡してください。",
    bad_schema:
      "AI プロバイダがこの形式に対応していません。別のモデルをお試しください。",
    not_configured:
      "AI プロバイダが未設定です。システム設定 → AI プロバイダ を確認してください。",
    no_vision:
      "指定のモデルは画像を読み取れません。システム設定 → AI プロバイダ で画像対応モデルを指定してください。",
    upstream:
      "AI プロバイダでエラーが起きました。時間をおいてもう一度お試しください。",
  };
  return messages[kind] ?? null;
}
