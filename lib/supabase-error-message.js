/** Chuyển lỗi Supabase/PostgREST sang tiếng Việt dễ hiểu (tránh lặp câu dài). */
export function formatSupabaseUserMessage(...parts) {
  const raw = parts
    .map((p) => String(p || '').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!raw) {
    return 'Không kết nối được Supabase. Kiểm tra biến môi trường trên Vercel.';
  }

  if (/exceed_egress_quota|egress quota|exceeded.*egress/i.test(raw)) {
    return (
      'Supabase đã vượt hạn mức băng thông (egress) — project đang bị hạn chế, không ghi/đọc được. '
      + 'Vào supabase.com → Project → Usage/Billing: nâng gói, đợi chu kỳ reset, hoặc liên hệ https://supabase.help. '
      + 'Token vẫn dùng trên máy này (ô Authorization); Lưu lên server / cache chung / máy khác tạm không dùng được.'
    );
  }

  if (/exceed.*quota|over quota|quota exceeded/i.test(raw)) {
    return (
      'Supabase đã vượt một hạn mức (quota). Kiểm tra Usage/Billing trên dashboard Supabase hoặc liên hệ support.'
    );
  }

  if (/relation.*app_config.*does not exist|app_config/i.test(raw) && /does not exist/i.test(raw)) {
    return 'Chưa có bảng app_config trên Supabase. Chạy SQL trong VERCEL-SETUP.md (create table app_config).';
  }

  // Tránh lặp cùng một câu hai lần
  const sentences = raw.split(/(?<=\.)\s+/).filter(Boolean);
  const unique = [...new Set(sentences)];
  if (unique.length === 1) return unique[0];

  return unique.join(' ');
}
