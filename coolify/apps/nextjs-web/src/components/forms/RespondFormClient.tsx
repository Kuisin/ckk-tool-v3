"use client";

import { useRouter } from "next/navigation";
import {
  submitResponse,
  updateResponse,
} from "@/app/(dashboard)/general/forms/actions";
import { useFormat } from "@/components/layout/PreferencesProvider";
import type {
  FormAnswerValue,
  FormAvailability,
  FormFieldDef,
} from "@/lib/form-schema";
import { RespondForm } from "./RespondForm";

export function RespondFormClient({
  code,
  title,
  description,
  fields,
  availability,
  closesAt,
  existing,
}: {
  code: string;
  title: string;
  description: string | null;
  fields: FormFieldDef[];
  availability: FormAvailability;
  closesAt: string | null;
  existing: {
    responseNumber: string;
    answers: Record<string, unknown>;
    version: number;
  } | null;
}) {
  const router = useRouter();
  const fmt = useFormat();

  return (
    <RespondForm
      allowDraft={!existing}
      availability={availability}
      closesAtLabel={closesAt ? fmt.dateTime(closesAt) : null}
      description={description}
      fields={fields}
      initialAnswers={
        (existing?.answers ?? {}) as Record<string, FormAnswerValue>
      }
      onCancel={() => router.push(`/general/forms/${code}`)}
      onSubmit={async (answers, asDraft) => {
        if (existing) {
          const r = await updateResponse(existing.responseNumber, answers);
          if (r.ok)
            router.push(
              `/general/forms/${code}/responses/${existing.responseNumber}`,
            );
          return r.ok ? { ok: true } : { ok: false, error: r.error };
        }
        const r = await submitResponse(code, answers, asDraft);
        if (r.ok)
          router.push(
            `/general/forms/${code}/responses/${r.data.responseNumber}`,
          );
        return r.ok ? { ok: true } : { ok: false, error: r.error };
      }}
      submitLabel={existing ? "更新" : "送信"}
      title={title}
    />
  );
}
