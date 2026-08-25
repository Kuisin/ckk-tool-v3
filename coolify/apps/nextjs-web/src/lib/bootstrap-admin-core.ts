/**
 * bootstrap-admin-core.ts — 初期管理者（ローカル `admin`）を畳んでよいかの判定。
 *
 * 新規 DB は「ロールを持つ人が誰も居ない」状態で立ち上がるので、マイグレーション
 * `20260826090000_bootstrap_admin_account` が既定パスワード `admin` のローカル
 * アカウントを 1 つ作る。これは**立ち上げ用の踏み台**であって、恒久的な管理者
 * ではない。実運用の管理者ができたら無効化するのが正しい終わり方。
 *
 * ただし**先に無効化してしまうと誰も管理できない DB になる**（ロール付与の画面が
 * 無いので、そうなると psql でしか戻せない）。だから「他に管理者が居ること」を
 * 無効化の必須条件にする。
 *
 * ここは純ロジックだけ（DB も session も触らない）— サーバー側の実行前チェックと
 * 画面の表示を**同じ関数**で決めるため。片方だけ直して食い違うのを防ぐ。
 */

/** マイグレーションが作るローカル初期管理者の username。 */
export const BOOTSTRAP_ADMIN_USERNAME = "admin";

export interface BootstrapAdminInput {
  /** 対象ユーザーの username。 */
  username: string;
  /** 対象が現在有効か。 */
  isActive: boolean;
  /** 既定パスワードのままか（users.password_change_required）。 */
  passwordChangeRequired: boolean;
  /**
   * **対象以外**で system:ADMIN を持つ有効ユーザーの数。
   * 0 なら、この口を閉じると管理者が居なくなる。
   */
  otherActiveAdminCount: number;
}

export type BootstrapAdminStatus =
  /** 初期管理者ではない（通常のユーザー）。 */
  | "not-bootstrap"
  /** 既に無効化済み — 望ましい終状態。 */
  | "retired"
  /** まだ他に管理者が居ない。無効化は不可。 */
  | "blocked-no-other-admin"
  /** 他に管理者が居る。無効化してよい（推奨）。 */
  | "ready-to-retire";

export interface BootstrapAdminState {
  status: BootstrapAdminStatus;
  /** 無効化ボタンを押せるか。サーバー側の実行可否と同じ値。 */
  canDisable: boolean;
  /** 画面に出す一文（null = 何も出さない）。 */
  message: string | null;
  /** 既定パスワードのまま放置されている = 危険。強めに出す。 */
  isDefaultPasswordStillActive: boolean;
}

export function isBootstrapAdmin(username: string): boolean {
  return username === BOOTSTRAP_ADMIN_USERNAME;
}

/**
 * 初期管理者の「いま何をすべきか」を 1 か所で決める。
 * サーバー側 disableBootstrapAdmin と SY01 の表示が、この結果だけを見る。
 */
export function bootstrapAdminState(
  input: BootstrapAdminInput,
): BootstrapAdminState {
  if (!isBootstrapAdmin(input.username)) {
    return {
      status: "not-bootstrap",
      canDisable: false,
      message: null,
      isDefaultPasswordStillActive: false,
    };
  }

  // 既定パスワードのまま有効 = 誰でも入れる状態。無効化の可否とは別に警告する。
  const isDefaultPasswordStillActive =
    input.isActive && input.passwordChangeRequired;

  if (!input.isActive) {
    return {
      status: "retired",
      canDisable: false,
      message:
        "初期管理者は無効化済みです。実運用の管理者アカウントで運用してください。",
      isDefaultPasswordStillActive: false,
    };
  }

  if (input.otherActiveAdminCount < 1) {
    return {
      status: "blocked-no-other-admin",
      canDisable: false,
      message:
        "実ユーザーに管理者権限（system:ADMIN）を割り当ててから無効化してください。" +
        "いま無効化すると管理者が居なくなり、権限を戻す画面が無いため psql でしか復旧できません。",
      isDefaultPasswordStillActive,
    };
  }

  return {
    status: "ready-to-retire",
    canDisable: true,
    message:
      `他に管理者が ${input.otherActiveAdminCount} 名居ます。` +
      "初期管理者は立ち上げ用の踏み台なので、無効化することを推奨します。",
    isDefaultPasswordStillActive,
  };
}
