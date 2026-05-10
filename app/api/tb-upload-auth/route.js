import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  createTbUploadGateToken,
  tbUploadGateConfigured,
  tbUploadGateCookieName,
  verifyTbUploadGateToken,
  timingSafePasswordMatch,
} from '../../../lib/tb-upload-gate';

export async function GET() {
  try {
    const gateEnabled = tbUploadGateConfigured();
    if (!gateEnabled) {
      return NextResponse.json({ ok: true, unlocked: true, gateEnabled: false });
    }
    const token = cookies().get(tbUploadGateCookieName())?.value;
    const unlocked = verifyTbUploadGateToken(token);
    return NextResponse.json({ ok: true, unlocked, gateEnabled: true });
  } catch (err) {
    return NextResponse.json({ ok: false, message: err?.message || 'Lỗi server.' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    if (!tbUploadGateConfigured()) {
      return NextResponse.json({ ok: true, unlocked: true, gateEnabled: false });
    }
    const body = await request.json().catch(() => ({}));
    const password = String(body?.password ?? '');
    const expected = String(process.env.TB_UPLOAD_PASSWORD || '');
    if (!timingSafePasswordMatch(password, expected)) {
      return NextResponse.json({ ok: false, message: 'Mật khẩu không đúng.' }, { status: 401 });
    }
    const token = createTbUploadGateToken();
    const res = NextResponse.json({ ok: true, unlocked: true, gateEnabled: true });
    res.cookies.set(tbUploadGateCookieName(), token, {
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
