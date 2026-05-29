"use client";
import { useRef, useState } from "react";
import AvatarImage from "@/components/avatar-image";
import Loader from "@/components/ui/loading";
import { useCurrentUser } from "@/hooks/use-current-user";
import { usePermissions } from "@/hooks/use-permissions";
import { replaceTemplate } from "@/lib/language";
import HomeApps from "./home-apps";

interface EmployeePageClientProps {
  dict: {
    welcome: string;
    department: string;
    email: string;
    noDepartment: string;
    title: string;
    noTitle: string;
    zones: string;
    noZones: string;
    permissions: string;
    noPermissions: string;
    homeApps?: {
      starredApps: string;
      otherApps: string;
      noAppsAvailable: string;
      addToFavorites: string;
      removeFromFavorites: string;
    };
  };
}

export function EmployeePageClient({ dict }: EmployeePageClientProps) {
  const { user } = useCurrentUser();
  const { permissions, isLoading } = usePermissions();
  const [showPermissions, setShowPermissions] = useState(false);
  const clickTimestamps = useRef<number[]>([]);

  const MAX_CLICKS_TO_TOGGLE = 5;

  const handleTripleClick = () => {
    const now = Date.now();
    clickTimestamps.current.push(now);

    // Keep only clicks within the last 500ms
    clickTimestamps.current = clickTimestamps.current.filter(
      (timestamp) => now - timestamp < 1000,
    );

    // If we have 3 clicks within 500ms, toggle permissions
    if (clickTimestamps.current.length >= MAX_CLICKS_TO_TOGGLE) {
      setShowPermissions((prev) => !prev);
      clickTimestamps.current = []; // Reset after toggle
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleTripleClick();
    }
  };

  if (isLoading || !user) {
    return <Loader />;
  }

  return (
    <div className="flex flex-col items-center justify-center">
      <div className="mt-8 flex flex-col items-center justify-center">
        <div className="flex flex-row items-center justify-center gap-8 mx-4">
          <div className="w-32 h-32 bg-gray-100 rounded-full flex items-center justify-center overflow-hidden">
            <AvatarImage
              imageUrl={user.avatarImage || ""}
              displayName={user.displayName || ""}
            />
          </div>
          <div className="flex flex-col items-start">
            <p className="text-lg font-medium">
              {replaceTemplate(dict.welcome, {
                name: user.displayName || user.username || "",
              })}
            </p>
            <button
              type="button"
              className="flex flex-col items-start bg-transparent border-none p-0 cursor-default text-sm"
              onClick={handleTripleClick}
              onKeyDown={handleKeyDown}
            >
              <p className="text-left">{user.username}</p>
              <p>
                {dict.title}: {user.title || dict.noTitle}
              </p>
              <p className="text-left">
                {dict.department}: {user.department || dict.noDepartment}
              </p>
              <p className="text-left">
                {dict.zones}:{" "}
                {user.zones && user.zones.length > 0
                  ? user.zones.join(", ")
                  : dict.noZones}
              </p>
              <p className="text-left">
                {dict.email}: {user.email ?? null}
              </p>
            </button>
          </div>
        </div>

        {showPermissions && (
          <div className="mt-4 mx-4 p-4 bg-gray-100 rounded-lg">
            <p className="text-sm font-semibold mb-2">{dict.permissions}:</p>
            <p className="text-sm text-center">
              {permissions.join(", ") || dict.noPermissions}
            </p>
          </div>
        )}
        {process.env.NODE_ENV === "development" && (
          <p className="mt-4 mx-4 p-4 bg-gray-100 rounded-lg text-sm text-center">
            {permissions.join(", ")}
          </p>
        )}
      </div>
      <div className="mt-8 w-full max-w-4xl px-4">
        <HomeApps dict={dict.homeApps} />
      </div>
    </div>
  );
}
