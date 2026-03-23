const express = require('express');
const router  = express.Router();
const db      = require('../db');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
require('dotenv').config();

router.post('/student/login', async (req, res) => {
  const { roll_no, password } = req.body;
  if (!roll_no || !password)
    return res.status(400).json({ error: 'Roll number and password are required' });
  try {
    const [rows] = await db.query('SELECT * FROM students WHERE roll_no = ?', [roll_no]);
    if (!rows.length) return res.status(401).json({ error: 'Invalid credentials' });
    const valid = await bcrypt.compare(password, rows[0].password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign(
      { id: rows[0].student_id, role: 'student' },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );
    const { password: _, ...studentData } = rows[0];
    res.json({ token, student: studentData });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/teacher/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'Email and password are required' });
  try {
    const [rows] = await db.query('SELECT * FROM teachers WHERE email = ?', [email]);
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
