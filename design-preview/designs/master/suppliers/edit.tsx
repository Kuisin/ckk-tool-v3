'use client';

import { SupplierForm, type SupplierFormValues } from './new';

// ── Prefilled values (business_partners + bp_vendor_attrs, BP-00021) ─────────
const PREFILLED: SupplierFormValues = {
  nameJa: '外注研磨株式会社',
  nameEn: 'Gaichu Polishing Co., Ltd.',
  nameKana: 'がいちゅうけんま',
  shortName: '外注研磨',
  countryCode: 'JP',
  postalCode: '143-0006',
  addressJa: '東京都大田区平和島1-2-3',
  addressEn: '1-2-3 Heiwajima, Ota-ku, Tokyo',
  phone: '03-1234-5678',
  fax: '03-1234-5679',
  email: 'info@gaichu-kenma.co.jp',
  isActive: true,
  vendorCode: 'V-00021',
  vendorType: 'OUTSOURCE',
  closingDay: 31,
  paymentTermsDays: 60,
  paymentDay: 31,
  leadTimeDays: 7,
  bankName: 'みずほ銀行',
  bankBranch: '大森支店',
  bankAccountType: '普通',
  bankAccountNumber: '1234567',
};

export default function SupplierEditPage() {
  return <SupplierForm mode="edit" initialValues={PREFILLED} />;
}
