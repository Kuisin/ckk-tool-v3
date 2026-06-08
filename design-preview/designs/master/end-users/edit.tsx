'use client';

import { Stack } from '@mantine/core';
import { ActiveBadge, PageHeader } from '../../lib/ui';
import { EndUserFormBody } from './new';

// ── Prefilled mock values (日本重工業株式会社 / BP-00101) ────────────────────
const PREFILLED = {
  nameJa: '日本重工業株式会社',
  nameEn: 'Nihon Heavy Industries Co., Ltd.',
  nameKana: 'にっぽんじゅうこうぎょう',
  shortNameJa: '日本重工',
  shortNameEn: 'NHI',
  countryCode: 'JP',
  postalCode: '220-0012',
  addressJa: '神奈川県横浜市西区みなとみらい3-6-1',
  addressEn: '3-6-1 Minatomirai, Nishi-ku, Yokohama, Kanagawa',
  phone: '045-123-4567',
  fax: '045-123-4568',
  email: 'info@nihon-hi.co.jp',
  website: 'https://nihon-hi.co.jp',
  taxNumber: '9876543210123',
  isActive: true,
  industry: '産業機械',
  notes: '大口ユーザー。直送案件あり。',
};

export default function EndUserEditPage() {
  return (
    <Stack gap="md">
      <PageHeader
        breadcrumbs={['ホーム', 'マスタ', '最終需要家', '日本重工業株式会社', '編集']}
        title="最終需要家 編集"
        status={<ActiveBadge active={PREFILLED.isActive} />}
      />
      <EndUserFormBody initialValues={PREFILLED} />
    </Stack>
  );
}
