const express = require('express');
const router  = express.Router();
const db      = require('../db');
const bcrypt  = require('bcryptjs');
const { verify } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });
  next();
};

router.use((req, res, next) => {
  // Profile routes: any valid JWT (students access own profile only — enforced at route level)
  if (req.path.includes('/profile')) return verify()(req, res, next);
  verify('admin', 'teacher')(req, res, next);
});

// ── GET / — All students ────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT s.student_id, s.roll_no,
              CONCAT(s.first_name, ' ', s.last_name) AS name,
              s.first_name, s.last_name,
              s.email, s.phone, s.abc_id,
              s.semester, s.study_year,
              s.level_id, s.programme_id, s.faculty_id,
              s.enrollment_submitted, s.academic_year_id,
              l.level_name, p.programme_name, f.faculty_name,
              a.year_label AS academic_year
       FROM students s
       LEFT JOIN levels        l ON s.level_id        = l.level_id
       LEFT JOIN programmes    p ON s.programme_id    = p.programme_id
       LEFT JOIN faculties     f ON s.faculty_id      = f.faculty_id
       LEFT JOIN academic_years a ON s.academic_year_id = a.academic_year_id
       ORDER BY s.roll_no`
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /:id — Single student by ID ────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT s.student_id, s.roll_no,
              CONCAT(s.first_name, ' ', s.last_name) AS name,
              s.first_name, s.last_name,
              s.email, s.phone, s.abc_id,
              s.semester, s.study_year,
              s.level_id, s.programme_id, s.faculty_id,
              s.enrollment_submitted, s.academic_year_id,
              l.level_name, p.programme_name, f.faculty_name,
              a.year_label AS academic_year
       FROM students s
       LEFT JOIN levels        l ON s.level_id        = l.level_id
       LEFT JOIN programmes    p ON s.programme_id    = p.programme_id
       LEFT JOIN faculties     f ON s.faculty_id      = f.faculty_id
       LEFT JOIN academic_years a ON s.academic_year_id = a.academic_year_id
       WHERE s.student_id = ?`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Student not found' });
    const { password, ...student } = rows[0];
    res.json(student);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /:id/profile — Full profile using view ──────────────────────────────
router.get('/:id/profile', async (req, res) => {
  if (req.user.role === 'student' && req.user.id !== parseInt(req.params.id)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    const [rows] = await db.query(
      'SELECT * FROM vw_student_profile WHERE student_id = ?',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Student not found' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST / — Add a student (admin only) ────────────────────────────────────
router.post('/',
  verify('admin'),
  body('roll_no').trim().notEmpty().withMessage('Roll number is required'),
  body('first_name').trim().notEmpty().withMessage('First name is required'),
  body('last_name').trim().notEmpty().withMessage('Last name is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('email').optional({ checkFalsy: true }).isEmail().withMessage('Invalid email format').normalizeEmail(),
  body('semester').optional().isInt({ min: 1, max: 8 }).withMessage('Semester must be between 1 and 8'),
  validate,
  async (req, res) => {
  const {
    roll_no, first_name, last_name, email, phone,
    semester, study_year, password,
    level_id, programme_id, faculty_id, academic_year_id, abc_id
  } = req.body;
  try {
    const hashed   = await bcrypt.hash(password, 10);
    const emailVal = email && email.trim() ? email.trim() : null;
    const [result] = await db.query(
      `INSERT INTO students
         (roll_no, first_name, last_name, email, phone,
          semester, study_year, password,
          level_id, programme_id, faculty_id, academic_year_id, abc_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [roll_no, first_name, last_name, emailVal, phone || null,
       semester, study_year || 1, hashed,
       level_id || null, programme_id || null, faculty_id || null,
       academic_year_id || null, abc_id || null]
    );
    res.json({ message: 'Student added', student_id: result.insertId });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── PUT /:id/profile — Student updates their own profile / password ─────────
router.put('/:id/profile',
  body('email').optional({ checkFalsy: true }).isEmail().withMessage('Invalid email format').normalizeEmail(),
  body('new_password').optional({ checkFalsy: true }).isLength({ min: 6 }).withMessage('New password must be at least 6 characters'),
  validate,
  async (req, res) => {
  if (req.user.role === 'student' && req.user.id !== parseInt(req.params.id)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { name, first_name, last_name, email, phone, current_password, new_password } = req.body;
  try {
    const [rows] = await db.query(
      'SELECT * FROM students WHERE student_id = ?', [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Student not found' });
    const student = rows[0];

    // Resolve first/last name — support both split fields and legacy single name
    let fName = first_name || (name ? name.split(' ')[0] : student.first_name);
    let lName = last_name  || (name ? name.split(' ').slice(1).join(' ') : student.last_name);

    if (new_password) {
      // Password change — verify current password first
      const valid = await bcrypt.compare(current_password || '', student.password);
      if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });
      const hashed = await bcrypt.hash(new_password, 10);
      await db.query(
        `UPDATE students
         SET first_name=?, last_name=?, email=?, phone=?, password=?
         WHERE student_id=?`,
        [fName, lName, email || student.email, phone || student.phone, hashed, req.params.id]
      );
    } else {
      await db.query(
        `UPDATE students
         SET first_name=?, last_name=?, email=?, phone=?
         WHERE student_id=?`,
        [fName, lName, email || student.email, phone || student.phone, req.params.id]
      );
    }
    // Return fresh student data so frontend always reflects actual DB state
    const [updated] = await db.query(
      `SELECT s.*, l.level_name, p.programme_name, f.faculty_name
       FROM students s
       LEFT JOIN levels l ON s.level_id = l.level_id
       LEFT JOIN programmes p ON s.programme_id = p.programme_id
       LEFT JOIN faculties f ON s.faculty_id = f.faculty_id
       WHERE s.student_id = ?`,
      [req.params.id]
    );
    const { password: _p, ...updatedStudent } = updated[0];
    updatedStudent.name = `${updatedStudent.first_name} ${updatedStudent.last_name}`;
    res.json({ message: 'Profile updated successfully', student: updatedStudent });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
