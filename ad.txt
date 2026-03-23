const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { verify } = require('../middleware/auth');
require('dotenv').config();

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const [rows] = await db.query('SELECT * FROM admins WHERE email = ?', [email]);
    if (!rows.length) return res.status(404).json({ error: 'Admin not found' });
    const valid = await bcrypt.compare(password, rows[0].password);
    if (!valid) return res.status(401).json({ error: 'Invalid password' });
    const token = jwt.sign({ id: rows[0].admin_id, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '1d' });
    res.json({ token, admin: { admin_id: rows[0].admin_id, name: rows[0].name, email: rows[0].email } });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.use(verify('admin'));

router.get('/students', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT s.student_id, s.roll_no, s.name, s.email, s.phone, s.course,
              s.semester, s.year, s.level_id, s.faculty_id, s.programme_id,
              l.level_name, p.programme_name, f.faculty_name
       FROM students s
       LEFT JOIN levels l ON s.level_id = l.level_id
       LEFT JOIN programmes p ON s.programme_id = p.programme_id
       LEFT JOIN faculties f ON s.faculty_id = f.faculty_id`
    );
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.delete('/students/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM students WHERE student_id = ?', [req.params.id]);
    res.json({ message: 'Student deleted' });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.get('/teachers', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT teacher_id, name, email, phone, department FROM teachers');
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.post('/teachers', async (req, res) => {
  const { name, email, phone, department, password } = req.body;
  try {
    const hashed = await bcrypt.hash(password, 12);
    const [result] = await db.query('INSERT INTO teachers (name, email, phone, department, password) VALUES (?, ?, ?, ?, ?)', [name, email, phone, department, hashed]);
    res.json({ message: 'Teacher added', teacher_id: result.insertId });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.put('/teachers/:id', async (req, res) => {
  const { name, email, phone, department } = req.body;
  try {
    const [result] = await db.query(
      'UPDATE teachers SET name=?, email=?, phone=?, department=? WHERE teacher_id=?',
      [name, email, phone, department, req.params.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Teacher not found' });
    res.json({ message: 'Teacher updated' });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.delete('/teachers/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM teachers WHERE teacher_id = ?', [req.params.id]);
    res.json({ message: 'Teacher deleted' });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.get('/subjects/all', async (req, res) => {
  try {
    const [rows] = await db.query(`SELECT s.*, l.level_name, p.programme_name FROM subjects s LEFT JOIN levels l ON s.level_id = l.level_id LEFT JOIN programmes p ON s.programme_id = p.programme_id ORDER BY l.level_name, p.programme_name, s.semester`);
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.get('/subjects', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM subjects');
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.post('/subjects', async (req, res) => {
  const { subject_code, subject_name, category, semester, credits, teacher_id } = req.body;
  try {
    const [result] = await db.query('INSERT INTO subjects (subject_code, subject_name, category, semester, credits, teacher_id) VALUES (?, ?, ?, ?, ?, ?)', [subject_code, subject_name, category, semester, credits, teacher_id || null]);
    res.json({ message: 'Subject added', subject_id: result.insertId });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.delete('/subjects/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM subjects WHERE subject_id = ?', [req.params.id]);
    res.json({ message: 'Subject deleted' });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.get('/attendance', async (req, res) => {
  try {
    const [rows] = await db.query(`SELECT a.*, s.name as student_name, sub.subject_name FROM attendance a JOIN students s ON a.student_id = s.student_id JOIN subjects sub ON a.subject_id = sub.subject_id`);
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.get('/fees', async (req, res) => {
  try {
    const [rows] = await db.query(`SELECT f.*, s.name as student_name, s.roll_no FROM fees f JOIN students s ON f.student_id = s.student_id`);
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.get('/marks', async (req, res) => {
  try {
    const [rows] = await db.query(`SELECT m.*, s.name as student_name, sub.subject_name FROM marks m JOIN students s ON m.student_id = s.student_id JOIN subjects sub ON m.subject_id = sub.subject_id`);
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.delete('/marks/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM marks WHERE mark_id = ?', [req.params.id]);
    res.json({ message: 'Mark deleted' });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.get('/enrollment/summary', async (req, res) => {
  try {
    const [rows] = await db.query(`SELECT st.student_id, st.roll_no, st.name as student_name, p.programme_name, l.level_name, st.semester, COUNT(e.enrollment_id) as total_enrolled, SUM(CASE WHEN e.status='ACCEPTED' THEN 1 ELSE 0 END) as accepted, SUM(CASE WHEN e.status='REJECTED' THEN 1 ELSE 0 END) as rejected, SUM(CASE WHEN e.status='PENDING' THEN 1 ELSE 0 END) as pending, MAX(e.admin_modified) as admin_modified FROM students st LEFT JOIN student_subject_enrollment e ON st.student_id = e.student_id LEFT JOIN programmes p ON st.programme_id = p.programme_id LEFT JOIN levels l ON st.level_id = l.level_id GROUP BY st.student_id ORDER BY st.roll_no`);
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.get('/enrollment/detail/:student_id', async (req, res) => {
  try {
    const [student] = await db.query('SELECT * FROM students WHERE student_id = ?', [req.params.student_id]);
    if (!student.length) return res.status(404).json({ error: 'Student not found' });
    const s = student[0];
    const [rows] = await db.query(`SELECT sub.subject_id, sub.subject_code, sub.subject_name, sub.category, sub.credits, sub.semester, sub.discipline_id, d.discipline_name, e.enrollment_id, e.status, e.is_major, e.remarks, e.admin_modified, e.admin_note FROM subjects sub LEFT JOIN disciplines d ON sub.discipline_id = d.discipline_id LEFT JOIN student_subject_enrollment e ON sub.subject_id = e.subject_id AND e.student_id = ? WHERE sub.semester = ? AND ((sub.category = 'MAJOR' AND sub.programme_id = ?) OR (sub.category != 'MAJOR' AND sub.is_common = TRUE)) ORDER BY sub.category, sub.subject_code`, [req.params.student_id, s.semester, s.programme_id]);
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.put('/enrollment/bulkupdate/:student_id', async (req, res) => {
  const { changes, admin_note } = req.body;
  try {
    for (const change of changes) {
      const [existing] = await db.query('SELECT * FROM student_subject_enrollment WHERE student_id = ? AND subject_id = ?', [req.params.student_id, change.subject_id]);
      if (existing.length) {
        await db.query('UPDATE student_subject_enrollment SET status = ?, admin_modified = 1, admin_note = ? WHERE student_id = ? AND subject_id = ?', [change.status, admin_note || '', req.params.student_id, change.subject_id]);
      } else {
        await db.query('INSERT INTO student_subject_enrollment (student_id, subject_id, status, admin_modified, admin_note) VALUES (?, ?, ?, 1, ?)', [req.params.student_id, change.subject_id, change.status, admin_note || 'Added by admin']);
      }
    }
    res.json({ message: `${changes.length} subject(s) updated successfully` });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.delete('/enrollment/reset/:student_id', async (req, res) => {
  try {
    await db.query('DELETE FROM student_subject_enrollment WHERE student_id = ?', [req.params.student_id]);
    res.json({ message: 'Enrollment reset successfully!' });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

module.exports = router;
