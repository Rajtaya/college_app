<?php
class Auth {
    private static function getToken(): ?string {
        $header = $_SERVER['HTTP_AUTHORIZATION']
               ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION']
               ?? '';
        if (preg_match('/Bearer\s+(.+)/i', $header, $m)) return $m[1];
        return $_GET['token'] ?? null;
    }

    public static function requireStudent(): array {
        $token   = self::getToken();
        if (!$token) Response::error('Authentication required', 401);
        $payload = JWT::verify($token);
        if (!$payload || empty($payload['roll_no'])) Response::error('Invalid or expired token', 401);
        $student = DB::fetchOne('SELECT roll_no, full_name, is_active FROM students WHERE roll_no = ?', [$payload['roll_no']]);
        if (!$student || !$student['is_active']) Response::error('Account inactive or not found', 403);
        return $payload;
    }

    public static function requireTeacher(): array {
        $token   = self::getToken();
        if (!$token) Response::error('Authentication required', 401);
        $payload = JWT::verify($token);
        if (!$payload || empty($payload['teacher_id'])) Response::error('Invalid or expired token', 401);
        $teacher = DB::fetchOne('SELECT teacher_id, is_active FROM teachers WHERE teacher_id = ?', [$payload['teacher_id']]);
        if (!$teacher || !$teacher['is_active']) Response::error('Account inactive', 403);
        return $payload;
    }

    public static function requireAdmin(): array {
        $token   = self::getToken();
        if (!$token) Response::error('Authentication required', 401);
        $payload = JWT::verify($token);
        if (!$payload || empty($payload['admin_id'])) Response::error('Admin access required', 403);
        return $payload;
    }

    public static function requireAny(): array {
        $token   = self::getToken();
        if (!$token) Response::error('Authentication required', 401);
        $payload = JWT::verify($token);
        if (!$payload) Response::error('Invalid or expired token', 401);
        return $payload;
    }
}
