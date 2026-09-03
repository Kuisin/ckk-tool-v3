"use client";

import { Alert, Button, Stack, Text, TextInput } from "@mantine/core";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
  requestLinkOtp,
  verifyLinkOtp,
} from "@/app/(portal)/portal/d/[token]/actions";

export function PortalLinkVerifyForm({ token }: { token: string }) {
  const tr = useTranslations();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [sent, setSent] = useState(false);
  const [challengeRef, setChallengeRef] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function send() {
    setError(null);
    start(async () => {
      const fd = new FormData();
      fd.set("token", token);
      const res = await requestLinkOtp(fd);
      setChallengeRef(res.challengeRef);
      setNotice(res.message);
      setSent(true);
    });
  }

  function verify() {
    setError(null);
    start(async () => {
      const fd = new FormData();
      fd.set("token", token);
      fd.set("challengeRef", challengeRef ?? "");
      fd.set("code", code);
      const res = await verifyLinkOtp(fd);
      if (res.ok) {
        router.replace(res.href);
        return;
      }
      setError(res.error);
    });
  }

  return (
    <Stack gap="md">
      {notice && sent ? (
        <Alert color="blue" variant="light">
          <Text size="xs">{notice}</Text>
        </Alert>
      ) : null}
      {error ? (
        <Alert color="red" variant="light">
          <Text size="xs">{error}</Text>
        </Alert>
      ) : null}

      {!sent ? (
        <Button fullWidth loading={pending} onClick={send}>
          {tr("common.sendAVerificationCode")}
        </Button>
      ) : (
        <>
          <TextInput
            autoComplete="one-time-code"
            autoFocus
            label={tr("common.verificationCode")}
            onChange={(e) => setCode(e.currentTarget.value)}
            placeholder="ABCD-EFGH"
            value={code}
          />
          <Button fullWidth loading={pending} onClick={verify}>
            {tr("portal.portalLinkVerifyForm.openTheDocument")}
          </Button>
        </>
      )}
    </Stack>
  );
}
