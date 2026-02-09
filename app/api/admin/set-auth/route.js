import { NextResponse } from 'next/server';
import { setStoredAuth } from '../../../../lib/auth-store';

/** POST: body { password, authorization }. Mật khẩu quản trị = ADMIN_PASSWORD (env). Lưu token vào Redis để mọi người dùng chung. */
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const password = body.password ?? '';
    const authorization = body.authorization ?? '';

    const adminPassword = process.env.ADMIN_PASSWORD || process.env.AUTH_PASSWORD || '';
    if (!adminPassword) {
      return NextResponse.json(
        { ok: false, message: 'Chưa cấu hình ADMIN_PASSWORD trên server. Quản trị thêm biến môi trường ADMIN_PASSWORD (Vercel).' },
        { status: 500 }
      );
    }
    if (password !== adminPassword) {
      return NextResponse.json(
        { ok: false, message: 'Mật khẩu quản trị không đúng.' },
        { status: 401 }
      );
    }
    if (!authorization || !authorization.trim()) {
      return NextResponse.json(
        { ok: false, message: 'Token không được để trống.' },
        { status: 400 }
      );
    }

    const ok = await setStoredAuth(authorization.trim());
    if (!ok) {
      return NextResponse.json(
        { ok: false, message: 'Không lưu được token. Kiểm tra Supabase: bảng app_config đã tạo chưa, env NEXT_PUBLIC_SUPABASE_URL và SUPABASE_SERVICE_ROLE_KEY đã set chưa.' },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: true, message: 'Đã lưu token lên server. Mọi người dùng app sẽ dùng token này.' });
  } catch (err) {
    return NextResponse.json(
      { ok: false, message: err.message || 'Lỗi server' },
      { status: 500 }
    );
  }
}
