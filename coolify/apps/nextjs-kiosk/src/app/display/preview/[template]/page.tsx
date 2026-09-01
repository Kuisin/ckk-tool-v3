import { notFound } from "next/navigation";
import { AnnouncementBoard } from "@/app/display/content/announcement/AnnouncementBoard";
import { PendingBoard } from "@/app/display/content/pending/PendingBoard";
import { ProductionBoard } from "@/app/display/content/production/ProductionBoard";
import { QualityBoard } from "@/app/display/content/quality/QualityBoard";
import { ShippingBoard } from "@/app/display/content/shipping/ShippingBoard";
import {
  SAMPLE_ANNOUNCEMENT,
  SAMPLE_PLANT_NAME,
  samplePendingRows,
  sampleProductionEntries,
  sampleQuality,
  sampleShippingRows,
} from "@/lib/display-sample";
import {
  DISPLAY_TEMPLATES,
  findDisplayTemplate,
} from "@/lib/display-templates";

/**
 * /display/preview/<テンプレート> — **見本データで描いた実物**。
 *
 * 管理画面の「画面」選択に縮小表示で埋め込む。名前だけでは何が映るのか
 * 分からないので、選ぶ前に形を見せる。
 *
 * ★ 描くのは**本番と同じ部品**（ProductionBoard 等）。別に絵を用意すると、
 *   画面を直したときに見本だけ古くなる — それは「見本を信じて選んだのに
 *   違うものが出た」という一番たちの悪いずれ方をする。
 * ★ データは lib/display-sample.ts の作り話だけ。業務データには触れないので、
 *   ここは登録済みディスプレイでなくても開ける（管理者のブラウザには
 *   ディスプレイの Cookie が無い）。
 */

export const dynamic = "force-static";

/** テンプレートは登録簿で決まっているので、全部あらかじめ焼いておく。 */
export function generateStaticParams() {
  return DISPLAY_TEMPLATES.map((t) => ({ template: t.key }));
}

export default async function DisplayPreviewPage({
  params,
}: {
  params: Promise<{ template: string }>;
}) {
  const { template } = await params;
  if (!findDisplayTemplate(template)) notFound();

  switch (template) {
    case "production":
      return (
        <ProductionBoard
          entries={sampleProductionEntries}
          plantName={SAMPLE_PLANT_NAME}
          rowsPerPage={8}
        />
      );
    case "pending":
      return (
        <PendingBoard
          plantName={SAMPLE_PLANT_NAME}
          rows={samplePendingRows}
          rowsPerPage={8}
        />
      );
    case "shipping":
      return (
        <ShippingBoard
          plantName={SAMPLE_PLANT_NAME}
          rows={sampleShippingRows}
          rowsPerPage={8}
        />
      );
    case "quality":
      return (
        <QualityBoard
          plantName={SAMPLE_PLANT_NAME}
          rowsPerPage={8}
          summary={sampleQuality}
        />
      );
    case "announcement":
      return (
        <AnnouncementBoard
          level="info"
          message={SAMPLE_ANNOUNCEMENT}
          showClock={true}
        />
      );
    default:
      notFound();
  }
}
