const MS_PER_DAY = 1000 * 60 * 60 * 24;

async function init() {
  const user = await window.auth.getCurrentUser();
  if (!user || user.role !== 'student') {
    window.location.href = 'login.html';
    return;
  }
  await loadTasks(user.id);
}

async function loadTasks(studentId) {
  const list = document.getElementById('taskList');
  const countEl = document.getElementById('taskCount');

  try {
    const { data: enrollments, error } = await window.supabaseClient
      .from('enrollment')
      .select('courseid, groupid')
      .eq('studentid', studentId)
      .not('groupid', 'is', null);
    if (error) throw error;

    if (!enrollments || enrollments.length === 0) {
      list.innerHTML = allDoneHTML();
      return;
    }

    const { data: submitted } = await window.supabaseClient
      .from('peerevaluation')
      .select('evaluateestudentid, scheduleid')
      .eq('evaluatorstudentid', studentId);
    const submittedSet = new Set(
      (submitted || []).map(s => `${s.scheduleid}:${s.evaluateestudentid}`)
    );

    const now = new Date();

    // Fetch schedules, course name, and groupmates for all enrollments in parallel
    const perEnrollment = await Promise.all(enrollments.map(async enr => {
      const [{ data: schedules }, { data: courseData }, { data: groupmates }] = await Promise.all([
        window.supabaseClient
          .from('evaluationschedule')
          .select('scheduleid, opens_at, due_at')
          .eq('courseid', enr.courseid)
          .eq('groupid', enr.groupid)
          .order('scheduleid'),
        window.supabaseClient
          .from('course')
          .select('coursecode')
          .eq('courseid', enr.courseid)
          .single(),
        window.supabaseClient
          .from('enrollment')
          .select('studentid, student(studentid, studentname)')
          .eq('courseid', enr.courseid)
          .eq('groupid', enr.groupid)
          .neq('studentid', studentId),
      ]);

      const courseName = courseData?.coursecode || `Course ${enr.courseid}`;
      const schedList  = schedules || [];
      const mates      = (groupmates || []).filter(m => m.student);

      const tasks = [];
      schedList.forEach((sched, idx) => {
        const opens = new Date(sched.opens_at);
        const due   = new Date(sched.due_at);
        if (now < opens || now > due) return; // only active windows

        const evalNum = idx + 1;
        mates.forEach(m => {
          if (!submittedSet.has(`${sched.scheduleid}:${m.student.studentid}`)) {
            tasks.push({
              courseName,
              evalNum,
              due,
              studentName: m.student.studentname,
              studentId:   m.student.studentid,
              scheduleId:  sched.scheduleid,
              evaluatorId: studentId,
            });
          }
        });
      });

      return tasks;
    }));

    const tasks = perEnrollment.flat().sort((a, b) => a.due - b.due);

    if (tasks.length === 0) {
      countEl.textContent = '';
      list.innerHTML = allDoneHTML();
      return;
    }

    countEl.textContent = `${tasks.length} pending`;
    list.innerHTML = tasks.map(t => taskHTML(t, now)).join('');

  } catch (e) {
    console.error(e);
    list.innerHTML = '<p class="shome-hint">Error loading tasks.</p>';
  }
}

function taskHTML(t, now) {
  const msLeft   = t.due - now;
  const daysLeft = msLeft / MS_PER_DAY;

  let urgencyClass, urgencyLabel;
  if (daysLeft < 1) {
    urgencyClass = 'task-card--urgent';
    urgencyLabel = 'Due today';
  } else if (daysLeft < 3) {
    urgencyClass = 'task-card--warning';
    urgencyLabel = `Due in ${Math.ceil(daysLeft)} day${Math.ceil(daysLeft) === 1 ? '' : 's'}`;
  } else {
    urgencyClass = '';
    urgencyLabel = `Due ${fmtDate(t.due)}`;
  }

  const href = `index.html?scheduleId=${t.scheduleId}`
             + `&evaluatorStudentId=${t.evaluatorId}`
             + `&evaluateeStudentId=${t.studentId}`;

  return `
    <div class="task-card ${urgencyClass}">
      <div class="task-dot"></div>
      <div class="task-body">
        <div class="task-title">Evaluate <strong>${esc(t.studentName)}</strong></div>
        <div class="task-meta">${esc(t.courseName)} &middot; Peer Evaluation #${t.evalNum}</div>
        <div class="task-due">${urgencyLabel}</div>
      </div>
      <a href="${href}" class="task-btn">Start &rarr;</a>
    </div>`;
}

function allDoneHTML() {
  return `
    <div class="tasks-all-done">
      <div class="tasks-all-done-icon">✓</div>
      <div class="tasks-all-done-text">All caught up!</div>
      <div class="tasks-all-done-sub">No pending evaluations right now.</div>
    </div>`;
}

function fmtDate(d) {
  return d.toLocaleString('en-SG', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
}

document.addEventListener('DOMContentLoaded', init);
