"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import {
  defaultLocale,
  extractLocale,
  getLocaleFromPath,
} from "@/lib/language";

interface NotFoundClientProps {
  dict: {
    redirecting: string;
  };
}

export function NotFoundClient({ dict }: NotFoundClientProps) {
  const pathname = usePathname();

  useEffect(() => {
    // Extract language from pathname and normalize it (e.g., "ja-JP" -> "ja")
    const localeFromPath = getLocaleFromPath(pathname);
    const lang = extractLocale(localeFromPath || defaultLocale);
    const redirectUrl = `/${lang}/employee`;

    console.log(
      "NotFoundClient: pathname =",
      pathname,
      "redirectUrl =",
      redirectUrl,
    );

    // Use window.location for immediate redirect
    // Always redirect to /employee for any 404 under /employee
    if (pathname.includes("/employee") && !pathname.endsWith("/employee")) {
      console.log("NotFoundClient: Redirecting to", redirectUrl);
      window.location.replace(redirectUrl);
    } else {
      console.log("NotFoundClient: Not redirecting, pathname =", pathname);
    }
  }, [pathname]);

  // Show loading state while redirecting
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <p className="text-gray-600">{dict.redirecting}</p>
      </div>
    </div>
  );
}
