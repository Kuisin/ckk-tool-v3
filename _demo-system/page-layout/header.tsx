"use client";
import { format } from "date-fns";
import { BellIcon, SettingsIcon, Share2Icon, XIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AvatarImage from "@/components/avatar-image";
import { Alert } from "@/components/ui/alert";
import { SearchInput } from "@/components/ui/search-input";
import { useNavigation } from "@/contexts/navigation-context";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useLogout } from "@/hooks/use-logout";
import { hasAnyPermission, usePermissions } from "@/hooks/use-permissions";
import { useSocket } from "@/hooks/use-socket";
import { useTableSubscription } from "@/hooks/use-table-subscription";
import { getNotificationDisplay } from "@/lib/notification-display";
import Apps from "./apps";

interface Notification {
  id: number;
  title: string | null;
  message: string;
  type: string | null;
  link: string | null;
  createdAt: string;
  createdBy: string | null;
  isRead: boolean;
  readAt: string | null;
}

const settingsItems = [
  {
    title: "favorites",
    href: "/employee/settings/home",
  },
  {
    title: "general",
    href: "/employee/settings/general",
  },
  {
    title: "bugReport",
    href: "/employee/settings/bug-report",
  },
];

interface EmployeeHeaderProps {
  lang: string;
  dict: {
    appName: string;
    notifications: string;
    markAllAsRead: string;
    showRead: string;
    loading: string;
    noNotifications: string;
    notification: string;
    viewAllNotifications: string;
    approvalRequest?: {
      purchaseTitle: string;
      purchaseMessage: string;
      orderTitle: string;
      orderMessage: string;
    };
    profile: string;
    adminSettings: string;
    signOut: string;
    settings: {
      favorites: string;
      general: string;
      bugReport: string;
    };
    apps?: {
      searchPlaceholder: string;
      loadingPermissions: string;
      starredApps: string;
      noAppsFound: string;
    };
    share?: {
      title: string;
      currentPage: string;
      recipients: string;
      users: string;
      groups: string;
      searchUsers: string;
      searchGroups: string;
      noUsersFound: string;
      noEmployeesAvailable: string;
      noGroupsFound: string;
      noGroupsAvailable: string;
      cancel: string;
      sharing: string;
      share: string;
      close: string;
      selectRecipient: string;
      shareFailed: string;
    };
  };
}

interface Employee {
  username: string;
  displayName: string;
  email: string | null;
  department: string | null;
  title: string | null;
}

interface Group {
  id: number;
  name: string;
  displayName: string | null;
  source: string | null;
}

export default function EmployeeHeader({ lang, dict }: EmployeeHeaderProps) {
  const profileRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const prevPathnameRef = useRef<string | null>(null);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isAppsOpen, setIsAppsOpen] = useState(false);
  const [isAppsClosing, setIsAppsClosing] = useState(false);
  const [preventHover, setPreventHover] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const appsRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const shareModalRef = useRef<HTMLDivElement>(null);

  const { user } = useCurrentUser();
  const { permissions } = usePermissions();
  const { handleLogout } = useLogout({ lang });
  const { isConnected: isSocketConnected } = useSocket();
  const { setLoading, pageTitle } = useNavigation();

  // Share modal state
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<number[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [isLoadingShareOptions, setIsLoadingShareOptions] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [groupSearchQuery, setGroupSearchQuery] = useState("");

  // Filter employees and groups based on search queries
  const filteredEmployees = useMemo(() => {
    if (!userSearchQuery.trim()) {
      return employees;
    }
    const query = userSearchQuery.toLowerCase().trim();
    return employees.filter(
      (employee) =>
        employee.displayName?.toLowerCase().includes(query) ||
        employee.username.toLowerCase().includes(query) ||
        employee.email?.toLowerCase().includes(query) ||
        employee.department?.toLowerCase().includes(query),
    );
  }, [employees, userSearchQuery]);

  const filteredGroups = useMemo(() => {
    if (!groupSearchQuery.trim()) {
      return groups;
    }
    const query = groupSearchQuery.toLowerCase().trim();
    return groups.filter(
      (group) =>
        group.displayName?.toLowerCase().includes(query) ||
        group.name.toLowerCase().includes(query),
    );
  }, [groups, groupSearchQuery]);

  // Notification state
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoadingNotifications, setIsLoadingNotifications] = useState(false);
  const [showPingAnimation, setShowPingAnimation] = useState(false);
  const [popupNotification, setPopupNotification] =
    useState<Notification | null>(null);
  const [showingReadNotifications, setShowingReadNotifications] =
    useState(false);
  const hasLoadedNotificationsRef = useRef(false);

  // Fetch notifications
  const fetchNotifications = useCallback(async () => {
    if (!user) return;

    const isInitialLoad = !hasLoadedNotificationsRef.current;

    try {
      if (isInitialLoad) {
        setIsLoadingNotifications(true);
      }

      // When showing read notifications, use same parameters as handleShowRead
      let notificationsUrl = `/api/notifications?limit=5&offset=0&includeRead=${isInitialLoad && !showingReadNotifications ? "false" : "true"}`;

      if (showingReadNotifications) {
        // Calculate date 7 days ago
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        const dateFrom = oneWeekAgo.toISOString();
        notificationsUrl = `/api/notifications?limit=20&offset=0&includeRead=true&dateFrom=${encodeURIComponent(dateFrom)}`;
      }

      const [notificationsResponse, countResponse] = await Promise.all([
        fetch(notificationsUrl, {
          credentials: "include",
        }),
        fetch(`/api/notifications/unread-count`, {
          credentials: "include",
        }),
      ]);

      if (notificationsResponse.ok) {
        const notificationsData = await notificationsResponse.json();
        const fetchedNotifications = notificationsData.notifications || [];
        // On initial load or when not showing read notifications, only show unread
        // If showingReadNotifications is true, show all notifications (read and unread from last week)
        const filteredNotifications =
          isInitialLoad || !showingReadNotifications
            ? fetchedNotifications.filter((n: Notification) => !n.isRead)
            : fetchedNotifications;
        setNotifications(filteredNotifications);
        // Don't reset showingReadNotifications here - it should persist until dropdown closes
      }

      if (countResponse.ok) {
        const countData = await countResponse.json();
        setUnreadCount(countData.count || 0);
      }

      if (isInitialLoad) {
        hasLoadedNotificationsRef.current = true;
      }
    } catch (error) {
      console.error("Error fetching notifications:", error);
    } finally {
      if (isInitialLoad) {
        setIsLoadingNotifications(false);
      }
    }
  }, [user, showingReadNotifications]);

  // Fetch notifications on mount and when dropdown opens
  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Subscribe to Notification table changes via WebSocket
  useTableSubscription({
    table: "Notification",
    onChange: (event) => {
      // Only show ping animation and popup for new notifications (create events)
      if (event.type === "create") {
        setShowPingAnimation(true);
        // Remove animation after 10 seconds
        setTimeout(() => {
          setShowPingAnimation(false);
        }, 10000);

        // Show popup notification
        const notificationData = event.data as {
          id: number;
          title: string | null;
          message: string;
          type: string | null;
          link: string | null;
          createdAt: Date | string;
          createdBy: string;
        };

        // Create notification object for popup
        const popupNotif: Notification = {
          id: notificationData.id,
          title: notificationData.title,
          message: notificationData.message,
          type: notificationData.type,
          link: notificationData.link,
          createdAt:
            typeof notificationData.createdAt === "string"
              ? notificationData.createdAt
              : notificationData.createdAt.toISOString(),
          createdBy: notificationData.createdBy,
          isRead: false,
          readAt: null,
        };

        setPopupNotification(popupNotif);

        // Auto-dismiss popup after 5 seconds
        setTimeout(() => {
          setPopupNotification(null);
        }, 5000);
      }
      // Refresh notifications immediately when Notification table changes
      // This handles create, update, and delete events
      fetchNotifications();
    },
  });

  // Fetch notifications immediately when socket connects
  useEffect(() => {
    if (isSocketConnected) {
      // Small delay to ensure subscription is ready
      const timer = setTimeout(() => {
        fetchNotifications();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isSocketConnected, fetchNotifications]);

  // Poll for updates - faster when socket is not connected, slower when connected
  useEffect(() => {
    // If socket is connected, poll every 30 seconds as backup
    // If socket is not connected, poll every 5 seconds for faster updates
    const pollInterval = isSocketConnected ? 30000 : 5000;

    const interval = setInterval(() => {
      fetchNotifications();
    }, pollInterval);

    return () => clearInterval(interval);
  }, [fetchNotifications, isSocketConnected]);

  // Refresh on window focus and visibility change
  useEffect(() => {
    const handleFocus = () => {
      fetchNotifications();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        fetchNotifications();
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [fetchNotifications]);

  // Reset showing read notifications when dropdown closes
  useEffect(() => {
    if (!isNotificationsOpen) {
      setShowingReadNotifications(false);
    }
  }, [isNotificationsOpen]);

  // Get current URL with path and params
  const getCurrentUrl = useCallback(() => {
    const pathWithoutLang = pathname.replace(/^\/[^/]+/, "") || "/";
    const searchParamsString = searchParams.toString();
    const fullPath = searchParamsString
      ? `${pathWithoutLang}?${searchParamsString}`
      : pathWithoutLang;
    return fullPath;
  }, [pathname, searchParams]);

  // Fetch employees and groups for share modal
  const fetchShareOptions = useCallback(async () => {
    setIsLoadingShareOptions(true);
    setShareError(null);
    try {
      const response = await fetch("/api/admin/employee-groups/options", {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to fetch employees and groups");
      }

      const data = await response.json();
      if (data.success) {
        setEmployees(data.employees || []);
        setGroups(data.groups || []);
      } else {
        throw new Error("Failed to fetch options");
      }
    } catch (error) {
      console.error("Error fetching share options:", error);
      setShareError(
        error instanceof Error ? error.message : "Failed to load options",
      );
    } finally {
      setIsLoadingShareOptions(false);
    }
  }, []);

  // Open share modal and fetch options
  const handleShareClick = useCallback(() => {
    setIsShareModalOpen(true);
    setSelectedUsers([]);
    setSelectedGroups([]);
    setShareError(null);
    setUserSearchQuery("");
    setGroupSearchQuery("");
    fetchShareOptions();
  }, [fetchShareOptions]);

  // Toggle user selection
  const toggleUserSelection = useCallback((username: string) => {
    setSelectedUsers((prev) =>
      prev.includes(username)
        ? prev.filter((u) => u !== username)
        : [...prev, username],
    );
  }, []);

  // Toggle group selection
  const toggleGroupSelection = useCallback((groupId: number) => {
    setSelectedGroups((prev) =>
      prev.includes(groupId)
        ? prev.filter((g) => g !== groupId)
        : [...prev, groupId],
    );
  }, []);

  // Handle share submission
  const handleShare = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setIsSharing(true);
      setShareError(null);
      setLoading(true);

      try {
        if (selectedUsers.length === 0 && selectedGroups.length === 0) {
          throw new Error(
            dict.share?.selectRecipient ||
              "Please select at least one recipient",
          );
        }

        const currentUrl = getCurrentUrl();

        const response = await fetch("/api/employee/share-page", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({
            url: currentUrl,
            recipients: {
              users: selectedUsers,
              groups: selectedGroups,
            },
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            errorData.error?.message ||
              dict.share?.shareFailed ||
              "Failed to share page",
          );
        }

        // Close modal and reset
        setIsShareModalOpen(false);
        setSelectedUsers([]);
        setSelectedGroups([]);
      } catch (error) {
        console.error("Error sharing page:", error);
        setShareError(
          error instanceof Error
            ? error.message
            : dict.share?.shareFailed || "Failed to share page",
        );
      } finally {
        setIsSharing(false);
        setLoading(false);
      }
    },
    [selectedUsers, selectedGroups, getCurrentUrl, setLoading, dict],
  );

  // Handle notification click
  const handleNotificationClick = async (notification: Notification) => {
    setLoading(true);
    // Always route through notification page to mark as read
    // The notification page will then redirect to the link if it exists
    router.push(
      `/${lang}/employee/notification?notificationId=${notification.id}`,
    );
    setIsNotificationsOpen(false);

    // Refresh notifications after a short delay to update badge count
    // This handles the case where user might stay on the page or come back quickly
    setTimeout(() => {
      fetchNotifications();
    }, 500);
  };

  // Mark all as read
  const handleMarkAllAsRead = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/notifications/read", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ markAll: true }),
      });

      if (response.ok) {
        await fetchNotifications();
      }
    } catch (error) {
      console.error("Error marking all as read:", error);
    } finally {
      setLoading(false);
    }
  };

  // Show read notifications from the last week
  const handleShowRead = useCallback(async () => {
    if (!user) return;

    try {
      setIsLoadingNotifications(true);
      setShowingReadNotifications(true);

      // Calculate date 7 days ago
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
      const dateFrom = oneWeekAgo.toISOString();

      const response = await fetch(
        `/api/notifications?limit=20&offset=0&includeRead=true&dateFrom=${encodeURIComponent(dateFrom)}`,
        {
          credentials: "include",
        },
      );

      if (response.ok) {
        const notificationsData = await response.json();
        // Show all notifications (read and unread) from the last week
        setNotifications(notificationsData.notifications || []);
      }
    } catch (error) {
      console.error("Error fetching read notifications:", error);
    } finally {
      setIsLoadingNotifications(false);
    }
  }, [user]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        profileRef.current &&
        !profileRef.current.contains(event.target as Node)
      ) {
        setIsProfileOpen(false);
      }
      if (appsRef.current && !appsRef.current.contains(event.target as Node)) {
        setIsAppsClosing(false);
        setIsAppsOpen(false);
      }
      if (
        settingsRef.current &&
        !settingsRef.current.contains(event.target as Node)
      ) {
        setIsSettingsOpen(false);
      }
      if (
        notificationsRef.current &&
        !notificationsRef.current.contains(event.target as Node)
      ) {
        setIsNotificationsOpen(false);
      }
      if (
        shareModalRef.current &&
        !shareModalRef.current.contains(event.target as Node)
      ) {
        setIsShareModalOpen(false);
      }
    }

    if (
      isProfileOpen ||
      isAppsOpen ||
      isSettingsOpen ||
      isNotificationsOpen ||
      isShareModalOpen
    ) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [
    isProfileOpen,
    isAppsOpen,
    isSettingsOpen,
    isNotificationsOpen,
    isShareModalOpen,
  ]);

  // Reset closing state after transition completes
  useEffect(() => {
    if (isAppsClosing) {
      const timer = setTimeout(() => {
        setIsAppsClosing(false);
      }, 200); // Match transition duration
      return () => clearTimeout(timer);
    }
  }, [isAppsClosing]);

  // Close apps window when pathname changes (navigation occurs)
  useEffect(() => {
    if (
      pathname &&
      prevPathnameRef.current !== null &&
      prevPathnameRef.current !== pathname
    ) {
      setIsAppsClosing(true);
      setIsAppsOpen(false);
      setPreventHover(true);
      // Prevent hover from reopening window for 500ms after navigation
      const timer = setTimeout(() => {
        setPreventHover(false);
      }, 500);
      return () => clearTimeout(timer);
    }
    prevPathnameRef.current = pathname;
  }, [pathname]);

  return (
    <header
      className="flex flex-row pl-1 pr-3 py-1 items-center justify-between relative"
      style={{ zIndex: 100 }}
    >
      <div className="flex flex-row items-center">
        <div className="relative group" ref={appsRef}>
          <button
            type="button"
            className="flex flex-row items-center py-1 px-2 min-w-30 md:min-w-40 gap-2 hover:bg-gray-300/50 rounded-lg transition-all duration-300 cursor-pointer"
            title="App Launcher"
            onClick={(e) => {
              e.preventDefault();
              setIsAppsClosing(false);
              setIsAppsOpen(!isAppsOpen);
            }}
          >
            <Image
              className="my-auto block dark:hidden h-6 w-6 md:h-9 md:w-9"
              src="/logo.svg"
              alt="logo"
              width={24}
              height={24}
            />
            <Image
              className="my-auto hidden dark:block h-6 w-6 md:h-9 md:w-9"
              src="/dark_logo.svg"
              alt="logo"
              width={24}
              height={24}
            />
            <h1 className="text-xl md:text-2xl text-left line-clamp-1">
              {pageTitle || dict.appName}
            </h1>
          </button>
          <div
            className={`absolute top-full left-2 pt-1 md:pt-3 z-50 transition-opacity duration-150 ${isAppsOpen && !isAppsClosing ? "opacity-100 pointer-events-auto " : "opacity-0 pointer-events-none "} ${isAppsClosing || preventHover ? "" : "md:group-hover:opacity-100 md:group-hover:pointer-events-auto"}`}
          >
            <div
              className="bg-white/90 backdrop-blur-md rounded-lg px-2 py-4 mt-1 max-w-[calc(100dvw-30px)] max-h-[calc(100dvh-100px)] w-xs md:w-lg lg:w-2xl"
              style={{ boxShadow: "0 0 5px 0 rgba(0, 0, 0, 0.2)" }}
            >
              <div className="overflow-y-scroll">
                <Apps
                  onAppClick={() => {
                    setIsAppsClosing(true);
                    setIsAppsOpen(false);
                  }}
                  dict={dict.apps}
                />
              </div>
            </div>
          </div>
        </div>
        <button
          type="button"
          className="p-2 ml-2 hover:bg-gray-300/50 rounded-lg transition-all duration-300 cursor-pointer"
          title="Share Page"
          onClick={handleShareClick}
        >
          <Share2Icon strokeWidth={1.5} className="h-5 w-5 md:h-6 md:w-6" />
        </button>
      </div>
      <div className="relative flex flex-row items-center gap-2">
        {/* {process.env.NODE_ENV === "development" && (
          <LanguageSwitch lang={lang} />
        )} */}
        <div className="md:relative group" ref={notificationsRef}>
          <button
            type="button"
            className="relative p-2 hover:bg-gray-300/50 rounded-lg transition-all duration-300 cursor-pointer"
            title="Notifications"
            onClick={(e) => {
              e.preventDefault();
              setIsNotificationsOpen(!isNotificationsOpen);
              if (!isNotificationsOpen) {
                fetchNotifications();
              }
            }}
          >
            <BellIcon strokeWidth={1.5} className="h-5 w-5 md:h-6 md:w-6" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center">
                {showPingAnimation && (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75"></span>
                )}
                <span className="relative inline-flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white text-xs font-bold">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              </span>
            )}
          </button>
          <div
            className={`text-black absolute top-full right-0 pt-1 md:pt-3 z-50 transition-opacity duration-150 ${isNotificationsOpen ? "opacity-100 pointer-events-auto " : "opacity-0 pointer-events-none "} md:group-hover:opacity-100 md:group-hover:pointer-events-auto`}
          >
            <div
              className="bg-white rounded-lg min-w-80 max-w-96 max-h-[80vh] overflow-y-auto flex flex-col"
              style={{ boxShadow: "0 0 5px 0 rgba(0, 0, 0, 0.2)" }}
            >
              <div className="flex items-baseline justify-between border-b border-gray-200 px-3 pt-2 pb-1 mb-1 sticky top-0 bg-white">
                <h3 className="text-lg font-medium">{dict.notifications}</h3>
                {unreadCount > 0 ? (
                  <button
                    type="button"
                    onClick={handleMarkAllAsRead}
                    className="text-xs text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                  >
                    {dict.markAllAsRead}
                  </button>
                ) : (
                  !showingReadNotifications && (
                    <button
                      type="button"
                      onClick={handleShowRead}
                      className="text-xs text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                    >
                      {dict.showRead}
                    </button>
                  )
                )}
              </div>
              <div className="flex flex-col px-2 pb-2">
                {isLoadingNotifications ? (
                  <div className="py-4 text-center text-sm text-gray-500">
                    {dict.loading}
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="py-4 text-center text-sm text-gray-500">
                    {dict.noNotifications}
                  </div>
                ) : (
                  notifications.map((notification, index) => (
                    <div key={notification.id}>
                      {index > 0 && (
                        <div className="w-full h-px my-1 bg-gray-200"></div>
                      )}
                      <button
                        type="button"
                        className={`relative w-full text-left flex flex-col py-2 px-2 rounded-md transition-all duration-300 ${
                          !notification.isRead
                            ? "bg-blue-50 hover:bg-blue-100"
                            : "hover:bg-gray-100"
                        }`}
                        onClick={() => handleNotificationClick(notification)}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex-1 min-w-0 flex flex-row gap-2 items-center justify-between">
                            <div className="flex items-center">
                              {!notification.isRead && (
                                <div className="w-2 h-2 bg-blue-500 rounded-full shrink-0 my-auto mr-2"></div>
                              )}
                              {(() => {
                                const resolved = getNotificationDisplay(
                                  notification,
                                  dict,
                                  dict.notification,
                                );
                                return (
                                  <>
                                    <span className="text-sm font-semibold line-clamp-1">
                                      {resolved.title}
                                    </span>
                                    {resolved.displayType && (
                                      <span
                                        className={`text-xs px-1.5 py-0.5 ml-2 rounded ${
                                          resolved.displayType === "error"
                                            ? "bg-red-100 text-red-700"
                                            : resolved.displayType === "warning"
                                              ? "bg-yellow-100 text-yellow-700"
                                              : resolved.displayType ===
                                                  "success"
                                                ? "bg-green-100 text-green-700"
                                                : "bg-blue-100 text-blue-700"
                                        }`}
                                      >
                                        {resolved.displayType}
                                      </span>
                                    )}
                                  </>
                                );
                              })()}
                            </div>
                            <span className="text-xs text-gray-500 whitespace-nowrap">
                              {format(
                                new Date(notification.createdAt),
                                "yyyy/MM/dd HH:mm:ss",
                              )}
                            </span>
                          </div>
                        </div>
                      </button>
                    </div>
                  ))
                )}
                {!isLoadingNotifications && (
                  <>
                    <div className="w-full h-px mt-1 mb-2 bg-gray-200"></div>
                    <Link
                      href={`/${lang}/employee/notification`}
                      className="text-center text-sm text-blue-600 hover:text-blue-800 hover:underline"
                      onClick={() => {
                        setLoading(true);
                        setIsNotificationsOpen(false);
                      }}
                    >
                      {dict.viewAllNotifications}
                    </Link>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="relative group" ref={settingsRef}>
          <button
            type="button"
            className="p-2 hover:bg-gray-300/50 rounded-lg transition-all duration-300 cursor-pointer"
            title="Settings"
            onClick={(e) => {
              e.preventDefault();
              setIsSettingsOpen(!isSettingsOpen);
            }}
          >
            <SettingsIcon strokeWidth={1.5} className="h-5 w-5 md:h-6 md:w-6" />
          </button>
          <div
            className={`text-black absolute top-full right-0 pt-1 md:pt-3 z-50 transition-opacity duration-150 ${isSettingsOpen ? "opacity-100 pointer-events-auto " : "opacity-0 pointer-events-none "} md:group-hover:opacity-100 md:group-hover:pointer-events-auto`}
          >
            <div
              className="bg-white rounded-lg p-1 min-w-32 flex flex-col"
              style={{ boxShadow: "0 0 5px 0 rgba(0, 0, 0, 0.2)" }}
            >
              {settingsItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="text-sm text-gray-700 hover:bg-gray-100 rounded-md px-2 py-1"
                  onClick={() => setLoading(true)}
                >
                  {dict.settings[item.title as keyof typeof dict.settings] ||
                    item.title}
                </Link>
              ))}
            </div>
          </div>
        </div>

        <div className="group" ref={profileRef}>
          <button
            type="button"
            className="h-7 w-7 md:h-9 md:w-9 flex items-center justify-center bg-gray-100 hover:outline-3 outline-gray-600/50 dark:outline-white/50 rounded-full cursor-pointer overflow-hidden"
            title="Profile"
            onClick={(e) => {
              e.preventDefault();
              setIsProfileOpen(!isProfileOpen);
            }}
          >
            <AvatarImage
              imageUrl={user?.avatarImage || ""}
              displayName={user?.displayName || ""}
            />
          </button>
          <div
            className={`text-black absolute top-full right-0 pt-1 md:pt-3 z-50 transition-opacity duration-150 ${isProfileOpen ? "opacity-100 pointer-events-auto " : "opacity-0 pointer-events-none "} md:group-hover:opacity-100 md:group-hover:pointer-events-auto`}
          >
            <div
              className="bg-white rounded-lg min-w-90 flex flex-col p-2"
              style={{ boxShadow: "0 0 5px 0 rgba(0, 0, 0, 0.2)" }}
            >
              <div className="flex flex-row items-center justify-between border-b border-gray-200 pb-2 px-2">
                <span>{dict.profile}</span>
                {/* <LogoutButton lang={lang} label="Logout" /> */}
              </div>
              <div className="flex flex-row items-center gap-4 px-4 py-4">
                <div className="w-36 h-36 rounded-full flex items-center justify-center overflow-hidden">
                  <AvatarImage
                    imageUrl={user?.avatarImage || ""}
                    displayName={user?.displayName || ""}
                  />
                </div>
                <div className="flex flex-col">
                  <span className="text-lg font-medium">
                    {user?.displayName || user?.username}
                  </span>
                  {user?.department && (
                    <span className="text-gray-500 text-sm mb-2">
                      {user.department}
                    </span>
                  )}
                  <span className="text-gray-500 text-sm">
                    {user?.email ?? null}
                  </span>
                </div>
              </div>
              {hasAnyPermission(permissions, ["*:admin#*"]) && (
                <div className="flex flex-col border-t border-gray-200 pt-1">
                  <Link
                    href={`/${lang}/admin`}
                    className="w-full py-1 px-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md whitespace-nowrap"
                    onClick={() => setLoading(true)}
                  >
                    {dict.adminSettings}
                  </Link>
                </div>
              )}
              <div className="flex flex-col border-t border-gray-200 pt-1 mt-1">
                <button
                  type="button"
                  onClick={handleLogout}
                  className="ml-auto py-1 px-3 text-left text-sm text-red-500 hover:underline rounded-md whitespace-nowrap cursor-pointer"
                >
                  {dict.signOut}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Notification Popup */}
      {popupNotification && (
        <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-top-2 fade-in duration-300">
          <div
            className={`bg-white/95 dark:bg-gray-900/95 rounded-lg shadow-lg min-w-80 max-w-md p-3`}
            style={{ boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)" }}
          >
            <div className="flex flex-col">
              {(() => {
                const resolved = getNotificationDisplay(
                  popupNotification,
                  dict,
                  dict.notification,
                );
                return (
                  <>
                    <div className="flex items-center mb-1 gap-2">
                      <div className="flex-1 flex items-center min-w-0">
                        <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 line-clamp-1 overflow-hidden">
                          {resolved.title}
                        </h4>
                        {resolved.displayType && (
                          <span
                            className={`ml-2 text-xs px-1.5 py-0.5 rounded shrink-0 ${
                              resolved.displayType === "error"
                                ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                                : resolved.displayType === "warning"
                                  ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                                  : resolved.displayType === "success"
                                    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                    : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                            }`}
                          >
                            {resolved.displayType}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {format(
                          new Date(popupNotification.createdAt),
                          "yyyy/MM/dd HH:mm:ss",
                        )}
                      </span>
                    </div>
                    {resolved.message && (
                      <p className="text-sm text-gray-600 dark:text-gray-300 line-clamp-2">
                        {resolved.message}
                      </p>
                    )}
                  </>
                );
              })()}
              <button
                type="button"
                onClick={() => setPopupNotification(null)}
                className="mt-2 text-sm dark:text-white text-black hover:text-gray-600 dark:hover:text-gray-300 shrink-0 ml-auto bg-gray-100 dark:bg-gray-900 rounded-md px-4 py-1 cursor-pointer"
                aria-label="Close notification"
              >
                {dict.share?.close || "Close"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Share Modal */}
      {isShareModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div
            ref={shareModalRef}
            className="bg-white text-black rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto m-4"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">
                {dict.share?.title || "Share Page"}
              </h2>
              <button
                type="button"
                onClick={() => setIsShareModalOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="mb-4 p-3 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600 mb-1">
                {dict.share?.currentPage || "Current page:"}
              </p>
              <p className="text-sm font-mono text-gray-800 break-all">
                {getCurrentUrl()}
              </p>
            </div>

            {shareError && (
              <Alert variant="error" className="mb-4">
                {shareError}
              </Alert>
            )}

            <form onSubmit={handleShare} className="space-y-4">
              <div>
                <div className="block text-sm font-medium mb-2">
                  {dict.share?.recipients || "Recipients"}{" "}
                  <span className="text-red-500">*</span>
                </div>

                {/* Users Selection */}
                <div className="mb-4">
                  <h3 className="text-sm font-medium mb-2">
                    {dict.share?.users || "Users"}
                  </h3>
                  <SearchInput
                    value={userSearchQuery}
                    onChange={setUserSearchQuery}
                    placeholder={dict.share?.searchUsers || "Search users..."}
                    containerClassName="mb-2"
                    className="text-sm"
                  />
                  <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg p-2">
                    {isLoadingShareOptions ? (
                      <p className="text-sm text-gray-500">{dict.loading}</p>
                    ) : filteredEmployees.length === 0 ? (
                      <p className="text-sm text-gray-500">
                        {userSearchQuery.trim()
                          ? dict.share?.noUsersFound || "No users found"
                          : dict.share?.noEmployeesAvailable ||
                            "No employees available"}
                      </p>
                    ) : (
                      filteredEmployees.map((employee) => (
                        <label
                          key={employee.username}
                          className="flex items-center gap-2 p-2 hover:bg-gray-50 cursor-pointer rounded"
                        >
                          <input
                            type="checkbox"
                            checked={selectedUsers.includes(employee.username)}
                            onChange={() =>
                              toggleUserSelection(employee.username)
                            }
                            className="rounded"
                          />
                          <span className="text-sm text-gray-700">
                            {employee.displayName} ({employee.username})
                          </span>
                        </label>
                      ))
                    )}
                  </div>
                </div>

                {/* Groups Selection */}
                <div>
                  <h3 className="text-sm font-medium mb-2">
                    {dict.share?.groups || "Groups"}
                  </h3>
                  <SearchInput
                    value={groupSearchQuery}
                    onChange={setGroupSearchQuery}
                    placeholder={dict.share?.searchGroups || "Search groups..."}
                    containerClassName="mb-2"
                    className="text-sm"
                  />
                  <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg p-2">
                    {isLoadingShareOptions ? (
                      <p className="text-sm text-gray-500">{dict.loading}</p>
                    ) : filteredGroups.length === 0 ? (
                      <p className="text-sm text-gray-500">
                        {groupSearchQuery.trim()
                          ? dict.share?.noGroupsFound || "No groups found"
                          : dict.share?.noGroupsAvailable ||
                            "No groups available"}
                      </p>
                    ) : (
                      filteredGroups.map((group) => (
                        <label
                          key={group.id}
                          className="flex items-center gap-2 p-2 hover:bg-gray-50 cursor-pointer rounded"
                        >
                          <input
                            type="checkbox"
                            checked={selectedGroups.includes(group.id)}
                            onChange={() => toggleGroupSelection(group.id)}
                            className="rounded"
                          />
                          <span className="text-sm text-gray-700">
                            {group.displayName || group.name}
                          </span>
                        </label>
                      ))
                    )}
                  </div>
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setIsShareModalOpen(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-gray-700"
                  disabled={isSharing}
                >
                  {dict.share?.cancel || "Cancel"}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                  disabled={isSharing}
                >
                  {isSharing
                    ? dict.share?.sharing || "Sharing..."
                    : dict.share?.share || "Share"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </header>
  );
}
