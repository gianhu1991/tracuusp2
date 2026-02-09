import { NextResponse } from 'next/server';

/**
 * API tra cứu SP2.
 * Trên Vercel: set env BACKEND_URL (URL backend chạy Playwright) và AUTHORIZATION.
 * Request body: { toKyThuat?, olt?, slot?, port? }
 */
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { toKyThuat, olt, slot, port } = body;

    const backendUrl = process.env.BACKEND_URL || process.env.TRACUU_BACKEND_URL;
    const authorization = process.env.AUTHORIZATION || process.env.TRACUU_AUTHORIZATION || '';

    if (backendUrl) {
      const res = await fetch(`${backendUrl.replace(/\/$/, '')}/api/tracuu`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authorization ? { Authorization: authorization } : {}),
        },
        body: JSON.stringify({ toKyThuat, olt, slot, port }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return NextResponse.json(
          { message: data.message || data.error || 'Backend lỗi' },
          { status: res.status }
        );
      }
      return NextResponse.json(Array.isArray(data) ? { data } : data);
    }

    // Không có backend: trả về hướng dẫn (dev) hoặc 503
    if (process.env.NODE_ENV === 'development') {
      return NextResponse.json({
        data: [],
        message: 'Chưa cấu hình BACKEND_URL. Trên Vercel hãy thêm env BACKEND_URL và AUTHORIZATION.',
      });
    }

    return NextResponse.json(
      {
        data: [],
        message:
          'Chưa cấu hình backend. Vui lòng thêm biến môi trường BACKEND_URL (và AUTHORIZATION) trên Vercel.',
      },
      { status: 503 }
    );
  } catch (err) {
    return NextResponse.json(
      { message: err.message || 'Lỗi server' },
      { status: 500 }
    );
  }
}
