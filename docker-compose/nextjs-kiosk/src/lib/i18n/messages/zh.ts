import type { KioskMessages } from "./ja";

export const zh: KioskMessages = {
  launcher: {
    greeting: (name: string) => name,
    logout: "退出登录",
    appsTitle: "应用",
    noApps: "暂无可用应用",
    language: "语言",
  },
  activity: {
    autoLogout: (time: string) => `${time} 后自动退出`,
  },
};
