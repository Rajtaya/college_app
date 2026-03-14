<?php
/**
 * Application Configuration
 */

// App
define('APP_NAME',    'CRM Jat College App');
define('APP_URL',     'https://crmjatcollege.com');
define('API_URL',     'https://crmjatcollege.com/api/v1');
define('UPLOAD_PATH', APP_ROOT . '/../uploads');
define('UPLOAD_URL',  APP_URL  . '/uploads');

// JWT
define('JWT_SECRET',  getenv('JWT_SECRET') ?: 'CHANGE_THIS_TO_A_RANDOM_64_CHAR_STRING_IN_ENV');
define('JWT_EXPIRY',  86400);       // 1 day (seconds)
define('JWT_REFRESH', 2592000);     // 30 days

// Upload limits
define('MAX_PHOTO_SIZE',  5 * 1024 * 1024);   // 5MB
define('MAX_IMAGE_SIZE',  10 * 1024 * 1024);  // 10MB
define('MAX_EXCEL_SIZE',  20 * 1024 * 1024);  // 20MB
define('ALLOWED_IMG_TYPES', ['image/jpeg', 'image/png', 'image/webp']);
define('ALLOWED_EXCEL_TYPES', [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
]);

// Rate limiting
define('RATE_LIMIT_WINDOW',  60);   // seconds
define('RATE_LIMIT_MAX',     100);  // requests per window per IP
define('LOGIN_ATTEMPT_MAX',  5);    // max failed logins per hour
define('LOGIN_LOCK_MINUTES', 30);   // lockout duration

// Academic
define('CURRENT_ACADEMIC_YEAR', '2024-25');

// Firebase FCM
define('FCM_SERVER_KEY', getenv('FCM_SERVER_KEY') ?: 'YOUR_FIREBASE_SERVER_KEY');
define('FCM_API_URL',    'https://fcm.googleapis.com/fcm/send');

// Email (cPanel SMTP)
define('SMTP_HOST',     'mail.crmjatcollege.com');
define('SMTP_PORT',     587);
define('SMTP_USER',     'noreply@crmjatcollege.com');
define('SMTP_PASS',     getenv('SMTP_PASS') ?: 'YOUR_EMAIL_PASSWORD');
define('SMTP_FROM',     'noreply@crmjatcollege.com');
define('SMTP_FROM_NAME','CRM Jat College');

// Timezone
date_default_timezone_set('Asia/Kolkata');

// Error reporting (set to 0 in production)
error_reporting(E_ALL);
ini_set('display_errors', 0);
ini_set('log_errors', 1);
