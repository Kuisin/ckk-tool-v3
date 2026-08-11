import type { KioskMessages } from "./ja";

export const en: KioskMessages = {
  launcher: {
    greeting: (name: string) => name,
    logout: "Log out",
    appsTitle: "Apps",
    noApps: "No apps are available yet",
    language: "Language",
  },
  activity: {
    autoLogout: (time: string) => `Auto logout in ${time}`,
  },
};
