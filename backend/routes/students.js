const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcryptjs');
const { verify } = require('../middleware/auth');

router.use(verify('admin', 'teacher'));

// Get all students
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT s.student_id, s.roll_no, s.name, s.email, s.phone, s.course,
              s.semester, s.year, s.level_id, s.programme_id,
              l.level_name, p.programme_name
       FROM students s
       LEFT JOIN levels l ON s.level_id = l.level_id
       LEFT JOIN programmes p ON s.programme_id = p.programme_id`
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Add a student
router.post('/', verify('admin'), async (req, res) => {
  const { roll_no, name, email, phone, course, semester, year, password, level_id, programme_id } = req.body;
  try {
    const hashed = await bcrypt.hash(password, 10);
    const [result] = await db.query(
      'INSERT INTO students (roll_no, name, email, phone, course, semester, year, password, level_id, programme_id) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [roll_no, name, email, phone, course, semester, year, hashed, level_id || null, programme_id || null]
    );
    res.json({ message: 'Student added', student_id: result.insertId });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get single student
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT s.student_id, s.roll_no, s.name, s.email, s.phone, s.course,
              s.semester, s.year, l.level_name, p.programme_name
       FROM students s
       LEFT JOIN levels l ON s.level_id = l.level_id
       LEFT JOIN programmes p ON s.programme_id = p.programme_id
       WHERE s.student_id = ?`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Student not found' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
