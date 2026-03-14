<?php
class AdminRoutes {
    public static function handle(string $method, string $action, string $sub, array $body, array $auth): void {
        switch ($method . ':' . $action) {
            // Students
            case 'GET:students':      self::listStudents($_GET);       break;
            case 'POST:students':     self::createStudent($body);      break;
            case 'PUT:students':      self::updateStudent($sub, $body);break;

            // Teachers
            case 'GET:teachers':      self::listTeachers();             break;
            case 'POST:teachers':     self::createTeacher($body);       break;
            case 'POST:teacher-subject': self::assignSubject($body);   break;
            case 'DELETE:teacher-subject': self::removeSubject($body); break;

            // Subjects
            case 'POST:subjects-import': self::importSubjects();       break;
            case 'POST:subjects':     self::createSubject($body);      break;

            // Fee
            case 'GET:fee-structure': self::getFeeStructure($_GET);    break;
            case 'POST:fee-structure':self::saveFee($body);            break;
            case 'POST:fee-payment':  self::recordPayment($body);      break;

            // Faculties & Courses
            case 'GET:faculties':     self::getFaculties();            break;
            case 'GET:courses':       self::getCourses($_GET);         break;
            case 'POST:courses':      self::createCourse($body);       break;

            // Dashboard
            case 'GET:dashboard':     self::dashboard();               break;
            case 'GET:audit':         self::getAuditLog($_GET);        break;

            default: Response::error('Admin endpoint not found', 404);
        }
    }

    // ── LIST STUDENTS ───────────────────────────────────────
    private static function listStudents(array $q): void {
        $where = ['1=1']; $params = [];
        if (!empty($q['faculty_id'])) { $where[] = 's.faculty_id = ?'; $params[] = $q['faculty_id']; }
        if (!empty($q['course_id']))  { $where[] = 's.course_id = ?';  $params[] = $q['course_id']; }
        if (!empty($q['level']))      { $where[] = 's.level = ?';      $params[] = $q['level']; }
        if (!empty($q['search']))     { $where[] = '(s.roll_no LIKE ? OR s.full_name LIKE ?)';
                                        $params[] = '%'.$q['search'].'%'; $params[] = '%'.$q['search'].'%'; }

        $page = max(1, (int)($q['page'] ?? 1));
        $per  = min(100, max(10, (int)($q['per_page'] ?? 25)));
        $offset = ($page - 1) * $per;

        $whereStr = implode(' AND ', $where);
        $total    = DB::fetchOne("SELECT COUNT(*) as cnt FROM students s WHERE $whereStr", $params)['cnt'];
        $students = DB::fetchAll(
            "SELECT s.roll_no, s.full_name, s.mobile, s.email, s.level,
                    s.profile_complete, s.is_active, s.admission_yr,
                    f.faculty_name, c.course_name
             FROM students s
             LEFT JOIN faculties f ON s.faculty_id = f.faculty_id
             LEFT JOIN courses   c ON s.course_id  = c.course_id
             WHERE $whereStr ORDER BY s.roll_no LIMIT $per OFFSET $offset",
            $params
        );
        Response::paginated($students, (int)$total, $page, $per);
    }

    // ── CREATE STUDENT (Admin pre-loads roll no) ────────────
    private static function createStudent(array $body): void {
        $required = ['roll_no', 'full_name', 'mobile'];
        foreach ($required as $r) {
            if (empty($body[$r])) Response::error("$r is required");
        }

        $rollNo = strtoupper(trim($body['roll_no']));
        $exists = DB::fetchOne('SELECT roll_no FROM students WHERE roll_no = ?', [$rollNo]);
        if ($exists) Response::error('Roll No already exists');

        // Default password = roll_no (student must change after first login)
        $passHash = password_hash($rollNo, PASSWORD_BCRYPT);

        DB::execute(
            'INSERT INTO students (roll_no, full_name, mobile, email, faculty_id, course_id,
                                   level, admission_yr, password_hash)
             VALUES (?,?,?,?,?,?,?,?,?)',
            [
                $rollNo,
                $body['full_name'],
                $body['mobile'],
                $body['email']      ?? null,
                $body['faculty_id'] ?? null,
                $body['course_id']  ?? null,
                $body['level']      ?? null,
                $body['admission_yr'] ?? date('Y'),
                $passHash,
            ]
        );

        Response::success(['roll_no' => $rollNo], 'Student created. Default password = Roll No.', 201);
    }

    // ── UPDATE STUDENT ──────────────────────────────────────
    private static function updateStudent(string $rollNo, array $body): void {
        if (!$rollNo) Response::error('Roll No required');
        $allowed = ['full_name','mobile','email','faculty_id','course_id','level',
                    'admission_yr','is_active','device_fp'];
        $updates = []; $params = [];
        foreach ($allowed as $f) {
            if (array_key_exists($f, $body)) { $updates[] = "$f = ?"; $params[] = $body[$f]; }
        }
        if (isset($body['reset_password'])) {
            $updates[] = 'password_hash = ?';
            $params[]  = password_hash($rollNo, PASSWORD_BCRYPT);
        }
        if (empty($updates)) Response::error('Nothing to update');
        $params[] = $rollNo;
        DB::execute('UPDATE students SET ' . implode(', ', $updates) . ' WHERE roll_no = ?', $params);
        Response::success(null, 'Student updated');
    }

    // ── TEACHERS ────────────────────────────────────────────
    private static function listTeachers(): void {
        $teachers = DB::fetchAll(
            'SELECT t.teacher_id, t.name, t.email, t.mobile, t.designation, t.is_active,
                    COUNT(ts.id) as subject_count
             FROM teachers t
             LEFT JOIN teacher_subjects ts ON t.teacher_id = ts.teacher_id AND ts.academic_yr = ?
             GROUP BY t.teacher_id ORDER BY t.name',
            [CURRENT_ACADEMIC_YEAR]
        );
        Response::success($teachers);
    }

    private static function createTeacher(array $body): void {
        foreach (['name','email','password'] as $r) {
            if (empty($body[$r])) Response::error("$r required");
        }
        $exists = DB::fetchOne('SELECT teacher_id FROM teachers WHERE email = ?', [$body['email']]);
        if ($exists) Response::error('Email already exists');

        $id = DB::insert(
            'INSERT INTO teachers (name, email, mobile, designation, department, password_hash)
             VALUES (?,?,?,?,?,?)',
            [$body['name'], $body['email'], $body['mobile'] ?? null,
             $body['designation'] ?? null, $body['department'] ?? null,
             password_hash($body['password'], PASSWORD_BCRYPT)]
        );
        Response::success(['teacher_id' => $id], 'Teacher created', 201);
    }

    private static function assignSubject(array $body): void {
        foreach (['teacher_id','subject_id','faculty_id','course_id','level'] as $r) {
            if (empty($body[$r])) Response::error("$r required");
        }
        DB::execute(
            'INSERT IGNORE INTO teacher_subjects (teacher_id, subject_id, faculty_id, course_id, level, academic_yr)
             VALUES (?,?,?,?,?,?)',
            [$body['teacher_id'],$body['subject_id'],$body['faculty_id'],
             $body['course_id'],$body['level'],CURRENT_ACADEMIC_YEAR]
        );
        Response::success(null, 'Subject assigned to teacher');
    }

    private static function removeSubject(array $body): void {
        DB::execute(
            'DELETE FROM teacher_subjects WHERE teacher_id=? AND subject_id=? AND course_id=? AND academic_yr=?',
            [$body['teacher_id'],$body['subject_id'],$body['course_id'],CURRENT_ACADEMIC_YEAR]
        );
        Response::success(null, 'Assignment removed');
    }

    // ── IMPORT SUBJECTS FROM EXCEL ───────────────────────────
    private static function importSubjects(): void {
        if (empty($_FILES['excel'])) Response::error('No file uploaded');
        $file = $_FILES['excel'];
        if ($file['size'] > MAX_EXCEL_SIZE) Response::error('File too large');

        $ext  = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
        if (!in_array($ext, ['xlsx','xls'])) Response::error('Only .xlsx or .xls files allowed');

        $filename = 'subjects_import_' . time() . '.' . $ext;
        $dest     = UPLOAD_PATH . '/excel/' . $filename;
        if (!move_uploaded_file($file['tmp_name'], $dest)) Response::error('Upload failed');

        // Queue for cron processing (write a job record)
        DB::execute(
            "INSERT INTO audit_log (actor_type, actor_id, action, details, ip_address)
             VALUES ('ADMIN','system','EXCEL_IMPORT_QUEUED',?,?)",
            [json_encode(['file' => $filename, 'type' => 'subjects']),
             $_SERVER['REMOTE_ADDR'] ?? '']
        );

        Response::success(['file' => $filename], 'File uploaded. Processing will begin shortly via cron.');
    }

    // ── CREATE SUBJECT (manual) ──────────────────────────────
    private static function createSubject(array $body): void {
        foreach (['subject_code','subject_name','pool_type'] as $r) {
            if (empty($body[$r])) Response::error("$r required");
        }
        $id = DB::insert(
            'INSERT INTO subjects (subject_code, subject_name, faculty_id, level, pool_type, has_practical, credits)
             VALUES (?,?,?,?,?,?,?)',
            [strtoupper($body['subject_code']), $body['subject_name'],
             $body['faculty_id'] ?? null,
             strtoupper($body['level'] ?? 'BOTH'),
             strtoupper($body['pool_type']),
             $body['has_practical'] ?? 0,
             $body['credits'] ?? 4]
        );
        Response::success(['subject_id' => $id], 'Subject created', 201);
    }

    // ── FEE STRUCTURE ────────────────────────────────────────
    private static function getFeeStructure(array $q): void {
        $where = ['academic_yr = ?']; $params = [CURRENT_ACADEMIC_YEAR];
        if (!empty($q['course_id'])) { $where[] = 'course_id = ?'; $params[] = $q['course_id']; }
        $whereStr = implode(' AND ', $where);
        $fees = DB::fetchAll("SELECT * FROM fee_structure WHERE $whereStr ORDER BY fee_type, course_id", $params);
        Response::success($fees);
    }

    private static function saveFee(array $body): void {
        foreach (['fee_type','amount'] as $r) {
            if (empty($body[$r])) Response::error("$r required");
        }
        DB::execute(
            'INSERT INTO fee_structure (course_id, subject_id, fee_type, amount, academic_yr, description)
             VALUES (?,?,?,?,?,?)
             ON DUPLICATE KEY UPDATE amount = ?, description = ?',
            [$body['course_id'] ?? null, $body['subject_id'] ?? null,
             strtoupper($body['fee_type']), $body['amount'], CURRENT_ACADEMIC_YEAR,
             $body['description'] ?? null,
             $body['amount'], $body['description'] ?? null]
        );
        Response::success(null, 'Fee saved');
    }

    private static function recordPayment(array $body): void {
        foreach (['roll_no','amount_paid'] as $r) {
            if (empty($body[$r])) Response::error("$r required");
        }
        $receiptNo = 'RCP-' . strtoupper($body['roll_no']) . '-' . date('YmdHis');
        DB::execute(
            'INSERT INTO fee_payments (roll_no, academic_yr, amount_paid, fee_breakdown,
                                       payment_mode, receipt_no, recorded_by)
             VALUES (?,?,?,?,?,?,?)',
            [$body['roll_no'], CURRENT_ACADEMIC_YEAR, $body['amount_paid'],
             json_encode($body['breakdown'] ?? []),
             strtoupper($body['payment_mode'] ?? 'CASH'),
             $receiptNo, $body['admin_id'] ?? null]
        );
        Response::success(['receipt_no' => $receiptNo], 'Payment recorded');
    }

    private static function createCourse(array $body): void {
        foreach (['course_code','course_name','faculty_id','level'] as $r) {
            if (empty($body[$r])) Response::error("$r required");
        }
        $exists = DB::fetchOne('SELECT course_id FROM courses WHERE course_code = ?', [strtoupper($body['course_code'])]);
        if ($exists) Response::error('Course code already exists');
        $id = DB::insert(
            'INSERT INTO courses (faculty_id, level, course_name, course_code, duration_yr) VALUES (?,?,?,?,?)',
            [$body['faculty_id'], strtoupper($body['level']),
             $body['course_name'], strtoupper($body['course_code']),
             $body['duration_yr'] ?? 3]
        );
        Response::success(['course_id' => $id], 'Course created', 201);
    }

    // ── FACULTIES & COURSES ──────────────────────────────────
    private static function getFaculties(): void {
        Response::success(DB::fetchAll('SELECT * FROM faculties ORDER BY faculty_name'));
    }

    private static function getCourses(array $q): void {
        $where = ['1=1']; $params = [];
        if (!empty($q['faculty_id'])) { $where[] = 'faculty_id = ?'; $params[] = $q['faculty_id']; }
        if (!empty($q['level']))      { $where[] = 'level = ?';      $params[] = $q['level']; }
        $whereStr = implode(' AND ', $where);
        Response::success(DB::fetchAll(
            "SELECT c.*, f.faculty_name FROM courses c JOIN faculties f ON c.faculty_id = f.faculty_id
             WHERE $whereStr ORDER BY c.level, f.faculty_name, c.course_name", $params
        ));
    }

    // ── DASHBOARD STATS ──────────────────────────────────────
    private static function dashboard(): void {
        Response::success([
            'total_students'  => DB::fetchOne('SELECT COUNT(*) as n FROM students WHERE is_active=1')['n'],
            'total_teachers'  => DB::fetchOne('SELECT COUNT(*) as n FROM teachers WHERE is_active=1')['n'],
            'total_subjects'  => DB::fetchOne('SELECT COUNT(*) as n FROM subjects WHERE is_active=1')['n'],
            'by_faculty'      => DB::fetchAll(
                'SELECT f.faculty_name, COUNT(s.roll_no) as student_count
                 FROM faculties f LEFT JOIN students s ON f.faculty_id = s.faculty_id
                 GROUP BY f.faculty_id'
            ),
            'by_level'        => DB::fetchAll(
                "SELECT level, COUNT(*) as cnt FROM students WHERE is_active=1 GROUP BY level"
            ),
            'recent_payments' => DB::fetchAll(
                'SELECT p.roll_no, st.full_name, p.amount_paid, p.receipt_no, p.payment_date
                 FROM fee_payments p JOIN students st ON p.roll_no = st.roll_no
                 ORDER BY p.payment_date DESC LIMIT 5'
            ),
        ]);
    }

    // ── AUDIT LOG ────────────────────────────────────────────
    private static function getAuditLog(array $q): void {
        $page = max(1, (int)($q['page'] ?? 1));
        $per  = 50;
        $offset = ($page - 1) * $per;
        $logs = DB::fetchAll(
            "SELECT * FROM audit_log ORDER BY created_at DESC LIMIT $per OFFSET $offset"
        );
        Response::success($logs);
    }
}
