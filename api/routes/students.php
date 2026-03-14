<?php
class StudentRoutes {
    public static function handle(string $method, string $action, string $sub, array $body, array $auth): void {
        $rollNo = $auth['roll_no'];
        switch ($method . ':' . $action) {
            case 'GET:profile':      self::getProfile($rollNo);            break;
            case 'PUT:profile':      self::updateProfile($rollNo, $body);  break;
            case 'POST:photo':       self::uploadPhoto($rollNo);           break;
            case 'GET:subjects':     self::getSubjects($rollNo);           break;
            case 'POST:subjects':    self::saveSubjects($rollNo, $body);   break;
            case 'GET:fee':          self::getFee($rollNo);                break;
            case 'GET:notifications':self::getNotifications($rollNo);      break;
            case 'POST:fcm-token':   self::saveFcmToken($rollNo, $body);   break;
            default: Response::error('Student endpoint not found', 404);
        }
    }

    // ── GET Profile ─────────────────────────────────────────
    private static function getProfile(string $rollNo): void {
        $s = DB::fetchOne(
            'SELECT s.roll_no, s.full_name, s.email, s.mobile, s.dob, s.gender,
                    s.address, s.father_name, s.mother_name, s.tenth_school,
                    s.twelfth_school, s.twelfth_subjects, s.level, s.admission_yr,
                    s.photo_path, s.profile_complete, s.admission_yr,
                    f.faculty_name, f.faculty_code,
                    c.course_name, c.course_code
             FROM students s
             LEFT JOIN faculties f ON s.faculty_id = f.faculty_id
             LEFT JOIN courses   c ON s.course_id  = c.course_id
             WHERE s.roll_no = ?',
            [$rollNo]
        );
        if (!$s) Response::error('Student not found', 404);
        if ($s['photo_path']) $s['photo_url'] = UPLOAD_URL . '/photos/' . $s['photo_path'];
        Response::success($s);
    }

    // ── UPDATE Profile ──────────────────────────────────────
    private static function updateProfile(string $rollNo, array $body): void {
        $allowed = ['full_name','email','mobile','dob','gender','address',
                    'father_name','mother_name','tenth_school','twelfth_school',
                    'twelfth_subjects','faculty_id','course_id','level'];
        $updates = [];
        $params  = [];
        foreach ($allowed as $field) {
            if (isset($body[$field])) {
                $updates[] = "$field = ?";
                $params[]  = $body[$field];
            }
        }
        if (empty($updates)) Response::error('Nothing to update');

        // Validate faculty/course combo
        if (isset($body['faculty_id']) && isset($body['course_id'])) {
            $course = DB::fetchOne(
                'SELECT course_id FROM courses WHERE course_id = ? AND faculty_id = ?',
                [$body['course_id'], $body['faculty_id']]
            );
            if (!$course) Response::error('Invalid faculty/course combination');
        }

        $updates[] = 'profile_complete = 1';
        $params[]  = $rollNo;

        DB::execute('UPDATE students SET ' . implode(', ', $updates) . ' WHERE roll_no = ?', $params);
        self::getProfile($rollNo);
    }

    // ── Upload Photo ────────────────────────────────────────
    private static function uploadPhoto(string $rollNo): void {
        if (empty($_FILES['photo'])) Response::error('No file uploaded');
        $file = $_FILES['photo'];
        if ($file['size'] > MAX_PHOTO_SIZE) Response::error('Photo must be under 5MB');
        if (!in_array($file['type'], ALLOWED_IMG_TYPES)) Response::error('Only JPG/PNG/WEBP allowed');

        $ext      = pathinfo($file['name'], PATHINFO_EXTENSION);
        $filename = $rollNo . '_' . time() . '.' . $ext;
        $dest     = UPLOAD_PATH . '/photos/' . $filename;

        if (!move_uploaded_file($file['tmp_name'], $dest)) Response::error('Upload failed');

        DB::execute('UPDATE students SET photo_path = ? WHERE roll_no = ?', [$filename, $rollNo]);
        Response::success(['photo_url' => UPLOAD_URL . '/photos/' . $filename], 'Photo uploaded');
    }

    // ── GET Subjects ────────────────────────────────────────
    private static function getSubjects(string $rollNo): void {
        $selected = DB::fetchAll(
            'SELECT ss.id, ss.pool_type, ss.academic_yr,
                    s.subject_id, s.subject_code, s.subject_name,
                    s.has_practical, s.credits, s.pool_type as subject_pool
             FROM student_subjects ss
             JOIN subjects s ON ss.subject_id = s.subject_id
             WHERE ss.roll_no = ? AND ss.academic_yr = ?
             ORDER BY ss.pool_type, s.subject_name',
            [$rollNo, CURRENT_ACADEMIC_YEAR]
        );
        Response::success($selected);
    }

    // ── SAVE Subjects (with validation) ─────────────────────
    private static function saveSubjects(string $rollNo, array $body): void {
        $subjects    = $body['subjects'] ?? [];
        $academicYr  = CURRENT_ACADEMIC_YEAR;

        if (empty($subjects)) Response::error('No subjects provided');

        // Get student info for validation
        $student = DB::fetchOne(
            'SELECT faculty_id, course_id, level, twelfth_subjects FROM students WHERE roll_no = ?',
            [$rollNo]
        );
        if (!$student) Response::error('Student not found', 404);

        $twelfthSubjects = json_decode($student['twelfth_subjects'] ?? '[]', true) ?? [];

        // Load selected subjects with their codes and types
        $subjectIds = array_column($subjects, 'subject_id');
        if (empty($subjectIds)) Response::error('No valid subjects');

        $placeholders = implode(',', array_fill(0, count($subjectIds), '?'));
        $subjectData  = DB::fetchAll(
            "SELECT subject_id, subject_code, pool_type, faculty_id FROM subjects WHERE subject_id IN ($placeholders)",
            $subjectIds
        );
        $subjectMap = array_column($subjectData, null, 'subject_id');

        // ── VALIDATION RULES ──────────────────────────────
        $majorCodes = [];
        $poolGroups = [];
        foreach ($subjects as $sel) {
            $sid  = $sel['subject_id'];
            $sData = $subjectMap[$sid] ?? null;
            if (!$sData) Response::error("Subject ID $sid not found");
            $poolGroups[$sData['pool_type']][] = $sData;
            if ($sData['pool_type'] === 'MAJOR') $majorCodes[] = $sData['subject_code'];
        }

        // Rule 1: Minor ≠ Major
        if (isset($poolGroups['MINOR'])) {
            foreach ($poolGroups['MINOR'] as $minor) {
                if (in_array($minor['subject_code'], $majorCodes)) {
                    Response::error(
                        "Validation Error: Minor subject '{$minor['subject_code']}' cannot be same as a Major subject.",
                        422
                    );
                }
            }
        }

        // Rule 2: MDC ≠ Major
        if (isset($poolGroups['MDC'])) {
            foreach ($poolGroups['MDC'] as $mdc) {
                if (in_array($mdc['subject_code'], $majorCodes)) {
                    Response::error(
                        "Validation Error: MDC subject '{$mdc['subject_code']}' cannot be same as your Major subject.",
                        422
                    );
                }
                // Rule 3: MDC ≠ 10+2 subjects
                if (in_array($mdc['subject_code'], $twelfthSubjects)) {
                    Response::error(
                        "Validation Error: MDC subject '{$mdc['subject_code']}' cannot be a subject you studied at 10+2 level.",
                        422
                    );
                }
            }
        }

        // Rule 4: Major/Minor must be faculty-specific (not null faculty)
        foreach (['MAJOR', 'MINOR'] as $pool) {
            if (isset($poolGroups[$pool])) {
                foreach ($poolGroups[$pool] as $subj) {
                    if ($subj['faculty_id'] != $student['faculty_id']) {
                        Response::error(
                            "Validation Error: {$pool} subject '{$subj['subject_code']}' does not belong to your faculty.",
                            422
                        );
                    }
                }
            }
        }

        // ── SAVE ──────────────────────────────────────────
        DB::execute(
            'DELETE FROM student_subjects WHERE roll_no = ? AND academic_yr = ?',
            [$rollNo, $academicYr]
        );

        foreach ($subjects as $sel) {
            $sData = $subjectMap[$sel['subject_id']];
            DB::execute(
                'INSERT INTO student_subjects (roll_no, subject_id, pool_type, academic_yr) VALUES (?,?,?,?)',
                [$rollNo, $sel['subject_id'], $sData['pool_type'], $academicYr]
            );
        }

        // Audit
        DB::execute(
            "INSERT INTO audit_log (actor_type, actor_id, action, details, ip_address)
             VALUES ('STUDENT',?,?,?,?)",
            [$rollNo, 'SUBJECT_SELECTION',
             json_encode(['count' => count($subjects)]),
             $_SERVER['REMOTE_ADDR'] ?? '']
        );

        self::getSubjects($rollNo);
    }

    // ── GET Fee ─────────────────────────────────────────────
    private static function getFee(string $rollNo): void {
        $student = DB::fetchOne(
            'SELECT course_id, level FROM students WHERE roll_no = ?', [$rollNo]
        );
        if (!$student) Response::error('Student not found', 404);

        // Class fee
        $classFee = DB::fetchOne(
            "SELECT amount, description FROM fee_structure
             WHERE course_id = ? AND fee_type = 'CLASS' AND subject_id IS NULL AND academic_yr = ?",
            [$student['course_id'], CURRENT_ACADEMIC_YEAR]
        );

        // Subject fees
        $subjectFees = DB::fetchAll(
            "SELECT fs.amount, fs.description, s.subject_name, s.subject_code, s.has_practical
             FROM student_subjects ss
             JOIN subjects s ON ss.subject_id = s.subject_id
             LEFT JOIN fee_structure fs ON fs.subject_id = s.subject_id
                 AND fs.fee_type = 'SUBJECT' AND fs.academic_yr = ?
             WHERE ss.roll_no = ? AND ss.academic_yr = ?",
            [CURRENT_ACADEMIC_YEAR, $rollNo, CURRENT_ACADEMIC_YEAR]
        );

        // Practical fees
        $practicalFees = DB::fetchAll(
            "SELECT fs.amount, s.subject_name
             FROM student_subjects ss
             JOIN subjects s ON ss.subject_id = s.subject_id AND s.has_practical = 1
             JOIN fee_structure fs ON fs.subject_id = s.subject_id
                 AND fs.fee_type = 'PRACTICAL' AND fs.academic_yr = ?
             WHERE ss.roll_no = ? AND ss.academic_yr = ?",
            [CURRENT_ACADEMIC_YEAR, $rollNo, CURRENT_ACADEMIC_YEAR]
        );

        $total  = ($classFee['amount'] ?? 0);
        $total += array_sum(array_column($subjectFees, 'amount'));
        $total += array_sum(array_column($practicalFees, 'amount'));

        // Payment status
        $payment = DB::fetchOne(
            'SELECT payment_id, amount_paid, payment_date, receipt_no FROM fee_payments
             WHERE roll_no = ? AND academic_yr = ? ORDER BY payment_date DESC LIMIT 1',
            [$rollNo, CURRENT_ACADEMIC_YEAR]
        );

        Response::success([
            'class_fee'      => $classFee,
            'subject_fees'   => $subjectFees,
            'practical_fees' => $practicalFees,
            'total'          => round($total, 2),
            'paid'           => $payment ? (float)$payment['amount_paid'] : 0,
            'balance'        => round($total - ($payment ? (float)$payment['amount_paid'] : 0), 2),
            'last_payment'   => $payment,
        ]);
    }

    // ── Get Notifications ────────────────────────────────────
    private static function getNotifications(string $rollNo): void {
        $student = DB::fetchOne(
            'SELECT faculty_id, course_id, level FROM students WHERE roll_no = ?', [$rollNo]
        );

        $notifications = DB::fetchAll(
            "SELECT n.notif_id, n.title, n.message, n.image_path, n.content_type,
                    n.scope_type, n.sent_at, t.name as teacher_name
             FROM notifications n
             JOIN teachers t ON n.teacher_id = t.teacher_id
             WHERE n.scope_type = 'ALL'
                OR (n.scope_type = 'FACULTY' AND n.scope_value = ?)
                OR (n.scope_type = 'COURSE'  AND n.scope_value = ?)
                OR (n.scope_type = 'LEVEL'   AND n.scope_value = ?)
                OR (n.scope_type = 'SUBJECT' AND n.scope_value IN (
                    SELECT subject_id FROM student_subjects WHERE roll_no = ? AND academic_yr = ?
                ))
             ORDER BY n.sent_at DESC LIMIT 50",
            [$student['faculty_id'], $student['course_id'],
             $student['level'], $rollNo, CURRENT_ACADEMIC_YEAR]
        );

        foreach ($notifications as &$n) {
            if ($n['image_path']) {
                $n['image_url'] = UPLOAD_URL . '/notif/' . $n['image_path'];
            }
        }

        Response::success($notifications);
    }

    // ── Save FCM Token ───────────────────────────────────────
    private static function saveFcmToken(string $rollNo, array $body): void {
        $token = trim($body['fcm_token'] ?? '');
        if (!$token) Response::error('FCM token required');
        DB::execute(
            'INSERT INTO student_fcm_tokens (roll_no, fcm_token, device_fp)
             VALUES (?,?,?)
             ON DUPLICATE KEY UPDATE fcm_token = ?, device_fp = ?',
            [$rollNo, $token, $body['device_fp'] ?? null, $token, $body['device_fp'] ?? null]
        );
        Response::success(null, 'FCM token saved');
    }
}
