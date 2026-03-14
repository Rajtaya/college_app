<?php
/**
 * JWT Helper — Pure PHP, no external library needed
 * HS256 signing, compatible with standard JWT clients
 */

class JWT {

    public static function generate(array $payload, int $expiry = JWT_EXPIRY): string {
        $header = self::base64url(json_encode(['typ' => 'JWT', 'alg' => 'HS256']));

        $payload['iat'] = time();
        $payload['exp'] = time() + $expiry;
        $payload['jti'] = bin2hex(random_bytes(16)); // unique token ID

        $body      = self::base64url(json_encode($payload));
        $signature = self::base64url(
            hash_hmac('sha256', "$header.$body", JWT_SECRET, true)
        );

        return "$header.$body.$signature";
    }

    public static function verify(string $token): ?array {
        $parts = explode('.', $token);
        if (count($parts) !== 3) return null;

        [$header, $body, $sig] = $parts;

        $expected = self::base64url(
            hash_hmac('sha256', "$header.$body", JWT_SECRET, true)
        );
        if (!hash_equals($expected, $sig)) return null;

        $payload = json_decode(self::base64url_decode($body), true);
        if (!$payload)             return null;
        if ($payload['exp'] < time()) return null; // expired

        // Check blacklist
        if (isset($payload['jti'])) {
            $row = DB::fetchOne(
                'SELECT revoked FROM auth_tokens WHERE jti = ?',
                [$payload['jti']]
            );
            if ($row && $row['revoked']) return null;
        }

        return $payload;
    }

    public static function revoke(string $token): void {
        $payload = self::decode($token);
        if (!$payload || !isset($payload['jti'])) return;

        DB::execute(
            'UPDATE auth_tokens SET revoked = 1 WHERE jti = ?',
            [$payload['jti']]
        );
    }

    public static function decode(string $token): ?array {
        $parts = explode('.', $token);
        if (count($parts) !== 3) return null;
        $payload = json_decode(self::base64url_decode($parts[1]), true);
        return $payload ?: null;
    }

    public static function store(array $payload): void {
        if (!isset($payload['jti'])) return;
        DB::execute(
            'INSERT IGNORE INTO auth_tokens (jti, roll_no, teacher_id, admin_id, expires_at)
             VALUES (?, ?, ?, ?, FROM_UNIXTIME(?))',
            [
                $payload['jti'],
                $payload['roll_no']   ?? null,
                $payload['teacher_id'] ?? null,
                $payload['admin_id']  ?? null,
                $payload['exp'],
            ]
        );
    }

    private static function base64url(string $data): string {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }

    private static function base64url_decode(string $data): string {
        return base64_decode(strtr($data, '-_', '+/') . str_repeat('=', (4 - strlen($data) % 4) % 4));
    }
}
