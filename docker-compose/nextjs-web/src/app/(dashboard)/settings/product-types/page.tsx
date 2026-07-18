import { redirect } from "next/navigation";

/** 旧 SY04 ルート。製品項目（/settings/product-items）へ恒久リダイレクト。 */
export default function ProductTypesRedirect() {
  redirect("/settings/product-items");
}
