"use client";

import {
  publishFormFields,
  updateFormSettings,
} from "@/app/(dashboard)/general/forms/actions";
import type { FormSectionDef } from "@/lib/form-branching";
import type { FormFieldDef } from "@/lib/form-schema";
import { FormEditor, type FormSettingsValues } from "./FormEditor";

export function EditFormClient({
  code,
  settings,
  fields,
  sections,
}: {
  code: string;
  settings: FormSettingsValues;
  fields: FormFieldDef[];
  sections: FormSectionDef[];
}) {
  return (
    <FormEditor
      code={code}
      initialFields={fields}
      initialSections={sections}
      initialSettings={settings}
      mode="edit"
      onPublishFields={async (next, nextSections) => {
        const result = await publishFormFields(code, next, nextSections);
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
