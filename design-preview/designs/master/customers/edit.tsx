'use client';

import { ActiveBadge } from '../../lib/ui';
import { CustomerFormBody } from './new';

// ── Prefilled mock values (株式会社ABC製作所 / BP-00001) ─────────────────────
const PREFILLED = {
  nameJa: '株式会社ABC製作所',
  nameEn: 'ABC Manufacturing Co., Ltd.',
  nameKana: 'かぶしきがいしゃえーびーしーせいさくしょ',
  shortNameJa: 'ABC製作所',
  shortNameEn: 'ABC Mfg.',
  countryCode: 'JP',
  postalCode: '108-0075',
  addressJa: '東京都港区港南2-15-1',
  addressEn: '2-15-1 Konan, Minato-ku, Tokyo',
  phone: '03-1234-5678',
  fax: '03-1234-5679',
  email: 'info@abc-mfg.co.jp',
  website: 'https://abc-mfg.co.jp',
  taxNumber: '1234567890123',
  isActive: true,
  customerCode: 'C-0001',
  billingBpId: null,
  closingDay: 31,
  paymentTermsDays: 30,
  paymentDay: 25,
  creditLimit: 5000000,
  taxType: 'TAXABLE',
  invoiceMethod: 'EMAIL',
  isConsignment: false,
};

export default function CustomerEditPage() {
  return (
    <CustomerFormBody
      breadcrumbs={['ホーム', 'マスタ', '顧客', '株式会社ABC製作所', '編集']}
      title="顧客 編集"
      status={<ActiveBadge active={PREFILLED.isActive} />}
      initialValues={PREFILLED}
    />
  );
}
