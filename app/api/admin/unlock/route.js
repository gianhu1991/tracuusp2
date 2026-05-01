import { NextResponse } from 'next/server';

/** POST: body { password } — xác thực mở khóa phía server. */
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const password = body?.password ?? '';
    const unlockPassword = process.env.UNLOCK_PASSWORD || '';

    if (!unlockPassword) {
      return NextResponse.json(
        { ok: false, message: 'Chưa cấu hình mở khóa phía server.' },
        { status: 500 }
      );
    }
    if (!password || String(password).trim() === '') {
      return NextResponse.json(
        { ok: false, message: 'Vui lòng nhập mã.' },
        { status: 400 }
      );
    }
    if (String(password) !== unlockPassword) {
      return NextResponse.json(
        { ok: false, message: 'Không được phép.' },
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
