/**
 * icons.ts — Shared app/category icon registry (_specs/design.md §5, §7).
 *
 * One lookup map for AppLauncher + HomeApps so `app-list.ts` can stay a pure
 * data module (icon names as strings) while components resolve real
 * @tabler/icons-react components.
 */

import {
  IconAdjustments,
  IconAlertTriangle,
  IconAtom,
  IconBolt,
  IconBook2,
  IconBookmarks,
  IconBoxSeam,
  IconBuilding,
  IconBuildingFactory2,
  IconBuildingWarehouse,
  IconCalculator,
  IconCalendarDue,
  IconCategory,
  IconClipboardCheck,
  IconClipboardList,
  IconCurrencyYen,
  IconCylinder,
  IconDeviceTablet,
  IconDeviceTabletCog,
  IconFileInvoice,
  IconFileText,
  IconFolder,
  IconGitBranch,
  IconHash,
  IconHistory,
  IconLayoutGrid,
  IconListCheck,
  IconListDetails,
  IconMapPin,
  IconMathFunction,
  IconPackageImport,
  IconPackages,
  IconQrcode,
  IconReceipt,
  IconRuler2,
  IconSettings2,
  IconShieldCheck,
  IconShoppingCart,
  IconStack2,
  IconTruck,
  IconTruckDelivery,
  IconUserCog,
  IconUsers,
  IconUsersGroup,
} from "@tabler/icons-react";
import type { ComponentType } from "react";
import type { AppCategory } from "./app-list";

export type AppIcon = ComponentType<{ size?: number; stroke?: number }>;

/** `AppEntry.icon` name → component (design.md §7 icon map). */
export const ICON_MAP: Record<string, AppIcon> = {
  IconAdjustments,
  IconBook2,
  IconBookmarks,
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
  IconUserCog,
  IconUsers,
  IconCylinder,
  IconAtom,
  IconBolt,
  IconBuildingFactory2,
  IconBuildingWarehouse,
  IconPackages,
  IconShoppingCart,
  IconFolder,
  IconGitBranch,
  IconHash,
  IconMapPin,
  IconHistory,
  IconLayoutGrid,
  IconListCheck,
  IconListDetails,
  IconMathFunction,
  IconAlertTriangle,
  IconUsersGroup,
  IconCategory,
  IconQrcode,
  IconDeviceTablet,
  IconDeviceTabletCog,
};

/** Representative icon for each category section header. */
export const CATEGORY_SECTION_ICONS: Record<AppCategory, AppIcon> = {
  販売: IconCurrencyYen,
  購買: IconPackageImport,
  生産: IconSettings2,
  出荷: IconTruck,
  請求: IconFileInvoice,
  マスタ: IconBuilding,
  ドキュメント: IconBook2,
  システム: IconAdjustments,
};

export function resolveAppIcon(name: string): AppIcon {
  return ICON_MAP[name] ?? IconFileText;
}
