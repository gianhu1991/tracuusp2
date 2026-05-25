<?php
/**
 * API lưu trữ cho app tra cứu SP2/TB (thay Supabase).
 * Copy file này vào thư mục web: .../app-data/api.php
 * Ví dụ XAMPP: C:\xampp\htdocs\app-data\api.php
 *
 * Biến môi trường phía app (Vercel): STORAGE_API_URL, STORAGE_API_KEY
 * STORAGE_API_URL = https://xxx.ngrok-free.dev/app-data
 */

header('Content-Type: application/json; charset=utf-8');

$keyFile = __DIR__ . DIRECTORY_SEPARATOR . 'storage-key.txt';
$expectedKey = '';
if (is_file($keyFile)) {
    $expectedKey = trim((string)file_get_contents($keyFile));
}
if ($expectedKey === '') {
    $expectedKey = getenv('STORAGE_API_KEY') ?: '';
}
if ($expectedKey === '') {
    $expectedKey = 'doi-khoa-nay-truoc-khi-dung';
}

$provided = $_SERVER['HTTP_X_STORAGE_KEY'] ?? '';
if (!hash_equals($expectedKey, $provided)) {
    http_response_code(401);
    echo json_encode(['ok' => false, 'error' => 'Sai khóa API (X-Storage-Key).']);
    exit;
}

$baseDir = __DIR__ . DIRECTORY_SEPARATOR . '_storage';
$configDir = $baseDir . DIRECTORY_SEPARATOR . 'config';
$cacheDir = $baseDir . DIRECTORY_SEPARATOR . 'cache';

foreach ([$baseDir, $configDir, $cacheDir] as $d) {
    if (!is_dir($d) && !mkdir($d, 0775, true)) {
        http_response_code(500);
        echo json_encode(['ok' => false, 'error' => 'Không tạo được thư mục lưu trữ.']);
        exit;
    }
}

$raw = file_get_contents('php://input');
$body = json_decode($raw ?: '{}', true);
if (!is_array($body)) {
    $body = [];
}
$action = isset($body['action']) ? (string)$body['action'] : '';

function safe_filename(string $key): string {
    return hash('sha256', $key) . '.json';
}

function config_path(string $key): string {
    global $configDir;
    return $configDir . DIRECTORY_SEPARATOR . safe_filename($key);
}

function cache_path(string $cacheKey): string {
    global $cacheDir;
    return $cacheDir . DIRECTORY_SEPARATOR . safe_filename($cacheKey);
}

function read_json_file(string $path): ?array {
    if (!is_file($path)) return null;
    $t = file_get_contents($path);
    if ($t === false || $t === '') return null;
    $j = json_decode($t, true);
    return is_array($j) ? $j : null;
}

function write_json_file(string $path, array $data): bool {
    $tmp = $path . '.tmp';
    $encoded = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($encoded === false) return false;
    if (file_put_contents($tmp, $encoded, LOCK_EX) === false) return false;
    return rename($tmp, $path);
}

function list_cache_files(?string $prefix = null): array {
    global $cacheDir;
    $out = [];
    $files = glob($cacheDir . DIRECTORY_SEPARATOR . '*.json') ?: [];
    foreach ($files as $f) {
        $doc = read_json_file($f);
        if (!$doc || !isset($doc['cache_key'])) continue;
        $ck = (string)$doc['cache_key'];
        if ($prefix !== null && $prefix !== '' && strpos($ck, $prefix) !== 0) continue;
        $out[] = $doc;
    }
    usort($out, function ($a, $b) {
        return strcmp((string)($a['cache_key'] ?? ''), (string)($b['cache_key'] ?? ''));
    });
    return $out;
}

function is_sp2_port_key(string $key): bool {
    if ($key === '' || strpos($key, 'tb_subscriber_v1|') === 0) return false;
    if (strpos($key, 'tb_transfer_history_v1|') === 0) return false;
    if (strpos($key, 'tb_excel_shared_rows_v1') === 0) return false;
    $parts = explode('|', $key);
    if (count($parts) !== 5) return false;
    foreach ($parts as $p) {
        if (trim($p) === '') return false;
    }
    return true;
}

try {
    switch ($action) {
        case 'ping':
            echo json_encode(['ok' => true, 'message' => 'storage ok']);
            break;

        case 'config_get':
            $key = trim((string)($body['key'] ?? ''));
            if ($key === '') throw new Exception('Thiếu key.');
            $doc = read_json_file(config_path($key));
            echo json_encode(['ok' => true, 'value' => $doc['value'] ?? null]);
            break;

        case 'config_set':
            $key = trim((string)($body['key'] ?? ''));
            if ($key === '') throw new Exception('Thiếu key.');
            $value = $body['value'] ?? '';
            if (!write_json_file(config_path($key), ['key' => $key, 'value' => $value])) {
                throw new Exception('Không ghi được config.');
            }
            echo json_encode(['ok' => true]);
            break;

        case 'config_delete':
            $key = trim((string)($body['key'] ?? ''));
            if ($key === '') throw new Exception('Thiếu key.');
            $p = config_path($key);
            if (is_file($p)) unlink($p);
            echo json_encode(['ok' => true]);
            break;

        case 'cache_get':
            $ck = trim((string)($body['cache_key'] ?? ''));
            if ($ck === '') throw new Exception('Thiếu cache_key.');
            $doc = read_json_file(cache_path($ck));
            echo json_encode(['ok' => true, 'row' => $doc]);
            break;

        case 'cache_upsert':
            $rows = $body['rows'] ?? [];
            if (!is_array($rows)) throw new Exception('rows không hợp lệ.');
            foreach ($rows as $row) {
                if (!is_array($row) || empty($row['cache_key'])) continue;
                $ck = (string)$row['cache_key'];
                $doc = [
                    'cache_key' => $ck,
                    'data' => $row['data'] ?? null,
                    'updated_at' => $row['updated_at'] ?? date('c'),
                ];
                if (!write_json_file(cache_path($ck), $doc)) {
                    throw new Exception('Không ghi cache: ' . $ck);
                }
            }
            echo json_encode(['ok' => true]);
            break;

        case 'cache_delete_eq':
            $ck = trim((string)($body['cache_key'] ?? ''));
            if ($ck === '') throw new Exception('Thiếu cache_key.');
            $p = cache_path($ck);
            if (is_file($p)) unlink($p);
            echo json_encode(['ok' => true]);
            break;

        case 'cache_delete_like':
            $prefix = (string)($body['prefix'] ?? '');
            foreach (list_cache_files($prefix) as $doc) {
                $p = cache_path((string)$doc['cache_key']);
                if (is_file($p)) unlink($p);
            }
            echo json_encode(['ok' => true]);
            break;

        case 'cache_delete_sp2_only':
            foreach (list_cache_files(null) as $doc) {
                $ck = (string)($doc['cache_key'] ?? '');
                if (strpos($ck, 'tb_subscriber_v1|') === 0) continue;
                if (strpos($ck, 'tb_transfer_history_v1|') === 0) continue;
                $p = cache_path($ck);
                if (is_file($p)) unlink($p);
            }
            echo json_encode(['ok' => true]);
            break;

        case 'cache_list':
            $prefix = isset($body['prefix']) ? (string)$body['prefix'] : null;
            if ($prefix === '') $prefix = null;
            $offset = max(0, (int)($body['offset'] ?? 0));
            $limit = min(2000, max(1, (int)($body['limit'] ?? 1000)));
            $all = list_cache_files($prefix);
            $slice = array_slice($all, $offset, $limit);
            $rows = array_map(function ($doc) {
                return [
                    'cache_key' => $doc['cache_key'],
                    'data' => $doc['data'] ?? null,
                    'updated_at' => $doc['updated_at'] ?? null,
                ];
            }, $slice);
            echo json_encode(['ok' => true, 'rows' => $rows]);
            break;

        default:
            http_response_code(400);
            echo json_encode(['ok' => false, 'error' => 'action không hợp lệ: ' . $action]);
    }
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => $e->getMessage()]);
}
