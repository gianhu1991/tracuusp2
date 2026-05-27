import { NextResponse } from 'next/server';
import { getStoredAuth } from '../../../lib/auth-store';
import { pickAuthorizationForApi } from '../../../lib/authorization-expiry';
import { getStore } from '../../../lib/kv-backend';

const DEFAULT_URL = 'https://api-onebss.vnpt.vn/web-cabman/mang-truyen-dan/ds-thuebao-chua-nhapcap';
const DEFAULT_DONVI_ID = '301431';
const BASE_KEY = 'tb_no_cable_base_v1';

function asText(v) {
  return String(v == null ? '' : v).trim();
}

function isFiber(v) {
  return asText(v).toLowerCase() === 'fiber';
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const donviId = asText(searchParams.get('donvi_id')) || DEFAULT_DONVI_ID;

    const store = getStore();
    const base = await store.configGet(BASE_KEY);
    const basePayload = base.ok && base.value && typeof base.value === 'object' ? base.value : null;
    const baseList = Array.isArray(basePayload?.maTbList) ? basePayload.maTbList : [];
    const baseSet = new Set(baseList.map((x) => asText(x).toUpperCase()).filter(Boolean));
    if (baseSet.size === 0) {
      return NextResponse.json({
        ok: true,
        rows: [],
        configured: false,
        message: 'Chưa upload dữ liệu gốc. Vui lòng upload file Excel có cột MA_TB trước.',
      });
    }

    const authFromHeader = asText(request.headers.get('Authorization') || request.headers.get('authorization'));
    const authStored = asText(await getStoredAuth());
    const authEnv = asText(
      process.env.ONE_BSS_AUTHORIZATION || process.env.AUTHORIZATION || process.env.TRACUU_AUTHORIZATION || ''
    );
    const authorization = pickAuthorizationForApi(authFromHeader, authStored, authEnv);

    const url = `${DEFAULT_URL}?donvi_id=${encodeURIComponent(donviId)}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...(authorization ? { Authorization: authorization } : {}),
      },
      cache: 'no-store',
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, message: data?.message || data?.error || `Không lấy được dữ liệu (${res.status}).`, rows: [] },
        { status: res.status }
      );
    }

    const list = Array.isArray(data?.data) ? data.data : [];
    const fiberRows = list
      .filter((item) => isFiber(item?.LOAIHINH))
      .filter((item) => baseSet.has(asText(item?.MA_TB).toUpperCase()))
      .map((item) => ({
        nhanVienQl: asText(item?.NHANVIEN_QL),
        tenKv: asText(item?.TEN_KV),
        thueBaoId: asText(item?.THUEBAO_ID),
        maTb: asText(item?.MA_TB),
        tenTb: asText(item?.TEN_TB),
        diaChiLd: asText(item?.DIACHI_LD),
        tenTrungTam: asText(item?.TENTRUNGTAM),
        tenTo: asText(item?.TENTO),
        ngaySd: asText(item?.NGAY_SD),
        loaiHinh: asText(item?.LOAIHINH),
        trangThaiTb: asText(item?.TRANGTHAI_TB),
      }));

    return NextResponse.json({ ok: true, configured: true, rows: fiberRows, baseCount: baseSet.size });
  } catch (err) {
    return NextResponse.json(
      { ok: false, message: err?.message || 'Lỗi server khi lấy TB chưa nhập cáp.', rows: [] },
      { status: 500 }
    );
  }
}
