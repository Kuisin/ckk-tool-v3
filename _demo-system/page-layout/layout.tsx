// import { getCurrentUser } from "@/lib/auth/session-server";

import { NavigationClear } from "@/components/navigation-clear";
import { NavigationOverlay } from "@/components/navigation-overlay";
import { SessionRefresh } from "@/components/session-refresh";
import { NavigationProvider } from "@/contexts/navigation-context";
import { getDictionary } from "@/lib/language";
import { EmployeeFooter } from "./footer";
import EmployeeHeader from "./header";

interface EmployeeLayoutProps {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}

export default async function EmployeeLayout({
  children,
  params,
}: EmployeeLayoutProps) {
  const { lang } = await params;
  const dict = await getDictionary(lang, "Page_Employee");
  // const user = await getCurrentUser();

  return (
    <NavigationProvider>
      <div className="flex flex-col h-dvh min-w-dvw">
        <SessionRefresh />
        <EmployeeHeader lang={lang} dict={dict.header} />
        <main
          className="flex-1 overflow-hidden rounded mx-1 bg-gray-50 text-black relative"
          style={{ boxShadow: "0 0 5px 0 rgba(0, 0, 0, 0.2)" }}
        >
          <NavigationClear />
          <div className="h-full w-full overflow-y-auto flex flex-col">
            {children}
          </div>
          <NavigationOverlay />
        </main>
        <EmployeeFooter
          companyName={dict.footer.companyName}
          version={dict.footer.version}
          devMode={dict.footer.devMode}
          isDevelopment={process.env.NODE_ENV === "development"}
        />
      </div>
    </NavigationProvider>
  );
}
