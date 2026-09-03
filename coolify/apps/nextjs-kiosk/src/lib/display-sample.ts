/**
 * display-sample.ts — テンプレートの見本データ。
 *
 * 管理画面で「どの画面を出すか」を選ぶとき、名前だけでは何が映るのか
 * 分からない。**実物と同じ部品に作り話のデータを流して**縮小表示する
 * ための材料がここ。
 *
 * ★ 業務データには一切触れない。全部この場で作った固定値なので、
 *   プレビューを誰が開いても何も漏れない（見本ページに認証を求めない
 *   根拠でもある）。
 * ★ 見た目を確かめるためのものなので、**数字は「ありそう」で足りる**。
 *   ただし空・0・長い名前・担当者なしなど、**崩れやすい形は必ず混ぜる** —
 *   きれいなデータだけで作った見本は、現物を見たときの驚きを防げない。
 */

import type { PendingRow, QualitySummary, ShippingRow } from "./display-board";
import type { BoardEntry } from "./display-board-core";

export const SAMPLE_PLANT_NAME = "本社工場";

export const sampleProductionEntries: BoardEntry[] = [
  {
    workOrderId: "s1",
    lotNumber: 10842,
    documentNumber: "WOR-202609-00081",
    productName: "超硬ドリル φ8.3×330 OH付",
    plannedQuantity: 50,
    currentStepName: "円筒加工",
    currentStepStatus: "IN_PROGRESS",
    paused: false,
    assignees: ["山田 太郎", "佐藤 花子"],
    completedSteps: 3,
    totalSteps: 6,
    progressPercent: 50,
    quantity: 48,
  },
  {
    workOrderId: "s2",
    lotNumber: 10843,
    documentNumber: "WOR-202609-00082",
    productName: "リーマ φ12.0×200",
    plannedQuantity: 30,
    currentStepName: "研磨",
    currentStepStatus: "IN_PROGRESS",
    // 一時停止も混ぜる（黄色が出る形を見せたい）
    paused: true,
    assignees: ["鈴木 一郎"],
    completedSteps: 2,
    totalSteps: 5,
    progressPercent: 40,
    quantity: 30,
  },
  {
    workOrderId: "s3",
    lotNumber: 10844,
    documentNumber: "WOR-202609-00083",
    // 長い名前で truncate の効きを見る
    productName: "特殊形状エンドミル 4枚刃 コーティング付 φ6.0×80 テーパー",
    plannedQuantity: 120,
    currentStepName: "材料準備",
    currentStepStatus: "PENDING",
    paused: false,
    // 担当者なしも混ぜる
    assignees: [],
    completedSteps: 0,
    totalSteps: 7,
    progressPercent: 0,
    quantity: null,
  },
  {
    workOrderId: "s4",
    lotNumber: 10845,
    documentNumber: "WOR-202609-00084",
    productName: "センタドリル φ3.0",
    plannedQuantity: 200,
    currentStepName: "検査",
    currentStepStatus: "IN_PROGRESS",
    paused: false,
    assignees: ["田中 次郎", "高橋 三郎", "伊藤 四郎", "渡辺 五郎"],
    completedSteps: 5,
    totalSteps: 6,
    progressPercent: 83,
    quantity: 196,
  },
];

function daysFromNow(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(0, 0, 0, 0);
  return d;
}

export const samplePendingRows: PendingRow[] = [
  {
    id: "p1",
    documentNumber: "ORD-202608-00214-01",
    customerName: "株式会社 中央製作所",
    productName: "超硬ドリル φ6.0×150",
    quantity: 80,
    arrangedQuantity: 0,
    deliveryDate: daysFromNow(-2),
    overdue: true,
  },
  {
    id: "p2",
    documentNumber: "ORD-202609-00003-02",
    customerName: "東海精密工業 株式会社",
    productName: "リーマ φ10.0×180",
    quantity: 40,
    arrangedQuantity: 25,
    deliveryDate: daysFromNow(1),
    overdue: false,
  },
  {
    id: "p3",
    documentNumber: "ORD-202609-00007-01",
    customerName: "北陸ツール",
    productName: "エンドミル φ4.0×60",
    quantity: 150,
    arrangedQuantity: 0,
    // 納期未定も混ぜる
    deliveryDate: null,
    overdue: false,
  },
];

export const sampleShippingRows: ShippingRow[] = [
  {
    id: "d1",
    documentNumber: "DOR-202609-00042",
    customerName: "株式会社 中央製作所",
    status: "CONFIRMED",
    itemCount: 3,
    totalQuantity: 180,
    fromPlantName: SAMPLE_PLANT_NAME,
  },
  {
    id: "d2",
    documentNumber: "DOR-202609-00043",
    customerName: "東海精密工業 株式会社",
    status: "DRAFT",
    itemCount: 1,
    totalQuantity: 40,
    // 出荷元未設定も混ぜる
    fromPlantName: null,
  },
];

export const sampleQuality: QualitySummary = {
  totalDefects: 23,
  days: 7,
  rows: [
    { id: "q1", defectTypeName: "寸法不良", count: 11 },
    { id: "q2", defectTypeName: "欠け・チッピング", count: 6 },
    { id: "q3", defectTypeName: "コーティング剥離", count: 4 },
    { id: "q4", defectTypeName: "表面粗さ", count: 2 },
  ],
};

export const SAMPLE_ANNOUNCEMENT = "本日 15:00 より 安全点検を行います";
