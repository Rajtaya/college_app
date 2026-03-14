<?php
/**
 * Database Configuration
 * Update credentials to match your cPanel MySQL details
 */

define('DB_HOST',     getenv('DB_HOST')     ?: 'localhost');
define('DB_NAME',     getenv('DB_NAME')     ?: 'crmjatco_college');
define('DB_USER',     getenv('DB_USER')     ?: 'crmjatco_coluser');
define('DB_PASS',     getenv('DB_PASS')     ?: 'YOUR_DB_PASSWORD');
define('DB_CHARSET',  'utf8mb4');

class DB {
    private static ?PDO $instance = null;

    public static function get(): PDO {
        if (self::$instance === null) {
            $dsn = 'mysql:host=' . DB_HOST
                 . ';dbname=' . DB_NAME
                 . ';charset=' . DB_CHARSET;
            try {
                self::$instance = new PDO($dsn, DB_USER, DB_PASS, [
                    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_EMULATE_PREPARES   => false,
                ]);
            } catch (PDOException $e) {
                error_log('[DB] Connection failed: ' . $e->getMessage());
                http_response_code(503);
                echo json_encode(['success' => false, 'message' => 'Database unavailable']);
                exit();
            }
        }
        return self::$instance;
    }

    public static function query(string $sql, array $params = []): \PDOStatement {
        $stmt = self::get()->prepare($sql);
        $stmt->execute($params);
        return $stmt;
    }

    public static function fetchOne(string $sql, array $params = []): ?array {
        $row = self::query($sql, $params)->fetch();
        return $row ?: null;
    }

    public static function fetchAll(string $sql, array $params = []): array {
        return self::query($sql, $params)->fetchAll();
    }

    public static function insert(string $sql, array $params = []): int {
        self::query($sql, $params);
        return (int) self::get()->lastInsertId();
    }

    public static function execute(string $sql, array $params = []): int {
        return self::query($sql, $params)->rowCount();
    }
}
