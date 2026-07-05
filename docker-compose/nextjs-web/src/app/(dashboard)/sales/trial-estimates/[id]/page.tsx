import { TrialEstimateDetail } from "@/components/sales/trial-estimates/TrialEstimateDetail";

/** 試算 詳細 (SA52). */
export default async function TrialEstimateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <TrialEstimateDetail id={id} />;
}
