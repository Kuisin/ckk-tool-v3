"use client";

/**
 * PinKeypad.tsx — タブレット向け数字キーパッド（既定: PIN 4〜6 桁）。
 * minLength/maxLength で固定長にも使える（端末設定コードは 6 桁固定）。
 */

import { Box, Button, Center, SimpleGrid, Stack, Text } from "@mantine/core";
import { IconBackspace, IconCheck } from "@tabler/icons-react";
import { useState } from "react";

type Props = {
  title: string;
  subtitle?: string;
  submitting?: boolean;
  minLength?: number;
  maxLength?: number;
  onSubmit: (pin: string) => void;
};

export function PinKeypad({
  title,
  subtitle,
  submitting = false,
  minLength: MIN_LEN = 4,
  maxLength: MAX_LEN = 6,
  onSubmit,
}: Props) {
  const [pin, setPin] = useState("");

  const push = (d: string) => {
    if (pin.length < MAX_LEN) setPin(pin + d);
  };
  const pop = () => setPin(pin.slice(0, -1));
  const submit = () => {
    if (pin.length >= MIN_LEN && !submitting) {
      onSubmit(pin);
      setPin("");
    }
  };

  return (
    <Stack align="center" gap="md" maw={360} mx="auto" w="100%">
      <Text fw={600} size="xl">
        {title}
      </Text>
      {subtitle && (
        <Text c="dimmed" size="sm" ta="center">
          {subtitle}
        </Text>
      )}

      <Center>
        <Box style={{ display: "flex", gap: 12 }}>
          {Array.from({ length: MAX_LEN }, (_, i) => (
            <Box
              h={18}
              // biome-ignore lint/suspicious/noArrayIndexKey: 固定長の表示ドット
              key={i}
              style={{
                borderRadius: "50%",
                border: "2px solid var(--mantine-color-gray-5)",
                background:
                  i < pin.length
                    ? "var(--mantine-color-blue-6)"
                    : "transparent",
                opacity: i >= MIN_LEN && i >= pin.length ? 0.35 : 1,
              }}
              w={18}
            />
          ))}
        </Box>
      </Center>

      <SimpleGrid cols={3} spacing="sm" w="100%">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <Button
            disabled={submitting}
            key={d}
            onClick={() => push(d)}
            size="xl"
            variant="default"
          >
            {d}
          </Button>
        ))}
        <Button
          aria-label="1文字削除"
          color="gray"
          disabled={submitting}
          onClick={pop}
          size="xl"
          variant="subtle"
        >
          <IconBackspace size={26} />
        </Button>
        <Button
          disabled={submitting}
          onClick={() => push("0")}
          size="xl"
          variant="default"
        >
          0
        </Button>
        <Button
          aria-label="確定"
          color="blue"
          disabled={pin.length < MIN_LEN}
          loading={submitting}
          onClick={submit}
          size="xl"
        >
          <IconCheck size={26} />
        </Button>
      </SimpleGrid>
    </Stack>
  );
}
