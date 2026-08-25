"use client";

import {
  publishFormFields,
  updateFormSettings,
} from "@/app/(dashboard)/general/forms/actions";
import type { FormFieldDef } from "@/lib/form-schema";
import { FormEditor, type FormSettingsValues } from "./FormEditor";

export function EditFormClient({
  code,
  settings,
  fields,
}: {
  code: string;
  settings: FormSettingsValues;
  fields: FormFieldDef[];
}) {
  return (
    <FormEditor
      code={code}
      initialFields={fields}
      initialSettings={settings}
      mode="edit"
      onPublishFields={async (next) => {
        const result = await publishFormFields(code, next);
        return result.ok ? { ok: true } : { ok: false, error: result.error };
      }}
      onSaveSettings={async (values) => {
        const result = await updateFormSettings(code, values);
        return result.ok
          ? { ok: true, code }
          : { ok: false, error: result.error };
      }}
    />
  );
}
