<?php
class AuthRoutes {
    public static function handle(string $method, string $action, array $body): void {
        switch ($action) {
            case 'student-login':  self::studentLogin($body);  break;
            case 'teacher-login':  self::teacherLogin($body);  break;
            case 'admin-login':    self::adminLogin($body);    break;
            case 'logout':         self::logout();             break;
            case 'refresh':        self::refresh();            break;
            default: Response::error('Auth endpoint not found', 404);
        }
    }

    // ── Student Login (Roll No + Password) ─────────────────
    private static function studentLogin(array $body): void {
        $rollNo   = trim($body['roll_no']   ?? '');
        $password = trim($body['password']  ?? '');
        $deviceFp = trim($body['device_fp'] ?? '');
        $ip       = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';

        if (!$rollNo || !$password) Response::error('Roll No and password are required');

        if (!RateLimit::checkLogin($rollNo)) {
            Response::error('Too many failed attempts. Try again after 30 minutes.', 429);
        }

        $student = DB::fetchOne(
            'SELECT roll_no, full_name, password_hash, is_active, profile_complete,
                    faculty_id, course_id, level
             FROM students WHERE roll_no = ?',
            [$rollNo]
        );

        if (!$student || !password_verify($password, $student['password_hash'])) {
            RateLimit::logAttempt($rollNo, $ip, false);
            Response::error('Invalid Roll No or password', 401);
        }

        if (!$student['is_active']) Response::error('Account is inactive. Contact admin.', 403);

        // Update device fingerprint if provided
        if ($deviceFp) {
            DB::execute('UPDATE students SET device_fp = ? WHERE roll_no = ?', [$deviceFp, $rollNo]);
        }

        RateLimit::logAttempt($rollNo, $ip, true);

        $payload = [
            'role'             => 'student',
            'roll_no'          => $student['roll_no'],
            'full_name'        => $student['full_name'],
            'profile_complete' => (bool)$student['profile_complete'],
        ];

        $token = JWT::generate($payload);
        $decoded = JWT::decode($token);
        JWT::store($decoded);

        // Audit
        DB::execute(
            "INSERT INTO audit_log (actor_type, actor_id, action, ip_address) VALUES ('STUDENT',?,?,?)",
            [$rollNo, 'LOGIN', $ip]
        );

        Response::success([
            'token'            => $token,
            'role'             => 'student',
            'roll_no'          => $student['roll_no'],
            'full_name'        => $student['full_name'],
            'profile_complete' => (bool)$student['profile_complete'],
        ], 'Login successful');
    }

    // ── Teacher Login ───────────────────────────────────────
    private static function teacherLogin(array $body): void {
        $email    = trim($body['email']    ?? '');
        $password = trim($body['password'] ?? '');
        $ip       = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';

        if (!$email || !$password) Response::error('Email and password are required');

        if (!RateLimit::checkLogin($email)) {
            Response::error('Too many failed attempts. Try again later.', 429);
        }

        $teacher = DB::fetchOne(
            'SELECT teacher_id, name, email, password_hash, is_active FROM teachers WHERE email = ?',
            [$email]
        );

        if (!$teacher || !password_verify($password, $teacher['password_hash'])) {
            RateLimit::logAttempt($email, $ip, false);
            Response::error('Invalid email or password', 401);
        }

        if (!$teacher['is_active']) Response::error('Account inactive', 403);

        RateLimit::logAttempt($email, $ip, true);

        $payload = [
            'role'       => 'teacher',
            'teacher_id' => $teacher['teacher_id'],
            'name'       => $teacher['name'],
            'email'      => $teacher['email'],
        ];

        $token   = JWT::generate($payload);
        $decoded = JWT::decode($token);
        JWT::store($decoded);

        Response::success([
            'token'      => $token,
            'role'       => 'teacher',
            'teacher_id' => $teacher['teacher_id'],
            'name'       => $teacher['name'],
        ], 'Login successful');
    }

    // ── Admin Login ─────────────────────────────────────────
    private static function adminLogin(array $body): void {
        $username = trim($body['username'] ?? '');
        $password = trim($body['password'] ?? '');
        $ip       = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';

        if (!$username || !$password) Response::error('Username and password are required');

        $admin = DB::fetchOne(
            'SELECT admin_id, username, full_name, password_hash, is_super FROM admins WHERE username = ?',
            [$username]
        );

        if (!$admin || !password_verify($password, $admin['password_hash'])) {
            Response::error('Invalid credentials', 401);
        }

        $payload = [
            'role'      => 'admin',
            'admin_id'  => $admin['admin_id'],
            'username'  => $admin['username'],
            'full_name' => $admin['full_name'],
            'is_super'  => (bool)$admin['is_super'],
        ];

        $token   = JWT::generate($payload);
        $decoded = JWT::decode($token);
        JWT::store($decoded);

        Response::success([
            'token'     => $token,
            'role'      => 'admin',
            'username'  => $admin['username'],
            'full_name' => $admin['full_name'],
            'is_super'  => (bool)$admin['is_super'],
        ], 'Admin login successful');
    }

    // ── Logout ──────────────────────────────────────────────
    private static function logout(): void {
        $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
        if (preg_match('/Bearer\s+(.+)/i', $header, $m)) {
            JWT::revoke($m[1]);
        }
        Response::success(null, 'Logged out successfully');
    }

    // ── Refresh ─────────────────────────────────────────────
    private static function refresh(): void {
        $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
        if (!preg_match('/Bearer\s+(.+)/i', $header, $m)) {
            Response::error('Token required', 401);
        }
        $old     = JWT::verify($m[1]);
        if (!$old) Response::error('Invalid or expired token', 401);
        JWT::revoke($m[1]);
        unset($old['iat'], $old['exp'], $old['jti']);
        $token   = JWT::generate($old);
        $decoded = JWT::decode($token);
        JWT::store($decoded);
        Response::success(['token' => $token], 'Token refreshed');
    }
}
