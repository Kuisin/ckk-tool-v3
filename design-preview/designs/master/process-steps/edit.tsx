'use client';

import { ProcessStepForm, type ProcessStepFormValues } from './new';

// ── Prefilled values (process_step_catalog: 円筒加工) ─────────────────────────
// 使用依存: 円筒加工検査・検査承認を含むこと（spec 02-production.md）
const PREFILLED: ProcessStepFormValues = {
  code: 'CYLINDER_MACHINING',
  nameJa: '円筒加工',
  nameEn: 'Cylinder Machining',
  category: 'MACHINING',
  executionLocation: 'INTERNAL',
  isSyncCapable: false,
  isInspection: false,
  isApprovalStep: false,
  approvalMinRank: '',
  sortOrder: 40,
  isActive: true,
  notes: '使用依存: 円筒加工検査・検査承認を含むこと',
  useDependencies: [
    { dependsOnStepId: 'CYLINDER_INSPECTION', relation: 'AND', isNegation: false },
    { dependsOnStepId: 'CYLINDER_INSPECTION_APPROVAL', relation: 'AND', isNegation: false },
  ],
  execDependencies: [
    { dependsOnStepId: 'CENTERLESS', relation: 'OR' },
    { dependsOnStepId: 'CUTTING', relation: 'OR' },
  ],
};

export default function ProcessStepEditPage() {
  return <ProcessStepForm mode="edit" initialValues={PREFILLED} />;
}
