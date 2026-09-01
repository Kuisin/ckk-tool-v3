"use client";

/**
 * AppTabs — 画面のタブはすべてこれを通す（Mantine の `Tabs` を直接書かない）。
 *
 * **タブが横幅に収まらないときは、横並びをやめてドロップダウンにする。**
 * 以前は 2 通りの負け方をしていた: PC ではタブが 2 段・3 段に折り返して本文が
 * 下へ押し出され、スマホでは横スクロール（globals.css）にしていたので、開いて
 * いるタブが画面外に隠れて「いま何を見ているのか」が分からなかった。
 * 幅で決めるので、スマホでもタブが 2 枚なら横並びのまま、PC でも 8 枚あって
 * 狭ければドロップダウンになる。
 *
 * **呼び出し側の書き方は Mantine のまま** — `<Tabs>` を `<AppTabs>` に替える
 * だけで、中身（`Tabs.List` / `Tabs.Tab` / `Tabs.Panel`）は一切変えない。
 * ドロップダウンの中身は `Tabs.List` の子（`Tabs.Tab`）から読み取る。
 *
 * 測り方: `Tabs.List` は常に 1 つだけ描き（複製すると id が重なる）、その
 * `scrollWidth`（＝折り返さないときに必要な幅）を親の幅と比べる。畳んだあとは
 * `position:absolute; width:max-content` で見えない場所に置くので、同じ読み方で
 * 「本来必要な幅」が取れる ⇒ 広くなったら横並びへ戻せる。見えないまま残すのは
 * 測るためだけではない — `Tabs.Panel` の `aria-labelledby` が指す先（タブの id）
 * を消さないため。
 */

import { Menu, Tabs, type TabsProps, UnstyledButton } from "@mantine/core";
import { useIsomorphicEffect } from "@mantine/hooks";
import { IconChevronDown } from "@tabler/icons-react";
import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
  useCallback,
  useRef,
  useState,
} from "react";
import { useTr } from "@/hooks/useTr";
import { nextTabsCollapsed } from "@/lib/tab-overflow";

interface TabItem {
  value: string;
  label: ReactNode;
  leftSection?: ReactNode;
  rightSection?: ReactNode;
  disabled?: boolean;
}

type AnyProps = Record<string, unknown>;

function isElement(node: ReactNode): node is ReactElement<AnyProps> {
  return isValidElement(node);
}

/**
 * `Tabs.List` の子から、ドロップダウンに出す項目を読み取る（Fragment も辿る）。
 * 試験のため export している（AppTabs.test.ts）— 外から使う想定は無い。
 */
export function collectTabs(node: ReactNode, out: TabItem[] = []): TabItem[] {
  for (const child of Children.toArray(node)) {
    if (!isElement(child)) continue;
    const props = child.props;
    // `{cond && <Tabs.Tab/>}` の false や、Fragment でまとめた並びに耐える。
    if (child.type === Tabs.Tab || typeof props.value === "string") {
      if (typeof props.value !== "string") continue;
      out.push({
        value: props.value,
        label: props.children as ReactNode,
        leftSection: props.leftSection as ReactNode,
        rightSection: props.rightSection as ReactNode,
        disabled: props.disabled === true,
      });
    } else if (props.children) {
      collectTabs(props.children as ReactNode, out);
    }
  }
  return out;
}

/** 子を「タブ列」と「それ以外（パネルなど）」に割る（試験のため export）。 */
export function splitList(children: ReactNode): {
  list: ReactElement<AnyProps> | null;
  rest: ReactNode[];
} {
  const rest: ReactNode[] = [];
  let list: ReactElement<AnyProps> | null = null;
  for (const child of Children.toArray(children)) {
    if (!list && isElement(child) && child.type === Tabs.List) list = child;
    else rest.push(child);
  }
  return { list, rest };
}

export function AppTabs({
  children,
  value,
  defaultValue,
  onChange,
  ...rest
}: TabsProps) {
  const tr = useTr();
  // 制御 / 非制御のどちらでも受ける（呼び出し側は Mantine と同じ書き方）。
  // 畳んだときの見出しに「いま開いているタブ」が要るので、非制御でも中で持つ。
  const [internal, setInternal] = useState<string | null>(defaultValue ?? null);
  const active = value !== undefined ? value : internal;
  const handleChange = useCallback(
    (next: string | null) => {
      if (value === undefined) setInternal(next);
      onChange?.(next);
    },
    [value, onChange],
  );

  const { list, rest: panels } = splitList(children);
  const items = list ? collectTabs(list.props.children as ReactNode) : [];

  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(false);

  useIsomorphicEffect(() => {
    const container = containerRef.current;
    if (!container || items.length === 0) return;

    const measure = () => {
      // **タブ列そのもの**を測る。包んでいる div ではない — 中の列は
      // overflow:hidden なので親の div ははみ出さず、幅が常に同じに見える
      // （これで畳まれない不具合を出した）。
      const list =
        listRef.current?.querySelector<HTMLElement>('[role="tablist"]');
      if (!list) return;
      // scrollWidth は「折り返さないときに必要な幅」。横並び（overflow:hidden）
      // でも、畳んだあと（width:max-content の中）でも同じ意味になる。
      const next = nextTabsCollapsed(
        collapsed,
        list.scrollWidth,
        container.clientWidth,
      );
      if (next !== null) setCollapsed(next);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
    // items の中身（タブの増減・バッジの出入り）でも測り直す。
  }, [collapsed, items.length, items.map((t) => t.value).join(",")]);

  const activeItem = items.find((t) => t.value === active) ?? items[0];

  return (
    <Tabs {...rest} onChange={handleChange} value={active}>
      {list && (
        <div className="app-tabs-bar" ref={containerRef}>
          <div
            className={collapsed ? "app-tabs-measure" : undefined}
            ref={listRef}
          >
            {list}
          </div>
          {collapsed && (
            <Menu
              position="bottom-start"
              shadow="md"
              width="target"
              withinPortal
            >
              {/*
               * 見た目は**タブ列と同じ**にする（枠も背景も持たず、下線 1 本だけ
               * — .app-tabs-trigger）。以前は variant="default" の Button だったので
               * 入力欄の Select と見分けが付かず、「タブを選ぶ」ではなく
               * 「値を選ぶ」に見えていた。開けることは右端の ▾ で示す。
               */}
              <Menu.Target>
                <UnstyledButton className="app-tabs-trigger">
                  {activeItem?.leftSection}
                  <span className="app-tabs-trigger-label">
                    {activeItem?.label ?? tr("タブ")}
                  </span>
                  {activeItem?.rightSection}
                  <IconChevronDown
                    className="app-tabs-trigger-chevron"
                    size={16}
                  />
                </UnstyledButton>
              </Menu.Target>
              <Menu.Dropdown>
                {items.map((item) => (
                  <Menu.Item
                    bg={
                      item.value === active
                        ? "light-dark(var(--mantine-color-blue-0), var(--mantine-color-dark-5))"
                        : undefined
                    }
                    disabled={item.disabled}
                    fw={item.value === active ? 600 : undefined}
                    key={item.value}
                    leftSection={item.leftSection}
                    onClick={() => handleChange(item.value)}
                    rightSection={item.rightSection}
                  >
                    {item.label}
                  </Menu.Item>
                ))}
              </Menu.Dropdown>
            </Menu>
          )}
        </div>
      )}
      {panels}
    </Tabs>
  );
}
