"use client";

/**
 * NumberStepper.tsx — タブレット向けの数量入力（小さなスピナー矢印の代わりに
 * 大きな [−] [+] ボタン + 直接入力）。
 *
 * - フィールドは `inputMode="numeric"` で**数字キーボード**を出す（直接入力可）。
 * - [−]/[+] は 44px 以上のタッチターゲット（design.md §20.1）。
 * - 整数のみ・下限 0（既定）。min/max でクランプ。
 */

import { ActionIcon, Group, NumberInput, Stack, Text } from "@mantine/core";
import { IconMinus, IconPlus } from "@tabler/icons-react";
import { useI18n } from "../I18nProvider";

type Props = {
  value: number;
  onChange: (value: number) => void;
  label?: string;
  ariaLabel?: string;
  min?: number;
  max?: number;
  step?: number;
  /** コンパクト表示（行内で使うとき）。 */
  compact?: boolean;
  disabled?: boolean;
};

export function NumberStepper({
  value,
  onChange,
  label,
  ariaLabel,
  min = 0,
  max,
  step = 1,
  compact = false,
  disabled = false,
}: Props) {
  const { m } = useI18n();
  const btn = compact ? 40 : 54;
  const fieldH = compact ? 40 : 54;
  const a11y = ariaLabel ?? label ?? m.common.quantity;

  const clamp = (n: number): number => {
    if (!Number.isFinite(n)) return min;
    let r = Math.trunc(n);
    if (min != null) r = Math.max(min, r);
    if (max != null) r = Math.min(max, r);
    return r;
  };
  const base = Number.isFinite(value) ? value : min;

  return (
    <Stack gap={4}>
      {label && (
        <Text fw={500} size="sm">
          {label}
        </Text>
      )}
      <Group gap="xs" wrap="nowrap">
        <ActionIcon
          aria-label={`${a11y} −`}
          disabled={disabled || base <= min}
          onClick={() => onChange(clamp(base - step))}
          radius="sm"
          size={btn}
          variant="light"
        >
          <IconMinus size={compact ? 18 : 24} />
        </ActionIcon>
        <NumberInput
          allowDecimal={false}
          allowNegative={false}
          aria-label={a11y}
          disabled={disabled}
          hideControls
          inputMode="numeric"
          max={max}
          min={min}
          onChange={(v) =>
            onChange(clamp(typeof v === "number" ? v : Number.parseInt(v, 10)))
          }
          step={step}
          style={{ flex: 1 }}
          styles={{
            input: {
              textAlign: "center",
              fontSize: compact ? 18 : 22,
              fontWeight: 700,
              height: fieldH,
            },
          }}
          value={value}
        />
        <ActionIcon
          aria-label={`${a11y} +`}
          disabled={disabled || (max != null && base >= max)}
          onClick={() => onChange(clamp(base + step))}
          radius="sm"
          size={btn}
          variant="light"
        >
          <IconPlus size={compact ? 18 : 24} />
        </ActionIcon>
      </Group>
    </Stack>
  );
}
