const express = require('express');
const router  = express.Router();
const db      = require('../db');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
require('dotenv').config();

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });
  next();
};

router.post('/student/login',
  body('roll_no').trim().notEmpty().withMessage('Roll number is required'),
  body('password').notEmpty().withMessage('Password is required'),
  validate,
  async (req, res) => {
  const { roll_no, password } = req.body;
  try {
    const [rows] = await db.query(
      `SELECT s.*, l.level_name, p.programme_name, f.faculty_name
       FROM students s
       LEFT JOIN levels l ON s.level_id = l.level_id
       LEFT JOIN programmes p ON s.programme_id = p.programme_id
       LEFT JOIN faculties f ON s.faculty_id = f.faculty_id
       WHERE s.roll_no = ?`,
      [roll_no]
    );
    if (!rows.length) return res.status(401).json({ error: 'Invalid credentials' });
    const valid = await bcrypt.compare(password, rows[0].password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign(
      { id: rows[0].student_id, role: 'student' },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );
    const { password: _, ...studentData } = rows[0];
    // Add combined name field for frontend compatibility
    studentData.name = `${studentData.first_name} ${studentData.last_name}`;
    // Add course field for frontend compatibility (uses programme_name)
    studentData.course = studentData.programme_name;
    // Add year field for frontend compatibility (uses study_year)
    studentData.year = studentData.study_year;
    res.json({ token, student: studentData });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/teacher/login',
  body('email').trim().isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required'),
  validate,
  async (req, res) => {
  const { email, password } = req.body;
  try {
    const [rows] = await db.query(
      `SELECT t.*, 
              CONCAT(t.first_name, ' ', t.last_name) AS name
       FROM teachers t
       WHERE t.email = ?`,
      [email]
    );
    if (!rows.length) return res.status(401).json({ error: 'Invalid credentials' });
    const valid = await bcrypt.compare(password, rows[0].password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign(
      { id: rows[0].teacher_id, role: 'teacher' },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );
    const { password: _, ...teacherData } = rows[0];
    res.json({ token, teacher: teacherData });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
