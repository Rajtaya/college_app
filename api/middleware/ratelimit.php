<?php
class RateLimit {
    public static function check(string $ip): bool {
        $window = date('Y-m-d H:i:s', time() - RATE_LIMIT_WINDOW);
        $count  = DB::fetchOne(
            'SELECT COUNT(*) as cnt FROM login_attempts WHERE ip_address = ? AND attempted_at > ?',
            [$ip, $window]
        );
        return ($count['cnt'] ?? 0) < RATE_LIMIT_MAX;
    }

    public static function checkLogin(string $identifier): bool {
        $window = date('Y-m-d H:i:s', time() - 3600);
        $count  = DB::fetchOne(
            'SELECT COUNT(*) as cnt FROM login_attempts
             WHERE identifier = ? AND attempted_at > ? AND success = 0',
            [$identifier, $window]
        );
        return ($count['cnt'] ?? 0) < LOGIN_ATTEMPT_MAX;
    }

    public static function logAttempt(string $identifier, string $ip, bool $success): void {
        DB::execute(
            'INSERT INTO login_attempts (identifier, ip_address, success) VALUES (?,?,?)',
            [$identifier, $ip, $success ? 1 : 0]
        );
    }

    public static function cleanOld(): void {
        DB::execute("DELETE FROM login_attempts WHERE attempted_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)");
    }
}
