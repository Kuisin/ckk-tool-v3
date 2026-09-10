/**
 * /work-location — 作業場所の工程（この機械に待っている仕事）。
 *
 * /steps が「自分の担当」で引くのに対し、こちらは**作業場所**で引く。
 * 作業計画は担当者が任意になり、代わりに計画日 + 作業場所が必須になったので
 * （20261015090000 / 20261017090000 / 20261018090000）、「いつ・どこで」だけ
 * 決めた計画行が普通に作られる。それは userId で引く /steps には**一切
 * 出てこない** — 機械の前のタブレットがその機械の仕事を出せるようにする。
 *
 * proxy は Cookie の有無しか見ないので、ここでセッションと権限を本検証する。
 *
 * 見る場所の決め方: `?loc=<作業場所コード>`（QR を読んだ結果）> 端末の既定。
 * 未知のコードは 404 にせず「見つかりません」を画面に出す — 現場のタブレットに
 * 行き止まりを作らない（/wo-scan/[woNumber] と同じ方針）。
 */

import { redirect } from "next/navigation";
import { I18nProvider } from "@/components/I18nProvider";
import { LocationStepsView } from "@/components/work-location/LocationStepsView";
import { readableCodes } from "@/lib/authz";
import {
  type BoardLocation,
  boardLocationIds,
  getDeviceBoardLocation,
  resolveBoardLocationByCode,
} from "@/lib/device-work-location";
import { getSession } from "@/lib/kiosk-auth";
import { parseScope } from "@/lib/location-board-core";
import { listStepsAtLocation } from "@/lib/steps";

export const dynamic = "force-dynamic";

/** 画面に渡す分だけ（id は出さない）。 */
function toView(loc: BoardLocation | null) {
  return loc
    ? { code: loc.code, label: loc.label, groupName: loc.groupName }
    : null;
}

export default async function WorkLocationPage({
  searchParams,
}: {
  searchParams: Promise<{ loc?: string; scope?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const codes = await readableCodes(session.userId);
  if (!codes.has("work_order") && !codes.has("*")) redirect("/");

  const { loc, scope: rawScope } = await searchParams;
  const scope = parseScope(rawScope ?? null);

  const deviceDefault = await getDeviceBoardLocation(
    session.deviceId,
    session.locale,
  );

  // 読み取った QR の場所 > 端末の既定。未知・無効なコードは端末の既定へ戻し、
  // 「見つかりません」を添える（黙って別の場所を見せない）。
  let location = deviceDefault;
  let unknownCode: string | null = null;
  const requested = loc?.trim();
  if (requested != null && requested !== "") {
    const resolved = await resolveBoardLocationByCode(
      requested,
      session.locale,
    );
    if (resolved) location = resolved;
    else unknownCode = requested;
  }

  const { steps, upcomingCount } = location
    ? await listStepsAtLocation(
        await boardLocationIds(location, scope),
        session.userId,
        session.locale,
      )
    : { steps: [], upcomingCount: 0 };

  return (
    <I18nProvider locale={session.locale}>
      <LocationStepsView
        deviceDefault={toView(deviceDefault)}
        location={toView(location)}
        scope={scope}
        steps={steps}
        unknownCode={unknownCode}
        upcomingCount={upcomingCount}
      />
    </I18nProvider>
  );
}
