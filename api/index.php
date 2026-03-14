<?php
/**
 * College App API — Entry Point
 * All requests routed through this file via .htaccess
 * cPanel / Apache compatible
 */

define('APP_ROOT', __DIR__);
define('API_VERSION', 'v1');

// ── CORS & Headers ────────────────────────────────────────
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// ── Autoload & Config ─────────────────────────────────────
require_once APP_ROOT . '/config/database.php';
require_once APP_ROOT . '/config/config.php';
require_once APP_ROOT . '/helpers/response.php';
require_once APP_ROOT . '/helpers/jwt.php';
require_once APP_ROOT . '/middleware/auth.php';
require_once APP_ROOT . '/middleware/ratelimit.php';

// ── Router ────────────────────────────────────────────────
$method = $_SERVER['REQUEST_METHOD'];
$uri    = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$uri    = str_replace('/api/' . API_VERSION, '', $uri);
$uri    = rtrim($uri, '/');

// Parse body
$body = [];
$contentType = $_SERVER['CONTENT_TYPE'] ?? '';
if (strpos($contentType, 'application/json') !== false) {
    $body = json_decode(file_get_contents('php://input'), true) ?? [];
} else {
    $body = $_POST;
}

// Route segments
$segments = explode('/', trim($uri, '/'));
$resource = $segments[0] ?? '';
$param1   = $segments[1] ?? '';
$param2   = $segments[2] ?? '';

// ── RATE LIMITING ─────────────────────────────────────────
$ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
if (!RateLimit::check($ip)) {
    Response::error('Too many requests. Please wait.', 429);
}

// ── ROUTE DISPATCH ────────────────────────────────────────
try {
    switch ($resource) {

        // AUTH
        case 'auth':
            require_once APP_ROOT . '/routes/auth.php';
            AuthRoutes::handle($method, $param1, $body);
            break;

        // STUDENTS
        case 'students':
            $auth = Auth::requireStudent();
            require_once APP_ROOT . '/routes/students.php';
            StudentRoutes::handle($method, $param1, $param2, $body, $auth);
            break;

        // SUBJECTS
        case 'subjects':
            require_once APP_ROOT . '/routes/subjects.php';
            SubjectRoutes::handle($method, $param1, $body, $_GET);
            break;

        // FEE
        case 'fee':
            $auth = Auth::requireAny();
            require_once APP_ROOT . '/routes/fee.php';
            FeeRoutes::handle($method, $param1, $body, $auth);
            break;

        // TEACHERS
        case 'teachers':
            $auth = Auth::requireTeacher();
            require_once APP_ROOT . '/routes/teachers.php';
            TeacherRoutes::handle($method, $param1, $param2, $body, $auth);
            break;

        // NOTIFICATIONS
        case 'notifications':
            $auth = Auth::requireTeacher();
            require_once APP_ROOT . '/routes/notifications.php';
            NotificationRoutes::handle($method, $param1, $body, $auth);
            break;

        // ADMIN
        case 'admin':
            $auth = Auth::requireAdmin();
            require_once APP_ROOT . '/routes/admin.php';
            AdminRoutes::handle($method, $param1, $param2, $body, $auth);
            break;

        // UPLOAD (file serving with token check)
        case 'file':
            require_once APP_ROOT . '/routes/files.php';
            FileRoutes::handle($method, $param1, $_GET);
            break;

        default:
            Response::error('Endpoint not found', 404);
    }
} catch (Exception $e) {
    error_log('[CollegeApp] ' . $e->getMessage());
    Response::error('Internal server error', 500);
}
