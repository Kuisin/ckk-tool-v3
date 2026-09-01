"use client";

/**
 * TableSettingsProvider — 一覧表の「表示する列」を配る Context。
 *
 * **端末ではなく DB（app.user_view_settings）に持つ**ので、会社の PC で隠した列は
 * タブレットでも隠れている。レイアウトが 1 回だけまとめて読み（表ごとに 1 往復
 * させない）、ここから各 DataTable が同期的に受け取る — 描画のあとで設定が届くと、
 * 隠したはずの列が一瞬見えてしまうため。
 *
 * 書き込みは楽観更新（先に画面を変え、裏で保存）。失敗しても列は消さず、
 * 通知だけ出す — 表示の好みのために操作を巻き戻す価値はない。
 */

import { notifications } from "@mantine/notifications";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { useTr } from "@/hooks/useTr";
import { saveTableColumns } from "./table-settings-actions";

interface TableSettingsValue {
  hiddenFor: (key: string) => string[];
  setHidden: (key: string, hidden: string[]) => void;
}

const TableSettingsContext = createContext<TableSettingsValue>({
  hiddenFor: () => [],
  setHidden: () => {},
});

export function TableSettingsProvider({
  initial,
  children,
}: {
  /** key → 隠している列 id。サーバーが user_view_settings から渡す。 */
  initial: Record<string, string[]>;
  children: ReactNode;
}) {
  const tr = useTr();
  const [map, setMap] = useState(initial);

  const setHidden = useCallback(
    (key: string, hidden: string[]) => {
      setMap((prev) => ({ ...prev, [key]: hidden }));
      void saveTableColumns(key, hidden).then((r) => {
        if (!r.ok) {
          notifications.show({
            title: tr("エラー"),
            message: r.error ?? tr("表示する列を保存できませんでした"),
            color: "red",
          });
        }
      });
    },
    [tr],
  );

  const value = useMemo<TableSettingsValue>(
    () => ({ hiddenFor: (key) => map[key] ?? [], setHidden }),
    [map, setHidden],
  );

  return (
    <TableSettingsContext.Provider value={value}>
      {children}
    </TableSettingsContext.Provider>
  );
}

export function useTableSettings(): TableSettingsValue {
  return useContext(TableSettingsContext);
}
