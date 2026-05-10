import { NextResponse } from 'next/server';
import { adminUnlockCookieName } from '../../../../lib/admin-unlock-cookie';

/** POST: xóa cookie mở khóa (đồng bộ với khóa Cài đặt / hết phiên). */
export async function POST() {
  try {
    const res = NextResponse.json({ ok: true });
    res.cookies.set(adminUnlockCookieName(), '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });
    return res;
  } catch (err) {
    return NextResponse.json({ ok: false, message: err?.message || 'Lỗi server.' }, { status: 500 });
  }
}
