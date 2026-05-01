import { NextResponse } from 'next/server';
import { setStoredAuth } from '../../../../lib/auth-store';

/** POST: body { password, authorization } — xác thực phía server, lưu Authorization dùng chung. */
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const password = body.password ?? '';
    const authorization = body.authorization ?? '';

    const adminPassword = process.env.ADMIN_PASSWORD || process.env.AUTH_PASSWORD || '';
    if (!adminPassword) {
      return NextResponse.json(
        { ok: false, message: 'Chưa cấu hình xác thực phía server.' },
        { status: 500 }
      );
    }
    if (password !== adminPassword) {
      return NextResponse.json(
        { ok: false, message: 'Không được phép.' },
        { status: 401 }
      );
    }
    if (!authorization || !authorization.trim()) {
      return NextResponse.json(
        { ok: false, message: 'Thiếu Authorization.' },
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
    return NextResponse.json({ ok: true, message: 'Đã lưu.' });
  } catch (err) {
    return NextResponse.json(
      { ok: false, message: err.message || 'Lỗi server' },
      { status: 500 }
    );
  }
}
