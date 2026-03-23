const express = require('express');
const router = express.Router();
const db = require('../db');
const { verify } = require('../middleware/auth');

router.use(verify());

// GET /students/:subject_id — students enrolled (ACCEPTED) in a subject
router.get('/students/:subject_id', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT s.student_id, s.name, s.roll_no
       FROM student_subject_enrollment e
       JOIN students s ON e.student_id = s.student_id
       WHERE e.subject_id = ? AND e.status = 'ACCEPTED'
       ORDER BY s.roll_no`,
      [req.params.subject_id]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get all subjects for student's programme with pairing info
router.get('/subjects/:student_id', async (req, res) => {
  try {
    const [student] = await db.query('SELECT * FROM students WHERE student_id = ?', [req.params.student_id]);
    if (!student.length) return res.status(404).json({ error: 'Student not found' });
    const s = student[0];

    const [subjects] = await db.query(
      `SELECT s.subject_id, s.subject_code, s.subject_name, s.category,
              s.semester, s.credits, s.internal_marks,
              s.teacher_id, s.level_id, s.programme_id, s.faculty_id,
              s.discipline_id, s.is_common,
              d.discipline_name,
              e.enrollment_id, e.status as enrollment_status,
              e.is_major, e.remarks
       FROM subjects s
       LEFT JOIN disciplines d ON s.discipline_id = d.discipline_id
       LEFT JOIN student_subject_enrollment e
         ON s.subject_id = e.subject_id AND e.student_id = ?
       LEFT JOIN programme_subject_pool psp
         ON psp.subject_id = s.subject_id AND psp.programme_id = ?
       WHERE s.semester = ?
       AND (
        (s.category = 'MAJOR' AND s.programme_id = ? AND s.level_id = ?)
       OR
         (s.category != 'MAJOR' AND s.is_common = TRUE AND s.level_id = ?)
           OR
           (psp.id IS NOT NULL)
         )
       ORDER BY s.category, s.subject_code`,
      [req.params.student_id, s.programme_id, s.semester, s.programme_id, s.level_id, s.level_id]
    );

    // Add pairing info for MDC and SEC
    const enriched = subjects.map(sub => {
      let pair_code = null;
      let pair_type = null;
      if (['MDC','SEC','MAJOR'].includes(sub.category)) {
        const code = sub.subject_code.trim();
        const lastChar = code.slice(-1).toUpperCase();
        if (lastChar === 'T') {
          const pCode = code.slice(0, -1) + 'P';
          const pPair = subjects.find(s2 => s2.subject_code.trim() === pCode && s2.category === sub.category);
          if (pPair) { pair_code = pCode; pair_type = 'THEORY'; }
        } else if (lastChar === 'P') {
          const tCode = code.slice(0, -1) + 'T';
          const tPair = subjects.find(s2 => s2.subject_code.trim() === tCode && s2.category === sub.category);
          if (tPair) { pair_code = tCode; pair_type = 'PRACTICAL'; }
        }
      }
      return { ...sub, pair_code, pair_type };
    });

    res.json(enriched);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get enrollment status for student
router.get('/status/:student_id', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT e.*, s.subject_code, s.subject_name, s.category,
              s.credits, s.internal_marks,
              d.discipline_name
       FROM student_subject_enrollment e
       JOIN subjects s ON e.subject_id = s.subject_id
       LEFT JOIN disciplines d ON s.discipline_id = d.discipline_id
       WHERE e.student_id = ?
       ORDER BY s.category, s.subject_code`,
      [req.params.student_id]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Student submits enrollment
router.post('/submit/:student_id', verify('student', 'admin'), async (req, res) => {
  const { enrollments } = req.body;
  try {
    let existingCount = 0;
    try {
      const [existing] = await db.query(
        'SELECT COUNT(*) as count FROM student_subject_enrollment WHERE student_id = ?',
        [req.params.student_id]
      );
      existingCount = existing[0].count;
    } catch(e) { console.error('EXISTING CHECK ERROR:', e.message); }
    if (existingCount > 0) {
      return res.status(400).json({ error: 'Already submitted. Contact admin to reset.' });
    }

    const accepted = enrollments.filter(e => e.status === 'ACCEPTED');
    const subjectIds = accepted.map(e => e.subject_id);
    let subjectDetails = [];
    if (subjectIds.length > 0) {
      const [details] = await db.query(
        `SELECT s.*, d.discipline_id, d.discipline_name
         FROM subjects s
         LEFT JOIN disciplines d ON s.discipline_id = d.discipline_id
         WHERE s.subject_id IN (?)`,
        [subjectIds]
      );
      subjectDetails = details;
    }

    const errors = [];
    const majorDisciplines = subjectDetails
      .filter(s => s.category === 'MAJOR')
      .map(s => s.discipline_id).filter(Boolean);

    const byCategory = {};
    subjectDetails.forEach(s => {
      if (!byCategory[s.category]) byCategory[s.category] = [];
      byCategory[s.category].push(s);
    });

    const getBaseCode = (code) => {
      const c = code.trim();
      const last = c.slice(-1).toUpperCase();
      return ['T','P'].includes(last) ? c.slice(0,-1) : c;
    };

    // MIC: exactly 1, discipline conflict
    const mic = byCategory['MIC'] || [];
    if (mic.length === 0) errors.push('❌ MIC: Must select exactly 1 subject');
    else if (mic.length > 1) errors.push(`❌ MIC: Select only 1 subject (selected ${mic.length})`);
    else if (majorDisciplines.includes(mic[0].discipline_id))
      errors.push(`❌ MIC conflict: "${mic[0].subject_name}" is from your MAJOR discipline`);

    // VAC: exactly 1, no conflict
    const vac = byCategory['VAC'] || [];
    if (vac.length === 0) errors.push('❌ VAC: Must select exactly 1 subject');
    else if (vac.length > 1) errors.push(`❌ VAC: Select only 1 subject (selected ${vac.length})`);

    // AEC: exactly 1, no conflict
    const aec = byCategory['AEC'] || [];
    if (aec.length > 1) errors.push(`❌ AEC: Select only 1 subject (selected ${aec.length})`);

    // MDC: 1 group, T+P pair, discipline conflict
    const mdc = byCategory['MDC'] || [];
    if (mdc.length === 0) errors.push('❌ MDC: Must select at least 1 subject');
    else {
      mdc.forEach(s => {
        if (majorDisciplines.includes(s.discipline_id))
          errors.push(`❌ MDC conflict: "${s.subject_name}" is from your MAJOR discipline`);
      });
      const mdcGroups = {};
      mdc.forEach(s => { const b = getBaseCode(s.subject_code); if(!mdcGroups[b]) mdcGroups[b]=[]; mdcGroups[b].push(s); });
      if (Object.keys(mdcGroups).length > 1) errors.push('❌ MDC: Select subjects from only ONE group');
      Object.entries(mdcGroups).forEach(([base, group]) => {
        const hasT = group.some(s => s.subject_code.trim().toUpperCase().endsWith('T'));
        const hasP = group.some(s => s.subject_code.trim().toUpperCase().endsWith('P'));
        const is2Credit = group.some(s => s.credits <= 2);
        if (is2Credit && hasT && !hasP) errors.push('❌ MDC: Must also select the Practical (P) companion');
        if (is2Credit && hasP && !hasT) errors.push('❌ MDC: Must also select the Theory (T) companion');
      });
    }

    // SEC: 1 group, T+P pair, NO discipline conflict
    const sec = byCategory['SEC'] || [];
    if (sec.length > 0) {
      const secGroups = {};
      sec.forEach(s => { const b = getBaseCode(s.subject_code); if(!secGroups[b]) secGroups[b]=[]; secGroups[b].push(s); });
      if (Object.keys(secGroups).length > 1) errors.push('❌ SEC: Select subjects from only ONE group');
      Object.entries(secGroups).forEach(([base, group]) => {
        const hasT = group.some(s => s.subject_code.trim().toUpperCase().endsWith('T'));
        const hasP = group.some(s => s.subject_code.trim().toUpperCase().endsWith('P'));
        const is2Credit = group.some(s => s.credits <= 2);
        if (is2Credit && hasT && !hasP) errors.push('❌ SEC: Must also select the Practical (P) companion');
        if (is2Credit && hasP && !hasT) errors.push('❌ SEC: Must also select the Theory (T) companion');
      });
    }


    // MAJOR: exactly 3 groups required
    const major = byCategory['MAJOR'] || [];
    const getMajorBase = (code) => {
      const c = code.trim();
      const last = c.slice(-1).toUpperCase();
      return ['T','P'].includes(last) ? c.slice(0,-1) : c;
    };
    const majorGroups = {};
    major.forEach(s => { const b = getMajorBase(s.subject_code); if(!majorGroups[b]) majorGroups[b]=[]; majorGroups[b].push(s); });
    const majorGroupCount = Object.keys(majorGroups).length;
    if (majorGroupCount < 3) errors.push('MAJOR: Must select exactly 3 subjects/groups (selected ' + majorGroupCount + ')');
    if (majorGroupCount > 3) errors.push('MAJOR: Cannot select more than 3 groups (selected ' + majorGroupCount + ')');
    Object.entries(majorGroups).forEach(([base, group]) => {
      const hasT = group.some(s => s.subject_code.trim().toUpperCase().endsWith('T'));
      const hasP = group.some(s => s.subject_code.trim().toUpperCase().endsWith('P'));
      const is3Credit = group.some(s => s.credits === 3);
      if (is3Credit && hasT && !hasP) errors.push('MAJOR: Must also select the Practical companion for ' + base + 'T');
      if (is3Credit && hasP && !hasT) errors.push('MAJOR: Must also select the Theory companion for ' + base + 'P');
    });

    // Pending check
    const pending = enrollments.filter(e => e.status === 'PENDING');
    if (pending.length > 0) return res.status(400).json({ error: pending.length + " subject(s) still pending — please Accept or Raise Error for all", errors: [pending.length + " subject(s) still pending"] });

    if (errors.length > 0) {
      return res.status(400).json({ error: errors.join('\n'), errors });
    }

    // Save enrollments
    await db.query('DELETE FROM student_subject_enrollment WHERE student_id = ? AND status = ?',
      [req.params.student_id, 'PENDING']);

    for (const e of enrollments) {
      await db.query(
        `INSERT INTO student_subject_enrollment
         (student_id, subject_id, status, is_major, remarks)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE status=VALUES(status), is_major=VALUES(is_major), remarks=VALUES(remarks)`,
        [req.params.student_id, e.subject_id, e.status, e.is_major||false, e.remarks||'']
      );
    }
    res.json({ message: 'Enrollment submitted successfully!' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
