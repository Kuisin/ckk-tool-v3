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
  PointerSensor,
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
import {
  FORM_FIELD_TYPES,
  type FormFieldDef,
  normalizeOrder,
} from "@/lib/form-schema";
import { FormFieldEditor } from "./FormFieldEditor";

function typeLabel(t: FormFieldDef["type"]): string {
  return FORM_FIELD_TYPES.find((x) => x.value === t)?.label ?? t;
}

function SortableField({
  field,
  index,
  siblingKeys,
  onChange,
  onRemove,
}: {
  field: FormFieldDef;
  index: number;
  siblingKeys: string[];
  onChange: (next: FormFieldDef) => void;
  onRemove: () => void;
}) {
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
              aria-label="ドラッグして並べ替え"
              color="gray"
              style={{ cursor: "grab" }}
              variant="subtle"
              {...attributes}
              {...listeners}
            >
              <IconGripVertical size={16} />
            </ActionIcon>
            <Accordion.Control>
              <Group gap="xs" wrap="nowrap">
                <Text fw={500} size="sm">
                  {field.label.ja || "（名称未設定）"}
                </Text>
                <Badge color="gray" size="xs" variant="light">
                  {typeLabel(field.type)}
                </Badge>
                {field.required && (
                  <Badge color="red" size="xs" variant="light">
                    必須
                  </Badge>
                )}
              </Group>
            </Accordion.Control>
            <ActionIcon
              aria-label="この項目を削除"
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
              siblingKeys={siblingKeys}
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
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
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

  const addField = () =>
    onChange(
      normalizeOrder([
        ...fields,
        {
          key: "",
          label: { ja: "", en: "" },
          type: "text",
          required: false,
          order: fields.length,
        },
      ]),
    );

  return (
    <Stack gap="sm">
      {fields.length === 0 && (
        <Text c="dimmed" size="sm">
          項目がありません。「項目を追加」から作ってください。
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
                siblingKeys={fields
                  .filter((_, idx) => idx !== i)
                  .map((f) => f.key)
                  .filter(Boolean)}
              />
            ))}
          </Stack>
        </SortableContext>
      </DndContext>
      <Group>
        <GhostButton leftSection={<IconPlus size={14} />} onClick={addField}>
          項目を追加
        </GhostButton>
      </Group>
    </Stack>
  );
}
