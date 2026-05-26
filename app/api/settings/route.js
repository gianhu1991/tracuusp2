import { NextResponse } from 'next/server';
import { getStore } from '../../../lib/kv-backend';

const CONFIG_KEY = 'app_settings';

export async function GET() {
  try {
    const store = getStore();
    const r = await store.configGet(CONFIG_KEY);
    if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 500 });
    return NextResponse.json({ ok: true, settings: r.value ?? {} });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { settings } = body;
    if (!settings || typeof settings !== 'object') {
      return NextResponse.json({ ok: false, error: 'settings phải là object' }, { status: 400 });
    }
    const store = getStore();
    const existing = await store.configGet(CONFIG_KEY);
    const merged = { ...(existing.ok && existing.value ? existing.value : {}), ...settings };
    const r = await store.configSet(CONFIG_KEY, merged);
    if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 500 });
    return NextResponse.json({ ok: true, settings: merged });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
