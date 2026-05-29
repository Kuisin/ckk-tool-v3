"use client";

import { Star, StarOff } from "lucide-react";
import type { IconName } from "lucide-react/dynamic";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppCard } from "@/components/app-card";
import { ContextMenu } from "@/components/context-menu";
import Loader from "@/components/ui/loading";
import { useNavigation } from "@/contexts/navigation-context";
import { hasAnyPermission, usePermissions } from "@/hooks/use-permissions";
import { appList } from "@/lib/app-list";
import { getDictionaryPromise } from "@/lib/language";
import { shortcutList } from "@/lib/shortcut-list";

interface AppSettings {
  mode: "default" | "customize";
  starredApps: string[];
  groupings?: Array<{
    category: string;
    apps: string[];
    order: number;
  }>;
}

interface AvailableApp {
  dictKey: string;
  category: string;
  categoryDictKey: string;
  icon: IconName;
  image: string | null;
  href: string;
  isShortcut?: boolean;
}

interface HomeAppsProps {
  dict?: {
    starredApps: string;
    otherApps: string;
    noAppsAvailable: string;
    addToFavorites: string;
    removeFromFavorites: string;
  };
}

export default function HomeApps({ dict }: HomeAppsProps = {}) {
  const params = useParams();
  const lang = params?.lang as string;
  const { permissions, isLoading } = usePermissions();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [isTogglingStar, setIsTogglingStar] = useState(false);
  const [appNamesDict, setAppNamesDict] = useState<
    Record<string, { name: string; description: string }>
  >({});
  const [categoryDict, setCategoryDict] = useState<
    Record<string, { name: string; description: string }>
  >({});
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    appDictKey: string;
  } | null>(null);

  const { setLoading } = useNavigation();

  // Load dictionary for app names and categories
  useEffect(() => {
    async function loadDict() {
      try {
        const appNames = await getDictionaryPromise(lang, "AppNames");
        const categoryDict = await getDictionaryPromise(lang, "CategoryName");
        setAppNamesDict(appNames || {});
        setCategoryDict(categoryDict || {});
      } catch (error) {
        console.error("Failed to load dictionary:", error);
      }
    }
    loadDict();
  }, [lang]);

  const getAppName = useCallback(
    (dictKey: string): string => {
      return appNamesDict[dictKey]?.name || dictKey;
    },
    [appNamesDict],
  );

  const getCategoryName = useCallback(
    (categoryDictKey: string): string => {
      return categoryDict[categoryDictKey]?.name || categoryDictKey;
    },
    [categoryDict],
  );

  // Helper function to build href with lang parameter and apps path
  // href always starts with /employee
  const buildHref = (href: string) => {
    return `/${lang}${href}`;
  };

  // Handle context menu
  const handleContextMenu = (
    e: React.MouseEvent<HTMLAnchorElement>,
    appDictKey: string,
  ) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      appDictKey,
    });
  };

  // Toggle star status for an app
  const toggleStar = async (appDictKey: string) => {
    if (isTogglingStar || !settings) return;

    setIsTogglingStar(true);
    const newStarredApps = settings.starredApps.includes(appDictKey)
      ? settings.starredApps.filter((key) => key !== appDictKey)
      : [...settings.starredApps, appDictKey];

    try {
      const response = await fetch("/api/employee/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          mode: settings.mode,
          starredApps: newStarredApps,
          groupings: settings.groupings,
        }),
      });

      if (response.ok) {
        setSettings({
          ...settings,
          starredApps: newStarredApps,
        });
      } else {
        console.error("Failed to update star status");
      }
    } catch (error) {
      console.error("Error updating star status:", error);
    } finally {
      setIsTogglingStar(false);
    }
  };

  // Fetch settings
  useEffect(() => {
    async function fetchSettings() {
      try {
        const response = await fetch("/api/employee/settings", {
          credentials: "include",
        });
        if (response.ok) {
          const data = await response.json();
          setSettings({
            mode: data.settings?.mode ?? "default",
            starredApps: data.settings?.starredApps ?? [],
            groupings: data.settings?.groupings ?? [],
          });
        }
      } catch (error) {
        console.error("Error fetching settings:", error);
        // Use defaults on error
        setSettings({
          mode: "default",
          starredApps: [],
          groupings: [],
        });
      } finally {
        setIsLoadingSettings(false);
      }
    }
    fetchSettings();
  }, []);

  // Build available apps from appList and shortcutList, filtered by permissions
  const availableApps = useMemo(() => {
    const allApps: AvailableApp[] = [];

    // Add apps from appList
    appList.forEach((app) => {
      if (hasAnyPermission(permissions, app.requiredPermission)) {
        allApps.push({
          dictKey: app.dictKey,
          category: app.category,
          categoryDictKey: app.categoryDictKey,
          icon: app.icon,
          image: app.image,
          href: app.href,
        });
      }
    });

    // Add apps from shortcutList
    shortcutList.forEach((app) => {
      if (hasAnyPermission(permissions, app.requiredPermission)) {
        allApps.push({
          dictKey: app.dictKey,
          category: app.app,
          categoryDictKey: app.categoryDictKey,
          icon: app.icon,
          image: app.image,
          href: app.href,
          isShortcut: true,
        });
      }
    });

    return allApps;
  }, [permissions]);

  // Organize apps based on settings
  const organizedApps = useMemo(() => {
    if (!settings || isLoadingSettings || isLoading) {
      return {
        starred: [],
        groups: [],
        ungrouped: [],
      };
    }

    const starredApps = availableApps.filter((app) =>
      settings.starredApps.includes(app.dictKey),
    );

    if (settings.mode === "customize" && settings.groupings) {
      // Custom mode: organize by custom groupings
      const sortedGroupings = [...settings.groupings].sort(
        (a, b) => a.order - b.order,
      );

      const groups = sortedGroupings.map((group) => ({
        category: group.category,
        apps: availableApps.filter(
          (app) =>
            group.apps.includes(app.dictKey) &&
            !settings.starredApps.includes(app.dictKey),
        ),
      }));

      // Find ungrouped apps (not in any group and not starred)
      const groupedAppDictKeys = new Set(
        sortedGroupings.flatMap((g) => g.apps),
      );
      const ungrouped = availableApps.filter(
        (app) =>
          !groupedAppDictKeys.has(app.dictKey) &&
          !settings.starredApps.includes(app.dictKey),
      );

      return {
        starred: starredApps,
        groups,
        ungrouped,
      };
    } else {
      // Default mode: organize by default categories
      const categoryMap = new Map<string, AvailableApp[]>();
      availableApps.forEach((app) => {
        if (!settings.starredApps.includes(app.dictKey)) {
          const categoryName = getCategoryName(app.categoryDictKey);
          if (!categoryMap.has(categoryName)) {
            categoryMap.set(categoryName, []);
          }
          const categoryApps = categoryMap.get(categoryName);
          if (categoryApps) {
            categoryApps.push(app);
          }
        }
      });

      const groups = Array.from(categoryMap.entries()).map(
        ([category, apps]) => ({
          category,
          apps,
        }),
      );

      return {
        starred: starredApps,
        groups,
        ungrouped: [],
      };
    }
  }, [settings, availableApps, isLoadingSettings, isLoading, getCategoryName]);

  if (isLoading || isLoadingSettings) {
    return (
      <div className="flex-1">
        <Loader />
      </div>
    );
  }

  // Get context menu options for an app
  const getContextMenuOptions = (appDictKey: string) => {
    const isStarred = settings?.starredApps.includes(appDictKey) ?? false;
    return [
      {
        label: isStarred
          ? (dict?.removeFromFavorites ?? "Remove from Favorites")
          : (dict?.addToFavorites ?? "Add to Favorites"),
        action: () => toggleStar(appDictKey),
        icon: isStarred ? (
          <StarOff className="w-4 h-4" />
        ) : (
          <Star className="w-4 h-4" />
        ),
      },
    ];
  };

  return (
    <div className="flex flex-col">
      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          options={getContextMenuOptions(contextMenu.appDictKey)}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Starred Apps Section */}
      {organizedApps.starred.length > 0 && (
        <div className="flex flex-col mb-6">
          <h2 className="text-lg font-semibold mb-3">{dict?.starredApps}</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {organizedApps.starred.map((app) => (
              <AppCard
                key={app.href}
                dictKey={app.dictKey}
                getAppName={getAppName}
                icon={app.icon}
                image={app.image}
                href={buildHref(app.href)}
                isStarred={true}
                isShortcut={app.isShortcut}
                onContextMenu={(e) => handleContextMenu(e, app.dictKey)}
                onClick={() => setLoading(true)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Custom Groups or Default Categories */}
      {organizedApps.groups.map((group, groupIndex) => {
        if (group.apps.length === 0) return null;

        return (
          <div key={group.category} className="flex flex-col mb-6">
            <h2 className="text-lg font-semibold mb-3">{group.category}</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {group.apps.map((app) => (
                <AppCard
                  key={app.href}
                  dictKey={app.dictKey}
                  getAppName={getAppName}
                  icon={app.icon}
                  image={app.image}
                  href={buildHref(app.href)}
                  isStarred={
                    settings?.starredApps.includes(app.dictKey) ?? false
                  }
                  isShortcut={app.isShortcut}
                  onContextMenu={(e) => handleContextMenu(e, app.dictKey)}
                  onClick={() => setLoading(true)}
                />
              ))}
            </div>
            {groupIndex < organizedApps.groups.length - 1 && (
              <div className="border-t border-gray-300 mt-4" />
            )}
          </div>
        );
      })}

      {/* Ungrouped Apps (only in customize mode) */}
      {organizedApps.ungrouped.length > 0 && (
        <div className="flex flex-col mb-6">
          <h2 className="text-lg font-semibold mb-3">{dict?.otherApps}</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {organizedApps.ungrouped.map((app) => (
              <AppCard
                key={app.href}
                dictKey={app.dictKey}
                getAppName={getAppName}
                icon={app.icon}
                image={app.image}
                href={buildHref(app.href)}
                isStarred={settings?.starredApps.includes(app.dictKey) ?? false}
                isShortcut={app.isShortcut}
                onContextMenu={(e) => handleContextMenu(e, app.dictKey)}
                onClick={() => setLoading(true)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Show message if no apps available */}
      {availableApps.length === 0 && (
        <div className="text-sm text-gray-500">{dict?.noAppsAvailable}</div>
      )}
    </div>
  );
}
