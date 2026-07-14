/**
 * icons.ts — Shared app/category icon registry (_specs/design.md §5, §7).
 *
 * One lookup map for AppLauncher + HomeApps so `app-list.ts` can stay a pure
 * data module (icon names as strings) while components resolve real
 * @tabler/icons-react components.
 */

import {
  IconAlertTriangle,
  IconAtom,
  IconBolt,
  IconBoxSeam,
  IconBuilding,
  IconBuildingFactory2,
  IconBuildingWarehouse,
  IconCalculator,
  IconCalendarDue,
  IconClipboardCheck,
  IconClipboardList,
  IconCurrencyYen,
  IconCylinder,
  IconFileInvoice,
  IconFileText,
  IconGitBranch,
  IconHash,
  IconListCheck,
  IconPackageImport,
  IconReceipt,
  IconRuler2,
  IconSettings2,
  IconShieldCheck,
  IconShoppingCart,
  IconStack2,
  IconTruck,
  IconTruckDelivery,
  IconUsers,
  IconUsersGroup,
} from "@tabler/icons-react";
import type { ComponentType } from "react";
import type { AppCategory } from "./app-list";

export type AppIcon = ComponentType<{ size?: number; stroke?: number }>;

/** `AppEntry.icon` name → component (design.md §7 icon map). */
export const ICON_MAP: Record<string, AppIcon> = {
  IconCurrencyYen,
  IconCalculator,
  IconFileText,
  IconClipboardCheck,
  IconRuler2,
  IconPackageImport,
  IconTruckDelivery,
  IconClipboardList,
  IconSettings2,
  IconShieldCheck,
  IconBoxSeam,
  IconStack2,
  IconTruck,
  IconReceipt,
  IconFileInvoice,
  IconCalendarDue,
  IconBuilding,
  IconUsers,
  IconCylinder,
  IconAtom,
  IconBolt,
  IconBuildingFactory2,
  IconBuildingWarehouse,
  IconShoppingCart,
  IconGitBranch,
  IconHash,
  IconListCheck,
  IconAlertTriangle,
  IconUsersGroup,
};

/** Representative icon for each category section header. */
export const CATEGORY_SECTION_ICONS: Record<AppCategory, AppIcon> = {
  販売: IconCurrencyYen,
  購買: IconPackageImport,
  生産: IconSettings2,
  出荷: IconTruck,
  請求: IconFileInvoice,
  マスタ: IconBuilding,
};

export function resolveAppIcon(name: string): AppIcon {
  return ICON_MAP[name] ?? IconFileText;
}
