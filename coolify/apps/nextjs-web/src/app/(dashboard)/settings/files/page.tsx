import { FileManager } from "@/components/admin/FileManager";
import { requireAppRead } from "@/lib/authz-page";

/** 管理 › ファイル管理 — admin document storage (SeaweedFS) browser. */
export default async function AdminFilesPage() {
  const denied = await requireAppRead("file-management");
  if (denied) return denied;
  return <FileManager />;
}
