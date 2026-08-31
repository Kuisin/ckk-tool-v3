"use server";

import { destroyPortalSession } from "@/lib/portal-auth";
import { requirePortalFeature } from "@/lib/portal-page";

export async function portalLogout(): Promise<void> {
  requirePortalFeature();
  await destroyPortalSession();
}
