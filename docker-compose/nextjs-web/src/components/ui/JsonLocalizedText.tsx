/**
 * JsonLocalizedText.tsx — { ja, en } DB JSON field renderer
 * (_specs/design.md §10.6 / §17.4).
 *
 * TODO(i18n): wire to next-intl `useLocale()` once i18n is configured.
 * Until then the app locale is fixed to `ja` with the spec's ja fallback.
 */

import { type LocalizedText, localized } from "@/lib/format";

export function JsonLocalizedText({
  value,
}: {
  value: LocalizedText | null | undefined;
}) {
  return <>{localized(value)}</>;
}
