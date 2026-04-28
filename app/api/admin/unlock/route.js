import { NextResponse } from 'next/server';

/** POST: body { password }. Kiểm tra mật khẩu quản trị từ biến môi trường server. */
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const password = body?.password ?? '';
    const adminPassword = process.env.ADMIN_PASSWORD || process.env.AUTH_PASSWORD || '';

    if (!adminPassword) {
      return NextResponse.json(
        { ok: false, message: 'Chưa cấu hình ADMIN_PASSWORD trên server.' },
        { status: 500 }
      );
    }
    if (!password || String(password).trim() === '') {
      return NextResponse.json(
        { ok: false, message: 'Vui lòng nhập mật khẩu quản trị.' },
        { status: 400 }
      );
    }
    if (String(password) !== adminPassword) {
      return NextResponse.json(
        { ok: false, message: 'Mật khẩu không đúng.' },
        { status: 401 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { ok: false, message: err?.message || 'Lỗi server.' },
      { status: 500 }
    );
  }
}
