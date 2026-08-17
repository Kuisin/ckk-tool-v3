/**
 * UserAvatar — ユーザーの顔（プロフィール写真 / イニシャル）。
 *
 * プロフィール写真は **常に真円** で表示する（`radius="xl"` は 32px 固定なので
 * 64px を超えるサイズだと角丸の四角に見えてしまう）。表示位置ごとにブレない
 * よう、アバターを出す箇所は必ずこのコンポーネントを使う。
 *
 * 写真は正方形に切り抜いて **大小 2 枚** 保存してある（lib/avatar.ts）。
 * どちらを読むかはここで `size` から決めるので、呼び出し側は両方の URL を
 * 渡すだけでよい — 一覧やヘッダーで大きな画像を読んでしまうことがない。
 */

import { Avatar, type AvatarProps } from "@mantine/core";

/**
 * これ以下の表示サイズなら小サイズ（96px）で十分（px）。
 *
 * 96 / 2 = 48 — 2x ディスプレイでも等倍以上になる境界。一覧・ヘッダー・
 * 履歴・コメントのアイコン（18〜32px）は全て小を読み、プロフィールや
 * ホームの大きいアバター（64・72px）だけ大を読む。
 */
const THUMB_THRESHOLD_PX = 48;

/** Mantine のサイズトークン → おおよその実サイズ px。 */
const TOKEN_PX: Record<string, number> = {
  xs: 16,
  sm: 26,
  md: 38,
  lg: 56,
  xl: 84,
};

function resolvePx(size: AvatarProps["size"]): number {
  if (typeof size === "number") return size;
  if (typeof size === "string") {
    const token = TOKEN_PX[size];
    if (token) return token;
    const parsed = Number.parseFloat(size);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return TOKEN_PX.md;
}

export interface UserAvatarProps extends Omit<AvatarProps, "src" | "radius"> {
  /** 写真（大）。未設定なら null → イニシャル表示。 */
  src?: string | null;
  /** 写真（小）。小さく表示するときはこちらを読む。 */
  thumbSrc?: string | null;
  /** 表示名 — alt とイニシャルの元。 */
  name: string;
  /** イニシャル（省略時は表示名の先頭 2 文字）。 */
  initials?: string;
}

export function UserAvatar({
  src,
  thumbSrc,
  name,
  initials,
  size,
  ...props
}: UserAvatarProps) {
  const small = resolvePx(size) <= THUMB_THRESHOLD_PX;
  const chosen = (small ? (thumbSrc ?? src) : (src ?? thumbSrc)) ?? undefined;
  return (
    <Avatar
      alt={name}
      color="blue"
      radius={9999}
      size={size}
      src={chosen}
      {...props}
    >
      {initials ?? name.slice(0, 2)}
    </Avatar>
  );
}
