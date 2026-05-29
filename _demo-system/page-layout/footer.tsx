"use client";

import { useEffect, useState } from "react";

interface FooterProps {
  companyName: string;
  version: string;
  devMode?: string;
  isDevelopment: boolean;
}

export function EmployeeFooter({
  companyName,
  version,
  devMode,
  isDevelopment,
}: FooterProps) {
  const [isPWA, setIsPWA] = useState(false);

  useEffect(() => {
    // Detect PWA/standalone mode
    const checkPWA = () => {
      if (typeof window === "undefined") return false;

      // Check for standalone display mode (installed PWA)
      const isStandalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        window.matchMedia("(display-mode: minimal-ui)").matches;

      // Check for iOS Safari standalone mode
      const isIOSStandalone =
        "standalone" in window.navigator &&
        (window.navigator as { standalone?: boolean }).standalone === true;

      return isStandalone || isIOSStandalone;
    };

    setIsPWA(checkPWA());
  }, []);

  return (
    <footer
      className={
        isPWA
          ? "flex flex-row items-center justify-center gap-4 px-4 pt-2 md:pt-1 pb-6 md:pb-2"
          : "flex flex-row items-center justify-center gap-4 px-4 pt-1 md:pt-1 pb-1 md:pb-2"
      }
    >
      <p className="text-sm text-gray-400">{companyName}</p>
      <p className="text-sm text-gray-400">
        {version}: {process.env.NEXT_PUBLIC_APP_VERSION}
      </p>
      {isDevelopment && <p className="text-sm text-gray-400">{devMode}</p>}
    </footer>
  );
}
