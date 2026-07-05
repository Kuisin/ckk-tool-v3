/**
 * mock.ts — Shared sample data for design previews.
 *
 * Consistent entities (customers, products, materials, users…) reused across
 * every page so cross-references line up (e.g. a quote's customer also appears
 * in the customer master). Not a DB — preview only.
 */

export interface Option { value: string; label: string }

// ── Users / staff ───────────────────────────────────────────────────────────
export const USERS = {
  suzuki: '鈴木 一郎',
  tanaka: '田中 太郎',
  nakamura: '中村 花子',
  yamada: '山田 部長',
  sato: '佐藤 工場長',
  ito: '伊藤 係長',
} as const;

export const USER_OPTIONS: Option[] = Object.entries(USERS).map(([value, label]) => ({ value, label }));

// ── Customers (CUSTOMER role BPs) ────────────────────────────────────────────
export const CUSTOMERS: Option[] = [
  { value: 'bp-001', label: '株式会社ABC製作所' },
  { value: 'bp-002', label: '合同会社XYZ工業' },
  { value: 'bp-003', label: '株式会社DEFエンジニアリング' },
  { value: 'bp-004', label: '東邦精密株式会社' },
];

export const BRANCHES: Record<string, Option[]> = {
  'bp-001': [
    { value: 'bp-001-t', label: '東京本社' },
    { value: 'bp-001-o', label: '大阪支社' },
  ],
  'bp-002': [],
  'bp-003': [{ value: 'bp-003-n', label: '名古屋支店' }],
  'bp-004': [{ value: 'bp-004-k', label: '神戸工場' }],
};

// ── End users ─────────────────────────────────────────────────────────────--
export const END_USERS: Option[] = [
  { value: 'eu-001', label: '日本重工業株式会社' },
  { value: 'eu-002', label: '関西自動車部品株式会社' },
];

// ── Suppliers / vendors ──────────────────────────────────────────────────────
export const SUPPLIERS: Option[] = [
  { value: 'sp-001', label: '外注研磨株式会社' },
  { value: 'sp-002', label: '中央コーティング工業' },
  { value: 'sp-003', label: '山陽素材商事' },
];

// ── Material types / materials / products ────────────────────────────────────
export const MATERIAL_TYPES: Option[] = [
  { value: 'A01A0001', label: 'A01A0001 — SUS303' },
  { value: 'A02B0014', label: 'A02B0014 — SKD11' },
  { value: 'B01A0007', label: 'B01A0007 — S45C' },
];

export const MATERIALS: Option[] = [
  { value: 'A01A0001-A001-001', label: 'A01A0001-A001-001 — SUS303 φ20×3000（研磨）' },
  { value: 'A02B0014-B001-002', label: 'A02B0014-B001-002 — SKD11 φ32×2500（定尺）' },
  { value: 'B01A0007-A002-001', label: 'B01A0007-A002-001 — S45C φ16×4000（研磨）' },
];

export const PRODUCTS: Option[] = [
  { value: 'PRD-202601-0001', label: '精密軸 PRD-202601-0001' },
  { value: 'PRD-202602-0008', label: 'ロッド PRD-202602-0008' },
  { value: 'PRD-202603-0012', label: '特殊加工品 PRD-202603-0012' },
];

// ── Order types (design.md / tables.md ORDER_TYPE) ───────────────────────────
export const ORDER_TYPE_OPTIONS: Option[] = [
  { value: 'PRODUCTION', label: '本番' },
  { value: 'TEST', label: 'テスト' },
  { value: 'SAMPLE', label: 'サンプル' },
  { value: 'OTHER', label: 'その他' },
];

export const ORDER_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  ORDER_TYPE_OPTIONS.map((o) => [o.value, o.label]),
);

// ── Process step catalog (subset, _specs/feature/02-production.md) ────────────
export const PROCESS_STEPS: Option[] = [
  { value: 'MATERIAL_PREP', label: '素材出し（在庫）' },
  { value: 'CUTTING', label: '切断' },
  { value: 'CENTERLESS', label: 'センタレス' },
  { value: 'CYLINDER_MACHINING', label: '円筒加工' },
  { value: 'CYLINDER_INSPECTION', label: '円筒加工検査' },
  { value: 'CYLINDER_INSPECTION_APPROVAL', label: '円筒加工検査承認' },
  { value: 'LENGTH_ADJUST', label: '全長合わせ' },
  { value: 'CHAMFER', label: 'C面' },
  { value: 'STEP_MACHINING', label: '段加工' },
  { value: 'COATING', label: 'コーティング' },
  { value: 'SHIPPING_INSPECTION', label: '出荷前検査' },
];

// ── Defect types ──────────────────────────────────────────────────────────────
export const DEFECT_TYPES: Option[] = [
  { value: 'dim', label: '寸法不良' },
  { value: 'scratch', label: 'キズ' },
  { value: 'crack', label: 'クラック' },
  { value: 'coating', label: 'コーティング不良' },
];

export const UNITS: Option[] = [
  { value: '本', label: '本' },
  { value: 'kg', label: 'kg' },
  { value: 'm', label: 'm' },
  { value: '個', label: '個' },
];
