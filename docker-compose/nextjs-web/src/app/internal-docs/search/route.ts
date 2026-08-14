/**
 * /internal-docs/search — 社内ドキュメントの検索 API（要ログイン）。
 * proxy.ts が /internal-docs を包含しているが、ここでも 401 を返す
 * （防御の深層化）。
 */

import { createTokenizer as createJapaneseTokenizer } from "@orama/tokenizers/japanese";
import { createTokenizer as createMandarinTokenizer } from "@orama/tokenizers/mandarin";
import { createFromSource } from "fumadocs-core/search/server";
import { auth } from "@/auth";
import { internalSource } from "@/lib/internal-source";

const handler = createFromSource(internalSource, {
  localeMap: {
    ja: {
      components: { tokenizer: createJapaneseTokenizer() },
      search: { threshold: 0, tolerance: 0 },
    },
    zh: {
      components: { tokenizer: createMandarinTokenizer() },
      search: { threshold: 0, tolerance: 0 },
    },
    en: "english",
  },
});

export async function GET(req: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }
  return handler.GET(req);
}
