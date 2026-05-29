"use client";

import { HouseIcon, SearchIcon } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppCard } from "@/components/app-card";
import AppIcon from "@/components/app-icon";
import Loader from "@/components/ui/loading";
import { useNavigation } from "@/contexts/navigation-context";
import { hasAnyPermission, usePermissions } from "@/hooks/use-permissions";
import { appList } from "@/lib/app-list";
import { defaultLocale, getDictionaryPromise } from "@/lib/language";
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

interface AppsProps {
  onAppClick?: () => void;
  dict?: {
    searchPlaceholder: string;
    loadingPermissions: string;
    starredApps: string;
    noAppsFound: string;
  };
}

export default function Apps({ onAppClick, dict }: AppsProps) {
  const params = useParams<{ lang: string }>();
  const lang = params?.lang || defaultLocale;
  const [searchQuery, setSearchQuery] = useState("");
  const { permissions, isLoading } = usePermissions();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [appNamesDict, setAppNamesDict] = useState<
    Record<string, { name: string; description: string }>
  >({});
  const [categoryDict, setCategoryDict] = useState<
    Record<string, { name: string; description: string }>
  >({});

  const router = useRouter();
  const { setLoading } = useNavigation();

  // Clear loading when component unmounts (navigation completed)
  useEffect(() => {
    return () => {
      setLoading(false);
    };
  }, [setLoading]);

  // Load dictionary for app names and categories (Comp_KioskAppCategory per app-list docs; fallback CategoryName)
  useEffect(() => {
    async function loadDict() {
      try {
        const appNames = await getDictionaryPromise(lang, "AppNames");
        const kioskCategory = await getDictionaryPromise(
          lang,
          "Comp_KioskAppCategory",
        );
        const categoryName = await getDictionaryPromise(lang, "CategoryName");
        setAppNamesDict(appNames || {});
        setCategoryDict(kioskCategory || categoryName || {});
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

  // Helper function to build href with lang parameter and apps path
  // href always starts with /employee
  const buildHref = (href: string) => {
    const validLang = lang || defaultLocale;
    return `/${validLang}${href}`;
  };

  // Filter apps based on search query and permissions
  const filteredAppList = useMemo(() => {
    return appList.filter((app) => {
      const appName = getAppName(app.dictKey);
      const matchesSearch = appName
        .toLowerCase()
        .includes(searchQuery.toLowerCase());
      const hasPermission = hasAnyPermission(
        permissions,
        app.requiredPermission,
      );
      return matchesSearch && hasPermission;
    });
  }, [searchQuery, permissions, getAppName]);

  const filteredShortcutList = useMemo(() => {
    return shortcutList.filter((app) => {
      const appName = getAppName(app.dictKey);
      const matchesSearch = appName
        .toLowerCase()
        .includes(searchQuery.toLowerCase());
      const hasPermission = hasAnyPermission(
        permissions,
        app.requiredPermission,
      );
      return matchesSearch && hasPermission;
    });
  }, [searchQuery, permissions, getAppName]);

  // Separate starred and non-starred apps
  const { starredApps, regularApps } = useMemo(() => {
    if (!settings) {
      return { starredApps: [], regularApps: filteredAppList };
    }

    const starred = filteredAppList.filter((app) =>
      settings.starredApps.includes(app.dictKey),
    );
    const regular = filteredAppList.filter(
      (app) => !settings.starredApps.includes(app.dictKey),
    );

    return { starredApps: starred, regularApps: regular };
  }, [filteredAppList, settings]);

  const { starredShortcuts, regularShortcuts } = useMemo(() => {
    if (!settings) {
      return { starredShortcuts: [], regularShortcuts: filteredShortcutList };
    }

    const starred = filteredShortcutList.filter((app) =>
      settings.starredApps.includes(app.dictKey),
    );
    const regular = filteredShortcutList.filter(
      (app) => !settings.starredApps.includes(app.dictKey),
    );

    return { starredShortcuts: starred, regularShortcuts: regular };
  }, [filteredShortcutList, settings]);

  // Combine all apps for simple list when searching
  const allFilteredApps = useMemo(() => {
    return [...filteredAppList, ...filteredShortcutList];
  }, [filteredAppList, filteredShortcutList]);

  // Create a Set of shortcut dictKeys for quick lookup
  const shortcutDictKeys = useMemo(() => {
    return new Set(shortcutList.map((app) => app.dictKey));
  }, []);

  if (isLoading || isLoadingSettings) {
    return (
      <div className="flex flex-col">
        <div className="border border-gray-300 flex flex-row items-center justify-center rounded-md overflow-hidden mb-4">
          <button
            type="button"
            className="px-3 py-3 hover:bg-gray-100 transition-all duration-300 cursor-pointer"
          >
            <SearchIcon size={12} strokeWidth={1.5} />
          </button>
          <input
            type="text"
            placeholder={dict?.searchPlaceholder}
            className="w-full mr-2 outline-none text-sm"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            disabled
          />
        </div>
        <div className="m-8">
          <Loader message={dict?.loadingPermissions} />
        </div>
      </div>
    );
  }

  const hasStarredApps = starredApps.length > 0 || starredShortcuts.length > 0;
  const hasRegularApps = regularApps.length > 0 || regularShortcuts.length > 0;
  const isSearching = searchQuery.trim().length > 0;

  return (
    <div className="flex flex-col text-black">
      <div className="flex flex-row mb-4 mx-1 items-center">
        <button
          onClick={() => {
            onAppClick?.();
            router.push(`/${lang}/employee`);
          }}
          type="button"
          className="px-3 py-3 mr-1 rounded-md hover:bg-gray-100 transition-all duration-300 cursor-pointer"
        >
          <HouseIcon size={20} strokeWidth={2} />
        </button>
        <div className="flex-1 border border-gray-300 flex flex-row items-center justify-center rounded-md overflow-hidden focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-200 transition-all">
          <div className="px-3 py-3 transition-all duration-300">
            <SearchIcon size={12} strokeWidth={1.5} />
          </div>
          <input
            type="text"
            placeholder={dict?.searchPlaceholder}
            className="w-full mr-2 outline-none text-sm focus:outline-none"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Simple list when searching */}
      {isSearching ? (
        allFilteredApps.length > 0 ? (
          <div className="flex flex-col mx-1">
            {allFilteredApps.map((app) => {
              const appName = getAppName(app.dictKey);
              const categoryName = app.categoryDictKey
                ? getCategoryName(app.categoryDictKey)
                : (app as { category?: string }).category || "";
              const isShortcut = shortcutDictKeys.has(app.dictKey);
              const isStarred =
                settings?.starredApps.includes(app.dictKey) ?? false;
              return (
                <Link
                  href={buildHref(app.href)}
                  key={app.href}
                  className="flex flex-row items-center px-2 py-2 hover:bg-gray-100 transition-all duration-300 rounded-md"
                  onClick={() => {
                    setLoading(true);
                    onAppClick?.();
                  }}
                >
                  <div className="w-8 h-8 flex items-center justify-center">
                    <AppIcon
                      name={appName}
                      icon={app.icon}
                      image={app.image || undefined}
                      sizeClass="w-full h-full"
                      isShortcut={isShortcut}
                      isStarred={isStarred}
                    />
                  </div>
                  <p className="text-base font-medium flex flex-row items-baseline ml-2">
                    {appName}
                    <span className="text-xs text-gray-500 ml-2">
                      {categoryName}
                    </span>
                  </p>
                </Link>
              );
            })}
          </div>
        ) : null
      ) : (
        <>
          {/* Starred Apps Section */}
          {hasStarredApps && (
            <div className="flex flex-col mb-4 mx-2">
              <h2 className="text-sm font-semibold text-gray-700 mb-2">
                {dict?.starredApps}
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {starredApps.map((app) => (
                  <AppCard
                    key={app.href}
                    dictKey={app.dictKey}
                    getAppName={getAppName}
                    icon={app.icon}
                    image={app.image}
                    href={buildHref(app.href)}
                    isStarred={true}
                    onClick={() => {
                      setLoading(true);
                      onAppClick?.();
                    }}
                  />
                ))}
                {starredShortcuts.map((app) => (
                  <AppCard
                    key={app.href}
                    dictKey={app.dictKey}
                    getAppName={getAppName}
                    icon={app.icon}
                    image={app.image}
                    href={buildHref(app.href)}
                    size="small"
                    isStarred={true}
                    isShortcut={true}
                    onClick={() => {
                      setLoading(true);
                      onAppClick?.();
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Regular Apps Section */}
          {hasRegularApps && (
            <>
              {hasStarredApps && (
                <div className="border-t border-gray-300 my-4 mx-2" />
              )}
              {regularApps.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mx-2">
                  {regularApps.map((app) => (
                    <AppCard
                      key={app.href}
                      dictKey={app.dictKey}
                      getAppName={getAppName}
                      icon={app.icon}
                      image={app.image}
                      href={buildHref(app.href)}
                      isStarred={false}
                      onClick={() => {
                        setLoading(true);
                        onAppClick?.();
                      }}
                    />
                  ))}
                </div>
              )}
              {regularShortcuts.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 pt-4 mt-4 border-t border-gray-300 mx-2">
                  {regularShortcuts.map((app) => (
                    <AppCard
                      key={app.dictKey}
                      dictKey={app.dictKey}
                      getAppName={getAppName}
                      icon={app.icon}
                      image={app.image}
                      href={buildHref(app.href)}
                      size="small"
                      isStarred={false}
                      isShortcut={true}
                      onClick={() => {
                        setLoading(true);
                        onAppClick?.();
                      }}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {/* No results message */}
          {!hasStarredApps && !hasRegularApps && (
            <div className="text-sm text-gray-500 mx-2">
              {dict?.noAppsFound}
            </div>
          )}
        </>
      )}
    </div>
  );
}
