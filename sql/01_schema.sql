-- ============================================================
-- COLLEGE APP — COMPLETE MySQL SCHEMA
-- Import via phpMyAdmin or: mysql -u user -p db < 01_schema.sql
-- ============================================================

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
SET time_zone = "+00:00";

-- ── DATABASE ──────────────────────────────────────────────
CREATE DATABASE IF NOT EXISTS `college_app`
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;
USE `college_app`;

-- ── FACULTIES ─────────────────────────────────────────────
CREATE TABLE `faculties` (
  `faculty_id`   INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `faculty_name` VARCHAR(100) NOT NULL,
  `faculty_code` VARCHAR(20)  NOT NULL UNIQUE,
  `created_at`   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

INSERT INTO `faculties` (`faculty_name`, `faculty_code`) VALUES
  ('Arts',     'ARTS'),
  ('Science',  'SCI'),
  ('Commerce', 'COM');

-- ── COURSES ───────────────────────────────────────────────
CREATE TABLE `courses` (
  `course_id`   INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `faculty_id`  INT UNSIGNED NOT NULL,
  `level`       ENUM('UG','PG') NOT NULL,
  `course_name` VARCHAR(150) NOT NULL,
  `course_code` VARCHAR(30)  NOT NULL UNIQUE,
  `duration_yr` TINYINT UNSIGNED DEFAULT 3,
  `created_at`  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`faculty_id`) REFERENCES `faculties`(`faculty_id`)
) ENGINE=InnoDB;

INSERT INTO `courses` (`faculty_id`, `level`, `course_name`, `course_code`, `duration_yr`) VALUES
-- UG Arts
(1, 'UG', 'Bachelor of Arts',                        'BA',          3),
-- UG Science
(2, 'UG', 'B.Sc Physical Science',                   'BSC_PHY',     3),
(2, 'UG', 'B.Sc Life Science',                       'BSC_LIFE',    3),
(2, 'UG', 'B.Sc Computer Science',                   'BSC_CS',      3),
(2, 'UG', 'Bachelor of Computer Applications',       'BCA',         3),
(2, 'UG', 'BCA (Artificial Intelligence)',           'BCA_AI',      3),
(2, 'UG', 'B.Sc Sports Science',                     'BSC_SPORTS',  3),
-- UG Commerce
(3, 'UG', 'Bachelor of Commerce',                    'BCOM',        3),
(3, 'UG', 'B.Com (Self Finance)',                    'BCOM_SF',     3),
(3, 'UG', 'Bachelor of Business Administration',     'BBA',         3),
-- PG Arts
(1, 'PG', 'MA Hindi',                                'MA_HINDI',    2),
(1, 'PG', 'MA English',                              'MA_ENG',      2),
(1, 'PG', 'MA Yoga',                                 'MA_YOGA',     2),
-- PG Science
(2, 'PG', 'M.Sc Mathematics',                        'MSC_MATH',    2),
(2, 'PG', 'M.Sc Zoology',                            'MSC_ZOO',     2),
-- PG Commerce
(3, 'PG', 'Master of Commerce',                      'MCOM',        2);

-- ── STUDENTS ──────────────────────────────────────────────
CREATE TABLE `students` (
  `roll_no`       VARCHAR(20)  NOT NULL PRIMARY KEY,
  `full_name`     VARCHAR(150) NOT NULL,
  `email`         VARCHAR(150),
  `mobile`        VARCHAR(15),
  `dob`           DATE,
  `gender`        ENUM('Male','Female','Other'),
  `address`       TEXT,
  `father_name`   VARCHAR(150),
  `mother_name`   VARCHAR(150),
  `tenth_school`  VARCHAR(200),
  `twelfth_school`VARCHAR(200),
  `twelfth_subjects` TEXT COMMENT 'JSON array of 10+2 subject codes for MDC validation',
  `faculty_id`    INT UNSIGNED,
  `course_id`     INT UNSIGNED,
  `level`         ENUM('UG','PG'),
  `admission_yr`  YEAR,
  `photo_path`    VARCHAR(255),
  `password_hash` VARCHAR(255) NOT NULL,
  `device_fp`     VARCHAR(255),
  `profile_complete` TINYINT(1) DEFAULT 0,
  `is_active`     TINYINT(1) DEFAULT 1,
  `created_at`    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`faculty_id`) REFERENCES `faculties`(`faculty_id`),
  FOREIGN KEY (`course_id`)  REFERENCES `courses`(`course_id`)
) ENGINE=InnoDB;

-- ── SUBJECTS ──────────────────────────────────────────────
CREATE TABLE `subjects` (
  `subject_id`   INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `subject_code` VARCHAR(30)  NOT NULL UNIQUE,
  `subject_name` VARCHAR(200) NOT NULL,
  `faculty_id`   INT UNSIGNED COMMENT 'NULL = common pool (VAC/SEC/MDC/AEC)',
  `level`        ENUM('UG','PG','BOTH') DEFAULT 'BOTH',
  `pool_type`    ENUM('MAJOR','MINOR','VAC','SEC','MDC','AEC') NOT NULL,
  `has_practical`TINYINT(1) DEFAULT 0,
  `credits`      TINYINT UNSIGNED DEFAULT 4,
  `is_active`    TINYINT(1) DEFAULT 1,
  `created_at`   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`faculty_id`) REFERENCES `faculties`(`faculty_id`)
) ENGINE=InnoDB;

-- ── STUDENT SUBJECT SELECTIONS ────────────────────────────
CREATE TABLE `student_subjects` (
  `id`           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `roll_no`      VARCHAR(20)  NOT NULL,
  `subject_id`   INT UNSIGNED NOT NULL,
  `pool_type`    ENUM('MAJOR','MINOR','VAC','SEC','MDC','AEC') NOT NULL,
  `academic_yr`  VARCHAR(10)  NOT NULL DEFAULT '2024-25',
  `selected_at`  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_student_subject_yr` (`roll_no`, `subject_id`, `academic_yr`),
  FOREIGN KEY (`roll_no`)     REFERENCES `students`(`roll_no`),
  FOREIGN KEY (`subject_id`)  REFERENCES `subjects`(`subject_id`)
) ENGINE=InnoDB;

-- ── FEE STRUCTURE ─────────────────────────────────────────
CREATE TABLE `fee_structure` (
  `fee_id`       INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `course_id`    INT UNSIGNED,
  `subject_id`   INT UNSIGNED COMMENT 'NULL = class-level fee',
  `fee_type`     ENUM('CLASS','SUBJECT','PRACTICAL') NOT NULL,
  `amount`       DECIMAL(10,2) NOT NULL,
  `academic_yr`  VARCHAR(10)  NOT NULL DEFAULT '2024-25',
  `description`  VARCHAR(255),
  `created_at`   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`course_id`)  REFERENCES `courses`(`course_id`),
  FOREIGN KEY (`subject_id`) REFERENCES `subjects`(`subject_id`)
) ENGINE=InnoDB;

-- ── FEE PAYMENTS ──────────────────────────────────────────
CREATE TABLE `fee_payments` (
  `payment_id`   INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `roll_no`      VARCHAR(20)  NOT NULL,
  `academic_yr`  VARCHAR(10)  NOT NULL,
  `amount_paid`  DECIMAL(10,2) NOT NULL,
  `fee_breakdown`JSON COMMENT 'JSON: {class_fee, subject_fees[], practical_fees[]}',
  `payment_mode` ENUM('CASH','ONLINE','DD','CHEQUE') DEFAULT 'CASH',
  `receipt_no`   VARCHAR(50) UNIQUE,
  `receipt_path` VARCHAR(255),
  `payment_date` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `recorded_by`  INT UNSIGNED COMMENT 'admin_id',
  FOREIGN KEY (`roll_no`) REFERENCES `students`(`roll_no`)
) ENGINE=InnoDB;

-- ── TEACHERS ──────────────────────────────────────────────
CREATE TABLE `teachers` (
  `teacher_id`   INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `name`         VARCHAR(150) NOT NULL,
  `email`        VARCHAR(150) NOT NULL UNIQUE,
  `mobile`       VARCHAR(15),
  `designation`  VARCHAR(100),
  `department`   VARCHAR(100),
  `password_hash`VARCHAR(255) NOT NULL,
  `photo_path`   VARCHAR(255),
  `fcm_token`    VARCHAR(255),
  `is_active`    TINYINT(1) DEFAULT 1,
  `created_at`   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  -- NOTE: No faculty_id — teachers are NOT faculty-bound
) ENGINE=InnoDB;

-- ── TEACHER ↔ SUBJECT ASSIGNMENTS (Many-to-Many) ──────────
CREATE TABLE `teacher_subjects` (
  `id`           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `teacher_id`   INT UNSIGNED NOT NULL,
  `subject_id`   INT UNSIGNED NOT NULL,
  `faculty_id`   INT UNSIGNED NOT NULL,
  `course_id`    INT UNSIGNED NOT NULL,
  `level`        ENUM('UG','PG') NOT NULL,
  `academic_yr`  VARCHAR(10) DEFAULT '2024-25',
  `assigned_at`  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_teacher_subject_yr` (`teacher_id`,`subject_id`,`course_id`,`academic_yr`),
  FOREIGN KEY (`teacher_id`) REFERENCES `teachers`(`teacher_id`),
  FOREIGN KEY (`subject_id`) REFERENCES `subjects`(`subject_id`),
  FOREIGN KEY (`faculty_id`) REFERENCES `faculties`(`faculty_id`),
  FOREIGN KEY (`course_id`)  REFERENCES `courses`(`course_id`)
) ENGINE=InnoDB;

-- ── STUDENT FCM TOKENS ────────────────────────────────────
CREATE TABLE `student_fcm_tokens` (
  `id`        INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `roll_no`   VARCHAR(20) NOT NULL,
  `fcm_token` VARCHAR(255) NOT NULL,
  `device_fp` VARCHAR(255),
  `updated_at`TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_student_fcm` (`roll_no`),
  FOREIGN KEY (`roll_no`) REFERENCES `students`(`roll_no`)
) ENGINE=InnoDB;

-- ── NOTIFICATIONS ─────────────────────────────────────────
CREATE TABLE `notifications` (
  `notif_id`     INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `teacher_id`   INT UNSIGNED NOT NULL,
  `title`        VARCHAR(255) NOT NULL,
  `message`      TEXT NOT NULL,
  `image_path`   VARCHAR(255),
  `scope_type`   ENUM('SUBJECT','COURSE','FACULTY','LEVEL','ALL') NOT NULL,
  `scope_value`  VARCHAR(50) COMMENT 'subject_id / course_id / faculty_id / UG|PG / ALL',
  `content_type` ENUM('TEXT','IMAGE') DEFAULT 'TEXT',
  `sent_count`   INT UNSIGNED DEFAULT 0,
  `sent_at`      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`teacher_id`) REFERENCES `teachers`(`teacher_id`)
) ENGINE=InnoDB;

-- ── ADMINS ────────────────────────────────────────────────
CREATE TABLE `admins` (
  `admin_id`     INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `username`     VARCHAR(100) NOT NULL UNIQUE,
  `email`        VARCHAR(150) NOT NULL,
  `password_hash`VARCHAR(255) NOT NULL,
  `full_name`    VARCHAR(150),
  `is_super`     TINYINT(1) DEFAULT 0,
  `created_at`   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Default admin (password: Admin@123 — change after first login)
INSERT INTO `admins` (`username`,`email`,`password_hash`,`full_name`,`is_super`) VALUES
('admin','admin@crmjatcollege.com','$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
 'College Administrator', 1);

-- ── AUTH TOKENS (JWT blacklist + rate limiting) ───────────
CREATE TABLE `auth_tokens` (
  `id`         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `jti`        VARCHAR(100) NOT NULL UNIQUE COMMENT 'JWT ID for blacklisting',
  `roll_no`    VARCHAR(20),
  `teacher_id` INT UNSIGNED,
  `admin_id`   INT UNSIGNED,
  `expires_at` TIMESTAMP NOT NULL,
  `revoked`    TINYINT(1) DEFAULT 0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_jti` (`jti`),
  INDEX `idx_expires` (`expires_at`)
) ENGINE=InnoDB;

CREATE TABLE `login_attempts` (
  `id`         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `identifier` VARCHAR(50) NOT NULL COMMENT 'roll_no or username',
  `ip_address` VARCHAR(45) NOT NULL,
  `attempted_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `success`    TINYINT(1) DEFAULT 0,
  INDEX `idx_identifier` (`identifier`),
  INDEX `idx_ip` (`ip_address`)
) ENGINE=InnoDB;

-- ── AUDIT LOG ─────────────────────────────────────────────
CREATE TABLE `audit_log` (
  `log_id`     INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `actor_type` ENUM('STUDENT','TEACHER','ADMIN') NOT NULL,
  `actor_id`   VARCHAR(50) NOT NULL,
  `action`     VARCHAR(100) NOT NULL,
  `details`    JSON,
  `ip_address` VARCHAR(45),
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_actor` (`actor_type`, `actor_id`),
  INDEX `idx_created` (`created_at`)
) ENGINE=InnoDB;

-- ── COMPUTER SCIENCE MAJOR SUBJECTS (Arts & Science) ──────
-- Science Faculty (faculty_id = 2) — Computer Science MAJOR subjects
INSERT INTO `subjects` (`subject_code`,`subject_name`,`faculty_id`,`level`,`pool_type`,`has_practical`,`credits`) VALUES
('CS_PROG1',    'Programming Fundamentals (C/C++)',          2, 'UG', 'MAJOR', 1, 4),
('CS_PROG2',    'Object-Oriented Programming (Java)',        2, 'UG', 'MAJOR', 1, 4),
('CS_DS',       'Data Structures & Algorithms',              2, 'UG', 'MAJOR', 1, 4),
('CS_DBMS',     'Database Management Systems',               2, 'UG', 'MAJOR', 1, 4),
('CS_OS',       'Operating Systems',                         2, 'UG', 'MAJOR', 1, 4),
('CS_NET',      'Computer Networks',                         2, 'UG', 'MAJOR', 0, 4),
('CS_WEB',      'Web Technologies (HTML/CSS/JS/PHP)',        2, 'UG', 'MAJOR', 1, 4),
('CS_AI',       'Artificial Intelligence & Machine Learning',2, 'UG', 'MAJOR', 0, 4),
('CS_SE',       'Software Engineering',                      2, 'UG', 'MAJOR', 0, 4),
('CS_CYBER',    'Cyber Security & Ethical Hacking',          2, 'UG', 'MAJOR', 1, 4),
('CS_CLOUD',    'Cloud Computing & DevOps',                  2, 'UG', 'MAJOR', 1, 4),
('MSC_CS_ADV',  'Advanced Algorithms & Complexity',          2, 'PG', 'MAJOR', 0, 4),
('MSC_CS_ML',   'Machine Learning & Deep Learning',         2, 'PG', 'MAJOR', 1, 4),
('MSC_CS_BIG',  'Big Data Analytics & Hadoop',              2, 'PG', 'MAJOR', 1, 4),

-- Arts Faculty (faculty_id = 1) — Computer Science MAJOR subjects
('ARTS_CS_IT',  'Introduction to Information Technology',    1, 'UG', 'MAJOR', 1, 4),
('ARTS_CS_PROG','Programming with Python',                   1, 'UG', 'MAJOR', 1, 4),
('ARTS_CS_DCA', 'Digital Communication & Applications',     1, 'UG', 'MAJOR', 1, 4),
('ARTS_CS_WEB', 'Web Design & Development',                  1, 'UG', 'MAJOR', 1, 4),
('ARTS_CS_DATA','Data Analytics for Humanities',             1, 'UG', 'MAJOR', 0, 4),
('ARTS_CS_ERP', 'ERP Systems & Office Automation',          1, 'UG', 'MAJOR', 1, 4),
('MA_CS_DH',    'Digital Humanities & Computational Methods',1, 'PG', 'MAJOR', 0, 4),
('MA_CS_AI',    'AI in Arts, Media & Communication',        1, 'PG', 'MAJOR', 0, 4);
