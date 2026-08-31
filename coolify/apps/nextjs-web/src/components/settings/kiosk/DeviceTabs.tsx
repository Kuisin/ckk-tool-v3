"use client";

/**
 * DeviceTabs — 端末管理（SY09）の入口。
 *
 * 拠点に据える機器を 1 か所で扱う。**共有端末（タブレット）とディスプレイは
 * 登録の手順が同じ**（作る → リンク → 有効化）なので、同じ画面のタブに置く。
 * 分けると「これはどっちの画面で直すのか」を現場が毎回考えることになる。
 *
 * 「表示内容」は**ディスプレイにしか無い設定**なので、ディスプレイを使う
 * 環境でだけ出す（タブが増えるとタブレットしか使わない人の邪魔になる）。
 */

import { Tabs } from "@mantine/core";
import { useState } from "react";
import { AppTabs } from "@/components/ui/AppTabs";
import type { DisplayProfileRow, DisplayRow } from "@/lib/displays-admin";
import type { KioskDeviceRow, KioskPlantOption } from "@/lib/kiosk-admin";
import { DisplayProfilesPanel } from "../displays/DisplayProfilesPanel";
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
  displayProfiles: DisplayProfileRow[];
  pairableProfiles: Array<{ id: string; name: string }>;
  displaysEnabled: boolean;
};

export function DeviceTabs({
  kioskRows,
  plantOptions,
  workLocationOptions,
  displays,
  displayProfiles,
  pairableProfiles,
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
        <Tabs.Tab value="content">表示内容</Tabs.Tab>
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
        <DisplaysTable
          plantOptions={plantOptions.map((p) => ({
            value: String(p.value),
            label: p.label,
          }))}
          profiles={pairableProfiles}
          rows={displays}
        />
      </Tabs.Panel>

      <Tabs.Panel keepMounted={false} pt="md" value="content">
        <DisplayProfilesPanel
          plantOptions={plantOptions.map((p) => ({
            value: String(p.value),
            label: p.label,
          }))}
          rows={displayProfiles}
        />
      </Tabs.Panel>
    </AppTabs>
  );
}
