import { DesignFileTable } from "@/components/production/design-files/DesignFileTable";
import { requireAppRead } from "@/lib/authz-page";
import { fetchDesignFileSeries } from "./data";

export const dynamic = "force-dynamic";

/** 設計図 一覧 (PD06). */
export default async function ProductionDesignFilesPage() {
  const denied = await requireAppRead("design-files");
  if (denied) return denied;
  const { rows, truncated } = await fetchDesignFileSeries();
  return <DesignFileTable rows={rows} truncated={truncated} />;
}
