import React, { useState, useEffect } from 'react';
import API from '../api';
import StudentEnrollment from './StudentEnrollment';

export default function Dashboard({ student, onLogout }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [attendance, setAttendance] = useState([]);
  const [enrollmentSummary, setEnrollmentSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showEnrollment, setShowEnrollment] = useState(false);

  useEffect(() => {
    if (activeTab === 'attendance') fetchAttendance();
    if (activeTab === 'subjects') fetchEnrollmentSummary();
  }, [activeTab]);

  useEffect(() => { fetchEnrollmentSummary(); }, []);

  const fetchAttendance = async () => {
    setLoading(true);
    try { const r = await API.get(`/attendance/student/${student.student_id}`); setAttendance(r.data); }
    catch(e){} finally { setLoading(false); }
  };

  const fetchEnrollmentSummary = async () => {
    try {
      const r = await API.get(`/enrollment/status/${student.student_id}`);
      setEnrollmentSummary(r.data);
    } catch(e){}
  };

  const getStats = () => {
    const subjectMap = {};
    attendance.forEach(a => {
      if (!subjectMap[a.subject_name]) subjectMap[a.subject_name] = { present:0, absent:0, late:0, total:0 };
      subjectMap[a.subject_name].total++;
      if (a.status==='PRESENT') subjectMap[a.subject_name].present++;
      else if (a.status==='ABSENT') subjectMap[a.subject_name].absent++;
      else if (a.status==='LEAVE') subjectMap[a.subject_name].late++;
    });
    return subjectMap;
  };

  const stats = getStats();
  const totalClasses = attendance.length;
  const totalPresent = attendance.filter(a => a.status==='PRESENT').length;
  const overallPct = totalClasses ? ((totalPresent/totalClasses)*100).toFixed(1) : 0;

  const isEnrollmentSubmitted = student.enrollment_submitted === 1;
  const acceptedSubjects = enrollmentSummary 
    ? enrollmentSummary.filter(e => e.status === 'ACCEPTED' && e.is_draft === 0) 
    : [];
  const hasDraft = enrollmentSummary && enrollmentSummary.some(e => e.is_draft === 1);
  const adminModified = enrollmentSummary && enrollmentSummary.some(e => e.admin_modified === 1);
  const adminNote = enrollmentSummary && enrollmentSummary.find(e => e.admin_note)?.admin_note;

  if (showEnrollment) {
    return <StudentEnrollment student={student} onBack={() => { setShowEnrollment(false); fetchEnrollmentSummary(); }} />;
  }

  const categoryLabels = {
    MAJOR:'Discipline Specific', MIC:'Minor/Vocational', MDC:'Multidisciplinary',
    SEC:'Skill Enhancement', VAC:'Value Added', AEC:'Ability Enhancement'
  };
  const categoryColors = {
    MAJOR:'#4c51bf', MIC:'#057a55', MDC:'#dd6b20',
    SEC:'#e53e3e', VAC:'#d69e2e', AEC:'#805ad5'
  };

  const groupedAccepted = acceptedSubjects.reduce((acc, s) => {
    if (!acc[s.category]) acc[s.category] = [];
    acc[s.category].push(s);
    return acc;
  }, {});

  return (
    <div style={styles.container}>
      <nav style={styles.nav}>
        <h2 style={styles.navTitle}>🎓 College ERP</h2>
        <div style={styles.navRight}>
          <span style={styles.studentName}>👤 {student.name}</span>
          <button style={styles.logoutBtn} onClick={onLogout}>Logout</button>
        </div>
      </nav>

      <div style={styles.tabs}>
        {['overview','subjects','attendance'].map(tab => (
          <button key={tab} style={{...styles.tab, ...(activeTab===tab?styles.activeTab:{})}}
            onClick={() => setActiveTab(tab)}>
            {tab==='overview'?'🏠 Overview':tab==='subjects'?'📚 My Subjects':'📅 Attendance'}
          </button>
        ))}
      </div>

      <div style={styles.content}>

        {activeTab === 'overview' && (
          <div>
            {adminModified && (
              <div style={styles.adminNotifBanner}>
                <div style={styles.adminNotifLeft}>
                  <span style={{fontSize:'1.8rem'}}>🔔</span>
                  <div>
                    <strong style={{fontSize:'1rem'}}>Your enrollment has been updated by Admin</strong>
                    {adminNote && <p style={{margin:'0.25rem 0 0',fontSize:'0.9rem',opacity:0.9}}>Note: {adminNote}</p>}
                  </div>
                </div>
                <button style={styles.adminNotifBtn} onClick={() => setActiveTab('subjects')}>
                  View Updated Subjects →
                </button>
              </div>
            )}
            <div style={styles.welcome}>
              <h1>Welcome, {student.name}! 👋</h1>
              <p style={styles.meta}>
                Roll No: <strong>{student.roll_no}</strong> &nbsp;|&nbsp;
                Course: <strong>{student.course}</strong> &nbsp;|&nbsp;
                Semester: <strong>{student.semester}</strong>
              </p>
            </div>
            <div style={styles.cards}>
              <div style={{...styles.card, background:'#4c51bf', position:'relative'}} onClick={() => setActiveTab('subjects')}>
                {adminModified && <span style={styles.notifDot}>!</span>}
                <h3>📚 My Subjects</h3>
                <p>{isEnrollmentSubmitted ? `✅ ${acceptedSubjects.length} subjects enrolled` : '⚠️ Enrollment pending'}</p>
                <p style={styles.cardArrow}>→ Click to view</p>
              </div>
              <div style={{...styles.card, background:'#48bb78'}} onClick={() => setActiveTab('attendance')}>
                <h3>📅 Attendance</h3>
                <p>Overall: {overallPct}%</p>
                <p style={styles.cardArrow}>→ Click to view</p>
              </div>
              <div style={{...styles.card, background:'#9f7aea'}}>
                <h3>📊 Marks</h3>
                <p>View exam results</p>
                <p style={styles.cardArrow}>Coming soon</p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'subjects' && (
          <div>
            <div style={styles.subjectHeader}>
              <div>
                <h2 style={{margin:0}}>📚 My Subjects</h2>
                <p style={{color:'#718096', margin:'0.25rem 0 0'}}>Semester {student.semester}</p>
              </div>
              {!isEnrollmentSubmitted ? (
                <button style={styles.enrollBtn} onClick={() => setShowEnrollment(true)}>
                  📋 Go to Enrollment →
                </button>
              ) : (
                <div style={{...styles.submittedTag, background: adminModified?'#ebf8ff':'#c6f6d5', color: adminModified?'#2b6cb0':'#276749'}}>
                  {adminModified ? '✏️ Modified by Admin' : '✅ Enrollment Submitted'}
                </div>
              )}
            </div>

            {adminModified && (
              <div style={styles.adminSubjectBanner}>
                <span style={{fontSize:'1.4rem'}}>🔔</span>
                <div>
                  <strong>Your enrollment was updated by the Admin.</strong>
                  {adminNote && <span style={{marginLeft:'0.5rem',opacity:0.85}}>"{adminNote}"</span>}
                  <p style={{margin:'0.25rem 0 0',fontSize:'0.85rem',opacity:0.8}}>
                    The subjects below reflect your current approved enrollment.
                  </p>
                </div>
              </div>
            )}

            {!isEnrollmentSubmitted && (
              <div style={styles.enrollmentAlert}>
                <h3 style={{margin:'0 0 0.5rem', color:'#92400e'}}>⚠️ Enrollment Pending!</h3>
                <p style={{margin:0}}>You need to review and submit your subject enrollment.</p>
              </div>
            )}

            {isEnrollmentSubmitted && acceptedSubjects.length > 0 && (
              <div>
                <div style={styles.summaryCards}>
                  <div style={{...styles.summaryCard, background:'#f0fff4', border:'2px solid #9ae6b4'}}>
                    <p style={{...styles.summaryNum, color:'#276749'}}>{acceptedSubjects.length}</p>
                    <p style={styles.summaryLabel}>Enrolled Subjects</p>
                  </div>
                  <div style={{...styles.summaryCard, background:'#ebf8ff', border:'2px solid #90cdf4'}}>
                    <p style={styles.summaryNum}>{Object.keys(groupedAccepted).length}</p>
                    <p style={styles.summaryLabel}>Course Types</p>
                  </div>
                  <div style={{...styles.summaryCard, background:'#faf5ff', border:'2px solid #d6bcfa'}}>
                    <p style={{...styles.summaryNum, color:'#553c9a'}}>
                      {acceptedSubjects.reduce((sum, s) => sum + (s.credits || 0), 0)}
                    </p>
                    <p style={styles.summaryLabel}>Total Credits</p>
                  </div>
                </div>

                {Object.keys(categoryLabels).filter(cat => groupedAccepted[cat]).map(category => (
                  <div key={category} style={styles.categoryBlock}>
                    <div style={{...styles.categoryHeader, background: categoryColors[category]||'#667eea'}}>
                      <span style={styles.catTitle}>{categoryLabels[category] || category}</span>
                      <span style={styles.catCount}>{groupedAccepted[category].length} subjects</span>
                    </div>
                    <table style={styles.table}>
                      <thead>
                        <tr>
                          {['Course Code','Paper Name','Discipline','Credits','Internal Marks', category==='MAJOR'?'Major?':''].filter(Boolean).map(h=>(
                            <th key={h} style={styles.th}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {groupedAccepted[category].map(sub => (
                          <tr key={sub.enrollment_id} style={{background: sub.admin_modified ? '#fffbeb' : '#fff'}}>
                            <td style={{...styles.td, fontFamily:'monospace', fontWeight:'600', fontSize:'0.82rem'}}>
                              {sub.subject_code}
                              {sub.admin_modified ? <span style={styles.adminTag}>✏️</span> : ''}
                            </td>
                            <td style={styles.td}>{sub.subject_name}</td>
                            <td style={styles.td}>
                              {sub.discipline_name
                                ? <span style={styles.discBadge}>{sub.discipline_name}</span>
                                : <span style={{color:'#a0aec0'}}>-</span>}
                            </td>
                            <td style={{...styles.td, textAlign:'center'}}>{sub.credits}</td>
                            <td style={{...styles.td, textAlign:'center'}}>{sub.internal_marks}</td>
                            {category === 'MAJOR' && (
                              <td style={{...styles.td, textAlign:'center'}}>
                                {sub.is_major ? <span style={{color:'#4c51bf', fontWeight:'700'}}>⭐ Major</span> : '-'}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'attendance' && (
          <div>
            <div style={styles.summaryBox}>
              <h2 style={{margin:0, marginBottom:'1rem'}}>📅 My Attendance</h2>
              <div style={styles.summaryCards}>
                <div style={{...styles.summaryCard, background:'#ebf8ff', border:'2px solid #90cdf4'}}>
                  <p style={styles.summaryNum}>{totalClasses}</p>
                  <p style={styles.summaryLabel}>Total Classes</p>
                </div>
                <div style={{...styles.summaryCard, background:'#f0fff4', border:'2px solid #9ae6b4'}}>
                  <p style={styles.summaryNum}>{totalPresent}</p>
                  <p style={styles.summaryLabel}>Present</p>
                </div>
                <div style={{...styles.summaryCard, background:'#fff5f5', border:'2px solid #feb2b2'}}>
                  <p style={styles.summaryNum}>{totalClasses-totalPresent}</p>
                  <p style={styles.summaryLabel}>Absent/Late</p>
                </div>
                <div style={{...styles.summaryCard, background: overallPct>=75?'#f0fff4':'#fff5f5', border:`2px solid ${overallPct>=75?'#9ae6b4':'#feb2b2'}`}}>
                  <p style={{...styles.summaryNum, color: overallPct>=75?'#276749':'#c53030'}}>{overallPct}%</p>
                  <p style={styles.summaryLabel}>Overall %</p>
                </div>
              </div>
              {overallPct < 75 && totalClasses > 0 && <div style={styles.warningBanner}>⚠️ Your attendance is below 75%!</div>}
              {overallPct >= 75 && totalClasses > 0 && <div style={styles.goodBanner}>✅ Great! Your attendance is above 75%.</div>}
            </div>

            {Object.keys(stats).length > 0 && (
              <div style={styles.subjectStats}>
                <h3>Subject-wise Attendance</h3>
                <div style={styles.subjectGrid}>
                  {Object.entries(stats).map(([subject, data]) => {
                    const pct = ((data.present/data.total)*100).toFixed(1);
                    return (
                      <div key={subject} style={styles.subjectCard}>
                        <h4 style={styles.subjectName}>{subject}</h4>
                        <div style={styles.progressBar}>
                          <div style={{...styles.progressFill, width:`${pct}%`, background: pct>=75?'#48bb78':'#e53e3e'}} />
                        </div>
                        <div style={styles.subjectMeta}>
                          <span style={{color: pct>=75?'#276749':'#c53030', fontWeight:'700'}}>{pct}%</span>
                          <span style={{color:'#718096'}}>{data.present}/{data.total} classes</span>
                        </div>
                        <div style={styles.subjectBadges}>
                          <span style={{...styles.badge, background:'#48bb78'}}>P: {data.present}</span>
                          <span style={{...styles.badge, background:'#e53e3e'}}>A: {data.absent}</span>
                          {data.late>0 && <span style={{...styles.badge, background:'#ed8936'}}>L: {data.late}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <h3>Attendance Records</h3>
            {loading ? <p>Loading...</p> : attendance.length === 0 ? (
              <div style={styles.emptyState}>📭 No attendance records found.</div>
            ) : (
              <table style={styles.table}>
                <thead><tr>{['Date','Subject','Status'].map(h=><th key={h} style={styles.th}>{h}</th>)}</tr></thead>
                <tbody>{attendance.map(a=>(
                  <tr key={a.attendance_id}>
                    <td style={styles.td}>{new Date(a.date).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}</td>
                    <td style={styles.td}>{a.subject_name}</td>
                    <td style={styles.td}><span style={{...styles.badge, background: a.status==='PRESENT'?'#48bb78':a.status==='LEAVE'?'#ed8936':'#e53e3e'}}>{a.status}</span></td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  container:{minHeight:'100vh',background:'#f0f4f8'},
  nav:{background:'#2d3748',padding:'1rem 2rem',display:'flex',justifyContent:'space-between',alignItems:'center'},
  navTitle:{color:'#fff',margin:0},
  navRight:{display:'flex',alignItems:'center',gap:'1rem'},
  studentName:{color:'#a0aec0'},
  logoutBtn:{background:'#e53e3e',color:'#fff',border:'none',padding:'0.5rem 1rem',borderRadius:'6px',cursor:'pointer'},
  tabs:{display:'flex',background:'#fff',borderBottom:'2px solid #e2e8f0',padding:'0 2rem'},
  tab:{padding:'1rem 1.5rem',border:'none',background:'none',cursor:'pointer',fontSize:'0.95rem',color:'#718096'},
  activeTab:{color:'#4c51bf',borderBottom:'2px solid #4c51bf',fontWeight:'600'},
  content:{padding:'2rem'},
  adminNotifBanner:{background:'linear-gradient(135deg,#2b6cb0,#4c51bf)',color:'#fff',padding:'1rem 1.5rem',borderRadius:'12px',marginBottom:'1.5rem',display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:'1rem',boxShadow:'0 4px 12px rgba(76,81,191,0.3)'},
  adminNotifLeft:{display:'flex',alignItems:'center',gap:'1rem'},
  adminNotifBtn:{background:'rgba(255,255,255,0.2)',border:'2px solid rgba(255,255,255,0.5)',color:'#fff',padding:'0.6rem 1.2rem',borderRadius:'8px',cursor:'pointer',fontWeight:'600',whiteSpace:'nowrap'},
  adminSubjectBanner:{background:'#ebf8ff',border:'2px solid #90cdf4',color:'#2b6cb0',padding:'1rem 1.5rem',borderRadius:'10px',marginBottom:'1.5rem',display:'flex',gap:'1rem',alignItems:'flex-start'},
  adminTag:{marginLeft:'0.4rem',fontSize:'0.75rem'},
  notifDot:{position:'absolute',top:'-8px',right:'-8px',background:'#e53e3e',color:'#fff',borderRadius:'999px',width:'22px',height:'22px',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:'700',fontSize:'0.85rem'},
  welcome:{background:'#fff',padding:'1.5rem',borderRadius:'12px',marginBottom:'2rem',boxShadow:'0 2px 8px rgba(0,0,0,0.08)'},
  meta:{color:'#718096',marginTop:'0.5rem'},
  cards:{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(200px, 1fr))',gap:'1.5rem'},
  card:{padding:'1.5rem',borderRadius:'12px',color:'#fff',boxShadow:'0 4px 12px rgba(0,0,0,0.15)',cursor:'pointer'},
  cardArrow:{marginTop:'0.5rem',opacity:0.8,fontSize:'0.9rem'},
  subjectHeader:{display:'flex',justifyContent:'space-between',alignItems:'center',background:'#fff',padding:'1.5rem',borderRadius:'12px',marginBottom:'1.5rem',boxShadow:'0 2px 8px rgba(0,0,0,0.08)'},
  enrollBtn:{padding:'0.75rem 1.5rem',background:'#4c51bf',color:'#fff',border:'none',borderRadius:'8px',cursor:'pointer',fontWeight:'600',fontSize:'1rem'},
  submittedTag:{padding:'0.5rem 1.25rem',borderRadius:'999px',fontWeight:'600'},
  enrollmentAlert:{background:'#fffbeb',border:'2px solid #fcd34d',borderRadius:'10px',padding:'1rem 1.5rem',marginBottom:'1.5rem'},
  summaryCards:{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(120px, 1fr))',gap:'1rem',marginBottom:'1.5rem'},
  summaryCard:{padding:'1rem',borderRadius:'10px',textAlign:'center'},
  summaryNum:{fontSize:'2rem',fontWeight:'700',margin:0},
  summaryLabel:{color:'#718096',margin:'0.25rem 0 0',fontSize:'0.85rem'},
  categoryBlock:{marginBottom:'2rem',borderRadius:'10px',overflow:'hidden',boxShadow:'0 2px 8px rgba(0,0,0,0.08)'},
  categoryHeader:{padding:'0.75rem 1.5rem',color:'#fff',display:'flex',justifyContent:'space-between',alignItems:'center'},
  catTitle:{fontWeight:'700',fontSize:'1rem'},
  catCount:{background:'rgba(255,255,255,0.3)',padding:'0.2rem 0.75rem',borderRadius:'999px',fontSize:'0.82rem'},
  discBadge:{background:'#ebf8ff',color:'#2b6cb0',padding:'0.15rem 0.5rem',borderRadius:'999px',fontSize:'0.75rem',fontWeight:'600'},
  summaryBox:{background:'#fff',padding:'1.5rem',borderRadius:'12px',marginBottom:'2rem',boxShadow:'0 2px 8px rgba(0,0,0,0.08)'},
  warningBanner:{background:'#fffbeb',color:'#92400e',border:'1px solid #fcd34d',borderRadius:'8px',padding:'0.75rem 1rem',fontWeight:'600'},
  goodBanner:{background:'#f0fff4',color:'#276749',border:'1px solid #9ae6b4',borderRadius:'8px',padding:'0.75rem 1rem',fontWeight:'600'},
  subjectStats:{background:'#fff',padding:'1.5rem',borderRadius:'12px',marginBottom:'2rem',boxShadow:'0 2px 8px rgba(0,0,0,0.08)'},
  subjectGrid:{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))',gap:'1rem'},
  subjectCard:{background:'#f7fafc',padding:'1rem',borderRadius:'10px',border:'1px solid #e2e8f0'},
  subjectName:{margin:'0 0 0.75rem',color:'#2d3748',fontSize:'0.95rem'},
  progressBar:{height:'8px',background:'#e2e8f0',borderRadius:'999px',overflow:'hidden',marginBottom:'0.5rem'},
  progressFill:{height:'100%',borderRadius:'999px',transition:'width 0.3s ease'},
  subjectMeta:{display:'flex',justifyContent:'space-between',fontSize:'0.85rem',marginBottom:'0.5rem'},
  subjectBadges:{display:'flex',gap:'0.4rem'},
  badge:{padding:'0.2rem 0.6rem',borderRadius:'999px',color:'#fff',fontSize:'0.75rem',fontWeight:'600'},
  table:{width:'100%',borderCollapse:'collapse',background:'#fff',borderRadius:'10px',overflow:'hidden',boxShadow:'0 2px 8px rgba(0,0,0,0.08)'},
  th:{background:'#2d3748',color:'#fff',padding:'0.75rem 1rem',textAlign:'left',fontSize:'0.85rem'},
  td:{padding:'0.75rem 1rem',borderBottom:'1px solid #e2e8f0',fontSize:'0.85rem'},
  emptyState:{background:'#fff',padding:'3rem',textAlign:'center',borderRadius:'12px',color:'#718096',fontSize:'1.1rem'},
};
