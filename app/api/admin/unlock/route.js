import { NextResponse } from 'next/server';

/** POST: body { password }. Kiểm tra mật khẩu mở khóa từ biến môi trường server. */
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const password = body?.password ?? '';
    const unlockPassword = process.env.UNLOCK_PASSWORD || '';

    if (!unlockPassword) {
      return NextResponse.json(
        { ok: false, message: 'Chưa cấu hình UNLOCK_PASSWORD trên server.' },
        { status: 500 }
      );
    }
    if (!password || String(password).trim() === '') {
      return NextResponse.json(
        { ok: false, message: 'Vui lòng nhập mật khẩu quản trị.' },
        { status: 400 }
      );
    }
    if (String(password) !== unlockPassword) {
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
