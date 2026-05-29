import { defaultLocale, getDictionary } from "@/lib/language";
import { NotFoundClient } from "./not-found-client";

export default async function NotFound() {
  // Get dictionary for the redirecting message
  const dict = await getDictionary(defaultLocale, "Page_NotFound");

  // Use client component to extract lang from URL and redirect
  return <NotFoundClient dict={dict} />;
}
