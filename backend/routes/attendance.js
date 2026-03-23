const express = require('express');
const router = express.Router();
const db = require('../db');
const { verify } = require('../middleware/auth');

router.use(verify());

// POST / — Mark single attendance (upsert)
router.post('/', verify('teacher', 'admin'), async (req, res) => {
  const { student_id, subject_id, date, status } = req.body;
  try {
    const [result] = await db.query(
      'INSERT INTO attendance (student_id, subject_id, date, status) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE status=VALUES(status)',
      [student_id, subject_id, date, status]
    );
    res.json({ message: 'Attendance marked', attendance_id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /bulk — Mark attendance for a whole class on a date
router.post('/bulk', verify('teacher', 'admin'), async (req, res) => {
  const { subject_id, date, records } = req.body;
  if (!Array.isArray(records) || records.length === 0) {
    return res.status(400).json({ error: 'records must be a non-empty array' });
  }
  try {
    for (const { student_id, status } of records) {
      await db.query(
        'INSERT INTO attendance (student_id, subject_id, date, status) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE status=VALUES(status)',
        [student_id, subject_id, date, status]
      );
    }
    res.json({ message: `Attendance marked for ${records.length} student(s)` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /student/:student_id — All attendance for a student
router.get('/student/:student_id', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT a.*, s.subject_name, s.subject_code
       FROM attendance a
       JOIN subjects s ON a.subject_id = s.subject_id
       WHERE a.student_id = ?
       ORDER BY a.date DESC`,
      [req.params.student_id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /student/:student_id/summary — Attendance % per subject
router.get('/student/:student_id/summary', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT s.subject_id, s.subject_name, s.subject_code,
              COUNT(*) AS total,
              SUM(a.status = 'PRESENT') AS present,
              SUM(a.status = 'LATE') AS late,
              ROUND(SUM(a.status = 'PRESENT') / COUNT(*) * 100, 1) AS percentage
       FROM attendance a
       JOIN subjects s ON a.subject_id = s.subject_id
       WHERE a.student_id = ?
       GROUP BY s.subject_id`,
      [req.params.student_id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /subject/:subject_id/date/:date — Class roll for a date
router.get('/subject/:subject_id/date/:date', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT a.attendance_id, a.student_id, a.status,
              st.name, st.roll_no
       FROM attendance a
       JOIN students st ON a.student_id = st.student_id
       WHERE a.subject_id = ? AND a.date = ?
       ORDER BY st.roll_no`,
      [req.params.subject_id, req.params.date]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /:attendance_id — Update attendance status
router.put('/:attendance_id', verify('teacher', 'admin'), async (req, res) => {
  const { status } = req.body;
  try {
    const [result] = await db.query(
      'UPDATE attendance SET status = ? WHERE attendance_id = ?',
      [status, req.params.attendance_id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Attendance record not found' });
    }
    res.json({ message: 'Attendance updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /:attendance_id — Delete an attendance record
router.delete('/:attendance_id', verify('teacher', 'admin'), async (req, res) => {
  try {
    const [result] = await db.query(
      'DELETE FROM attendance WHERE attendance_id = ?',
      [req.params.attendance_id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Attendance record not found' });
    }
    res.json({ message: 'Attendance deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
