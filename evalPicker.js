async function init() {
  const user = await window.auth.getCurrentUser();
  if (!user || user.role !== 'student') {
    window.location.href = 'login.html';
    return;
  }
  await loadEvals(user.id);
}

async function loadEvals(studentId) {
  const list = document.getElementById('evalList');
  try {
    const { data: enrollments, error } = await window.supabaseClient
      .from('enrollment')
      .select('courseid, groupid')
      .eq('studentid', studentId)
      .not('groupid', 'is', null);
    if (error) throw error;

    if (!enrollments || enrollments.length === 0) {
      list.innerHTML = '<p class="shome-hint">You are not in any groups yet.</p>';
      return;
    }

    // Fetch schedules + already-submitted evals in parallel across all enrollments
    const [scheduleResults, { data: submitted }] = await Promise.all([
      Promise.all(enrollments.map(enr =>
        window.supabaseClient
          .from('evaluationschedule')
          .select('scheduleid, opens_at, due_at')
          .eq('courseid', enr.courseid)
          .eq('groupid', enr.groupid)
          .order('scheduleid')
          .then(({ data }) => ({ enr, schedules: data || [] }))
      )),
      window.supabaseClient
        .from('peerevaluation')
        .select('scheduleid, evaluateestudentid')
        .eq('evaluatorstudentid', studentId),
    ]);

    const submittedBySchedule = new Map();
    (submitted || []).forEach(s => {
      if (!submittedBySchedule.has(s.scheduleid)) submittedBySchedule.set(s.scheduleid, 0);
      submittedBySchedule.set(s.scheduleid, submittedBySchedule.get(s.scheduleid) + 1);
    });

    // Build a flat list of all schedules, numbered per course
    const cards = [];
    for (const { enr, schedules } of scheduleResults) {
      const { data: courseData } = await window.supabaseClient
        .from('course').select('coursecode').eq('courseid', enr.courseid).single();
      const courseName = courseData?.coursecode || `Course ${enr.courseid}`;

      // Count total groupmates to show progress
      const { data: groupmates } = await window.supabaseClient
        .from('enrollment')
        .select('studentid')
        .eq('courseid', enr.courseid)
        .eq('groupid', enr.groupid)
        .neq('studentid', studentId);
      const totalMates = (groupmates || []).length;

      schedules.forEach((sched, idx) => {
        const opens = new Date(sched.opens_at);
        const due   = new Date(sched.due_at);
        const now   = new Date();
        const isOpen     = now >= opens && now <= due;
        const isUpcoming = now < opens;
        const doneCount  = submittedBySchedule.get(sched.scheduleid) || 0;
        const allDone    = totalMates > 0 && doneCount >= totalMates;

        cards.push({
          scheduleid: sched.scheduleid,
          evalNum: idx + 1,
          courseName,
          opens,
          due,
          isOpen,
          isUpcoming,
          doneCount,
          totalMates,
          allDone,
          studentId,
        });
      });
    }

    if (cards.length === 0) {
      list.innerHTML = '<p class="shome-hint">No evaluations scheduled yet.</p>';
      return;
    }

    list.innerHTML = cards.map(c => {
      const statusLabel = c.isUpcoming ? 'Upcoming' : c.isOpen ? 'Open' : 'Closed';
      const statusClass = c.isUpcoming ? 'picker-badge--upcoming'
                        : c.isOpen     ? 'picker-badge--open'
                        :                'picker-badge--closed';
      const href = `index.html?scheduleId=${c.scheduleid}&evaluatorStudentId=${c.studentId}`;

      return `
        <div class="picker-card ${c.allDone ? 'picker-card--done' : ''} ${!c.isOpen ? 'picker-card--inactive' : ''}">
          <div class="picker-card-left">
            <div class="picker-eval-num">Peer Evaluation #${c.evalNum}</div>
            <div class="picker-course">${esc(c.courseName)}</div>
            <div class="picker-dates">
              Opens: ${fmt(c.opens)}<br>Due: ${fmt(c.due)}
            </div>
          </div>
          <div class="picker-card-right">
            <span class="picker-badge ${statusClass}">${statusLabel}</span>
            ${c.totalMates > 0
              ? `<span class="picker-progress">${c.doneCount}/${c.totalMates} done</span>`
              : ''}
            ${c.isOpen && !c.allDone
              ? `<a href="${href}" class="picker-btn">Start →</a>`
              : c.allDone
              ? `<span class="picker-done-label">All Done ✓</span>`
              : ''}
          </div>
        </div>`;
    }).join('');
  } catch (e) {
    console.error(e);
    list.innerHTML = '<p class="shome-hint">Error loading evaluations.</p>';
  }
}

function fmt(d) {
  return d.toLocaleString('en-SG', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
}

document.addEventListener('DOMContentLoaded', init);
