/**
 * portal-guide-core.ts — 取引先ポータルの「ご利用案内」の純粋な部分。
 *
 * 案内 PDF（api/pdf/portal-guide）とログイン画面の両方が使うので、DB にも
 * `server-only` にも触らない形でここに置く。
 *
 * ■ QR に URL を入れる（書類 QR とは規約が違う）
 * `lib/pdf-qr.ts` の書類 QR は **URL を入れない** — 現場のスキャナが読むのは
 * `CKK:<種別>:<番号>` で、URL は QR を細かくするうえ紙が外へ出たときに
 * ホスト名を晒すため。案内 PDF は逆で、**社外の人が自分の携帯で読んで
 * ポータルを開く**ためのものなので URL でなければ意味がない。ホスト名は
 * そもそも案内に印字して教えるものなので、隠す理由も無い。
 *
 * ■ QR に入れてよいのは「識別子」まで。**資格情報は入れない**
 * 入れるのは宛先アドレスの前埋めだけで、これは本人の識別子であって鍵ではない
 * （確認コードは登録アドレスへ送られる。URL を拾った第三者は何も進められない）。
 * バックアップコード・セッション・書類リンクのトークンは**紙にも QR にも
 * 載せない** — あれらは持っているだけで開ける bearer 資格情報で、
 * 手渡し以外の経路に出してはいけない（portal.prisma の方針）。
 */

/** メールアドレスとして URL に載せてよい形か（前埋めの受け口の入力検証）。 */
export function isPlausibleEmail(value: string): boolean {
  const v = value.trim();
  if (v.length === 0 || v.length > 254) return false;
  // 受け取り側は「入力欄に置くだけ」なので、厳密な RFC 準拠までは要らない。
  // 弾きたいのは**アドレスに見えない文字列**（案内文のように読ませる細工）。
  return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(v);
}

/**
 * ログイン画面の URL に前埋めのアドレスを載せる。
 *
 * アドレスが空・形が違うときは**素のログイン URL**を返す（前埋めが無いだけで
 * 案内としては成立する）。`base` は末尾のスラッシュを許す。
 */
export function portalLoginUrl(base: string, email?: string | null): string {
  const root = base.replace(/\/+$/, "");
  const url = `${root}/portal/login`;
  if (!email || !isPlausibleEmail(email)) return url;
  return `${url}?e=${encodeURIComponent(email.trim())}`;
}

/** 案内に載せる付与の最小形（DB の行から必要な分だけ写したもの）。 */
export interface PortalGuideGrant {
  kind: string;
  formTitle?: string | null;
  includeBranches?: boolean;
  includeAsEndUser?: boolean;
}

/**
 * 「ご覧いただけるもの」。
 *
 * **付与を数えるのであって、書類を数えるのではない。** 案内は渡す時点で刷る
 * ものなので、件数を書くと翌日には嘘になる。
 */
export interface PortalGuideScope {
  /** 自社宛の書類と注文の進捗（BP_SCOPE の付与がある）。 */
  documents: boolean;
  /** 支店宛の書類も含む。 */
  branches: boolean;
  /** 需要家・出荷先としての書類も含む。 */
  asEndUser: boolean;
  /** 個別に指定された書類の件数（DOCUMENT の付与）。 */
  singleDocuments: number;
  /** 共有されたフォームの名前（重複なし・並びは付与の順）。 */
  forms: string[];
}

export function summarizePortalGuideScope(
  grants: readonly PortalGuideGrant[],
): PortalGuideScope {
  const forms: string[] = [];
  let documents = false;
  let branches = false;
  let asEndUser = false;
  let singleDocuments = 0;

  for (const g of grants) {
    switch (g.kind) {
      case "BP_SCOPE":
        documents = true;
        // 広いほうが勝つ（付与の和集合 — portal-access-core と同じ規則）。
        branches = branches || g.includeBranches !== false;
        asEndUser = asEndUser || g.includeAsEndUser === true;
        break;
      case "DOCUMENT":
        singleDocuments += 1;
        break;
      case "FORM": {
        const title = g.formTitle?.trim();
        if (title && !forms.includes(title)) forms.push(title);
        break;
      }
      // 未知の kind は数えない（fail-closed — 紙に嘘を書かない）。
    }
  }

  return { documents, branches, asEndUser, singleDocuments, forms };
}

/** 案内に出すものが 1 つも無いか（何も見えない人に案内を渡さないため）。 */
export function isEmptyPortalGuideScope(scope: PortalGuideScope): boolean {
  return (
    !scope.documents && scope.singleDocuments === 0 && scope.forms.length === 0
  );
}
