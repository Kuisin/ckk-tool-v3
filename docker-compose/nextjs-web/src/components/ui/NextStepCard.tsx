"use client";

/**
 * NextStepCard — 書類詳細の最上部に出す「次のステップ」カード。
 *
 * 業務フロー上の次の書類（注文明細 → 指示書、注文請書 → 出荷書 …）へ
 * ワンクリックで進めるようにする統一コンポーネント（§10.9 ActionCard の
 * `action` トーン）。承認カードと同じ位置・同じ見た目に揃えることで、
 * 「いまやること」が常に画面最上部の 1 枚に集約される。
 *
 * 押せない状態のときはカード自体を出さない — 押せない理由は三点メニューの
 * グレーアウト項目（MenuItemDef.disabledReason）が説明する。
 */

import { IconArrowRight } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { ActionCard } from "./ActionCard";
import { PrimaryButton } from "./buttons";

export function NextStepCard({
  title,
  description,
  buttonLabel,
  href,
  icon,
}: {
  /** 例: 「次のステップ: 指示書の作成」。 */
  title: string;
  description: string;
  /** 例: 「指示書を作成」。 */
  buttonLabel: string;
  /** 遷移先（プリセレクト用のクエリ付き）。 */
  href: string;
  icon?: ReactNode;
}) {
  return (
    <ActionCard
      actions={
        <PrimaryButton href={href} leftSection={<IconArrowRight size={14} />}>
          {buttonLabel}
        </PrimaryButton>
      }
      description={description}
      icon={icon ?? <IconArrowRight size={20} />}
      title={title}
      tone="action"
    />
  );
}
