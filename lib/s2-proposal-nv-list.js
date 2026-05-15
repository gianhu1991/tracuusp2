/** 23 NV địa bàn — có thể ghi đè bằng NEXT_PUBLIC_S2_PROPOSAL_NV_LIST (phân tách dấu phẩy). */
export const S2_PROPOSAL_NV_DIA_BAN = [
  'Đinh Văn Huynh',
  'Phạm Thanh Hiến',
  'Bùi Minh Tám',
  'Ninh Thế Đức',
  'Lê Nhật Tuân',
  'Hoàng Mạnh',
  'Nguyễn Văn Dũng',
  'Bùi Xuân Vũ',
  'Đinh Quang Thắng',
  'Lương Tất Chiến',
  'Trần Thanh Đăng',
  'Trần Văn Tùng',
  'Đinh Quang Hồng',
  'Trần Ngọc Ninh',
  'Nguyễn Văn Tư',
  'Đinh Thế Hoàn',
  'Nguyễn Đức Cảnh',
  'Đinh Văn Quân',
  'Nguyễn Văn Đông',
  'Lê Văn Hùng',
  'Đinh Quốc Lập',
  'Đoàn Thanh Bình',
  'Nguyễn Văn Thọ',
];

export function getNvDiaBanOptions() {
  const raw = typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_S2_PROPOSAL_NV_LIST : '';
  const fromEnv = String(raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return fromEnv.length ? fromEnv : S2_PROPOSAL_NV_DIA_BAN;
}

export function formatProposalCoord(value) {
  if (value == null || value === '') return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return n.toFixed(6);
}
