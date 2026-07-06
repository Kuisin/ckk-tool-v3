"use client";

/**
 * AddComponentModal.tsx — 採番構成 (MS0C) の構成要素 追加モーダル。
 *
 * 種別（kind）ごとに入力フィールドを切り替える。直径・全長は mm 入力から
 * コード（TEXT(径×10,'000') / TEXT(全長,'000')）をライブ導出して表示する。
 */

import { NumberInput, Select, Stack, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  type ComponentTableKind,
  createDiameter,
  createGrade,
  createKind,
  createLengthVariant,
  createManufacturer,
  createShape,
  createSurfaceFinish,
} from "@/app/(dashboard)/master/material-numbering/actions";
import { FormModal, type ModalBaseProps } from "@/components/ui/modals";
import { diameterCodeFromMm, lengthCodeFromMm } from "@/lib/material-code";
import type { Option } from "@/lib/mock";
import type { ActionResult } from "@/lib/server-action";

const TITLES: Record<ComponentTableKind, string> = {
  manufacturer: "メーカーの追加",
  grade: "メーカー材種の追加",
  shape: "形状の追加",
  kind: "種類の追加",
  finish: "黒皮・研磨区分の追加",
  diameter: "直径の追加",
  length: "全長の追加",
};

export function AddComponentModal({
  opened,
  onClose,
  kind,
  parentOptions = [],
}: ModalBaseProps & {
  kind: ComponentTableKind;
  /** grade: メーカー options / kind: 形状 options。 */
  parentOptions?: Option[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [parentCode, setParentCode] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [nameJa, setNameJa] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [mm, setMm] = useState<number | string>("");
  const [customLabel, setCustomLabel] = useState("");

  const resetAndClose = () => {
    setParentCode(null);
    setCode("");
    setNameJa("");
    setNameEn("");
    setMm("");
    setCustomLabel("");
    onClose();
  };

  const mmValue = typeof mm === "number" ? mm : Number(mm) || 0;
  const derivedCode = (() => {
    try {
      if (kind === "diameter") return diameterCodeFromMm(mmValue);
      if (kind === "length") return lengthCodeFromMm(mmValue);
    } catch {
      return "—";
    }
    return "—";
  })();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    startTransition(async () => {
      let res: ActionResult;
      switch (kind) {
        case "manufacturer":
          res = await createManufacturer({ code, nameJa, nameEn });
          break;
        case "grade":
          res = await createGrade({
            manufacturerCode: parentCode ?? "",
            code,
            nameJa,
            nameEn,
          });
          break;
        case "shape":
          res = await createShape({ code, nameJa, nameEn });
          break;
        case "kind":
          res = await createKind({
            shapeCode: parentCode ?? "",
            code,
            nameJa,
            nameEn,
          });
          break;
        case "finish":
          res = await createSurfaceFinish({ code, nameJa, nameEn });
          break;
        case "diameter":
          res = await createDiameter({ diameterMm: mmValue });
          break;
        case "length":
          res = await createLengthVariant({ lengthMm: mmValue, customLabel });
          break;
      }
      if (res.ok) {
        notifications.show({
          title: "追加しました",
          message: "構成要素を追加しました",
          color: "green",
        });
        resetAndClose();
        router.refresh();
      } else {
        notifications.show({
          title: "エラー",
          message: res.error,
          color: "red",
        });
      }
    });
  };

  const isDimension = kind === "diameter" || kind === "length";

  return (
    <FormModal
      loading={isPending}
      onClose={resetAndClose}
      onSubmit={handleSubmit}
      opened={opened}
      size="md"
      submitLabel="追加"
      title={TITLES[kind]}
    >
      <Stack gap="sm">
        {kind === "grade" && (
          <Select
            data={parentOptions}
            label="メーカー"
            onChange={setParentCode}
            placeholder="メーカーを選択"
            value={parentCode}
            withAsterisk
          />
        )}
        {kind === "kind" && (
          <Select
            data={parentOptions}
            label="形状"
            onChange={setParentCode}
            placeholder="形状を選択"
            value={parentCode}
            withAsterisk
          />
        )}
        {isDimension ? (
          <>
            <NumberInput
              decimalScale={kind === "diameter" ? 1 : 0}
              description={`コード: ${derivedCode}`}
              label={kind === "diameter" ? "直径 (mm)" : "全長 (mm)"}
              max={kind === "diameter" ? 99.9 : 999}
              min={kind === "diameter" ? 0.1 : 1}
              onChange={setMm}
              step={kind === "diameter" ? 0.1 : 1}
              value={mm}
              withAsterisk
            />
            {kind === "length" && (
              <TextInput
                label="カスタム識別（任意）"
                onChange={(e) => setCustomLabel(e.currentTarget.value)}
                placeholder="例: 特注 330L"
                value={customLabel}
              />
            )}
          </>
        ) : (
          <>
            <TextInput
              description={
                kind === "grade" || kind === "kind"
                  ? "2桁（例: 01, B5）"
                  : "英大文字1文字（例: A）"
              }
              label="コード"
              maxLength={kind === "grade" || kind === "kind" ? 2 : 1}
              onChange={(e) => setCode(e.currentTarget.value.toUpperCase())}
              value={code}
              withAsterisk
            />
            <TextInput
              label="名称（日本語）"
              onChange={(e) => setNameJa(e.currentTarget.value)}
              value={nameJa}
              withAsterisk
            />
            <TextInput
              label="名称（English）"
              onChange={(e) => setNameEn(e.currentTarget.value)}
              value={nameEn}
            />
          </>
        )}
      </Stack>
    </FormModal>
  );
}
