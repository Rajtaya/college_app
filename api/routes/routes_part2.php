<?php
// ═══════════════════════════════════════════════════════════
// SUBJECTS ROUTES
// ═══════════════════════════════════════════════════════════
class SubjectRoutes {
    public static function handle(string $method, string $action, array $body, array $query): void {
        switch ($method . ':' . $action) {
            case 'GET:':
            case 'GET:list':
                self::list($query);
                break;
            default:
                Response::error('Subject endpoint not found', 404);
        }
    }

    private static function list(array $query): void {
        $where  = ['s.is_active = 1'];
        $params = [];

        if (!empty($query['faculty_id'])) {
            $where[]  = '(s.faculty_id = ? OR s.faculty_id IS NULL)';
            $params[] = $query['faculty_id'];
        }
        if (!empty($query['level'])) {
            $where[]  = "(s.level = ? OR s.level = 'BOTH')";
            $params[] = strtoupper($query['level']);
        }
        if (!empty($query['pool_type'])) {
            $where[]  = 's.pool_type = ?';
            $params[] = strtoupper($query['pool_type']);
        }

        $whereStr = implode(' AND ', $where);
        $subjects = DB::fetchAll(
            "SELECT s.subject_id, s.subject_code, s.subject_name,
                    s.pool_type, s.level, s.has_practical, s.credits,
                    f.faculty_name
             FROM subjects s
             LEFT JOIN faculties f ON s.faculty_id = f.faculty_id
             WHERE $whereStr
             ORDER BY s.pool_type, s.subject_name",
            $params
        );
        Response::success($subjects);
    }
}

// ═══════════════════════════════════════════════════════════
// FEE ROUTES
// ═══════════════════════════════════════════════════════════
class FeeRoutes {
    public static function handle(string $method, string $action, array $body, array $auth): void {
        switch ($method . ':' . $action) {
            case 'POST:calculate': self::calculate($body); break;
            default: Response::error('Fee endpoint not found', 404);
        }
    }

    private static function calculate(array $body): void {
        $courseId   = $body['course_id']   ?? null;
        $subjectIds = $body['subject_ids'] ?? [];
        $academicYr = CURRENT_ACADEMIC_YEAR;

        $classFee = DB::fetchOne(
            "SELECT amount FROM fee_structure WHERE course_id=? AND fee_type='CLASS' AND academic_yr=?",
            [$courseId, $academicYr]
        );

        $breakdown = ['class_fee' => (float)($classFee['amount'] ?? 0), 'subjects' => []];
        $total     = $breakdown['class_fee'];

        if (!empty($subjectIds)) {
            $ph   = implode(',', array_fill(0, count($subjectIds), '?'));
            $fees = DB::fetchAll(
                "SELECT s.subject_id, s.subject_name, s.has_practical,
                        fs_s.amount as subject_fee, fs_p.amount as practical_fee
                 FROM subjects s
                 LEFT JOIN fee_structure fs_s ON fs_s.subject_id = s.subject_id AND fs_s.fee_type='SUBJECT'  AND fs_s.academic_yr=?
                 LEFT JOIN fee_structure fs_p ON fs_p.subject_id = s.subject_id AND fs_p.fee_type='PRACTICAL' AND fs_p.academic_yr=?
                 WHERE s.subject_id IN ($ph)",
                array_merge([$academicYr, $academicYr], $subjectIds)
            );
            foreach ($fees as $f) {
                $sf = (float)($f['subject_fee'] ?? 0);
                $pf = $f['has_practical'] ? (float)($f['practical_fee'] ?? 0) : 0;
                $total += $sf + $pf;
                $breakdown['subjects'][] = [
                    'subject_id'    => $f['subject_id'],
                    'subject_name'  => $f['subject_name'],
                    'subject_fee'   => $sf,
                    'practical_fee' => $pf,
                ];
            }
        }

        $breakdown['total'] = round($total, 2);
        Response::success($breakdown);
    }
}

// ═══════════════════════════════════════════════════════════
// TEACHER ROUTES
// ═══════════════════════════════════════════════════════════
class TeacherRoutes {
    public static function handle(string $method, string $action, string $sub, array $body, array $auth): void {
        $tid = $auth['teacher_id'];
        switch ($method . ':' . $action) {
            case 'GET:profile':   self::getProfile($tid);         break;
            case 'GET:subjects':  self::getMySubjects($tid);      break;
            case 'GET:students':  self::getMyStudents($tid, $_GET); break;
            default: Response::error('Teacher endpoint not found', 404);
        }
    }

    private static function getProfile(int $tid): void {
        $t = DB::fetchOne(
            'SELECT teacher_id, name, email, mobile, designation, department, photo_path
             FROM teachers WHERE teacher_id = ?', [$tid]
        );
        if (!$t) Response::error('Teacher not found', 404);
        if ($t['photo_path']) $t['photo_url'] = UPLOAD_URL . '/photos/' . $t['photo_path'];
        Response::success($t);
    }

    private static function getMySubjects(int $tid): void {
        $subjects = DB::fetchAll(
            'SELECT ts.id, ts.level, ts.academic_yr,
                    s.subject_id, s.subject_code, s.subject_name, s.pool_type,
                    f.faculty_name, f.faculty_code,
                    c.course_name, c.course_code,
                    (SELECT COUNT(*) FROM student_subjects ss
                     JOIN students st ON ss.roll_no = st.roll_no
                     WHERE ss.subject_id = s.subject_id AND st.course_id = ts.course_id
                       AND ss.academic_yr = ts.academic_yr) as enrolled_count
             FROM teacher_subjects ts
             JOIN subjects   s ON ts.subject_id = s.subject_id
             JOIN faculties  f ON ts.faculty_id = f.faculty_id
             JOIN courses    c ON ts.course_id  = c.course_id
             WHERE ts.teacher_id = ? AND ts.academic_yr = ?
             ORDER BY f.faculty_name, ts.level, s.subject_name',
            [$tid, CURRENT_ACADEMIC_YEAR]
        );
        Response::success($subjects);
    }

    private static function getMyStudents(int $tid, array $query): void {
        $subjectId = $query['subject_id'] ?? null;
        $courseId  = $query['course_id']  ?? null;

        $where  = ['ts.teacher_id = ?', 'ts.academic_yr = ?'];
        $params = [$tid, CURRENT_ACADEMIC_YEAR];

        if ($subjectId) { $where[] = 'ts.subject_id = ?'; $params[] = $subjectId; }
        if ($courseId)  { $where[] = 'ts.course_id  = ?'; $params[] = $courseId;  }

        $whereStr = implode(' AND ', $where);

        $students = DB::fetchAll(
            "SELECT DISTINCT st.roll_no, st.full_name, st.mobile, st.email,
                    f.faculty_name, c.course_name, ts.level
             FROM teacher_subjects ts
             JOIN student_subjects ss ON ss.subject_id = ts.subject_id AND ss.academic_yr = ts.academic_yr
             JOIN students st ON ss.roll_no = st.roll_no AND st.course_id = ts.course_id
             JOIN faculties f ON st.faculty_id = f.faculty_id
             JOIN courses   c ON st.course_id  = c.course_id
             WHERE $whereStr
             ORDER BY st.full_name",
            $params
        );
        Response::success($students);
    }
}

// ═══════════════════════════════════════════════════════════
// NOTIFICATION ROUTES
// ═══════════════════════════════════════════════════════════
class NotificationRoutes {
    public static function handle(string $method, string $action, array $body, array $auth): void {
        $tid = $auth['teacher_id'];
        switch ($method . ':' . $action) {
            case 'POST:send':  self::send($tid, $body);  break;
            case 'GET:history':self::history($tid);      break;
            default: Response::error('Notification endpoint not found', 404);
        }
    }

    private static function send(int $tid, array $body): void {
        $title     = trim($body['title']       ?? '');
        $message   = trim($body['message']     ?? '');
        $scopeType = strtoupper($body['scope_type']  ?? 'ALL');
        $scopeVal  = $body['scope_value'] ?? null;

        if (!$title || !$message) Response::error('Title and message required');

        // Handle image upload
        $imagePath = null;
        if (!empty($_FILES['image'])) {
            $file = $_FILES['image'];
            if ($file['size'] > MAX_IMAGE_SIZE) Response::error('Image must be under 10MB');
            if (!in_array($file['type'], ALLOWED_IMG_TYPES)) Response::error('Only JPG/PNG allowed');
            $ext       = pathinfo($file['name'], PATHINFO_EXTENSION);
            $imagePath = 'notif_' . $tid . '_' . time() . '.' . $ext;
            move_uploaded_file($file['tmp_name'], UPLOAD_PATH . '/notif/' . $imagePath);
        }

        // Save notification
        $notifId = DB::insert(
            'INSERT INTO notifications (teacher_id, title, message, image_path, scope_type, scope_value, content_type)
             VALUES (?,?,?,?,?,?,?)',
            [$tid, $title, $message, $imagePath, $scopeType, $scopeVal,
             $imagePath ? 'IMAGE' : 'TEXT']
        );

        // Get FCM tokens of target students
        $tokens = self::getTargetTokens($scopeType, $scopeVal);

        // Send via FCM
        $sent = 0;
        if (!empty($tokens)) {
            $sent = self::sendFCM($tokens, $title, $message, $imagePath, $notifId);
        }

        DB::execute('UPDATE notifications SET sent_count = ? WHERE notif_id = ?', [$sent, $notifId]);

        Response::success(['notif_id' => $notifId, 'sent_to' => $sent], 'Notification sent');
    }

    private static function getTargetTokens(string $scope, $value): array {
        $sql    = '';
        $params = [];

        switch ($scope) {
            case 'ALL':
                $sql    = 'SELECT fcm_token FROM student_fcm_tokens';
                break;
            case 'FACULTY':
                $sql    = 'SELECT sft.fcm_token FROM student_fcm_tokens sft
                           JOIN students s ON sft.roll_no = s.roll_no WHERE s.faculty_id = ?';
                $params = [$value];
                break;
            case 'COURSE':
                $sql    = 'SELECT sft.fcm_token FROM student_fcm_tokens sft
                           JOIN students s ON sft.roll_no = s.roll_no WHERE s.course_id = ?';
                $params = [$value];
                break;
            case 'LEVEL':
                $sql    = 'SELECT sft.fcm_token FROM student_fcm_tokens sft
                           JOIN students s ON sft.roll_no = s.roll_no WHERE s.level = ?';
                $params = [$value];
                break;
            case 'SUBJECT':
                $sql    = 'SELECT DISTINCT sft.fcm_token FROM student_fcm_tokens sft
                           JOIN student_subjects ss ON sft.roll_no = ss.roll_no
                           WHERE ss.subject_id = ? AND ss.academic_yr = ?';
                $params = [$value, CURRENT_ACADEMIC_YEAR];
                break;
            default:
                return [];
        }

        $rows = DB::fetchAll($sql, $params);
        return array_column($rows, 'fcm_token');
    }

    private static function sendFCM(array $tokens, string $title, string $body, ?string $imagePath, int $notifId): int {
        if (FCM_SERVER_KEY === 'YOUR_FIREBASE_SERVER_KEY') return 0;

        $sent  = 0;
        $batch = array_chunk($tokens, 500); // FCM max 500/request

        foreach ($batch as $chunk) {
            $payload = json_encode([
                'registration_ids' => $chunk,
                'notification' => array_filter([
                    'title' => $title,
                    'body'  => $body,
                    'image' => $imagePath ? UPLOAD_URL . '/notif/' . $imagePath : null,
                ]),
                'data' => ['notif_id' => $notifId, 'type' => 'college_notification'],
            ]);

            $ch = curl_init(FCM_API_URL);
            curl_setopt_array($ch, [
                CURLOPT_POST           => true,
                CURLOPT_POSTFIELDS     => $payload,
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_HTTPHEADER     => [
                    'Authorization: key=' . FCM_SERVER_KEY,
                    'Content-Type: application/json',
                ],
            ]);
            $result = json_decode(curl_exec($ch), true);
            curl_close($ch);
            $sent += $result['success'] ?? 0;
        }
        return $sent;
    }

    private static function history(int $tid): void {
        $notifs = DB::fetchAll(
            'SELECT notif_id, title, message, scope_type, scope_value,
                    content_type, sent_count, sent_at
             FROM notifications WHERE teacher_id = ?
             ORDER BY sent_at DESC LIMIT 50',
            [$tid]
        );
        Response::success($notifs);
    }
}
