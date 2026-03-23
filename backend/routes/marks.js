const express = require('express');
const router = express.Router();
const db = require('../db');
const { verify } = require('../middleware/auth');

router.use(verify());

// POST / — Add marks (upsert on student+subject+exam_type)
router.post('/', verify('teacher', 'admin'), async (req, res) => {
  const { student_id, subject_id, exam_type, marks_obtained, max_marks, semester } = req.body;
  try {
    const [result] = await db.query(
      `INSERT INTO marks (student_id, subject_id, exam_type, marks_obtained, max_marks, semester)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE marks_obtained=VALUES(marks_obtained), max_marks=VALUES(max_marks)`,
      [student_id, subject_id, exam_type, marks_obtained, max_marks, semester]
    );
    res.json({ message: 'Marks saved', mark_id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /student/:student_id — All marks for a student
router.get('/student/:student_id', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT m.*, s.subject_name, s.subject_code, s.category
       FROM marks m
       JOIN subjects s ON m.subject_id = s.subject_id
       WHERE m.student_id = ?
       ORDER BY s.subject_name, m.exam_type`,
      [req.params.student_id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /student/:student_id/summary — Marks summary per subject
router.get('/student/:student_id/summary', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT s.subject_id, s.subject_name, s.subject_code,
              SUM(m.marks_obtained) AS total_obtained,
              SUM(m.max_marks) AS total_max,
              ROUND(SUM(m.marks_obtained) / SUM(m.max_marks) * 100, 1) AS percentage
       FROM marks m
       JOIN subjects s ON m.subject_id = s.subject_id
       WHERE m.student_id = ?
       GROUP BY s.subject_id`,
      [req.params.student_id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /subject/:subject_id — All marks for a subject (admin view)
router.get('/subject/:subject_id', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT m.*, st.name, st.roll_no
       FROM marks m
       JOIN students st ON m.student_id = st.student_id
       WHERE m.subject_id = ?
       ORDER BY st.roll_no, m.exam_type`,
      [req.params.subject_id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /:mark_id — Update marks
router.put('/:mark_id', verify('teacher', 'admin'), async (req, res) => {
  const { marks_obtained, max_marks, exam_type } = req.body;
  try {
    const [result] = await db.query(
      `UPDATE marks SET
         marks_obtained = COALESCE(?, marks_obtained),
         max_marks = COALESCE(?, max_marks),
         exam_type = COALESCE(?, exam_type)
       WHERE mark_id = ?`,
      [marks_obtained, max_marks, exam_type, req.params.mark_id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Mark record not found' });
    res.json({ message: 'Marks updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /:mark_id — Delete a mark record
router.delete('/:mark_id', verify('teacher', 'admin'), async (req, res) => {
  try {
    const [result] = await db.query('DELETE FROM marks WHERE mark_id = ?', [req.params.mark_id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Mark record not found' });
    res.json({ message: 'Mark deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
