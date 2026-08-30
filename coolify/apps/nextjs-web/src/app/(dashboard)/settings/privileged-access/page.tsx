import { PrivilegedAccessView } from "@/components/settings/privileged/PrivilegedAccessView";
import { requireAppRead } from "@/lib/authz-page";
import { requestableCodes } from "@/lib/privileged-access";
import { ELEVATION_CODES } from "@/lib/privileged-operations";
import {
  approvableCodesFor,
  listDecidedRequests,
  listMyRequests,
  listRequestsToApprove,
} from "@/lib/privileged-requests";
import { USER_ADMIN_CODE } from "@/lib/user-change-requests";

export const dynamic = "force-dynamic";

/**
 * 特権アクセス（SY0G）— 申請と決裁の 1 画面。
 *
 * requiredPermission は null（誰でも開ける）。中身は「自分が申請できるもの」と
 * 「自分が決裁できるもの」だけなので、権限の無い人には空の画面が出る。
 * my-tasks / forms と同じ扱い — アプリ単位の入口権限を作ると、申請したい人に
 * まず入口の権限を配る必要が出て、分離した意味が薄れる。
 */
export default async function PrivilegedAccessPage() {
  const denied = await requireAppRead("privileged-access");
  if (denied) return denied;

  const [mine, toApprove, decided, canRequestCodes, approvable] =
    await Promise.all([
      listMyRequests(),
      listRequestsToApprove(),
      listDecidedRequests(),
      requestableCodes(ELEVATION_CODES),
      approvableCodesFor([...ELEVATION_CODES, USER_ADMIN_CODE]),
    ]);

  return (
    <PrivilegedAccessView
      canApprove={approvable.length > 0}
      canRequest={canRequestCodes.length > 0}
      decided={decided}
      mine={mine}
      toApprove={toApprove}
    />
  );
}
