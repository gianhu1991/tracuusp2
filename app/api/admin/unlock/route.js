import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  adminUnlockCookieName,
  adminUnlockConfigured,
  createAdminUnlockToken,
  verifyAdminUnlockToken,
  timingSafePasswordMatch,
} from '../../../../lib/admin-unlock-cookie';

/** GET: trạng thái cookie mở khóa (upload TB / đã đăng nhập quản trị). */
export async function GET() {
  try {
    const gateEnabled = adminUnlockConfigured();
    if (!gateEnabled) {
      return NextResponse.json({ ok: true, gateEnabled: false, unlocked: true });
    }
    const token = cookies().get(adminUnlockCookieName())?.value;
    const unlocked = verifyAdminUnlockToken(token);
    return NextResponse.json({ ok: true, gateEnabled: true, unlocked });
  } catch (err) {
    return NextResponse.json({ ok: false, message: err?.message || 'Lỗi server.' }, { status: 500 });
  }
}

/** POST: body { password } — xác thực mở khóa phía server; đặt cookie chung với upload TB. */
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const password = body?.password ?? '';
    const unlockPassword = String(process.env.UNLOCK_PASSWORD || '').trim();

    if (!unlockPassword) {
      return NextResponse.json(
        { ok: false, message: 'Chưa cấu hình mở khóa phía server.' },
        { status: 500 }
      );
    }
    if (!password || String(password).trim() === '') {
      return NextResponse.json({ ok: false, message: 'Vui lòng nhập mã.' }, { status: 400 });
    }
    if (!timingSafePasswordMatch(password, unlockPassword)) {
      return NextResponse.json({ ok: false, message: 'Không được phép.' }, { status: 401 });
    }
    const token = createAdminUnlockToken();
    const res = NextResponse.json({ ok: true });
    res.cookies.set(adminUnlockCookieName(), token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: Math.floor(7 * 24 * 60 * 60),
    });
    return res;
  } catch (err) {
    return NextResponse.json({ ok: false, message: err?.message || 'Lỗi server.' }, { status: 500 });
  }
}
