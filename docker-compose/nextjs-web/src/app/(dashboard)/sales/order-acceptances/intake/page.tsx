import { OrderRequestIntake } from "@/components/sales/order-acceptances/OrderRequestIntake";

/** 受注請書 取込（AI / 手動）. `?manual=1` starts with a blank form. */
export default async function SalesOrderAcceptanceIntakePage({
  searchParams,
}: {
  searchParams: Promise<{ manual?: string }>;
}) {
  const { manual } = await searchParams;
  return <OrderRequestIntake manual={manual === "1"} />;
}
