import React, { useState, useEffect } from 'react';
import API from '../api';

const categoryLabels = {
  MAJOR: 'Discipline Specific Course (DSC)',
  MIC:   'Minor Course / Vocational',
  MDC:   'Multidisciplinary Course',
  SEC:   'Skill Enhancement Course',
  VAC:   'Value Added Course',
  AEC:   'Ability Enhancement Course',
};

const categoryColors = {
  MAJOR:'#4c51bf', MIC:'#057a55', MDC:'#dd6b20',
  SEC:'#e53e3e', VAC:'#d69e2e', AEC:'#805ad5'
};

const categoryRules = {
  MIC: '⚠️ Select exactly 1 subject. Must be from a different discipline than your MAJOR.',
  VAC: '⚠️ Select exactly 1 subject.',
  AEC: '⚠️ Select exactly 1 subject.',
  MDC: '⚠️ Select 1 group only. For 3-credit: select 1 subject. For 2-credit: select both Theory(T) + Practical(P) together. Must be from a different discipline than your MAJOR.',
  SEC: '⚠️ Select 1 group only. For 3-credit: select 1 subject. For 2-credit: select both Theory(T) + Practical(P) together. No discipline restriction.',
  MAJOR: 'Select your programme subjects.',
};

export default function StudentEnrollment({ student, onBack }) {
  const [subjects, setSubjects] = useState([]);
  const [enrollments, setEnrollments] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState('success');
  const [validationErrors, setValidationErrors] = useState([]);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [subRes, enrollRes] = await Promise.all([
        API.get(`/enrollment/subjects/${student.student_id}`),
        API.get(`/enrollment/status/${student.student_id}`)
      ]);
      setSubjects(subRes.data);
      const hasSubmitted = enrollRes.data.some(e => e.status !== 'PENDING');
      setSubmitted(hasSubmitted);
      const enrollState = {};
      subRes.data.forEach(s => {
        enrollState[s.subject_id] = {
          status: s.enrollment_status || 'PENDING',
          is_major: s.is_major || false,
          remarks: s.remarks || '',
          category: s.category,
          discipline_id: s.discipline_id,
          credits: s.credits,
          subject_code: s.subject_code,
          pair_code: s.pair_code,
          pair_type: s.pair_type,
        };
      });
      setEnrollments(enrollState);
    } catch(e) { showMsg('Failed to load subjects', 'error'); }
    finally { setLoading(false); }
  };

  const showMsg = (text, type='success') => {
    setMsg(text); setMsgType(type);
    setTimeout(() => setMsg(''), 6000);
  };

  // Get base code (strip last T or P)
  const getBaseCode = (code) => {
    const c = code.trim();
    const last = c.slice(-1).toUpperCase();
    return ['T','P'].includes(last) ? c.slice(0,-1) : c;
  };

  // Handle accept/reject with auto-pairing for MDC/SEC T+P
  const handleDecision = (subject_id, newStatus) => {
    if (submitted) return;
    const sub = subjects.find(s => s.subject_id === subject_id);
    if (!sub) return;

    setEnrollments(prev => {
      const updated = { ...prev, [subject_id]: { ...prev[subject_id], status: newStatus } };

      // Auto-pair logic for MDC and SEC 2-credit T+P subjects
      if (['MDC','SEC','MAJOR'].includes(sub.category) && sub.pair_code) {
        const pairSubject = subjects.find(s => s.subject_code.trim() === sub.pair_code.trim());
        if (pairSubject) {
          updated[pairSubject.subject_id] = { ...prev[pairSubject.subject_id], status: newStatus };
        }
      }

      // For MIC/VAC/AEC: auto-reject others in same category when one is accepted
      if (['MIC','VAC','AEC'].includes(sub.category) && newStatus === 'ACCEPTED') {
        subjects.forEach(s => {
          if (s.subject_id !== subject_id && s.category === sub.category) {
            updated[s.subject_id] = { ...prev[s.subject_id], status: 'REJECTED' };
          }
        });
      }

      // For MDC/SEC: auto-reject other groups when one group is accepted
      if (['MDC','SEC'].includes(sub.category) && newStatus === 'ACCEPTED') {
        const selectedBase = getBaseCode(sub.subject_code);
        subjects.forEach(s => {
          if (s.category === sub.category && getBaseCode(s.subject_code) !== selectedBase) {
            updated[s.subject_id] = { ...prev[s.subject_id], status: 'REJECTED' };
          }
        });
      }

      // Auto-reject unselected MAJOR subjects when total credits reach 12
      if (sub.category === 'MAJOR') {
        const getB = (code) => { const c=code.trim(); const l=c.slice(-1).toUpperCase(); return ['T','P'].includes(l)?c.slice(0,-1):c; };
        const accMajors = subjects.filter(s => 
          s.category === 'MAJOR' && updated[s.subject_id]?.status === 'ACCEPTED'
        );
        const totalMajCr = accMajors.reduce((sum, s) => sum + (s.credits || 0), 0);
        const accBases = new Set(accMajors.map(s => getB(s.subject_code)));
        if (totalMajCr >= 12) {
          subjects.forEach(s => {
            if (s.category === 'MAJOR' && updated[s.subject_id]?.status === 'PENDING') {
              if (!accBases.has(getB(s.subject_code))) {
                updated[s.subject_id] = { ...updated[s.subject_id], status: 'REJECTED' };
              }
            }
          });
        }
      }
      return updated;
    });

    // Re-run validation live to clear resolved errors
    setTimeout(() => {
      setEnrollments(prev => {
        const accepted = Object.entries(prev)
          .filter(([,e]) => e.status === 'ACCEPTED')
          .map(([id]) => subjects.find(s => s.subject_id === parseInt(id)))
          .filter(Boolean);

        const byCategory = {};
        accepted.forEach(s => {
          if (!byCategory[s.category]) byCategory[s.category] = [];
          byCategory[s.category].push(s);
        });

        const majorDisciplines = (byCategory['MAJOR']||[]).map(s => s.discipline_id).filter(Boolean);
        const errors = [];

        const mic = byCategory['MIC']||[];
        if (mic.length === 0) errors.push('❌ MIC: Must select exactly 1 subject');
        else if (mic.length > 1) errors.push(`❌ MIC: Select only 1 subject (you selected ${mic.length})`);
        else if (majorDisciplines.includes(mic[0].discipline_id)) errors.push(`❌ MIC: "${mic[0].subject_name}" conflicts with your MAJOR discipline`);

        const vac = byCategory['VAC']||[];
        if (vac.length === 0) errors.push('❌ VAC: Must select exactly 1 subject');
        else if (vac.length > 1) errors.push(`❌ VAC: Select only 1 subject (you selected ${vac.length})`);

        const aec = byCategory['AEC']||[];
        if (aec.length > 1) errors.push(`❌ AEC: Select only 1 subject (you selected ${aec.length})`);

        const getBase = (code) => { const c=code.trim(); const l=c.slice(-1).toUpperCase(); return ['T','P'].includes(l)?c.slice(0,-1):c; };

        const mdc = byCategory['MDC']||[];
        if (mdc.length > 0) {
          mdc.forEach(s => {
            if (majorDisciplines.includes(s.discipline_id))
              errors.push(`❌ MDC: "${s.subject_name}" conflicts with your MAJOR discipline`);
          });
          const mdcGroups = {};
          mdc.forEach(s => { const b=getBase(s.subject_code); if(!mdcGroups[b]) mdcGroups[b]=[]; mdcGroups[b].push(s); });
          if (Object.keys(mdcGroups).length > 1) errors.push('❌ MDC: Select subjects from only ONE group');
        }

        const sec = byCategory['SEC']||[];
        if (sec.length > 0) {
          const secGroups = {};
          sec.forEach(s => { const b=getBase(s.subject_code); if(!secGroups[b]) secGroups[b]=[]; secGroups[b].push(s); });
          if (Object.keys(secGroups).length > 1) errors.push('❌ SEC: Select subjects from only ONE group');
        }

        const pending = Object.values(prev).filter(e => e.status === 'PENDING');
        if (pending.length > 0) errors.push(`❌ ${pending.length} subject(s) still pending`);

        setValidationErrors(errors);
        return prev;
      });
    }, 0);
  };

  // Frontend validation before submit
  const validateEnrollments = () => {
    const errors = [];
    const accepted = subjects.filter(s => enrollments[s.subject_id]?.status === 'ACCEPTED');
    const byCategory = {};
    accepted.forEach(s => {
      if (!byCategory[s.category]) byCategory[s.category] = [];
      byCategory[s.category].push(s);
    });

    const majorDisciplines = (byCategory['MAJOR']||[]).map(s => s.discipline_id).filter(Boolean);

    // MAJOR: total credits must be exactly 12
    const major = byCategory['MAJOR']||[];
    const getMBase = (code) => { const c=code.trim(); const l=c.slice(-1).toUpperCase(); return ['T','P'].includes(l)?c.slice(0,-1):c; };
    const majorTotalCredits = major.reduce((sum, s) => sum + (s.credits || 0), 0);
    if (majorTotalCredits === 0) errors.push('MAJOR: Must select subjects with total 12 credits (selected 0)');
    else if (majorTotalCredits < 12) errors.push('MAJOR: Total credits must be 12 (currently ' + majorTotalCredits + ' credits selected)');
    else if (majorTotalCredits > 12) errors.push('MAJOR: Total credits must be 12 (currently ' + majorTotalCredits + ' credits selected — too many)');
    // Check T+P pairing
    const mGroups = {};
    major.forEach(s => { const b=getMBase(s.subject_code); if(!mGroups[b]) mGroups[b]=[]; mGroups[b].push(s); });
    Object.entries(mGroups).forEach(([base, group]) => {
      const hasT = group.some(s => s.subject_code.trim().toUpperCase().endsWith('T'));
      const hasP = group.some(s => s.subject_code.trim().toUpperCase().endsWith('P'));
      const is3Credit = group.some(s => s.credits === 3);
      if (is3Credit && hasT && !hasP) errors.push('MAJOR: Select Practical companion for ' + base + 'T');
      if (is3Credit && hasP && !hasT) errors.push('MAJOR: Select Theory companion for ' + base + 'P');
    });

    // MIC
    const mic = byCategory['MIC']||[];
    if (mic.length === 0) errors.push('❌ MIC: Must select exactly 1 subject');
    else if (mic.length > 1) errors.push(`❌ MIC: Select only 1 subject (you selected ${mic.length})`);
    else if (majorDisciplines.includes(mic[0].discipline_id)) errors.push(`❌ MIC: "${mic[0].subject_name}" conflicts with your MAJOR discipline`);

    // VAC
    const vac = byCategory['VAC']||[];
    if (vac.length === 0) errors.push('❌ VAC: Must select exactly 1 subject');
    else if (vac.length > 1) errors.push(`❌ VAC: Select only 1 subject (you selected ${vac.length})`);

    // AEC
    const aec = byCategory['AEC']||[];
    if (aec.length > 1) errors.push(`❌ AEC: Select only 1 subject (you selected ${aec.length})`);

    // MDC
    const mdc = byCategory['MDC']||[];
    if (mdc.length === 0) errors.push('❌ MDC: Must select at least 1 subject');
    else {
      mdc.forEach(s => {
        if (majorDisciplines.includes(s.discipline_id))
          errors.push(`❌ MDC: "${s.subject_name}" conflicts with your MAJOR discipline`);
      });
      const mdcGroups = {};
      mdc.forEach(s => { const b = getBaseCode(s.subject_code); if(!mdcGroups[b]) mdcGroups[b]=[]; mdcGroups[b].push(s); });
      if (Object.keys(mdcGroups).length > 1) errors.push('❌ MDC: Select subjects from only ONE group');
      Object.entries(mdcGroups).forEach(([base, group]) => {
        const hasT = group.some(s => s.subject_code.trim().toUpperCase().endsWith('T'));
        const hasP = group.some(s => s.subject_code.trim().toUpperCase().endsWith('P'));
        const is2Credit = group.some(s => s.credits <= 2);
        if (is2Credit && hasT && !hasP) errors.push('❌ MDC: You selected Theory(T) - must also select the Practical(P) companion');
        if (is2Credit && hasP && !hasT) errors.push('❌ MDC: You selected Practical(P) - must also select the Theory(T) companion');
      });
    }

    // SEC
    const sec = byCategory['SEC']||[];
    if (sec.length > 0) {
      const secGroups = {};
      sec.forEach(s => { const b = getBaseCode(s.subject_code); if(!secGroups[b]) secGroups[b]=[]; secGroups[b].push(s); });
      if (Object.keys(secGroups).length > 1) errors.push('❌ SEC: Select subjects from only ONE group');
      Object.entries(secGroups).forEach(([base, group]) => {
        const hasT = group.some(s => s.subject_code.trim().toUpperCase().endsWith('T'));
        const hasP = group.some(s => s.subject_code.trim().toUpperCase().endsWith('P'));
        const is2Credit = group.some(s => s.credits <= 2);
        if (is2Credit && hasT && !hasP) errors.push('❌ SEC: You selected Theory(T) - must also select the Practical(P) companion');
        if (is2Credit && hasP && !hasT) errors.push('❌ SEC: You selected Practical(P) - must also select the Theory(T) companion');
      });
    }

    // All subjects must have a decision
    const pending = subjects.filter(s => enrollments[s.subject_id]?.status === 'PENDING');
    if (pending.length > 0) errors.push(`❌ ${pending.length} subject(s) still pending — please Accept or Raise Error for all`);

    return errors;
  };

  const handleSubmit = async () => {
    const errors = validateEnrollments();
    if (errors.length > 0) { setValidationErrors(errors); return; }

    if (!window.confirm('Are you sure? This action cannot be undone. Contact admin to reset.')) return;
    setSubmitting(true);
    try {
      const payload = subjects.map(s => ({
        subject_id: s.subject_id,
        status: enrollments[s.subject_id]?.status || 'PENDING',
        is_major: enrollments[s.subject_id]?.is_major || false,
        remarks: enrollments[s.subject_id]?.remarks || '',
      }));
      await API.post(`/enrollment/submit/${student.student_id}`, { enrollments: payload });
      showMsg('✅ Enrollment submitted successfully!', 'success');
      setSubmitted(true); setValidationErrors([]);
      fetchData();
    } catch(err) {
      const errMsg = err.response?.data?.error || 'Failed to submit';
      setValidationErrors(errMsg.split('\n'));
    } finally { setSubmitting(false); }
  };

  // Group by category
  const grouped = {};
  subjects.forEach(s => {
    if (!grouped[s.category]) grouped[s.category] = [];
    grouped[s.category].push(s);
  });

  // Count accepted per category
  const countAccepted = (cat) => subjects.filter(s => s.category===cat && enrollments[s.subject_id]?.status==='ACCEPTED').length;

  const totalSubjects = subjects.length;
  const acceptedCount = Object.values(enrollments).filter(e => e.status==='ACCEPTED').length;
  const rejectedCount = Object.values(enrollments).filter(e => e.status==='REJECTED').length;
  const pendingCount = Object.values(enrollments).filter(e => e.status==='PENDING').length;

  if (loading) return <div style={s.loading}>⏳ Loading your subjects...</div>;

  return (
    <div style={s.container}>
      {/* Header */}
      <div style={s.header}>
        <button style={s.backBtn} onClick={onBack}>← Back</button>
        <div>
          <h2 style={s.headerTitle}>📋 Subject Enrollment</h2>
          <p style={s.headerSub}>{student.name} | {student.roll_no} | Semester {student.semester}</p>
        </div>
      </div>

      {msg && <div style={{...s.msg, background:msgType==='error'?'#fff5f5':'#c6f6d5', color:msgType==='error'?'#c53030':'#276749'}}>{msg}</div>}

      {submitted ? (
        <div style={s.submittedBanner}>✅ <strong>Enrollment Submitted!</strong> Contact admin if you need changes.</div>
      ) : (
        <div style={s.infoBanner}>ℹ️ <strong>One-time action.</strong> Review all subjects carefully before submitting.</div>
      )}

      {/* Progress */}
      <div style={s.summaryBar}>
        {[{l:'Total',v:totalSubjects,bg:'#ebf8ff'},{l:'Accepted',v:acceptedCount,bg:'#f0fff4',c:'#276749'},{l:'Error Raised',v:rejectedCount,bg:'#fff5f5',c:'#c53030'},{l:'Pending',v:pendingCount,bg:'#fffbeb',c:'#92400e'}].map(item=>(
          <div key={item.l} style={{...s.summaryItem, background:item.bg}}>
            <span style={{...s.summaryNum, color:item.c||'#2d3748'}}>{item.v}</span>
            <span style={s.summaryLabel}>{item.l}</span>
          </div>
        ))}
      </div>



      {/* Subject Categories */}
      {Object.keys(categoryLabels).filter(cat => grouped[cat]).map(category => (
        <div key={category} style={s.categoryBlock}>
          {/* Category Header */}
          <div style={{...s.categoryHeader, background: categoryColors[category]||'#667eea'}}>
            <div>
              <span style={s.catTitle}>{categoryLabels[category]}</span>
              <span style={s.catCount}>{grouped[category].length} subjects</span>
            </div>
            <div style={s.catStatus}>
              {!submitted && <span style={s.catRule}>{categoryRules[category]}</span>}
              <span style={{...s.catAccepted, background: countAccepted(category)>0?'rgba(255,255,255,0.3)':'rgba(0,0,0,0.2)'}}>
                ✅ {countAccepted(category)} accepted
              </span>
            </div>
          </div>

          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Course Code</th>
                <th style={s.th}>Paper Name</th>
                <th style={s.th}>Discipline</th>
                <th style={s.th}>Credits</th>
                <th style={s.th}>Int.</th>
                <th style={s.th}>End Term</th>
                <th style={s.th}>Total</th>
                {category === 'MAJOR' && <th style={s.th}>Mark Major</th>}
                <th style={s.th}>Decision</th>
                <th style={s.th}>Remarks</th>
              </tr>
            </thead>
            <tbody>
              {grouped[category].map(sub => {
                const enroll = enrollments[sub.subject_id] || {};
                const status = enroll.status || 'PENDING';
                const isPaired = sub.pair_code !== null;
                const rowBg = status==='ACCEPTED'?'#f0fff4':status==='REJECTED'?'#fff5f5':'#fff';

                return (
                  <tr key={sub.subject_id} style={{background: rowBg, transition:'background 0.2s'}}>
                    <td style={{...s.td, fontFamily:'monospace', fontWeight:'600', fontSize:'0.8rem'}}>
                      {sub.subject_code}
                      {isPaired && <span style={s.pairTag}>{sub.pair_type==='THEORY'?'📚T':'🔬P'}</span>}
                    </td>
                    <td style={s.td}>
                      {sub.subject_name}
                      {isPaired && <div style={s.pairHint}>🔗 Paired with {sub.pair_code} — selecting one auto-selects the other</div>}
                    </td>
                    <td style={s.td}>
                      {sub.discipline_name
                        ? <span style={s.discBadge}>{sub.discipline_name}</span>
                        : <span style={{color:'#a0aec0', fontSize:'0.75rem'}}>-</span>}
                    </td>
                    <td style={{...s.td, textAlign:'center'}}>{sub.credits}</td>
                    <td style={{...s.td, textAlign:'center'}}>{sub.internal_marks||'-'}</td>
                    <td style={{...s.td, textAlign:'center'}}>{sub.end_term_marks||'-'}</td>
                    <td style={{...s.td, textAlign:'center', fontWeight:'700'}}>{sub.total_marks||'-'}</td>
                    {category === 'MAJOR' && (
                      <td style={{...s.td, textAlign:'center'}}>
                        <input type="checkbox" checked={enroll.is_major||false}
                          onChange={e => !submitted && setEnrollments(prev=>({...prev,[sub.subject_id]:{...prev[sub.subject_id],is_major:e.target.checked}}))}
                          disabled={submitted || status!=='ACCEPTED'}
                          style={{width:'18px',height:'18px',cursor:'pointer'}} />
                      </td>
                    )}
                    <td style={{...s.td, textAlign:'center'}}>
                      {submitted ? (
                        <span style={{...s.statusBadge, background:status==='ACCEPTED'?'#48bb78':status==='REJECTED'?'#e53e3e':'#ed8936'}}>
                          {status==='ACCEPTED'?'✅ Accepted':status==='REJECTED'?'❌ Error':'⏳ Pending'}
                        </span>
                      ) : (
                        <div style={s.btnGroup}>
                          <button style={{...s.acceptBtn, opacity:status==='ACCEPTED'?1:0.4, transform:status==='ACCEPTED'?'scale(1.05)':'scale(1)'}}
                            onClick={()=>handleDecision(sub.subject_id,'ACCEPTED')}>✅ Accept</button>
                          <button style={{...s.rejectBtn, opacity:status==='REJECTED'?1:0.4, transform:status==='REJECTED'?'scale(1.05)':'scale(1)'}}
                            onClick={()=>handleDecision(sub.subject_id,'REJECTED')}>❌ Error</button>
                        </div>
                      )}
                    </td>
                    <td style={s.td}>
                      {submitted ? (
                        <span style={{color:'#718096',fontSize:'0.82rem'}}>{enroll.remarks||'-'}</span>
                      ) : (
                        <input style={{...s.remarksInput, opacity:status==='REJECTED'?1:0.4}}
                          placeholder="Describe error..."
                          value={enroll.remarks||''}
                          onChange={e=>setEnrollments(prev=>({...prev,[sub.subject_id]:{...prev[sub.subject_id],remarks:e.target.value}}))}
                          disabled={status!=='REJECTED'} />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}

      {/* Submit */}
      {!submitted && subjects.length > 0 && (
        <div style={s.submitWrapper}>
          {validationErrors.length > 0 && (
            <div style={s.validationBox}>
              <h4 style={{margin:'0 0 0.5rem', color:'#c53030'}}>⚠️ Please fix these issues before submitting:</h4>
              {validationErrors.map((err,i) => <p key={i} style={s.validationErr}>{err}</p>)}
            </div>
          )}
          <div style={s.submitSection}>
            <div>
              <p style={{margin:'0 0 0.25rem', fontWeight:'600', color:'#2d3748'}}>⚠️ Once submitted, you cannot change your enrollment.</p>
              <p style={{margin:0, color:'#718096', fontSize:'0.9rem'}}>Pending: <strong style={{color:pendingCount>0?'#c53030':'#276749'}}>{pendingCount} subjects</strong></p>
            </div>
            <button style={{...s.submitBtn, opacity:submitting?0.6:1}} onClick={handleSubmit} disabled={submitting}>
              {submitting?'⏳ Submitting...':'🚀 Submit Enrollment'}
            </button>
          </div>
        </div>
      )}

      {subjects.length === 0 && (
        <div style={s.emptyState}>📭 No subjects found for your programme. Contact admin.</div>
      )}
    </div>
  );
}

const s = {
  container: { minHeight:'100vh', background:'#f0f4f8', padding:'1.5rem' },
  loading: { padding:'3rem', textAlign:'center', fontSize:'1.2rem', color:'#718096' },
  header: { display:'flex', alignItems:'center', gap:'1rem', marginBottom:'1.5rem', background:'#fff', padding:'1rem 1.5rem', borderRadius:'12px', boxShadow:'0 2px 8px rgba(0,0,0,0.08)' },
  backBtn: { padding:'0.5rem 1rem', background:'#4c51bf', color:'#fff', border:'none', borderRadius:'6px', cursor:'pointer', fontWeight:'600' },
  headerTitle: { margin:0, color:'#2d3748' },
  headerSub: { margin:'0.25rem 0 0', color:'#718096', fontSize:'0.9rem' },
  msg: { padding:'0.75rem 1.5rem', borderRadius:'8px', marginBottom:'1rem', fontWeight:'600' },
  submittedBanner: { background:'#c6f6d5', color:'#276749', padding:'1rem 1.5rem', borderRadius:'8px', marginBottom:'1rem', fontWeight:'600' },
  infoBanner: { background:'#ebf8ff', color:'#2b6cb0', padding:'1rem 1.5rem', borderRadius:'8px', marginBottom:'1rem', border:'1px solid #90cdf4' },
  summaryBar: { display:'flex', gap:'1rem', marginBottom:'1.5rem', flexWrap:'wrap' },
  summaryItem: { flex:1, minWidth:'100px', padding:'1rem', borderRadius:'10px', textAlign:'center', display:'flex', flexDirection:'column', alignItems:'center' },
  summaryNum: { fontSize:'2rem', fontWeight:'700' },
  summaryLabel: { fontSize:'0.8rem', color:'#718096', marginTop:'0.25rem' },
  validationBox: { background:'#fff5f5', border:'2px solid #fc8181', borderRadius:'10px', padding:'1rem 1.5rem', marginBottom:'1.5rem' },
  validationErr: { margin:'0.2rem 0', color:'#c53030', fontSize:'0.9rem' },
  categoryBlock: { marginBottom:'2rem', borderRadius:'10px', overflow:'hidden', boxShadow:'0 2px 8px rgba(0,0,0,0.08)' },
  categoryHeader: { padding:'0.75rem 1.5rem', color:'#fff', display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:'0.5rem' },
  catTitle: { fontWeight:'700', fontSize:'1rem', marginRight:'1rem' },
  catCount: { background:'rgba(255,255,255,0.3)', padding:'0.15rem 0.6rem', borderRadius:'999px', fontSize:'0.82rem' },
  catStatus: { display:'flex', alignItems:'center', gap:'0.75rem', flexWrap:'wrap' },
  catRule: { fontSize:'0.78rem', opacity:0.9, maxWidth:'400px' },
  catAccepted: { padding:'0.2rem 0.75rem', borderRadius:'999px', fontSize:'0.82rem', fontWeight:'600' },
  table: { width:'100%', borderCollapse:'collapse', background:'#fff' },
  th: { background:'#4a5568', color:'#fff', padding:'0.65rem 0.75rem', textAlign:'left', fontSize:'0.78rem', fontWeight:'600', borderRight:'1px solid #718096' },
  td: { padding:'0.65rem 0.75rem', borderBottom:'1px solid #e2e8f0', fontSize:'0.82rem', verticalAlign:'middle', borderRight:'1px solid #f0f4f8' },
  pairTag: { marginLeft:'0.4rem', background:'#bee3f8', color:'#2b6cb0', padding:'0.1rem 0.4rem', borderRadius:'4px', fontSize:'0.7rem', fontWeight:'600' },
  pairHint: { color:'#2b6cb0', fontSize:'0.72rem', marginTop:'0.2rem', fontStyle:'italic' },
  discBadge: { background:'#ebf8ff', color:'#2b6cb0', padding:'0.15rem 0.5rem', borderRadius:'999px', fontSize:'0.75rem', fontWeight:'600' },
  btnGroup: { display:'flex', gap:'0.4rem', justifyContent:'center' },
  acceptBtn: { padding:'0.35rem 0.65rem', background:'#48bb78', color:'#fff', border:'none', borderRadius:'5px', cursor:'pointer', fontWeight:'600', fontSize:'0.78rem', transition:'all 0.15s' },
  rejectBtn: { padding:'0.35rem 0.65rem', background:'#e53e3e', color:'#fff', border:'none', borderRadius:'5px', cursor:'pointer', fontWeight:'600', fontSize:'0.78rem', transition:'all 0.15s' },
  statusBadge: { padding:'0.3rem 0.75rem', borderRadius:'999px', color:'#fff', fontSize:'0.78rem', fontWeight:'600' },
  remarksInput: { padding:'0.35rem 0.6rem', borderRadius:'5px', border:'1px solid #cbd5e0', fontSize:'0.78rem', width:'100%', boxSizing:'border-box' },
  submitSection: { background:'#fff', padding:'1.5rem', borderRadius:'12px', display:'flex', justifyContent:'space-between', alignItems:'center', boxShadow:'0 2px 8px rgba(0,0,0,0.08)', flexWrap:'wrap', gap:'1rem' },
  submitBtn: { padding:'1rem 3rem', background:'#4c51bf', color:'#fff', border:'none', borderRadius:'8px', cursor:'pointer', fontWeight:'700', fontSize:'1.1rem' },
  emptyState: { background:'#fff', padding:'3rem', textAlign:'center', borderRadius:'12px', color:'#718096', fontSize:'1.1rem' },
  submitWrapper: { marginTop:'1rem' },
};
