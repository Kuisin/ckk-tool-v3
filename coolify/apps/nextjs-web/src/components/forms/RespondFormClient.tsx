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
  drafts = [],
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
    status: string;
  } | null;
  /** 書きかけの下書き（新規回答のときだけ渡ってくる）。 */
  drafts?: { responseNumber: string; href: string }[];
}) {
  const router = useRouter();
  const fmt = useFormat();

  const editingDraft = existing?.status === "DRAFT";
  const view = (n: string) => `/f/${code}/${encodeURIComponent(n)}`;

  return (
    <RespondForm
      // 下書きに保存できるのは「まだ出していない」ものだけ。新規と、
      // 下書きを開き直したときの両方が該当する（提出済みは戻せない）。
      allowDraft={!existing || editingDraft}
      availability={availability}
      closesAtLabel={closesAt ? fmt.dateTime(closesAt) : null}
      description={description}
      drafts={drafts}
      fields={fields}
      initialAnswers={
        (existing?.answers ?? {}) as Record<string, FormAnswerValue>
      }
      onCancel={() =>
        router.push(existing ? view(existing.responseNumber) : "/")
      }
      onSubmit={async (answers, asDraft) => {
        if (existing) {
          const r = await updateResponse(
            existing.responseNumber,
            answers,
            asDraft,
          );
          // 下書きを保存しただけなら画面に留まる（書き続けるため）。
          if (r.ok && !asDraft) router.push(view(existing.responseNumber));
          if (r.ok && asDraft) router.refresh();
          return r.ok ? { ok: true } : { ok: false, error: r.error };
        }
        const r = await submitResponse(code, answers, asDraft);
        // 新規の下書きは**その下書きの編集 URL へ移す** — 移さないと次の
        // 「下書き保存」がもう 1 件作ってしまい、書きかけが増えていく。
        if (r.ok)
          router.push(
            asDraft
              ? `${view(r.data.responseNumber)}/edit`
              : view(r.data.responseNumber),
          );
        return r.ok ? { ok: true } : { ok: false, error: r.error };
      }}
      // 編集は受付終了後も許される設定があるので、送信可否は別に渡す。
      // 最終判定はサーバ（canEditResponse / formAvailability）がやり直す。
      submitLabel={editingDraft ? "提出する" : existing ? "更新" : "送信"}
      submittable={
        existing
          ? editingDraft
            ? availability === "OPEN"
            : true
          : availability === "OPEN"
      }
      title={title}
    />
  );
}
