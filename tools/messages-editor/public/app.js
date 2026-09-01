// app.js — messages editor のクライアント側。ビルド不要の素の JS。
//
// 状態は 1 つの木（サーバーの /api/tree が返す形をそのまま持つ）。
// 値の編集はこの木を直接書き換えるだけで、構造が変わる操作（追加・削除・
// 折りたたみ・絞り込み）のときだけ再描画する——値を打つたびに再描画すると
// フォーカスとカーソル位置を毎回失うため。

const state = {
  locales: [],
  tree: [],
  collapsed: new Set(), // 折りたたみ中グループの path.join(".")
  filter: "",
  dirty: false,
};

const els = {
  headerRow: document.getElementById("header-row"),
  body: document.getElementById("tree-body"),
  status: document.getElementById("save-status"),
  warnings: document.getElementById("warnings"),
  dirLabel: document.getElementById("dir-label"),
  search: document.getElementById("search"),
};

function setStatus(kind, text) {
  els.status.className = `status-${kind}`;
  els.status.textContent = text;
}

function renderWarnings(warnings) {
  if (!warnings) {
    els.warnings.textContent = "";
    return;
  }
  const parts = [];
  for (const loc of state.locales) {
    const missing = warnings.missing?.[loc] ?? 0;
    const empty = warnings.empty?.[loc] ?? 0;
    if (missing || empty) {
      parts.push(`${loc}: 未追加 ${missing} / 空欄 ${empty}`);
    }
  }
  els.warnings.textContent = parts.length ? `⚠ ${parts.join("　")}` : "";
}

async function fetchTree() {
  setStatus("idle", "読み込み中…");
  const res = await fetch("/api/tree");
  const data = await res.json();
  state.locales = data.locales;
  state.tree = data.tree;
  els.dirLabel.textContent = data.dir;
  renderWarnings(data.warnings);
  buildHeader();
  render();
  setStatus("idle", "");
}

function buildHeader() {
  els.headerRow.innerHTML = "";
  const th0 = document.createElement("th");
  th0.className = "key-col";
  th0.textContent = "キー";
  els.headerRow.appendChild(th0);
  for (const loc of state.locales) {
    const th = document.createElement("th");
    th.textContent = loc;
    els.headerRow.appendChild(th);
  }
  const thActions = document.createElement("th");
  thActions.className = "actions-col";
  thActions.textContent = "";
  els.headerRow.appendChild(thActions);
}

async function saveTree() {
  state.dirty = true;
  setStatus("saving", "保存中…");
  try {
    const res = await fetch("/api/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tree: state.tree }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error ?? "保存に失敗しました");
    renderWarnings(data.warnings);
    setStatus("saved", "保存しました");
    state.dirty = false;
  } catch (err) {
    setStatus("error", `保存できませんでした: ${err.message ?? err}`);
  }
}

// ── 絞り込み ─────────────────────────────────────────────

function nodeMatchesSelf(node, filter) {
  if (node.key.toLowerCase().includes(filter)) return true;
  if (node.type === "leaf") {
    return Object.values(node.values).some((v) =>
      (v ?? "").toLowerCase().includes(filter),
    );
  }
  return false;
}

function subtreeHasMatch(node, filter) {
  if (nodeMatchesSelf(node, filter)) return true;
  if (node.type === "group") {
    return node.children.some((c) => subtreeHasMatch(c, filter));
  }
  return false;
}

// ── 描画 ─────────────────────────────────────────────────

function render() {
  els.body.innerHTML = "";
  const filter = state.filter.trim().toLowerCase();
  renderNodes(state.tree, 0, filter, false, els.body);
}

function renderNodes(nodes, depth, filter, forceShow, container) {
  for (const node of nodes) {
    if (filter) {
      const selfMatch = nodeMatchesSelf(node, filter);
      const show = forceShow || selfMatch || subtreeHasMatch(node, filter);
      if (!show) continue;
      const childForce = forceShow || selfMatch;
      if (node.type === "group") {
        container.appendChild(buildGroupRow(node, depth, true));
        renderNodes(node.children, depth + 1, filter, childForce, container);
      } else {
        container.appendChild(buildLeafRow(node, depth));
      }
      continue;
    }

    // 絞り込み無し — 通常の折りたたみを尊重する。
    if (node.type === "group") {
      container.appendChild(buildGroupRow(node, depth, false));
      const collapsed = state.collapsed.has(node.path.join("."));
      if (!collapsed) renderNodes(node.children, depth + 1, filter, false, container);
    } else {
      container.appendChild(buildLeafRow(node, depth));
    }
  }
}

function countLeaves(node) {
  if (node.type === "leaf") return 1;
  return node.children.reduce((n, c) => n + countLeaves(c), 0);
}

function buildGroupRow(node, depth, forceExpanded) {
  const tr = document.createElement("tr");
  tr.className = "group-row";
  const td = document.createElement("td");
  td.colSpan = state.locales.length + 2;

  const cell = document.createElement("div");
  cell.className = "key-cell";
  cell.style.paddingLeft = `${depth * 18}px`;

  const pathStr = node.path.join(".");
  const collapsed = !forceExpanded && state.collapsed.has(pathStr);

  const toggle = document.createElement("span");
  toggle.className = "toggle";
  toggle.textContent = collapsed ? "▶" : "▼";
  if (!forceExpanded) {
    toggle.addEventListener("click", () => {
      if (state.collapsed.has(pathStr)) state.collapsed.delete(pathStr);
      else state.collapsed.add(pathStr);
      render();
    });
  } else {
    toggle.style.visibility = "hidden";
  }
  cell.appendChild(toggle);

  const label = document.createElement("span");
  label.textContent = node.key;
  cell.appendChild(label);

  const count = document.createElement("span");
  count.style.fontWeight = "400";
  count.style.color = "#888";
  count.style.fontSize = "11px";
  count.textContent = ` (${countLeaves(node)})`;
  cell.appendChild(count);

  td.appendChild(cell);

  // グループ行は名前列が colSpan で全部占めているので、操作ボタンは
  // 同じセルの右端に絶対配置で重ねる（葉の行のように別セルを持たない）。
  td.style.position = "relative";
  const actionsWrap = document.createElement("div");
  actionsWrap.className = "row-actions";
  actionsWrap.style.position = "absolute";
  actionsWrap.style.right = "8px";
  actionsWrap.style.top = "3px";
  actionsWrap.appendChild(makeActionButton("＋鍵", () => addKey(node.children, node.path)));
  actionsWrap.appendChild(makeActionButton("＋組", () => addGroup(node.children, node.path)));
  actionsWrap.appendChild(makeActionButton("×", () => deleteNode(node), true));
  td.appendChild(actionsWrap);

  tr.appendChild(td);
  return tr;
}

function makeActionButton(label, onClick, danger) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = label;
  if (danger) btn.className = "danger";
  btn.addEventListener("click", onClick);
  return btn;
}

function buildLeafRow(node, depth) {
  const tr = document.createElement("tr");
  tr.className = "leaf-row";
  if (node.extraneous) tr.classList.add("extraneous");

  const keyTd = document.createElement("td");
  const keyCell = document.createElement("div");
  keyCell.className = "key-cell";
  keyCell.style.paddingLeft = `${depth * 18 + 16}px`;
  keyCell.textContent = node.key;
  if (node.extraneous) {
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = "他言語のみ";
    keyCell.appendChild(badge);
  }
  keyTd.appendChild(keyCell);
  tr.appendChild(keyTd);

  for (const loc of state.locales) {
    const td = document.createElement("td");
    const textarea = document.createElement("textarea");
    textarea.className = "value-cell";
    textarea.rows = 1;
    textarea.value = node.values[loc] ?? "";
    if (!textarea.value) textarea.classList.add("problem");
    autoResize(textarea);
    textarea.addEventListener("input", () => autoResize(textarea));
    textarea.addEventListener("blur", () => {
      const next = textarea.value;
      if (node.values[loc] === next) return;
      node.values[loc] = next;
      if (next) delete node.missing?.[loc];
      textarea.classList.toggle("problem", !next);
      saveTree();
    });
    td.appendChild(textarea);
    tr.appendChild(td);
  }

  const actionsTd = document.createElement("td");
  const wrap = document.createElement("div");
  wrap.className = "row-actions";
  wrap.appendChild(makeActionButton("×", () => deleteNode(node), true));
  actionsTd.appendChild(wrap);
  tr.appendChild(actionsTd);

  return tr;
}

function autoResize(textarea) {
  textarea.style.height = "auto";
  textarea.style.height = `${textarea.scrollHeight}px`;
}

// ── 構造の変更（追加・削除） ─────────────────────────────

function findParentArray(root, targetPath) {
  // targetPath の**親**の children 配列を返す。ルート直下なら root 自身。
  if (targetPath.length <= 1) return root;
  let nodes = root;
  for (let i = 0; i < targetPath.length - 1; i++) {
    const seg = targetPath[i];
    const group = nodes.find((n) => n.key === seg && n.type === "group");
    if (!group) return null;
    nodes = group.children;
  }
  return nodes;
}

function deleteNode(node) {
  const count = node.type === "group" ? countLeaves(node) : 1;
  const msg =
    node.type === "group"
      ? `「${node.path.join(".")}」配下の ${count} 件をすべて削除します。よろしいですか？`
      : `「${node.path.join(".")}」を削除します。よろしいですか？`;
  if (!confirm(msg)) return;
  const parent = findParentArray(state.tree, node.path);
  if (!parent) return;
  const idx = parent.indexOf(node); // 参照で探す（同名キーの取り違えを避ける）
  if (idx === -1) return;
  parent.splice(idx, 1);
  saveTree();
  render();
}

function validKeyName(name, siblings) {
  if (!name) return "キー名を入力してください";
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(name)) {
    return "半角英字と数字のみ（例: saveFailed）。next-intl のキー慣習に合わせます";
  }
  if (siblings.some((s) => s.key === name)) return "同じ名前のキーが既にあります";
  return null;
}

function addKey(childrenArray, parentPath) {
  const name = prompt("追加するキー名（英数字、lowerCamelCase）");
  if (name === null) return;
  const err = validKeyName(name, childrenArray);
  if (err) {
    alert(err);
    return;
  }
  const values = {};
  for (const loc of state.locales) {
    values[loc] = prompt(`[${loc}] の訳文（ja を先に決めてから他言語）`, "") ?? "";
  }
  childrenArray.push({
    type: "leaf",
    key: name,
    path: [...parentPath, name],
    values,
    missing: {},
  });
  saveTree();
  render();
}

function addGroup(childrenArray, parentPath) {
  const name = prompt("追加する名前空間名（英数字、lowerCamelCase）");
  if (name === null) return;
  const err = validKeyName(name, childrenArray);
  if (err) {
    alert(err);
    return;
  }
  childrenArray.push({
    type: "group",
    key: name,
    path: [...parentPath, name],
    children: [],
  });
  saveTree();
  render();
}

// ── ツールバー ───────────────────────────────────────────

document.getElementById("expand-all").addEventListener("click", () => {
  state.collapsed.clear();
  render();
});
document.getElementById("collapse-all").addEventListener("click", () => {
  function collectGroupPaths(nodes, acc) {
    for (const n of nodes) {
      if (n.type === "group") {
        acc.push(n.path.join("."));
        collectGroupPaths(n.children, acc);
      }
    }
    return acc;
  }
  const all = collectGroupPaths(state.tree, []);
  state.collapsed = new Set(all);
  render();
});
document.getElementById("add-root-group").addEventListener("click", () => {
  addGroup(state.tree, []);
});
document.getElementById("reload").addEventListener("click", () => {
  if (state.dirty) {
    if (!confirm("保存中の変更が残っている可能性があります。再読み込みしますか？")) return;
  }
  fetchTree();
});
els.search.addEventListener("input", () => {
  state.filter = els.search.value;
  render();
});

fetchTree();
