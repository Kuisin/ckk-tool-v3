"use client";

/**
 * FormBuilder — 項目の並べ替え・追加・削除・編集。
 *
 * 並べ替えは @dnd-kit（ドラッグ）。既存の SettingsReorderableList は ↑↓ ボタン
 * だけで、フォームのように項目が 20 も 30 もある画面では現実的でないため。
 * **ドラッグは描画層の話**で、順序の正規化（0..n-1 への振り直し）は
 * lib/form-schema.ts normalizeOrder が持つ — キーボードだけで組んでも、将来
 * API から作っても同じ結果になる。
 */

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Accordion,
  ActionIcon,
  Badge,
  Group,
  Paper,
  Stack,
  Text,
} from "@mantine/core";
import { IconGripVertical, IconPlus, IconTrash } from "@tabler/icons-react";
import { GhostButton } from "@/components/ui/buttons";
import { useTr } from "@/hooks/useTr";
import {
  FORM_FIELD_TYPES,
  type FormFieldDef,
  nextFieldKey,
  normalizeOrder,
} from "@/lib/form-schema";
import { FormFieldEditor } from "./FormFieldEditor";

function typeLabel(t: FormFieldDef["type"]): string {
  return FORM_FIELD_TYPES.find((x) => x.value === t)?.label ?? t;
}

function SortableField({
  field,
  index,
  siblings,
  onChange,
  onRemove,
  onSetTitle,
}: {
  field: FormFieldDef;
  index: number;
  siblings: FormFieldDef[];
  onChange: (next: FormFieldDef) => void;
  onRemove: () => void;
  onSetTitle: () => void;
}) {
  const tr = useTr();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `field-${index}` });

  return (
    <Paper
      p={0}
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
      }}
      withBorder
    >
      <Accordion chevronPosition="right" variant="filled">
        <Accordion.Item value={`field-${index}`}>
          <Group gap={0} wrap="nowrap">
            <ActionIcon
              aria-label={tr("ドラッグして並べ替え（スマホは長押し）")}
              color="gray"
              size="lg"
              style={{
                cursor: "grab",
                // 指で掴める大きさを確保する（design.md §20.1 の 44px）。
                minWidth: 44,
                minHeight: 44,
                // ドラッグ中にブラウザのスクロールと取り合わないようにする。
                touchAction: "none",
              }}
              variant="subtle"
              {...attributes}
              {...listeners}
            >
              <IconGripVertical size={16} />
            </ActionIcon>
            <Accordion.Control>
              <Group gap="xs" wrap="nowrap">
                <Text fw={500} size="sm">
                  {field.label.ja || tr("（名称未設定）")}
                </Text>
                <Badge color="gray" size="xs" variant="light">
                  {typeLabel(field.type)}
                </Badge>
                {field.required && (
                  <Badge color="red" size="xs" variant="light">
                    {tr("必須")}
                  </Badge>
                )}
                {field.isTitle && (
                  <Badge color="blue" size="xs" variant="light">
                    {tr("見出し")}
                  </Badge>
                )}
              </Group>
            </Accordion.Control>
            <ActionIcon
              aria-label={tr("この項目を削除")}
              color="red"
              mr="xs"
              onClick={onRemove}
              variant="subtle"
            >
              <IconTrash size={16} />
            </ActionIcon>
          </Group>
          <Accordion.Panel>
            <FormFieldEditor
              field={field}
              onChange={onChange}
              onSetTitle={onSetTitle}
              siblings={siblings}
            />
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </Paper>
  );
}

export function FormBuilder({
  fields,
  onChange,
}: {
  fields: FormFieldDef[];
  onChange: (next: FormFieldDef[]) => void;
}) {
  const tr = useTr();
  // タッチとマウスでセンサーを分けるのが要点。PointerSensor 1 本だと、スマホで
  // 縦にスワイプしただけでドラッグが始まり、ページがスクロールできなくなる。
  // タッチは「長押ししてから動かす」(delay) に限定し、指のわずかなブレは
  // tolerance で吸収する。
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = Number(String(active.id).replace("field-", ""));
    const to = Number(String(over.id).replace("field-", ""));
    onChange(normalizeOrder(arrayMove(fields, from, to)));
  };

  const addField = () => {
    // 空のキー・ラベルで作らない。空だと追加した瞬間に検証エラーになり、
    // 「項目を足したのに保存できない」ところから始まってしまう。
    const key = nextFieldKey(fields.map((f) => f.key));
    const n = fields.length + 1;
    onChange(
      normalizeOrder([
        ...fields,
        {
          key,
          label: { ja: `項目 ${n}`, en: "" },
          type: "text",
          required: false,
          order: fields.length,
        },
      ]),
    );
  };

  return (
    <Stack gap="sm">
      {fields.length === 0 && (
        <Text c="dimmed" size="sm">
          {tr("項目がありません。「項目を追加」から作ってください。")}
        </Text>
      )}
      <DndContext
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
        sensors={sensors}
      >
        <SortableContext
          items={fields.map((_, i) => `field-${i}`)}
          strategy={verticalListSortingStrategy}
        >
          <Stack gap="xs">
            {fields.map((field, i) => (
              <SortableField
                field={field}
                index={i}
                // biome-ignore lint/suspicious/noArrayIndexKey: 並び順そのものが同一性（項目キーは編集中に空になりうる）
                key={i}
                onChange={(next) =>
                  onChange(fields.map((f, idx) => (idx === i ? next : f)))
                }
                onRemove={() =>
                  onChange(normalizeOrder(fields.filter((_, idx) => idx !== i)))
                }
                onSetTitle={() =>
                  onChange(
                    fields.map((f, idx) => ({ ...f, isTitle: idx === i })),
                  )
                }
                siblings={fields.filter((_, idx) => idx !== i)}
              />
            ))}
          </Stack>
        </SortableContext>
      </DndContext>
      <Group>
        <GhostButton leftSection={<IconPlus size={14} />} onClick={addField}>
          {tr("項目を追加")}
        </GhostButton>
      </Group>
    </Stack>
  );
}
