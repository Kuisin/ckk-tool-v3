import "server-only";

/**
 * intake-company.ts — 取込口ごとの自社法人（SY0C）。server-only.
 *
 * 利用者の決定: 注文書の取込口（取込フォルダ / メールアドレス / 外部連携の
 * トークン）は、それぞれ 1 つの自社法人に結び付く。取込で作る注文請書（IMPORT）
 * は作成時にその法人を持つ — 発行元は作成後に変えられず（own_company_id）、
 * 番号も法人ごとの連番から払い出すので、あとから直せない。
 *
 * **いまの取込口は環境ごとに 1 つ**: 取込フォルダ（INTAKE_DIR）が 1 本あり、
 * メール（intake-gateway）も外部連携（POST /api/intake/inbound）もそこへ
 * ファイルを置く。ポーラーが拾う時点では、どの口から来たかは残っていない。
 * だから設定も 1 つ — 「この環境の取込フォルダ（メール・外部連携を含む）の法人」。
 * 法人ごとに別のフォルダ・アドレス・トークンを持たせる（取込口を増やす）ときは、
 * ここに口ごとの鍵を足す。
 *
 * 画面からのアップロード（source = UPLOAD）は取込口ではなく**人**が入れるので、
 * その人の発行会社の初期値（所属拠点の法人が 1 つならそれ）を使い、決まらなければ
 * 取込フォルダの法人へ落ちる。規則は lib/doc-company-core.ts companyForIntake。
 */

import { readConfigNamespace, writeConfigValues } from "@/lib/app-config";
import { prisma } from "@/lib/db";
import {
  companyForIntake,
  issuingCompanyChoice,
  ownCompanyData,
} from "@/lib/doc-company-core";

const NAMESPACE = "intake";
/** 取込フォルダ（メール・外部連携を含む）の法人。値は own_companies.id。 */
const FOLDER_KEY = `${NAMESPACE}.folder_own_company_id`;

/** 取込フォルダの法人 id。未設定 / 消えた法人なら null（= 既定の法人）。 */
export async function getIntakeFolderCompanyId(): Promise<number | null> {
  const raw = (await readConfigNamespace(NAMESPACE)).get(FOLDER_KEY);
  if (typeof raw !== "number" || !Number.isInteger(raw)) return null;
  const exists = await prisma.ownCompany.findUnique({
    where: { id: raw },
    select: { id: true },
  });
  return exists ? raw : null;
}

/** 取込フォルダの法人を保存する（null = 既定の法人に従う）。 */
export async function setIntakeFolderCompanyId(
  ownCompanyId: number | null,
): Promise<void> {
  await writeConfigValues({ [FOLDER_KEY]: ownCompanyId });
}

/**
 * 取込で作る注文請書の法人（Prisma の create data に展開する形）。
 * `uploaderId` は画面からのアップロードのときだけ（フォルダ取込は人が居ない）。
 */
export async function companyForIntakeAcceptance(input: {
  source: "FOLDER" | "UPLOAD";
  uploaderId?: string | null;
}): Promise<{ ownCompanyId?: number }> {
  const [folderCompanyId, defaultCompany, plants] = await Promise.all([
    getIntakeFolderCompanyId(),
    prisma.ownCompany.findFirst({
      where: { isDefault: true },
      select: { id: true },
    }),
    input.source === "UPLOAD" && input.uploaderId
      ? prisma.userPlant.findMany({
          where: { userId: input.uploaderId },
          orderBy: { plantId: "asc" },
          select: { plant: { select: { ownCompanyId: true } } },
        })
      : Promise.resolve([]),
  ]);
  const defaultId = defaultCompany?.id ?? null;
  const uploader = issuingCompanyChoice(
    plants.map((p) => p.plant.ownCompanyId),
    defaultId,
  );
  return ownCompanyData(
    companyForIntake(
      {
        source: input.source,
        channelCompanyId: folderCompanyId,
        // 所属拠点が 1 社に決まる人だけ（複数にまたがる人・拠点の無い人は、
        // 取込の時点では選ばせようがないので取込フォルダの法人）。
        uploaderCompanyId:
          uploader.companyIds.length === 1 ? uploader.companyIds[0] : null,
      },
      defaultId,
    ),
  );
}
