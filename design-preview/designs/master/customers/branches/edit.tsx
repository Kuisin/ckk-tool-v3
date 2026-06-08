'use client';

import { ActiveBadge } from '../../../lib/ui';
import { BranchFormBody } from './new';

// ── Prefilled mock values (東京本社 under 株式会社ABC製作所) ─────────────────
const PREFILLED = {
  nameJa: '東京本社',
  nameEn: 'Tokyo HQ',
  nameKana: 'とうきょうほんしゃ',
  postalCode: '108-0075',
  addressJa: '東京都港区港南2-15-1',
  addressEn: '2-15-1 Konan, Minato-ku, Tokyo',
  phone: '03-1234-5678',
  fax: '03-1234-5679',
  email: 'tokyo@abc-mfg.co.jp',
  contact: '高橋 健',
  isActive: true,
};

export default function BranchEditPage() {
  return (
    <BranchFormBody
      breadcrumbs={['ホーム', 'マスタ', '顧客', '株式会社ABC製作所', '支店', '東京本社', '編集']}
      title="支店 編集"
      status={<ActiveBadge active={PREFILLED.isActive} />}
      initialValues={PREFILLED}
    />
  );
}
