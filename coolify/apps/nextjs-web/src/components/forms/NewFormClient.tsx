"use client";

import { createForm } from "@/app/(dashboard)/general/forms/actions";
import { EMPTY_SETTINGS, FormEditor } from "./FormEditor";

/**
 * 新規作成は「設定だけ」を保存してから詳細へ送る。項目はフォームが出来て
 * から組む（バージョン 1 の公開）— 空のフォームを公開してしまわないため。
 */
export function NewFormClient() {
  return (
    <FormEditor
      initialFields={[]}
      initialSettings={EMPTY_SETTINGS}
      mode="new"
      onSaveSettings={async (values) => {
        const result = await createForm(values);
        return result.ok
          ? { ok: true, code: result.data.code }
          : { ok: false, error: result.error };
      }}
    />
  );
}
