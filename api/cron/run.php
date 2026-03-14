#!/usr/bin/env php
<?php
/**
 * Cron Job — runs every minute via cPanel Cron Manager
 * Command: php /home/crmjatco/public_html/api/cron/run.php >> /home/crmjatco/logs/cron.log 2>&1
 *
 * cPanel Cron Setup:
 *   Minute: *  Hour: *  Day: *  Month: *  Weekday: *
 */

define('APP_ROOT', dirname(__DIR__));
define('CRON_MODE', true);

require_once APP_ROOT . '/config/database.php';
require_once APP_ROOT . '/config/config.php';

echo '[' . date('Y-m-d H:i:s') . '] Cron started' . PHP_EOL;

// ── 1. Process pending Excel imports ──────────────────────
processPendingImports();

// ── 2. Cleanup expired tokens (run once per hour) ─────────
if ((int)date('i') === 0) {
    cleanupTokens();
    cleanupLoginAttempts();
}

echo '[' . date('Y-m-d H:i:s') . '] Cron finished' . PHP_EOL;

// ════════════════════════════════════════════════════════════
function processPendingImports(): void {
    // Find queued imports
    $jobs = DB::fetchAll(
        "SELECT log_id, details FROM audit_log
         WHERE action = 'EXCEL_IMPORT_QUEUED'
         ORDER BY created_at ASC LIMIT 5"
    );

    foreach ($jobs as $job) {
        $details = json_decode($job['details'], true);
        $file    = $details['file'] ?? null;
        $type    = $details['type'] ?? 'subjects';

        if (!$file) continue;

        $path = UPLOAD_PATH . '/excel/' . $file;
        if (!file_exists($path)) {
            DB::execute('UPDATE audit_log SET action="EXCEL_IMPORT_FILE_MISSING" WHERE log_id=?', [$job['log_id']]);
            continue;
        }

        echo "Processing: $file (type: $type)" . PHP_EOL;

        try {
            if ($type === 'subjects') {
                $count = importSubjectsFromExcel($path);
                echo "  Imported $count subjects" . PHP_EOL;
            } elseif ($type === 'fee') {
                $count = importFeeFromExcel($path);
                echo "  Imported $count fee rows" . PHP_EOL;
            }

            // Mark done
            DB::execute(
                'UPDATE audit_log SET action="EXCEL_IMPORT_DONE" WHERE log_id=?',
                [$job['log_id']]
            );
        } catch (Exception $e) {
            echo "  ERROR: " . $e->getMessage() . PHP_EOL;
            DB::execute(
                "UPDATE audit_log SET action='EXCEL_IMPORT_FAILED', details=? WHERE log_id=?",
                [json_encode(['file' => $file, 'error' => $e->getMessage()]), $job['log_id']]
            );
        }
    }
}

function importSubjectsFromExcel(string $path): int {
    /**
     * Expected Excel columns (row 1 = headers):
     * subject_code | subject_name | faculty_code | level | pool_type | has_practical | credits
     *
     * faculty_code: ARTS / SCI / COM (or blank for common pool VAC/SEC/MDC/AEC)
     * level: UG / PG / BOTH
     * pool_type: MAJOR / MINOR / VAC / SEC / MDC / AEC
     * has_practical: 1 / 0
     */

    $rows  = parseExcel($path);
    $count = 0;

    // Pre-load faculty codes
    $faculties = DB::fetchAll('SELECT faculty_id, faculty_code FROM faculties');
    $facMap    = array_column($faculties, 'faculty_id', 'faculty_code');

    foreach ($rows as $row) {
        $code      = strtoupper(trim($row['subject_code'] ?? ''));
        $name      = trim($row['subject_name'] ?? '');
        $facCode   = strtoupper(trim($row['faculty_code'] ?? ''));
        $level     = strtoupper(trim($row['level'] ?? 'BOTH'));
        $pool      = strtoupper(trim($row['pool_type'] ?? ''));
        $practical = (int)($row['has_practical'] ?? 0);
        $credits   = (int)($row['credits'] ?? 4);

        if (!$code || !$name || !$pool) continue;

        $facultyId = $facMap[$facCode] ?? null;

        // Common pool subjects (VAC/SEC/MDC/AEC) have no faculty
        if (in_array($pool, ['VAC','SEC','MDC','AEC'])) $facultyId = null;

        DB::execute(
            'INSERT INTO subjects (subject_code, subject_name, faculty_id, level, pool_type, has_practical, credits)
             VALUES (?,?,?,?,?,?,?)
             ON DUPLICATE KEY UPDATE subject_name=?, faculty_id=?, level=?, pool_type=?, has_practical=?, credits=?',
            [$code,$name,$facultyId,$level,$pool,$practical,$credits,
             $name,$facultyId,$level,$pool,$practical,$credits]
        );
        $count++;
    }
    return $count;
}

function importFeeFromExcel(string $path): int {
    /**
     * Expected columns:
     * course_code | subject_code | fee_type | amount | description
     * fee_type: CLASS / SUBJECT / PRACTICAL
     */
    $rows  = parseExcel($path);
    $count = 0;

    foreach ($rows as $row) {
        $courseCode  = strtoupper(trim($row['course_code']  ?? ''));
        $subjectCode = strtoupper(trim($row['subject_code'] ?? ''));
        $feeType     = strtoupper(trim($row['fee_type']     ?? ''));
        $amount      = (float)($row['amount'] ?? 0);
        $desc        = trim($row['description'] ?? '');

        if (!$feeType || $amount <= 0) continue;

        $courseId  = null;
        $subjectId = null;

        if ($courseCode) {
            $c = DB::fetchOne('SELECT course_id FROM courses WHERE course_code = ?', [$courseCode]);
            $courseId = $c['course_id'] ?? null;
        }
        if ($subjectCode) {
            $s = DB::fetchOne('SELECT subject_id FROM subjects WHERE subject_code = ?', [$subjectCode]);
            $subjectId = $s['subject_id'] ?? null;
        }

        DB::execute(
            'INSERT INTO fee_structure (course_id, subject_id, fee_type, amount, academic_yr, description)
             VALUES (?,?,?,?,?,?)
             ON DUPLICATE KEY UPDATE amount=?, description=?',
            [$courseId,$subjectId,$feeType,$amount,CURRENT_ACADEMIC_YEAR,$desc,$amount,$desc]
        );
        $count++;
    }
    return $count;
}

function parseExcel(string $path): array {
    /**
     * Simple CSV/Excel reader — reads first sheet
     * For .xlsx: uses PHP ZipArchive to extract xl/worksheets/sheet1.xml
     * For .csv: uses fgetcsv
     */
    $ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));

    if ($ext === 'csv') {
        return parseCsv($path);
    }

    // XLSX: extract shared strings + sheet XML
    $zip = new ZipArchive();
    if ($zip->open($path) !== true) throw new Exception("Cannot open xlsx file");

    $sharedStrings = [];
    $ssXml = $zip->getFromName('xl/sharedStrings.xml');
    if ($ssXml) {
        $ss = new SimpleXMLElement($ssXml);
        foreach ($ss->si as $si) {
            $sharedStrings[] = (string)$si->t;
        }
    }

    $sheetXml = $zip->getFromName('xl/worksheets/sheet1.xml');
    $zip->close();
    if (!$sheetXml) throw new Exception("No sheet1 found");

    $sheet = new SimpleXMLElement($sheetXml);
    $rows  = [];
    $headers = [];

    foreach ($sheet->sheetData->row as $rowIdx => $row) {
        $rowData = [];
        foreach ($row->c as $cell) {
            $val = '';
            $t   = (string)$cell['t'];
            if ($t === 's') {
                $val = $sharedStrings[(int)$cell->v] ?? '';
            } else {
                $val = (string)$cell->v;
            }
            $rowData[] = $val;
        }

        if ($rowIdx === 0) {
            $headers = array_map('trim', $rowData);
        } else {
            $assoc = [];
            foreach ($headers as $i => $h) {
                $assoc[strtolower(str_replace(' ', '_', $h))] = $rowData[$i] ?? '';
            }
            $rows[] = $assoc;
        }
    }
    return $rows;
}

function parseCsv(string $path): array {
    $rows = []; $headers = [];
    if (($handle = fopen($path, 'r')) !== false) {
        $rowIdx = 0;
        while (($data = fgetcsv($handle)) !== false) {
            if ($rowIdx === 0) {
                $headers = array_map('trim', $data);
            } else {
                $assoc = [];
                foreach ($headers as $i => $h) {
                    $assoc[strtolower(str_replace(' ', '_', $h))] = $data[$i] ?? '';
                }
                $rows[] = $assoc;
            }
            $rowIdx++;
        }
        fclose($handle);
    }
    return $rows;
}

function cleanupTokens(): void {
    $deleted = DB::execute('DELETE FROM auth_tokens WHERE expires_at < NOW()');
    echo "Cleaned $deleted expired tokens" . PHP_EOL;
}

function cleanupLoginAttempts(): void {
    $deleted = DB::execute("DELETE FROM login_attempts WHERE attempted_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)");
    echo "Cleaned $deleted old login attempts" . PHP_EOL;
}
