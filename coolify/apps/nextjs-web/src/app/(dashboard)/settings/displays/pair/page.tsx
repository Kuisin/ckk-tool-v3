import { PairDisplayForm } from "@/components/settings/displays/PairDisplayForm";
import { requireAppRead } from "@/lib/authz-page";
import { listPairableProfiles, listPlantOptions } from "@/lib/displays-admin";

export const dynamic = "force-dynamic";

/**
 * /settings/displays/pair — ディスプレイ画面の QR を読むとここへ来る。
 *
 * URL の ?code= をそのまま初期値に入れる。スマホで開くことを想定した
 * 縦 1 列のフォームで、名前・設置場所・表示内容を決めて「登録」を押すと
 * 壁の画面がその場で切り替わる。
 */
export default async function PairDisplayPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const denied = await requireAppRead("displays");
  if (denied) return denied;

  const params = await searchParams;
  const raw = params.code;
  const code = Array.isArray(raw) ? (raw[0] ?? "") : (raw ?? "");

  const [profiles, plantOptions] = await Promise.all([
    listPairableProfiles(),
    listPlantOptions(),
  ]);

  return (
    <PairDisplayForm
      initialCode={code}
      plantOptions={plantOptions}
      profiles={profiles}
    />
  );
}
