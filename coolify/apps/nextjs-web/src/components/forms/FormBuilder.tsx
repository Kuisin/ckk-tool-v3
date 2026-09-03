"use client";

/**
 * FormBuilder — 項目の並べ替え・追加・削除・編集、そしてセクション（複数ページ）。
 *
 * 並べ替えは @dnd-kit（ドラッグ）。既存の SettingsReorderableList は ↑↓ ボタン
 * だけで、フォームのように項目が 20 も 30 もある画面では現実的でないため。
 * **ドラッグは描画層の話**で、順序の正規化（0..n-1 への振り直し）は
 * lib/form-schema.ts normalizeOrder / lib/form-branching.ts
 * normalizeSectionOrder が持つ — キーボードだけで組んでも、将来 API から
 * 作っても同じ結果になる。
 *
 * **セクションは既定オフ**。`sections` が空配列の間は今までどおり 1 ページの
 * 平らな項目リストで、見た目も挙動も変わらない。「セクションに分ける」を
 * 押した時点で初めて、いまある項目をまとめて「セクション 1」に入れ、以後は
 * セクションごとの入れ子表示になる（最後の 1 つを消すと平らな表示へ戻る —
 * 元に戻せる一方通行にしない）。
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
  TextInput,
  Tooltip,
} from "@mantine/core";
import { IconGripVertical, IconPlus, IconTrash } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { GhostButton } from "@/components/ui/buttons";
import {
  type FormSectionDef,
  normalizeSectionOrder,
} from "@/lib/form-branching";
import {
  type FormFieldDef,
  formFieldTypes,
  nextFieldKey,
  normalizeOrder,
} from "@/lib/form-schema";
import { FormFieldEditor } from "./FormFieldEditor";
import { FormSectionRulesEditor } from "./FormSectionRulesEditor";

function typeLabel(
  t: FormFieldDef["type"],
  tr: ReturnType<typeof useTranslations>,
): string {
  return formFieldTypes(tr).find((x) => x.value === t)?.label ?? t;
}

let sectionSeq = 0;
function nextSectionKey(): string {
  sectionSeq += 1;
  return `section-${Date.now()}-${sectionSeq}`;
}

function SortableField({
  field,
  index,
  siblings,
  sectionOptions,
  onChange,
  onRemove,
  onSetTitle,
  onMoveSection,
}: {
  field: FormFieldDef;
  index: number;
  siblings: FormFieldDef[];
  /** 空 = セクション未使用（セレクトを出さない）。 */
  sectionOptions: { value: string; label: string }[];
  onChange: (next: FormFieldDef) => void;
  onRemove: () => void;
  onSetTitle: () => void;
  onMoveSection: (targetSectionKey: string) => void;
}) {
  const tr = useTranslations();
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
              aria-label={tr("forms.formBuilder.dragToReorderPressAndHold")}
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
                  {field.label.ja || tr("common.unnamed")}
                </Text>
                <Badge color="gray" size="xs" variant="light">
                  {typeLabel(field.type, tr)}
                </Badge>
                {field.required && (
                  <Badge color="red" size="xs" variant="light">
                    {tr("common.required2")}
                  </Badge>
                )}
                {field.isTitle && (
                  <Badge color="blue" size="xs" variant="light">
                    {tr("common.heading")}
                  </Badge>
                )}
              </Group>
            </Accordion.Control>
            <ActionIcon
              aria-label={tr("forms.formBuilder.removeThisItem")}
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
              onMoveSection={onMoveSection}
              onSetTitle={onSetTitle}
              sectionOptions={sectionOptions}
              siblings={siblings}
            />
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </Paper>
  );
}

/**
 * 項目の並べ替え・追加・削除・編集の本体。**subset を編集する** —
 * セクション未使用なら全項目、セクション使用中なら 1 セクション分だけを
 * 受け取る。セクション間の移動（onMoveSection）だけは呼び出し元
 * （FormBuilder）が全体を見て処理する。
 */
function FieldListEditor({
  fields,
  onChange,
  sectionKey,
  sectionOptions,
  onMoveSection,
}: {
  fields: FormFieldDef[];
  onChange: (next: FormFieldDef[]) => void;
  /** 新規追加した項目に付ける sectionKey。null = セクション未使用。 */
  sectionKey: string | null;
  sectionOptions: { value: string; label: string }[];
  onMoveSection: (field: FormFieldDef, targetSectionKey: string) => void;
}) {
  const tr = useTranslations();
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
          ...(sectionKey ? { sectionKey } : {}),
        },
      ]),
    );
  };

  return (
    <Stack gap="sm">
      {fields.length === 0 && (
        <Text c="dimmed" size="sm">
          {tr("forms.formBuilder.thereAreNoItemsCreateOne")}
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
                onMoveSection={(target) => onMoveSection(field, target)}
                onRemove={() =>
                  onChange(normalizeOrder(fields.filter((_, idx) => idx !== i)))
                }
                onSetTitle={() =>
                  onChange(
                    fields.map((f, idx) => ({ ...f, isTitle: idx === i })),
                  )
                }
                sectionOptions={sectionOptions}
                siblings={fields.filter((_, idx) => idx !== i)}
              />
            ))}
          </Stack>
        </SortableContext>
      </DndContext>
      <Group>
        <GhostButton leftSection={<IconPlus size={14} />} onClick={addField}>
          {tr("common.addAnItem")}
        </GhostButton>
      </Group>
    </Stack>
  );
}

function fieldsInSection(
  fields: FormFieldDef[],
  sectionKey: string,
): FormFieldDef[] {
  return fields.filter((f) => f.sectionKey === sectionKey);
}

function SortableSection({
  section,
  index,
  fields,
  allFields,
  sections,
  sectionOptions,
  onFieldsChange,
  onMoveSection,
  onTitleChange,
  onRulesChange,
  onRemove,
  removable,
}: {
  section: FormSectionDef;
  index: number;
  /** このセクション分だけ（項目リストの編集対象）。 */
  fields: FormFieldDef[];
  /** フォーム全項目（分岐ルールの条件候補用）。 */
  allFields: FormFieldDef[];
  sections: FormSectionDef[];
  sectionOptions: { value: string; label: string }[];
  onFieldsChange: (next: FormFieldDef[]) => void;
  onMoveSection: (field: FormFieldDef, targetSectionKey: string) => void;
  onTitleChange: (ja: string) => void;
  onRulesChange: (rules: FormSectionDef["rules"]) => void;
  onRemove: () => void;
  removable: boolean;
}) {
  const tr = useTranslations();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `section-${section.key}` });

  return (
    <Paper
      p="md"
      radius="md"
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
      }}
      withBorder
    >
      <Stack gap="sm">
        <Group gap="xs" wrap="nowrap">
          <ActionIcon
            aria-label={tr("forms.formBuilder.dragToReorderSection")}
            color="gray"
            size="lg"
            style={{ cursor: "grab", minWidth: 44, minHeight: 44 }}
            variant="subtle"
            {...attributes}
            {...listeners}
          >
            <IconGripVertical size={16} />
          </ActionIcon>
          <Badge color="blue" size="lg" variant="light">
            {index + 1}
          </Badge>
          <TextInput
            flex={1}
            onChange={(e) => onTitleChange(e.currentTarget.value)}
            placeholder={tr("forms.formBuilder.sectionTitlePlaceholder")}
            value={section.title.ja}
          />
          <Badge color="gray" variant="light">
            {tr("forms.formBuilder.itemCount", { count: fields.length })}
          </Badge>
          <Tooltip
            disabled={fields.length === 0}
            label={tr("forms.formBuilder.moveOrDeleteItemsFirst")}
          >
            <ActionIcon
              aria-label={tr("forms.formBuilder.removeThisSection")}
              color="red"
              disabled={!removable || fields.length > 0}
              onClick={onRemove}
              variant="subtle"
            >
              <IconTrash size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>

        <FieldListEditor
          fields={fields}
          onChange={onFieldsChange}
          onMoveSection={onMoveSection}
          sectionKey={section.key}
          sectionOptions={sectionOptions}
        />

        <FormSectionRulesEditor
          allFields={allFields}
          onChange={onRulesChange}
          section={section}
          sections={sections}
        />
      </Stack>
    </Paper>
  );
}

export function FormBuilder({
  fields,
  onChange,
  sections,
  onSectionsChange,
}: {
  fields: FormFieldDef[];
  onChange: (next: FormFieldDef[]) => void;
  sections: FormSectionDef[];
  onSectionsChange: (next: FormSectionDef[]) => void;
}) {
  const tr = useTranslations();

  const orderedSections = [...sections].sort((a, b) => a.order - b.order);
  const sectionOptions = orderedSections.map((s, i) => ({
    value: s.key,
    label: `${i + 1}. ${s.title.ja || tr("common.unnamed")}`,
  }));

  const sectionsSensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const enableSections = () => {
    const key = nextSectionKey();
    onSectionsChange([
      {
        key,
        title: { ja: tr("forms.formBuilder.section1"), en: "" },
        order: 0,
        rules: [],
      },
    ]);
    onChange(fields.map((f) => ({ ...f, sectionKey: key })));
  };

  const addSection = () => {
    const key = nextSectionKey();
    onSectionsChange(
      normalizeSectionOrder([
        ...sections,
        {
          key,
          title: {
            ja: tr("forms.formBuilder.sectionN", { n: sections.length + 1 }),
            en: "",
          },
          order: sections.length,
          rules: [],
        },
      ]),
    );
  };

  const removeSection = (key: string) => {
    const remaining = sections.filter((s) => s.key !== key);
    if (remaining.length === 0) {
      // 最後の 1 つを消したら平らな表示へ戻す。
      onSectionsChange([]);
      onChange(fields.map(({ sectionKey: _drop, ...rest }) => rest));
      return;
    }
    // このセクションを遷移先にしていたルールは「次のセクションへ」の既定へ
    // 戻す（target を消して fallback に任せる）。
    onSectionsChange(
      normalizeSectionOrder(
        remaining.map((s) => ({
          ...s,
          rules: s.rules.filter((r) => r.target !== key),
        })),
      ),
    );
  };

  /**
   * 別セクションへ移動した項目は、その先頭ではなく**末尾**に着地させる
   * （どこに挟まったか探させない、分かりやすい着地点）。normalizeOrder は
   * 既存の order 値でソートし直してから 0..n-1 を振り直すだけなので、単に
   * 配列の並びを組み替えても効かない — 移動する項目の order を移動先
   * セクションの最大値より大きくして、ソート結果として末尾に来るようにする。
   */
  const moveFieldToSection = (
    field: FormFieldDef,
    targetSectionKey: string,
  ) => {
    if (field.sectionKey === targetSectionKey) return;
    const targetFields = fieldsInSection(fields, targetSectionKey);
    const maxOrder = targetFields.reduce((m, f) => Math.max(m, f.order), -1);
    onChange(
      normalizeOrder(
        fields.map((f) =>
          f === field
            ? { ...f, sectionKey: targetSectionKey, order: maxOrder + 1 }
            : f,
        ),
      ),
    );
  };

  const handleSectionsDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = orderedSections.findIndex(
      (s) => `section-${s.key}` === active.id,
    );
    const to = orderedSections.findIndex((s) => `section-${s.key}` === over.id);
    if (from === -1 || to === -1) return;
    onSectionsChange(
      normalizeSectionOrder(arrayMove(orderedSections, from, to)),
    );
  };

  if (sections.length === 0) {
    return (
      <Stack gap="sm">
        <FieldListEditor
          fields={fields}
          onChange={onChange}
          onMoveSection={() => {}}
          sectionKey={null}
          sectionOptions={[]}
        />
        <Group>
          <GhostButton onClick={enableSections}>
            {tr("forms.formBuilder.splitIntoSections")}
          </GhostButton>
        </Group>
      </Stack>
    );
  }

  return (
    <Stack gap="md">
      <DndContext
        collisionDetection={closestCenter}
        onDragEnd={handleSectionsDragEnd}
        sensors={sectionsSensors}
      >
        <SortableContext
          items={orderedSections.map((s) => `section-${s.key}`)}
          strategy={verticalListSortingStrategy}
        >
          <Stack gap="md">
            {orderedSections.map((section, i) => (
              <SortableSection
                allFields={fields}
                fields={fieldsInSection(fields, section.key)}
                index={i}
                key={section.key}
                onFieldsChange={(next) => {
                  const others = fields.filter(
                    (f) => f.sectionKey !== section.key,
                  );
                  onChange(normalizeOrder([...others, ...next]));
                }}
                onMoveSection={moveFieldToSection}
                onRemove={() => removeSection(section.key)}
                onRulesChange={(rules) =>
                  onSectionsChange(
                    sections.map((s) =>
                      s.key === section.key ? { ...s, rules } : s,
                    ),
                  )
                }
                onTitleChange={(ja) =>
                  onSectionsChange(
                    sections.map((s) =>
                      s.key === section.key
                        ? { ...s, title: { ...s.title, ja } }
                        : s,
                    ),
                  )
                }
                removable
                section={section}
                sectionOptions={sectionOptions}
                sections={orderedSections}
              />
            ))}
          </Stack>
        </SortableContext>
      </DndContext>
      <Group>
        <GhostButton leftSection={<IconPlus size={14} />} onClick={addSection}>
          {tr("forms.formBuilder.addASection")}
        </GhostButton>
      </Group>
    </Stack>
  );
}
