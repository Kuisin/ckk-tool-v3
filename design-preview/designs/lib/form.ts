/**
 * form.ts — Shared Zod ↔ @mantine/form resolver.
 *
 * `@mantine/form`'s official `zodResolver` (from `mantine-form-zod-resolver`)
 * isn't bundled in this preview, so every form previously copied this helper.
 * Unified here for maintainability — forms do `validate: zodResolver(schema)`.
 */

import type { FormErrors } from '@mantine/form';
import type { z } from 'zod';

export function zodResolver<T>(schema: z.ZodType<T>) {
  return (values: T): FormErrors => {
    const result = schema.safeParse(values);
    if (result.success) return {};
    const errors: FormErrors = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join('.');
      if (key && !errors[key]) errors[key] = issue.message;
    }
    return errors;
  };
}
