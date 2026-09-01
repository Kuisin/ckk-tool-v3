"use client";

/**
 * DeviceTabs — 端末管理（SY09）の入口。
 *
 * 拠点に据える機器を 1 か所で扱う。**共有端末（タブレット）とディスプレイは
 * 登録の手順が同じ**（作る → リンク → 有効化）なので、同じ画面のタブに置く。
 * 分けると「これはどっちの画面で直すのか」を現場が毎回考えることになる。
 *
 * **タブは 2 枚しか置かない。** 以前は「表示内容」を別タブで作ってから画面に
 * 結びつける形だったが、掲示板は 1 枚ずつ違うものを映すので共有される表示内容は
 * ほとんど生まれず、1 枚増やすたびに 3 手順を踏むことになっていた。いまは
 * 何を映すかは画面の設定なので、ディスプレイの詳細で直接編集する。
 */

import { Tabs } from "@mantine/core";
import { useState } from "react";
import { AppTabs } from "@/components/ui/AppTabs";
import type { DisplayRow } from "@/lib/displays-admin";
import type { KioskDeviceRow, KioskPlantOption } from "@/lib/kiosk-admin";
import { DisplaysTable } from "../displays/DisplaysTable";
import { KioskDevicesTable } from "./KioskDevicesTable";

type WorkLocationOption = {
  value: string;
  label: string;
  plantId: number | null;
};

type Props = {
  kioskRows: KioskDeviceRow[];
  plantOptions: KioskPlantOption[];
  workLocationOptions: WorkLocationOption[];
  displays: DisplayRow[];
  /** 表示内容の「拠点で絞る」欄の選択肢。 */
  displayPlantOptions: Array<{ value: string; label: string }>;
  displaysEnabled: boolean;
};

export function DeviceTabs({
  kioskRows,
  plantOptions,
  workLocationOptions,
  displays,
  displayPlantOptions,
  displaysEnabled,
}: Props) {
  const [tab, setTab] = useState<string | null>("kiosk");

  if (!displaysEnabled) {
    // ディスプレイが無い環境ではタブを出さない（1 枚しかないタブは邪魔）
    return (
      <KioskDevicesTable
        plantOptions={plantOptions}
        rows={kioskRows}
        workLocationOptions={workLocationOptions}
      />
    );
  }

  return (
    <AppTabs onChange={setTab} value={tab}>
      <Tabs.List>
        <Tabs.Tab value="kiosk">共有端末</Tabs.Tab>
        <Tabs.Tab value="displays">ディスプレイ</Tabs.Tab>
      </Tabs.List>

      <Tabs.Panel pt="md" value="kiosk">
        <KioskDevicesTable
          plantOptions={plantOptions}
          rows={kioskRows}
          workLocationOptions={workLocationOptions}
        />
      </Tabs.Panel>

      {/* keepMounted={false}: 開くまで WS を張らない（見ていないタブの
          プレゼンス接続は無駄なだけ） */}
      <Tabs.Panel keepMounted={false} pt="md" value="displays">
        <DisplaysTable plantOptions={displayPlantOptions} rows={displays} />
      </Tabs.Panel>
    </AppTabs>
  );
}
