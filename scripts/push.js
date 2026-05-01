#!/usr/bin/env node
/**
 * Push code lên remote GitHub (dùng GITHUB_TOKEN trong .env.local hoặc biến môi trường).
 * Chạy: node scripts/push.js
 */

const { readFileSync, existsSync } = require('fs');
const { execSync } = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '..');
const envPath = path.join(root, '.env.local');

let token = process.env.GITHUB_TOKEN;

if (!token && existsSync(envPath)) {
  try {
    const content = readFileSync(envPath, 'utf8');
    const match = content.match(/GITHUB_TOKEN\s*=\s*(.+)/);
    if (match) token = match[1].trim().replace(/^["']|["']$/g, '');
  } catch (e) {
    console.error('Không đọc được .env.local:', e.message);
  }
}

if (!token) {
  console.error('Chưa có GITHUB_TOKEN. Thiết lập trong .env.local hoặc biến môi trường.');
  process.exit(1);
}

const remoteWithToken = `https://${token}@github.com/gianhu1991/tracuusp2.git`;
const remoteClean = 'https://github.com/gianhu1991/tracuusp2.git';

function run(cmd, opts = {}) {
  execSync(cmd, { cwd: root, stdio: 'inherit', ...opts });
}

try {
  run('git remote set-url origin ' + remoteWithToken);
  run('git push origin main');
  run('git remote set-url origin ' + remoteClean);
  console.log('Push xong.');
} catch (e) {
  run('git remote set-url origin ' + remoteClean);
  process.exit(e.status || 1);
}
