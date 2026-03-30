const express = require('express');
const router = express.Router();
const db = require('../db');
const { verify } = require('../middleware/auth');

router.use(verify());

// Visibility rules — which exam types are visible to students
const STUDENT_VISIBLE = new Set(['INTERNAL','ASSIGNMENT','PRACTICAL_INTERNAL']);

// POST / — Add/update marks (upsert on student+subject+exam_type)
router.post('/', verify('teacher', 'admin'), async (req, res) => {
  const { student_id, subject_id, exam_type, marks_obtained, max_marks, semester } = req.body;
  const is_visible = STUDENT_VISIBLE.has(exam_type) ? 1 : 0;
  try {
    const [result] = await db.query(
      `INSERT INTO marks (student_id, subject_id, exam_type, marks_obtained, max_marks, semester, is_visible_to_student)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE marks_obtained=VALUES(marks_obtained), max_marks=VALUES(max_marks)`,
      [student_id, subject_id, exam_type, marks_obtained, max_marks, semester, is_visible]
    );
    res.json({ message: 'Marks saved', mark_id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /bulk — Bulk save marks for entire class
router.post('/bulk', verify('teacher', 'admin'), async (req, res) => {
  const { entries, subject_id, exam_type, max_marks, semester } = req.body;
  // entries = [{student_id, marks_obtained}]
  const is_visible = STUDENT_VISIBLE.has(exam_type) ? 1 : 0;
  try {
    let saved = 0;
    for (const e of entries) {
      if (e.marks_obtained === '' || e.marks_obtained === null || e.marks_obtained === undefined) continue;
      await db.query(
        `INSERT INTO marks (student_id, subject_id, exam_type, marks_obtained, max_marks, semester, is_visible_to_student)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE marks_obtained=VALUES(marks_obtained), max_marks=VALUES(max_marks)`,
        [e.student_id, subject_id, exam_type, Number(e.marks_obtained), max_marks, semester, is_visible]
      );
      saved++;
    }
    res.json({ message: `Marks saved for ${saved} student(s)` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /student/:student_id — Marks visible to student only
router.get('/student/:student_id', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT m.*, s.subject_name, s.subject_code, s.category, s.credits
       FROM marks m
       JOIN subjects s ON m.subject_id = s.subject_id
       WHERE m.student_id = ? AND m.is_visible_to_student = 1
       ORDER BY s.subject_name, m.exam_type`,
      [req.params.student_id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /student/:student_id/all — All marks including external (admin/teacher view)
router.get('/student/:student_id/all', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT m.*, s.subject_name, s.subject_code, s.category, s.credits
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
      `SELECT m.*, CONCAT(st.first_name, ' ', st.last_name) AS name, st.roll_no
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

// GET /student/:student_id/detailed — Marks with percentage + PASS/FAIL per subject
router.get('/student/:student_id/detailed', async (req, res) => {
  try {
    const { semester, academic_year_id } = req.query;
    let query = 'SELECT * FROM vw_student_marks_summary WHERE student_id = ? AND is_visible_to_student = 1';
    const params = [req.params.student_id];
    if (semester)         { query += ' AND semester = ?';          params.push(semester); }
    if (academic_year_id) { query += ' AND academic_year_id = ?';  params.push(academic_year_id); }
    query += ' ORDER BY subject_name, exam_type';
    const [rows] = await db.query(query, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
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
