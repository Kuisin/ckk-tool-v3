/**
 * /manual/search — 公開マニュアルの検索 API（Orama）。
 *
 * import しているのは manualSource のみ — 管理マニュアル
 * （internal-source.ts）は import 禁止（公開インデックスへの混入防止）。
 */

import { createTokenizer as createJapaneseTokenizer } from "@orama/tokenizers/japanese";
import { createTokenizer as createMandarinTokenizer } from "@orama/tokenizers/mandarin";
import { createFromSource } from "fumadocs-core/search/server";
import { manualSource } from "@/lib/manual-source";

export const { GET } = createFromSource(manualSource, {
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
