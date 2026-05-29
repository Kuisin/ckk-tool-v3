import { getDictionary } from "@/lib/language";
import { EmployeePageClient } from "./page-client";

export default async function EmployeePage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const dict = await getDictionary(lang, "Page_Employee");

  return (
    <EmployeePageClient
      dict={{
        welcome: dict.welcome,
        department: dict.department,
        email: dict.email,
        noDepartment: dict.noDepartment,
        title: dict.title,
        noTitle: dict.noTitle,
        zones: dict.zones,
        noZones: dict.noZones,
        permissions: dict.permissions,
        noPermissions: dict.noPermissions,
        homeApps: dict.homeApps || {
          starredApps: "",
          otherApps: "",
          noAppsAvailable: "",
          addToFavorites: "",
          removeFromFavorites: "",
        },
      }}
    />
  );
}
