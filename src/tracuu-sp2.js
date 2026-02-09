/**
 * Module tra cứu Splitter (SP2) theo port OLT - OneBSS VNPT
 * URL và Authorization lấy từ config.js (có thể sửa tại đó khi token đổi).
 */

async function loadConfig() {
  try {
    const c = await import('../config.js');
    return c.default || c;
  } catch {
    return {
      baseUrl: 'https://onebss.vnpt.vn/#/ecms/tracuu-splitter-theo-port-olt',
      authorization: '',
    };
  }
}

/**
 * Thực hiện tra cứu SP2 với tham số tìm kiếm.
 * Cần trình duyệt đã đăng nhập OneBSS (hoặc dùng userDataDir để giữ session).
 *
 * @param {object} options - Cấu hình Playwright (browser, context, page)
 * @param {object} params - Tham số tra cứu
 * @param {string} [params.portOlt] - Port OLT (vd: "5")
 * @param {string} [params.tenKyHieu] - Tên/ký hiệu Splitter
 * @param {string} [params.diaChi] - Địa chỉ/ghi chú
 * @param {boolean} [params.headless] - Chạy ẩn trình duyệt (mặc định false để dễ debug)
 * @returns {Promise<Array>} Danh sách splitter (mảng object)
 */
export async function traCuuSP2(options = {}, params = {}) {
  const { browser, context, page } = options;
  const { portOlt, tenKyHieu, diaChi, headless = false } = params;

  const config = await loadConfig();
  const baseUrl = config.baseUrl || params.baseUrl;
  const authorization = config.authorization || params.authorization || '';

  const useExisting = page && typeof page.goto === 'function';

  let ownBrowser;
  let ownContext;
  let ownPage;

  if (useExisting) {
    ownPage = page;
  } else {
    const { chromium } = await import('playwright');
    ownBrowser = await chromium.launch({
      headless: headless ? 'new' : false,
      args: ['--disable-blink-features=AutomationControlled'],
    });
    const contextOptions = {
      viewport: { width: 1280, height: 800 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    };
    if (authorization) {
      contextOptions.extraHTTPHeaders = { Authorization: authorization };
    }
    ownContext = await ownBrowser.newContext(contextOptions);
    ownPage = await ownContext.newPage();
  }

  try {
    await ownPage.goto(baseUrl, { waitUntil: 'networkidle', timeout: 60000 });

    // Đợi form "Tìm kiếm thông tin Splitter" xuất hiện
    await ownPage.waitForSelector('text=Tìm kiếm thông tin Splitter', { timeout: 15000 }).catch(() => null);
    await ownPage.waitForTimeout(2000);

    // Điền Port OLT nếu có (tìm input gần label "Port OLT")
    if (portOlt) {
      const byLabel = ownPage.getByLabel(/Port\s*OLT/i).first();
      if (await byLabel.count() > 0) {
        await byLabel.fill(String(portOlt));
      } else {
        const portSection = ownPage.locator('*').filter({ hasText: /Port\s*OLT/i }).first();
        const inputInSection = portSection.locator('input').first();
        if (await inputInSection.count() > 0) await inputInSection.fill(String(portOlt));
      }
    }

    if (tenKyHieu) {
      const tenInput = await ownPage.getByPlaceholder(/tên\/ký hiệu Splitter/i).first();
      if (await tenInput.count() > 0) await tenInput.fill(tenKyHieu);
    }

    if (diaChi) {
      const diaChiInput = await ownPage.getByPlaceholder(/địa chỉ\/ghi chú/i).first();
      if (await diaChiInput.count() > 0) await diaChiInput.fill(diaChi);
    }

    // Bấm nút "Tra cứu"
    const btnTraCuu = ownPage.getByRole('button', { name: /Tra cứu/i }).first();
    await btnTraCuu.click();
    await ownPage.waitForTimeout(3000);

    // Đọc bảng "Danh sách splitter"
    const rows = await ownPage.locator('table tbody tr').all();
    const result = [];

    for (let i = 0; i < rows.length; i++) {
      const cells = await rows[i].locator('td').allTextContents();
      if (cells.length < 2) continue;
      const headers = [
        'tenSplitter', 'stt', 'id', 'kyHieu', 'capSP', 'ngayCapNhat',
        'diaChi', 'dungLuong', 'daDung', 'chuaDung', 'thietBiOLT', 'congOLT',
      ];
      const obj = {};
      headers.forEach((h, j) => { if (cells[j] !== undefined) obj[h] = cells[j].trim(); });
      result.push(obj);
    }

    return result;
  } finally {
    if (!useExisting && ownBrowser) await ownBrowser.close();
  }
}

/**
 * Mở trang tra cứu SP2 và giữ trình duyệt mở (để người dùng đăng nhập thủ công nếu cần).
 * Sau khi đăng nhập xong, có thể gọi traCuuSP2({ page }) với page hiện tại.
 *
 * @param {object} [options]
 * @param {boolean} [options.headless=false]
 * @returns {Promise<{ browser, context, page }>}
 */
export async function moTrangTraCuu(options = {}) {
  const { headless = false } = options;
  const config = await loadConfig();
  const baseUrl = config.baseUrl || options.baseUrl;
  const authorization = config.authorization || options.authorization || '';
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({
    headless: headless ? 'new' : false,
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const contextOptions = { viewport: { width: 1280, height: 800 } };
  if (authorization) {
    contextOptions.extraHTTPHeaders = { Authorization: authorization };
  }
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  return { browser, context, page };
}

/** Trả về config hiện tại (baseUrl, authorization) */
export async function getConfig() {
  return loadConfig();
}
