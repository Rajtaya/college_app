# CRM Jat College App — Deployment Guide
# cPanel / Shared Hosting (PHP + MySQL, No Node.js)

## ═══════════════════════════════════════════════
## STEP 1: DATABASE SETUP
## ═══════════════════════════════════════════════

1. Login to cPanel → MySQL Databases
2. Create database:     crmjatco_college
3. Create DB user:      crmjatco_coluser  (strong password)
4. Add user to DB:      Grant ALL privileges
5. Open phpMyAdmin → select the database
6. Click "Import" tab → upload sql/01_schema.sql
7. All tables + seed data will be created

## ═══════════════════════════════════════════════
## STEP 2: UPLOAD FILES
## ═══════════════════════════════════════════════

Upload via cPanel File Manager or FTP (FileZilla):

  public_html/
  ├── .htaccess                ← root .htaccess
  ├── api/                     ← entire api/ folder
  │   ├── index.php
  │   ├── config/
  │   ├── routes/
  │   ├── middleware/
  │   ├── helpers/
  │   └── cron/
  ├── admin/
  │   └── index.html           ← Admin panel
  ├── teacher/
  │   └── index.html           ← Teacher portal
  ├── student/
  │   ├── index.html           ← Student PWA
  │   └── manifest.json
  └── uploads/                 ← Create this folder
      ├── photos/
      ├── receipts/
      ├── notif/
      └── excel/

## ═══════════════════════════════════════════════
## STEP 3: SET PERMISSIONS
## ═══════════════════════════════════════════════

Via File Manager, set permissions:
  uploads/          → 755
  uploads/photos/   → 755
  uploads/receipts/ → 755
  uploads/notif/    → 755
  uploads/excel/    → 755
  api/config/       → 750 (restrict access)

## ═══════════════════════════════════════════════
## STEP 4: CONFIGURE api/config/database.php
## ═══════════════════════════════════════════════

Edit the file and update:
  DB_NAME  = 'crmjatco_college'      ← your DB name
  DB_USER  = 'crmjatco_coluser'      ← your DB username
  DB_PASS  = 'your_db_password'      ← your DB password
  DB_HOST  = 'localhost'             ← usually localhost

## ═══════════════════════════════════════════════
## STEP 5: CONFIGURE api/config/config.php
## ═══════════════════════════════════════════════

Update these values:
  JWT_SECRET   → Change to a random 64-char string
                 Generate: openssl rand -hex 32
  FCM_SERVER_KEY → Your Firebase Server Key (for push notifications)
  SMTP settings → cPanel email credentials

## ═══════════════════════════════════════════════
## STEP 6: ADD HTACCESS FOR UPLOADS FOLDER
## ═══════════════════════════════════════════════

Create public_html/uploads/.htaccess with:

  deny from all

This blocks direct URL access to uploaded files.
Files are served via signed API endpoints only.

## ═══════════════════════════════════════════════
## STEP 7: SET UP CRON JOB
## ═══════════════════════════════════════════════

cPanel → Cron Jobs → Add New Cron Job:
  Minute:  *
  Hour:    *
  Day:     *
  Month:   *
  Weekday: *
  Command: php /home/crmjatco/public_html/api/cron/run.php >> /home/crmjatco/logs/cron.log 2>&1

Note: Create the logs/ directory first.
This runs every minute to process Excel imports and clean tokens.

## ═══════════════════════════════════════════════
## STEP 8: FIREBASE SETUP (Push Notifications)
## ═══════════════════════════════════════════════

1. Go to https://console.firebase.google.com
2. Create project "crmjat-college"
3. Add Android app (package: com.crmjat.college)
4. Download google-services.json (for React Native later)
5. Project Settings → Cloud Messaging → copy Server Key
6. Paste into config.php FCM_SERVER_KEY

## ═══════════════════════════════════════════════
## STEP 9: FIRST LOGIN
## ═══════════════════════════════════════════════

Admin Panel:    https://crmjatcollege.com/admin/
  Username:     admin
  Password:     password   ← CHANGE IMMEDIATELY

Teacher Portal: https://crmjatcollege.com/teacher/
  (Create teacher accounts via Admin Panel first)

Student App:    https://crmjatcollege.com/student/
  (Create student accounts via Admin Panel first)
  Default password = Roll Number

## ═══════════════════════════════════════════════
## STEP 10: ADMIN FIRST-TIME SETUP CHECKLIST
## ═══════════════════════════════════════════════

  □ Change admin password immediately
  □ Import subjects from Excel (Admin → Excel Import)
  □ Import fee structure from Excel
  □ Create teacher accounts
  □ Assign teachers to subjects (Admin → Teachers → Assign Subject)
  □ Add student Roll Numbers (Admin → Students → Add Student)
  □ Share Student App URL with students

## ═══════════════════════════════════════════════
## EXCEL FILE FORMAT
## ═══════════════════════════════════════════════

SUBJECTS Excel (subjects_import.xlsx):
  Row 1 (headers): subject_code | subject_name | faculty_code | level | pool_type | has_practical | credits
  Example row:     PHY101 | Physics I | SCI | UG | MAJOR | 1 | 4
  faculty_code:    ARTS / SCI / COM  (blank = common pool)
  pool_type:       MAJOR / MINOR / VAC / SEC / MDC / AEC
  level:           UG / PG / BOTH

FEE Excel (fee_import.xlsx):
  Row 1 (headers): course_code | subject_code | fee_type | amount | description
  Example row:     BSC_PHY |  | CLASS | 15000 | Annual class fee
  fee_type:        CLASS / SUBJECT / PRACTICAL

## ═══════════════════════════════════════════════
## API ENDPOINTS REFERENCE
## ═══════════════════════════════════════════════

Base URL: https://crmjatcollege.com/api/v1

AUTH:
  POST /auth/student-login     { roll_no, password }
  POST /auth/teacher-login     { email, password }
  POST /auth/admin-login       { username, password }
  POST /auth/logout
  POST /auth/refresh

STUDENTS (requires student JWT):
  GET  /students/profile
  PUT  /students/profile       { full_name, mobile, ... }
  GET  /students/subjects
  POST /students/subjects      { subjects: [{subject_id}] }
  GET  /students/fee
  GET  /students/notifications
  POST /students/fcm-token     { fcm_token }

SUBJECTS (public):
  GET  /subjects?faculty_id=&level=&pool_type=

TEACHERS (requires teacher JWT):
  GET  /teachers/profile
  GET  /teachers/subjects
  GET  /teachers/students?subject_id=&course_id=

NOTIFICATIONS (requires teacher JWT):
  POST /notifications/send     (multipart: title, message, scope_type, scope_value, image?)
  GET  /notifications/history

ADMIN (requires admin JWT):
  GET  /admin/dashboard
  GET  /admin/students?search=&faculty_id=&level=&page=
  POST /admin/students         { roll_no, full_name, mobile, ... }
  PUT  /admin/students/:rollNo
  GET  /admin/teachers
  POST /admin/teachers         { name, email, password, ... }
  POST /admin/teacher-subject  { teacher_id, subject_id, faculty_id, course_id, level }
  POST /admin/subjects-import  (multipart: excel file)
  POST /admin/subjects         { subject_code, subject_name, pool_type, ... }
  GET  /admin/fee-structure
  POST /admin/fee-structure    { fee_type, amount, course_id?, ... }
  POST /admin/fee-payment      { roll_no, amount_paid, payment_mode }
  GET  /admin/faculties
  GET  /admin/courses?faculty_id=&level=
  GET  /admin/audit

## ═══════════════════════════════════════════════
## TROUBLESHOOTING
## ═══════════════════════════════════════════════

"404 Not Found" on API calls:
  → Check .htaccess is uploaded and mod_rewrite is enabled
  → In cPanel, Softaculous or MultiPHP may need AllowOverride All

"500 Internal Server Error":
  → Check cPanel Error Logs (Metrics → Errors)
  → Check api/config/database.php credentials

"CORS error" in browser:
  → The API returns CORS headers already
  → Check the request URL matches API_URL in config.php

Database connection fails:
  → Verify DB_NAME = crmjatco_SOMETHING (cPanel prefixes username)
  → Check DB_USER matches exactly what you created in MySQL Databases

Push notifications not working:
  → Verify FCM_SERVER_KEY in config.php
  → Students must open app and grant notification permission
  → FCM token is sent to server via POST /students/fcm-token
