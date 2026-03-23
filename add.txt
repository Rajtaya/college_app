import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import API from '../api';
import SubjectsTab from '../components/SubjectsTab';

export default function AdminDashboard({ admin, onLogout }) {
  const [activeTab, setActiveTab] = useState('levels');
  const [levels, setLevels] = useState([]);
  const [faculties, setFaculties] = useState([]);
  const [programmes, setProgrammes] = useState([]);
  const [students, setStudents] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [fees, setFees] = useState([]);
  const [marks, setMarks] = useState([]);
  const [enrollmentSummary, setEnrollmentSummary] = useState([]);
  const [enrollmentDetail, setEnrollmentDetail] = useState([]);
  const [selectedEnrollStudent, setSelectedEnrollStudent] = useState(null);
  const [adminNote, setAdminNote] = useState('');
  const [enrollSearch, setEnrollSearch] = useState('');
  const [form, setForm] = useState({});
  const [studentLevel, setStudentLevel] = useState('');
  const [studentFaculty, setStudentFaculty] = useState('');
  const [studentProgrammes, setStudentProgrammes] = useState([]);
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState('success');
  const [editingTeacher, setEditingTeacher] = useState(null);
  const [managingTeacher, setManagingTeacher] = useState(null);
  const [allSubjects, setAllSubjects] = useState([]);
  const [teacherSubjects, setTeacherSubjects] = useState([]);
  const [importing, setImporting] = useState(false);
  const studentFileRef = useRef();
  const teacherFileRef = useRef();
  const feeFileRef = useRef();

  useEffect(() => {
    fetchLevels();
    fetchFaculties();
    fetchProgrammes();
    fetchStudents();
  }, []);

  useEffect(() => {
    if (activeTab === 'students') fetchStudents();
    if (activeTab === 'teachers') fetchTeachers();
    if (activeTab === 'attendance') fetchAttendance();
    if (activeTab === 'fees') { fetchFees(); fetchStudents(); }
    if (activeTab === 'marks') fetchAllMarks();
    if (activeTab === 'enrollment') { fetchEnrollmentSummary(); setSelectedEnrollStudent(null); }
  }, [activeTab]);

  useEffect(() => {
    if (studentLevel && studentFaculty) {
      setStudentProgrammes(programmes.filter(p =>
        String(p.level_id) === String(studentLevel) &&
        String(p.faculty_id) === String(studentFaculty)
      ));
    } else { setStudentProgrammes([]); }
  }, [studentLevel, studentFaculty, programmes]);

  const fetchLevels = async () => { try { const r = await API.get('/levels'); setLevels(r.data); } catch(e){} };
  const fetchFaculties = async () => { try { const r = await API.get('/faculties'); setFaculties(r.data); } catch(e){} };
  const fetchProgrammes = async () => { try { const r = await API.get('/programmes'); setProgrammes(r.data); } catch(e){} };
  const fetchStudents = async () => { try { const r = await API.get('/admin/students'); setStudents(r.data); } catch(e){} };
  const fetchTeachers = async () => { try { const r = await API.get('/admin/teachers'); setTeachers(r.data); } catch(e){} };
  const fetchAttendance = async () => { try { const r = await API.get('/admin/attendance'); setAttendance(r.data); } catch(e){} };
  const fetchFees = async () => { try { const r = await API.get('/admin/fees'); setFees(r.data); } catch(e){} };
  const fetchAllMarks = async () => { try { const r = await API.get('/admin/marks'); setMarks(r.data); } catch(e){} };
  const fetchEnrollmentSummary = async () => { try { const r = await API.get('/admin/enrollment/summary'); setEnrollmentSummary(r.data); } catch(e){} };

  const openEnrollmentDetail = async (student) => {
    setSelectedEnrollStudent(student);
    setAdminNote('');
    try { const r = await API.get(`/admin/enrollment/detail/${student.student_id}`); setEnrollmentDetail(r.data); } catch(e){}
  };

  const handleEnrollStatusChange = (subject_id, newStatus) => {
    setEnrollmentDetail(prev => prev.map(s => s.subject_id === subject_id ? { ...s, status: newStatus } : s));
  };

  const handleEnrollSave = async () => {
    const changes = enrollmentDetail
      .filter(s => s.status && s.status !== 'PENDING')
      .map(s => ({ subject_id: s.subject_id, status: s.status }));
    try {
      await API.put(`/admin/enrollment/bulkupdate/${selectedEnrollStudent.student_id}`, { changes, admin_note: adminNote });
      showMsg('Enrollment updated!');
      fetchEnrollmentSummary();
      openEnrollmentDetail(selectedEnrollStudent);
    } catch(e) { showMsg(e.response?.data?.error || 'Error', 'error'); }
  };

  const handleEnrollReset = async (student) => {
    if (!window.confirm(`Reset all enrollment for ${student.name}?`)) return;
    try {
      await API.delete(`/admin/enrollment/reset/${student.student_id}`);
      showMsg('Enrollment reset!');
      fetchEnrollmentSummary();
      if (selectedEnrollStudent?.student_id === student.student_id) openEnrollmentDetail(student);
    } catch(e) { showMsg('Reset failed', 'error'); }
  };

  // Helper to get faculty name from faculty_id
  const getFacultyName = (faculty_id) => {
    const f = faculties.find(f => String(f.faculty_id) === String(faculty_id));
    return f ? f.faculty_name : 'N/A';
  };

  const getFacultyColor = (faculty_id) => {
    const name = getFacultyName(faculty_id);
    return facultyColors[name] || '#667eea';
  };

  const showMsg = (text, type = 'success') => { setMsg(text); setMsgType(type); setTimeout(() => setMsg(''), 4000); };

  const handleDelete = async (type, id) => {
    if (!window.confirm('Are you sure?')) return;
    try {
      await API.delete(`/admin/${type}/${id}`);
      showMsg('Deleted!');
      if (type === 'students') fetchStudents();
      if (type === 'teachers') fetchTeachers();
    } catch(e) { showMsg('Delete failed!', 'error'); }
  };

  const handleAddLevel = async (e) => {
    e.preventDefault();
    try { await API.post('/levels', form); showMsg('Level added!'); setForm({}); fetchLevels(); }
    catch(err) { showMsg(err.response?.data?.error || 'Error', 'error'); }
  };

  const handleAddFaculty = async (e) => {
    e.preventDefault();
    try { await API.post('/faculties', form); showMsg('Faculty added!'); setForm({}); fetchFaculties(); }
    catch(err) { showMsg(err.response?.data?.error || 'Error', 'error'); }
  };

  const handleAddProgramme = async (e) => {
    e.preventDefault();
    try { await API.post('/programmes', form); showMsg('Programme added!'); setForm({}); fetchProgrammes(); }
    catch(err) { showMsg(err.response?.data?.error || 'Error', 'error'); }
  };

  const handleAddStudent = async (e) => {
    e.preventDefault();
    try {
      await API.post('/students', { ...form, level_id: studentLevel, faculty_id: studentFaculty });
      showMsg('Student added!'); setForm({}); setStudentLevel(''); setStudentFaculty(''); fetchStudents();
    } catch(err) { showMsg(err.response?.data?.error || 'Error', 'error'); }
  };

  const handleAddTeacher = async (e) => {
    e.preventDefault();
    try { await API.post('/admin/teachers', form); showMsg('Teacher added!'); setForm({}); fetchTeachers(); }
    catch(err) { showMsg(err.response?.data?.error || 'Error', 'error'); }
  };

  const handleUpdateTeacher = async (e) => {
    e.preventDefault();
    try {
      await API.put(`/admin/teachers/${editingTeacher.teacher_id}`, editingTeacher);
      showMsg('Teacher updated!'); setEditingTeacher(null); fetchTeachers();
    } catch(err) { showMsg(err.response?.data?.error || 'Error', 'error'); }
  };

  const openManageSubjects = async (teacher) => {
    setManagingTeacher(teacher);
    setEditingTeacher(null);
    try {
      const [all, assigned] = await Promise.all([
        API.get('/subjects'),
        API.get(`/subjects/teacher/${teacher.teacher_id}`)
      ]);
      setAllSubjects(all.data);
      setTeacherSubjects(assigned.data.map(s => s.subject_id));
    } catch(e) { showMsg('Failed to load subjects', 'error'); }
  };

  const handleToggleSubject = async (subject_id, currentlyAssigned) => {
    const newTeacherId = currentlyAssigned ? null : managingTeacher.teacher_id;
    try {
      await API.put(`/subjects/${subject_id}`, { teacher_id: newTeacherId });
      setTeacherSubjects(prev =>
        currentlyAssigned ? prev.filter(id => id !== subject_id) : [...prev, subject_id]
      );
    } catch(e) { showMsg('Failed to update', 'error'); }
  };

  const handleAddFee = async (e) => {
    e.preventDefault();
    try { await API.post('/fees', form); showMsg('Fee added!'); setForm({}); fetchFees(); }
    catch(err) { showMsg(err.response?.data?.error || 'Error', 'error'); }
  };

  const handleMarkPaid = async (fee_id) => {
    try { await API.put(`/fees/pay/${fee_id}`); showMsg('Fee marked as paid!'); fetchFees(); }
    catch(err) { showMsg(err.response?.data?.error || 'Error', 'error'); }
  };

  const downloadTemplate = (type) => {
    const templates = {
      students: [{ roll_no:'BCA001', name:'Rahul Sharma', email:'rahul@college.com', phone:'9876543210', level_name:'UG', faculty_name:'Science', programme_name:'BCA', semester:1, year:1, password:'password123' }],
      teachers: [{ name:'Dr. Sharma', email:'sharma@college.com', phone:'9876543211', department:'Computer Science', password:'teacher123' }],
      fees: [{ roll_no:'BCA001', amount:15000, fee_type:'Tuition Fee', due_date:'2026-04-01' }],
    };
    const ws = XLSX.utils.json_to_sheet(templates[type]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, type);
    XLSX.writeFile(wb, `${type}_template.xlsx`);
  };

  const handleImportStudents = async (e) => {
    const file = e.target.files[0]; if (!file) return; setImporting(true);
    try {
      const data = await file.arrayBuffer(); const wb = XLSX.read(data);
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
      const levelMap = {}; levels.forEach(l => { levelMap[l.level_name.toUpperCase()] = l.level_id; });
      const progMap = {}; programmes.forEach(p => { progMap[p.programme_name.toLowerCase()] = p.programme_id; });
      const facMap = {}; faculties.forEach(f => { facMap[f.faculty_name.toLowerCase()] = f.faculty_id; });
      let success = 0, failed = 0;
      for (const row of rows) {
        try {
          await API.post('/students', {
            roll_no: String(row.roll_no||''), name: String(row.name||''),
            email: String(row.email||''), phone: String(row.phone||''),
            course: String(row.programme_name||''),
            semester: Number(row.semester||1), year: Number(row.year||1),
            password: String(row.password||'password123'),
            level_id: levelMap[String(row.level_name||'').toUpperCase()] || null,
            programme_id: progMap[String(row.programme_name||'').toLowerCase()] || null,
            faculty_id: facMap[String(row.faculty_name||'').toLowerCase()] || null,
          });
          success++;
        } catch { failed++; }
      }
      showMsg(`✅ Imported ${success} students${failed?`, ❌ ${failed} failed`:''}`, failed?'warning':'success');
      fetchStudents();
    } catch { showMsg('Failed!','error'); } finally { setImporting(false); e.target.value=''; }
  };

  const handleImportTeachers = async (e) => {
    const file = e.target.files[0]; if (!file) return; setImporting(true);
    try {
      const data = await file.arrayBuffer(); const wb = XLSX.read(data);
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
      let success = 0, failed = 0;
      for (const row of rows) {
        try { await API.post('/admin/teachers', { name: String(row.name||''), email: String(row.email||''), phone: String(row.phone||''), department: String(row.department||''), password: String(row.password||'teacher123') }); success++; }
        catch { failed++; }
      }
      showMsg(`✅ Imported ${success}${failed?`, ❌ ${failed} failed`:''}`, failed?'warning':'success');
      fetchTeachers();
    } catch { showMsg('Failed!','error'); } finally { setImporting(false); e.target.value=''; }
  };

  const handleImportFees = async (e) => {
    const file = e.target.files[0]; if (!file) return; setImporting(true);
    try {
      const data = await file.arrayBuffer(); const wb = XLSX.read(data);
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
      const studentMap = {}; students.forEach(s => { studentMap[s.roll_no] = s.student_id; });
      let success = 0, failed = 0, notFound = [];
      for (const row of rows) {
        try {
          const student_id = studentMap[String(row.roll_no||'').trim()];
          if (!student_id) { failed++; notFound.push(row.roll_no); continue; }
          await API.post('/fees', { student_id, amount: Number(row.amount||0), fee_type: String(row.fee_type||'Tuition Fee'), due_date: String(row.due_date||'') });
          success++;
        } catch { failed++; }
      }
      let m = `✅ Imported ${success}${failed?`, ❌ ${failed} failed`:''}`;
      if (notFound.length) m += `. Not found: ${notFound.join(', ')}`;
      showMsg(m, failed?'warning':'success');
      fetchFees();
    } catch { showMsg('Failed!','error'); } finally { setImporting(false); e.target.value=''; }
  };

  const tabs = ['levels','students','teachers','subjects','enrollment','attendance','fees','marks'];
  const msgStyle = { ...styles.msg, background: msgType==='error'?'#fff5f5':msgType==='warning'?'#fffbeb':'#c6f6d5', color: msgType==='error'?'#c53030':msgType==='warning'?'#92400e':'#276749' };

  return (
    <div style={styles.container}>
      <nav style={styles.nav}>
        <h2 style={styles.navTitle}>🎓 College ERP — Admin Panel</h2>
        <div style={styles.navRight}>
          <span style={styles.adminName}>👤 {admin.name}</span>
          <button style={styles.logoutBtn} onClick={onLogout}>Logout</button>
        </div>
      </nav>

      <div style={styles.tabs}>
        {tabs.map(tab => (
          <button key={tab} style={{...styles.tab, ...(activeTab===tab ? styles.activeTab : {})}}
            onClick={() => { setActiveTab(tab); setMsg(''); setForm({}); setStudentLevel(''); setStudentFaculty(''); }}>
            {tab==='levels'?'🏫 Levels & Faculties':tab.charAt(0).toUpperCase()+tab.slice(1)}
          </button>
        ))}
      </div>

      {msg && <div style={msgStyle}>{msg}</div>}

      <div style={styles.content}>

        {/* LEVELS FACULTIES PROGRAMMES */}
        {activeTab === 'levels' && (
          <div style={styles.threeCol}>
            {/* LEVELS */}
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>🎯 Levels</h3>
              <form onSubmit={handleAddLevel} style={styles.form}>
                <input style={styles.input} placeholder="Level (e.g. UG)" value={form.level_name||''} onChange={e=>setForm({...form,level_name:e.target.value})} required />
                <input style={styles.input} placeholder="Description" value={form.description||''} onChange={e=>setForm({...form,description:e.target.value})} />
                <button style={styles.addBtn} type="submit">Add</button>
              </form>
              <table style={styles.table}>
                <thead><tr>{['ID','Level','Desc','Del'].map(h=><th key={h} style={styles.th}>{h}</th>)}</tr></thead>
                <tbody>{levels.map(l=>(
                  <tr key={l.level_id}>
                    <td style={styles.td}>{l.level_id}</td>
                    <td style={styles.td}><span style={{...styles.badge,background:'#4c51bf'}}>{l.level_name}</span></td>
                    <td style={styles.td}>{l.description}</td>
                    <td style={styles.td}><button style={styles.delBtn} onClick={()=>API.delete(`/levels/${l.level_id}`).then(fetchLevels)}>✕</button></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>

            {/* FACULTIES */}
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>🏛️ Faculties</h3>
              <form onSubmit={handleAddFaculty} style={styles.form}>
                <input style={styles.input} placeholder="Faculty (e.g. Arts)" value={form.faculty_name||''} onChange={e=>setForm({...form,faculty_name:e.target.value})} required />
                <input style={styles.input} placeholder="Description" value={form.description||''} onChange={e=>setForm({...form,description:e.target.value})} />
                <button style={styles.addBtn} type="submit">Add</button>
              </form>
              <table style={styles.table}>
                <thead><tr>{['ID','Faculty','Desc','Del'].map(h=><th key={h} style={styles.th}>{h}</th>)}</tr></thead>
                <tbody>{faculties.map(f=>(
                  <tr key={f.faculty_id}>
                    <td style={styles.td}>{f.faculty_id}</td>
                    <td style={styles.td}><span style={{...styles.badge,background:facultyColors[f.faculty_name]||'#667eea'}}>{f.faculty_name}</span></td>
                    <td style={styles.td}>{f.description}</td>
                    <td style={styles.td}><button style={styles.delBtn} onClick={()=>API.delete(`/faculties/${f.faculty_id}`).then(fetchFaculties)}>✕</button></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>

            {/* PROGRAMMES */}
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>📚 Programmes</h3>
              <form onSubmit={handleAddProgramme} style={styles.form}>
                <select style={styles.input} value={form.level_id||''} onChange={e=>setForm({...form,level_id:e.target.value})} required>
                  <option value="">Select Level</option>
                  {levels.map(l=><option key={l.level_id} value={l.level_id}>{l.level_name}</option>)}
                </select>
                <select style={styles.input} value={form.faculty_id||''} onChange={e=>setForm({...form,faculty_id:e.target.value})} required>
                  <option value="">Select Faculty</option>
                  {faculties.map(f=><option key={f.faculty_id} value={f.faculty_id}>{f.faculty_name}</option>)}
                </select>
                <input style={styles.input} placeholder="Programme Name" value={form.programme_name||''} onChange={e=>setForm({...form,programme_name:e.target.value})} required />
                <input style={styles.input} type="number" placeholder="Duration (yrs)" value={form.duration_years||''} onChange={e=>setForm({...form,duration_years:e.target.value})} required />
                <button style={styles.addBtn} type="submit">Add</button>
              </form>
              <table style={styles.table}>
                <thead><tr>{['Level','Faculty','Programme','Dur','Del'].map(h=><th key={h} style={styles.th}>{h}</th>)}</tr></thead>
                <tbody>{programmes.map(p=>(
                  <tr key={p.programme_id}>
                    <td style={styles.td}>
                      <span style={{...styles.badge,background:'#4c51bf'}}>{p.level_name}</span>
                    </td>
                    <td style={styles.td}>
                      <span style={{...styles.badge, background: getFacultyColor(p.faculty_id)}}>
                        {getFacultyName(p.faculty_id)}
                      </span>
                    </td>
                    <td style={styles.td}>{p.programme_name}</td>
                    <td style={styles.td}>{p.duration_years}y</td>
                    <td style={styles.td}>
                      <button style={styles.delBtn} onClick={()=>API.delete(`/programmes/${p.programme_id}`).then(fetchProgrammes)}>✕</button>
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        )}

        {/* STUDENTS */}
        {activeTab === 'students' && (
          <div>
            <div style={styles.importBox}>
              <h3 style={styles.importTitle}>📥 Import Students from Excel</h3>
              <div style={styles.importActions}>
                <button style={styles.templateBtn} onClick={()=>downloadTemplate('students')}>⬇️ Download Template</button>
                <label style={{...styles.importBtn,opacity:importing?0.6:1}}>
                  {importing?'⏳ Importing...':'📂 Choose Excel File'}
                  <input ref={studentFileRef} type="file" accept=".xlsx,.xls" style={{display:'none'}} onChange={handleImportStudents} disabled={importing} />
                </label>
              </div>
              <p style={styles.importHint}>📋 Required: <strong>roll_no, name, email, phone, level_name, faculty_name, programme_name, semester, year, password</strong></p>
            </div>
            <h3>Add Student Manually</h3>
            <form onSubmit={handleAddStudent} style={styles.form}>
              {['roll_no','name','email','phone'].map(f=>(
                <input key={f} style={styles.input} placeholder={f.replace('_',' ')} value={form[f]||''} onChange={e=>setForm({...form,[f]:e.target.value})} required />
              ))}
              <select style={styles.input} value={studentLevel} onChange={e=>{setStudentLevel(e.target.value);setStudentFaculty('');setForm({...form,programme_id:''});}} required>
                <option value="">① Select Level</option>
                {levels.map(l=><option key={l.level_id} value={l.level_id}>{l.level_name} — {l.description}</option>)}
              </select>
              <select style={styles.input} value={studentFaculty} onChange={e=>{setStudentFaculty(e.target.value);setForm({...form,programme_id:''});}} required disabled={!studentLevel}>
                <option value="">{studentLevel?'② Select Faculty':'Select Level first'}</option>
                {faculties.map(f=><option key={f.faculty_id} value={f.faculty_id}>{f.faculty_name}</option>)}
              </select>
              <select style={styles.input} value={form.programme_id||''} onChange={e=>setForm({...form,programme_id:e.target.value,course:studentProgrammes.find(p=>String(p.programme_id)===e.target.value)?.programme_name||''})} required disabled={!studentFaculty}>
                <option value="">{studentFaculty?(studentProgrammes.length?'③ Select Programme':'No programmes found'):'Select Faculty first'}</option>
                {studentProgrammes.map(p=><option key={p.programme_id} value={p.programme_id}>{p.programme_name}</option>)}
              </select>
              <input style={styles.input} type="number" placeholder="Semester" value={form.semester||''} onChange={e=>setForm({...form,semester:e.target.value})} required />
              <input style={styles.input} type="number" placeholder="Year" value={form.year||''} onChange={e=>setForm({...form,year:e.target.value})} required />
              <input style={styles.input} type="password" placeholder="Password" value={form.password||''} onChange={e=>setForm({...form,password:e.target.value})} required />
              <button style={styles.addBtn} type="submit">Add Student</button>
            </form>
            <h3>All Students ({students.length})</h3>
            <table style={styles.table}>
              <thead><tr>{['ID','Roll No','Name','Level','Faculty','Programme','Sem','Action'].map(h=><th key={h} style={styles.th}>{h}</th>)}</tr></thead>
              <tbody>{students.map(s=>(
                <tr key={s.student_id}>
                  <td style={styles.td}>{s.student_id}</td>
                  <td style={styles.td}>{s.roll_no}</td>
                  <td style={styles.td}>{s.name}</td>
                  <td style={styles.td}><span style={{...styles.badge,background:'#4c51bf'}}>{s.level_name||'N/A'}</span></td>
                  <td style={styles.td}><span style={{...styles.badge,background:getFacultyColor(s.faculty_id)}}>{getFacultyName(s.faculty_id)}</span></td>
                  <td style={styles.td}>{s.programme_name||s.course||'N/A'}</td>
                  <td style={styles.td}>{s.semester}</td>
                  <td style={styles.td}><button style={styles.delBtn} onClick={()=>handleDelete('students',s.student_id)}>Delete</button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}

        {/* TEACHERS */}
        {activeTab === 'teachers' && (
          <div>
            <div style={styles.importBox}>
              <h3 style={styles.importTitle}>📥 Import Teachers from Excel</h3>
              <div style={styles.importActions}>
                <button style={styles.templateBtn} onClick={()=>downloadTemplate('teachers')}>⬇️ Download Template</button>
                <label style={{...styles.importBtn,opacity:importing?0.6:1}}>
                  {importing?'⏳ Importing...':'📂 Choose Excel File'}
                  <input ref={teacherFileRef} type="file" accept=".xlsx,.xls" style={{display:'none'}} onChange={handleImportTeachers} disabled={importing} />
                </label>
              </div>
              <p style={styles.importHint}>📋 Required: <strong>name, email, phone, department, password</strong></p>
            </div>
            <h3>Add Teacher Manually</h3>
            <form onSubmit={handleAddTeacher} style={styles.form}>
              {['name','email','phone','department'].map(f=>(
                <input key={f} style={styles.input} placeholder={f} value={form[f]||''} onChange={e=>setForm({...form,[f]:e.target.value})} required />
              ))}
              <input style={styles.input} type="password" placeholder="password" value={form.password||''} onChange={e=>setForm({...form,password:e.target.value})} required />
              <button style={styles.addBtn} type="submit">Add Teacher</button>
            </form>
            <h3>All Teachers ({teachers.length})</h3>
            {editingTeacher && (
              <form onSubmit={handleUpdateTeacher} style={{...styles.form, background:'#fffbeb', border:'1px solid #f6e05e', marginBottom:'1rem'}}>
                <strong style={{width:'100%',color:'#744210'}}>✏️ Editing: {editingTeacher.name}</strong>
                {['name','email','phone','department'].map(f=>(
                  <input key={f} style={styles.input} placeholder={f} value={editingTeacher[f]||''}
                    onChange={e=>setEditingTeacher({...editingTeacher,[f]:e.target.value})} required={f!=='phone'} />
                ))}
                <button style={styles.addBtn} type="submit">Save</button>
                <button style={{...styles.delBtn, padding:'0.6rem 1rem'}} type="button" onClick={()=>setEditingTeacher(null)}>Cancel</button>
              </form>
            )}
            <table style={styles.table}>
              <thead><tr>{['ID','Name','Email','Phone','Department','Action'].map(h=><th key={h} style={styles.th}>{h}</th>)}</tr></thead>
              <tbody>{teachers.map(t=>(
                <tr key={t.teacher_id} style={editingTeacher?.teacher_id===t.teacher_id?{background:'#fffbeb'}:{}}>
                  <td style={styles.td}>{t.teacher_id}</td>
                  <td style={styles.td}>{t.name}</td>
                  <td style={styles.td}>{t.email}</td>
                  <td style={styles.td}>{t.phone||'—'}</td>
                  <td style={styles.td}>{t.department}</td>
                  <td style={styles.td}>
                    <button style={{...styles.addBtn,padding:'0.3rem 0.8rem',fontSize:'0.8rem',marginRight:'0.4rem'}}
                      onClick={()=>{ setManagingTeacher(null); setEditingTeacher({...t}); }}>Edit</button>
                    <button style={{...styles.addBtn,padding:'0.3rem 0.8rem',fontSize:'0.8rem',marginRight:'0.4rem',background:'#805ad5'}}
                      onClick={()=>openManageSubjects(t)}>Subjects</button>
                    <button style={styles.delBtn} onClick={()=>handleDelete('teachers',t.teacher_id)}>Delete</button>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}

        {/* SUBJECTS */}
        {activeTab === 'subjects' && (
          <SubjectsTab levels={levels} faculties={faculties} programmes={programmes} showMsg={showMsg} />
        )}

        {/* MANAGE SUBJECTS PANEL — shown in teachers tab */}
        {activeTab === 'teachers' && managingTeacher && (
          <div style={{marginTop:'2rem', background:'#fff', borderRadius:'12px', padding:'1.5rem', boxShadow:'0 2px 8px rgba(0,0,0,0.08)'}}>
            <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1rem', borderBottom:'2px solid #e2e8f0', paddingBottom:'0.75rem'}}>
              <h3 style={{margin:0}}>📚 Subjects assigned to <span style={{color:'#805ad5'}}>{managingTeacher.name}</span></h3>
              <button style={{...styles.delBtn, padding:'0.4rem 1rem'}} onClick={()=>setManagingTeacher(null)}>✕ Close</button>
            </div>
            {['1','2','3','4','5','6','7','8'].map(sem => {
              const semSubjects = allSubjects.filter(s => String(s.semester) === sem);
              if (!semSubjects.length) return null;
              return (
                <div key={sem} style={{marginBottom:'1.5rem'}}>
                  <h4 style={{color:'#4a5568', marginBottom:'0.5rem'}}>Semester {sem}</h4>
                  <table style={styles.table}>
                    <thead><tr>{['Code','Subject','Category','Assigned'].map(h=><th key={h} style={styles.th}>{h}</th>)}</tr></thead>
                    <tbody>{semSubjects.map(s => {
                      const assigned = teacherSubjects.includes(s.subject_id);
                      const takenByOther = s.teacher_id && s.teacher_id !== managingTeacher.teacher_id;
                      return (
                        <tr key={s.subject_id} style={{background: assigned ? '#f0fff4' : takenByOther ? '#fff5f5' : ''}}>
                          <td style={styles.td}><strong>{s.subject_code}</strong></td>
                          <td style={styles.td}>{s.subject_name}</td>
                          <td style={styles.td}><span style={{...styles.badge, background:'#9f7aea'}}>{s.category}</span></td>
                          <td style={styles.td}>
                            {takenByOther
                              ? <span style={{color:'#e53e3e', fontSize:'0.82rem'}}>Assigned to another teacher</span>
                              : <label style={{cursor:'pointer', display:'flex', alignItems:'center', gap:'0.5rem'}}>
                                  <input type="checkbox" checked={assigned}
                                    onChange={() => handleToggleSubject(s.subject_id, assigned)} />
                                  <span style={{color: assigned ? '#38a169' : '#a0aec0', fontWeight:'600'}}>
                                    {assigned ? 'Assigned' : 'Unassigned'}
                                  </span>
                                </label>
                            }
                          </td>
                        </tr>
                      );
                    })}</tbody>
                  </table>
                </div>
              );
            })}
          </div>
        )}

        {/* ENROLLMENT */}
        {activeTab === 'enrollment' && (
          <div>
            {!selectedEnrollStudent ? (
              <div>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem'}}>
                  <h3 style={{margin:0}}>Enrollment Summary ({enrollmentSummary.length} students)</h3>
                  <input style={{...styles.input,minWidth:'240px'}} placeholder="Search by name or roll no…"
                    value={enrollSearch} onChange={e=>setEnrollSearch(e.target.value)} />
                </div>
                <table style={styles.table}>
                  <thead><tr>{['Roll No','Name','Programme','Sem','Total','Accepted','Rejected','Pending','Admin Modified','Actions'].map(h=><th key={h} style={styles.th}>{h}</th>)}</tr></thead>
                  <tbody>{enrollmentSummary
                    .filter(s => !enrollSearch || s.student_name?.toLowerCase().includes(enrollSearch.toLowerCase()) || s.roll_no?.toLowerCase().includes(enrollSearch.toLowerCase()))
                    .map(s=>(
                    <tr key={s.student_id}>
                      <td style={styles.td}><strong>{s.roll_no}</strong></td>
                      <td style={styles.td}>{s.student_name}</td>
                      <td style={styles.td}>{s.programme_name||'—'}</td>
                      <td style={styles.td}>{s.semester}</td>
                      <td style={styles.td}>{s.total_enrolled||0}</td>
                      <td style={styles.td}><span style={{...styles.badge,background:'#48bb78'}}>{s.accepted||0}</span></td>
                      <td style={styles.td}><span style={{...styles.badge,background:'#e53e3e'}}>{s.rejected||0}</span></td>
                      <td style={styles.td}><span style={{...styles.badge,background:'#ed8936'}}>{s.pending||0}</span></td>
                      <td style={styles.td}>{s.admin_modified ? <span style={{...styles.badge,background:'#9f7aea'}}>Yes</span> : '—'}</td>
                      <td style={styles.td}>
                        <button style={{...styles.addBtn,padding:'0.3rem 0.9rem',fontSize:'0.8rem',marginRight:'0.5rem'}}
                          onClick={()=>openEnrollmentDetail(s)}>Manage</button>
                        <button style={{...styles.delBtn}} onClick={()=>handleEnrollReset(s)}>Reset</button>
                      </td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            ) : (
              <div>
                <div style={{display:'flex',alignItems:'center',gap:'1rem',marginBottom:'1.25rem'}}>
                  <button style={{...styles.addBtn,background:'#718096'}} onClick={()=>setSelectedEnrollStudent(null)}>← Back</button>
                  <h3 style={{margin:0}}>Enrollment: {selectedEnrollStudent.name} ({selectedEnrollStudent.roll_no}) — Sem {selectedEnrollStudent.semester}</h3>
                </div>
                <div style={{...styles.form,marginBottom:'1rem'}}>
                  <input style={{...styles.input,flex:1}} placeholder="Admin note (optional)" value={adminNote} onChange={e=>setAdminNote(e.target.value)} />
                  <button style={styles.addBtn} onClick={handleEnrollSave}>Save Changes</button>
                  <button style={{...styles.delBtn,padding:'0.6rem 1.2rem'}} onClick={()=>handleEnrollReset(selectedEnrollStudent)}>Reset All</button>
                </div>
                {['MAJOR','MIC','MDC','SEC','VAC','AEC'].map(cat => {
                  const subjects = enrollmentDetail.filter(s => s.category === cat);
                  if (!subjects.length) return null;
                  return (
                    <div key={cat} style={{marginBottom:'1.5rem'}}>
                      <h4 style={{color:'#4c51bf',marginBottom:'0.5rem'}}>{cat}</h4>
                      <table style={styles.table}>
                        <thead><tr>{['Code','Subject','Credits','Status','Action'].map(h=><th key={h} style={styles.th}>{h}</th>)}</tr></thead>
                        <tbody>{subjects.map(s=>(
                          <tr key={s.subject_id}>
                            <td style={styles.td}><strong>{s.subject_code}</strong></td>
                            <td style={styles.td}>{s.subject_name}</td>
                            <td style={styles.td}>{s.credits}</td>
                            <td style={styles.td}>
                              <span style={{...styles.badge,background:s.status==='ACCEPTED'?'#48bb78':s.status==='REJECTED'?'#e53e3e':s.status==='PENDING'?'#ed8936':'#a0aec0'}}>
                                {s.status||'NOT ENROLLED'}
                              </span>
                              {s.admin_modified ? <span style={{...styles.badge,background:'#9f7aea',marginLeft:'0.4rem'}}>Admin</span> : null}
                            </td>
                            <td style={styles.td}>
                              <select style={{...styles.input,minWidth:'120px',padding:'0.3rem 0.6rem'}}
                                value={s.status||''}
                                onChange={e=>handleEnrollStatusChange(s.subject_id, e.target.value)}>
                                <option value="">— no change —</option>
                                <option value="ACCEPTED">ACCEPTED</option>
                                <option value="REJECTED">REJECTED</option>
                                <option value="PENDING">PENDING</option>
                              </select>
                            </td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ATTENDANCE */}
        {activeTab === 'attendance' && (
          <div>
            <div style={styles.readonlyBanner}>👁️ View Only — Attendance is marked by Teachers only</div>
            <h3>All Attendance Records ({attendance.length})</h3>
            <table style={styles.table}>
              <thead><tr>{['ID','Student','Subject','Date','Status'].map(h=><th key={h} style={styles.th}>{h}</th>)}</tr></thead>
              <tbody>{attendance.map(a=>(
                <tr key={a.attendance_id}>
                  <td style={styles.td}>{a.attendance_id}</td>
                  <td style={styles.td}>{a.student_name}</td>
                  <td style={styles.td}>{a.subject_name}</td>
                  <td style={styles.td}>{new Date(a.date).toLocaleDateString()}</td>
                  <td style={styles.td}><span style={{...styles.badge,background:a.status==='PRESENT'?'#48bb78':a.status==='LATE'?'#ed8936':'#e53e3e'}}>{a.status}</span></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}

        {/* FEES */}
        {activeTab === 'fees' && (
          <div>
            <div style={styles.importBox}>
              <h3 style={styles.importTitle}>📥 Import Fees from Excel</h3>
              <div style={styles.importActions}>
                <button style={styles.templateBtn} onClick={()=>downloadTemplate('fees')}>⬇️ Download Template</button>
                <label style={{...styles.importBtn,opacity:importing?0.6:1}}>
                  {importing?'⏳ Importing...':'📂 Choose Excel File'}
                  <input ref={feeFileRef} type="file" accept=".xlsx,.xls" style={{display:'none'}} onChange={handleImportFees} disabled={importing} />
                </label>
              </div>
              <p style={styles.importHint}>📋 Required: <strong>roll_no, amount, fee_type, due_date</strong></p>
            </div>
            <h3>Add Fee Manually</h3>
            <form onSubmit={handleAddFee} style={styles.form}>
              <select style={styles.input} value={form.student_id||''} onChange={e=>setForm({...form,student_id:e.target.value})} required>
                <option value="">Select Student</option>
                {students.map(s=><option key={s.student_id} value={s.student_id}>{s.roll_no} - {s.name}</option>)}
              </select>
              <input style={styles.input} type="number" placeholder="Amount (₹)" value={form.amount||''} onChange={e=>setForm({...form,amount:e.target.value})} required />
              <input style={styles.input} placeholder="Fee Type" value={form.fee_type||''} onChange={e=>setForm({...form,fee_type:e.target.value})} required />
              <input style={styles.input} type="date" value={form.due_date||''} onChange={e=>setForm({...form,due_date:e.target.value})} required />
              <button style={styles.addBtn} type="submit">Add Fee</button>
            </form>
            <h3>All Fee Records ({fees.length})</h3>
            <table style={styles.table}>
              <thead><tr>{['ID','Student','Roll No','Amount','Type','Due Date','Status','Action'].map(h=><th key={h} style={styles.th}>{h}</th>)}</tr></thead>
              <tbody>{fees.map(f=>(
                <tr key={f.fee_id}>
                  <td style={styles.td}>{f.fee_id}</td><td style={styles.td}>{f.student_name}</td>
                  <td style={styles.td}>{f.roll_no}</td><td style={styles.td}>₹{f.amount}</td>
                  <td style={styles.td}>{f.fee_type}</td>
                  <td style={styles.td}>{new Date(f.due_date).toLocaleDateString()}</td>
                  <td style={styles.td}><span style={{...styles.badge,background:f.status==='PAID'?'#48bb78':f.status==='OVERDUE'?'#e53e3e':'#ed8936'}}>{f.status}</span></td>
                  <td style={styles.td}>
                    {f.status!=='PAID'
                      ?<button style={styles.payBtn} onClick={()=>handleMarkPaid(f.fee_id)}>Mark Paid</button>
                      :<span style={{color:'#48bb78',fontWeight:'600'}}>✅ Paid</span>}
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}

        {/* MARKS */}
        {activeTab === 'marks' && (
          <div>
            <div style={styles.readonlyBanner}>👁️ View Only — Marks are entered by Teachers only</div>
            <h3>All Marks Records ({marks.length})</h3>
            <table style={styles.table}>
              <thead><tr>{['ID','Student','Subject','Exam Type','Marks','Max','Percentage','Semester'].map(h=><th key={h} style={styles.th}>{h}</th>)}</tr></thead>
              <tbody>{marks.map(m=>(
                <tr key={m.mark_id}>
                  <td style={styles.td}>{m.mark_id}</td><td style={styles.td}>{m.student_name}</td>
                  <td style={styles.td}>{m.subject_name}</td>
                  <td style={styles.td}><span style={{...styles.badge,background:'#9f7aea'}}>{m.exam_type}</span></td>
                  <td style={styles.td}><strong>{m.marks_obtained}</strong></td>
                  <td style={styles.td}>{m.max_marks}</td>
                  <td style={styles.td}><span style={{...styles.badge,background:(m.marks_obtained/m.max_marks*100)>=60?'#48bb78':'#e53e3e'}}>{((m.marks_obtained/m.max_marks)*100).toFixed(1)}%</span></td>
                  <td style={styles.td}>{m.semester}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const facultyColors = { 'Arts':'#9f7aea', 'Science':'#48bb78', 'Commerce':'#ed8936' };

const styles = {
  container: { minHeight:'100vh', background:'#f0f4f8' },
  nav: { background:'#2d3748', padding:'1rem 2rem', display:'flex', justifyContent:'space-between', alignItems:'center' },
  navTitle: { color:'#fff', margin:0 },
  navRight: { display:'flex', alignItems:'center', gap:'1rem' },
  adminName: { color:'#a0aec0' },
  logoutBtn: { background:'#e53e3e', color:'#fff', border:'none', padding:'0.5rem 1rem', borderRadius:'6px', cursor:'pointer' },
  tabs: { display:'flex', background:'#fff', borderBottom:'2px solid #e2e8f0', padding:'0 2rem', flexWrap:'wrap' },
  tab: { padding:'1rem 1.2rem', border:'none', background:'none', cursor:'pointer', fontSize:'0.9rem', color:'#718096', textTransform:'capitalize' },
  activeTab: { color:'#4c51bf', borderBottom:'2px solid #4c51bf', fontWeight:'600' },
  content: { padding:'2rem' },
  msg: { padding:'0.75rem 2rem', fontWeight:'600' },
  threeCol: { display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(320px, 1fr))', gap:'1.5rem' },
  section: { background:'#fff', padding:'1.5rem', borderRadius:'12px', boxShadow:'0 2px 8px rgba(0,0,0,0.08)' },
  sectionTitle: { margin:'0 0 1rem', color:'#2d3748', borderBottom:'2px solid #e2e8f0', paddingBottom:'0.5rem' },
  readonlyBanner: { background:'#ebf8ff', color:'#2b6cb0', border:'1px solid #90cdf4', borderRadius:'8px', padding:'0.75rem 1.25rem', marginBottom:'1.5rem', fontWeight:'600' },
  importBox: { background:'#fff', border:'2px dashed #4c51bf', borderRadius:'12px', padding:'1.5rem', marginBottom:'2rem' },
  importTitle: { color:'#4c51bf', marginTop:0 },
  importActions: { display:'flex', gap:'1rem', marginBottom:'0.75rem', flexWrap:'wrap' },
  templateBtn: { padding:'0.6rem 1.2rem', background:'#ebf8ff', color:'#2b6cb0', border:'1px solid #90cdf4', borderRadius:'6px', cursor:'pointer', fontWeight:'600' },
  importBtn: { padding:'0.6rem 1.2rem', background:'#4c51bf', color:'#fff', border:'none', borderRadius:'6px', cursor:'pointer', fontWeight:'600' },
  importHint: { color:'#718096', fontSize:'0.85rem', margin:0 },
  form: { display:'flex', flexWrap:'wrap', gap:'0.75rem', marginBottom:'1rem', padding:'1rem', background:'#f7fafc', borderRadius:'8px' },
  input: { padding:'0.6rem 0.9rem', borderRadius:'6px', border:'1px solid #cbd5e0', fontSize:'0.95rem', minWidth:'160px' },
  addBtn: { padding:'0.6rem 1.5rem', background:'#4c51bf', color:'#fff', border:'none', borderRadius:'6px', cursor:'pointer', fontWeight:'600' },
  payBtn: { padding:'0.3rem 0.75rem', background:'#48bb78', color:'#fff', border:'none', borderRadius:'4px', cursor:'pointer', fontWeight:'600' },
  table: { width:'100%', borderCollapse:'collapse', background:'#fff', borderRadius:'10px', overflow:'hidden', boxShadow:'0 2px 8px rgba(0,0,0,0.08)' },
  th: { background:'#2d3748', color:'#fff', padding:'0.75rem 1rem', textAlign:'left', fontSize:'0.85rem' },
  td: { padding:'0.65rem 1rem', borderBottom:'1px solid #e2e8f0', fontSize:'0.85rem' },
  delBtn: { background:'#e53e3e', color:'#fff', border:'none', padding:'0.3rem 0.75rem', borderRadius:'4px', cursor:'pointer' },
  badge: { padding:'0.2rem 0.6rem', borderRadius:'999px', color:'#fff', fontSize:'0.75rem', fontWeight:'600' },
};
