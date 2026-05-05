let currentStudentName = '';

async function init() {
  const user = await window.auth.getCurrentUser();
  if (!user || user.role !== 'student') {
    window.location.href = 'login.html';
    return;
  }

  // Fetch full name from student table
  const { data: sData } = await window.supabaseClient
    .from('student').select('studentname').eq('studentid', user.id).single();
  currentStudentName = sData?.studentname || user.email;

  await loadEvaluations(user.id);
}

async function loadEvaluations(studentId) {
  const container = document.getElementById('evalSections');
  try {
    // 1. Get all enrollments for this student (with groupid)
    const { data: enrollments, error: eErr } = await window.supabaseClient
      .from('enrollment')
      .select('courseid, groupid')
      .eq('studentid', studentId)
      .not('groupid', 'is', null);
    if (eErr) throw eErr;

    if (!enrollments || enrollments.length === 0) {
      container.innerHTML = '<p class="cs-hint" style="text-align:center;padding:40px;">You are not enrolled in any courses with groups yet.</p>';
      return;
    }

    // 2. For each enrollment, load schedules + groupmates + completion
    const sections = await Promise.all(enrollments.map(async (enr, enrIdx) => {
      // Course name
      const { data: courseData } = await window.supabaseClient
        .from('course').select('coursecode').eq('courseid', enr.courseid).single();
      const courseName = courseData?.coursecode || `Course ${enr.courseid}`;

      // Group name
      const { data: groupData } = await window.supabaseClient
        .from('grouptable').select('groupname').eq('groupid', enr.groupid).single();
      const groupName = groupData?.groupname || `Group ${enr.groupid}`;

      // Schedules for this course+group
      const { data: schedules } = await window.supabaseClient
        .from('evaluationschedule')
        .select('scheduleid, opens_at, due_at')
        .eq('courseid', enr.courseid)
        .eq('groupid', enr.groupid)
        .order('scheduleid');

      // All schedules for this course (for numbering)
      const { data: allCourseSchedules } = await window.supabaseClient
        .from('evaluationschedule')
        .select('scheduleid')
        .eq('courseid', enr.courseid)
        .order('scheduleid');
      const scheduleIndex = (allCourseSchedules || []).map(s => s.scheduleid);

      // Groupmates (same course + group, different student)
      const { data: groupmates } = await window.supabaseClient
        .from('enrollment')
        .select('studentid, student(studentid, studentname)')
        .eq('courseid', enr.courseid)
        .eq('groupid', enr.groupid)
        .neq('studentid', studentId);

      // Already-submitted evaluations by this student
      const { data: submitted } = await window.supabaseClient
        .from('peerevaluation')
        .select('evaluateestudentid, scheduleid')
        .eq('evaluatorstudentid', studentId);
      const submittedSet = new Set((submitted || []).map(s => `${s.scheduleid}:${s.evaluateestudentid}`));

      return { courseName, groupName, schedules: schedules || [], groupmates: groupmates || [], submittedSet, scheduleIndex };
    }));

    // 3. Render
    container.innerHTML = '';
    const now = new Date();

    sections.forEach(sec => {
      const section = document.createElement('div');
      section.className = 'sd-course-section';

      const header = document.createElement('div');
      header.className = 'sd-course-header';
      header.innerHTML = `<h2 class="sd-course-title">${escHtml(sec.courseName)}</h2><span class="sd-group-badge">${escHtml(sec.groupName)}</span>`;
      section.appendChild(header);

      if (sec.schedules.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'cs-hint';
        empty.textContent = 'No evaluations scheduled yet.';
        section.appendChild(empty);
        container.appendChild(section);
        return;
      }

      const grid = document.createElement('div');
      grid.className = 'sd-eval-grid';

      sec.schedules.forEach(sched => {
        const evalNum = sec.scheduleIndex.indexOf(sched.scheduleid) + 1;
        const opens   = new Date(sched.opens_at);
        const due     = new Date(sched.due_at);
        const isActive   = now >= opens && now <= due;
        const isUpcoming = now < opens;
        const isClosed   = now > due;

        // Count how many groupmates this student has evaluated for this schedule
        const doneCount = sec.groupmates.filter(gm =>
          gm.student && sec.submittedSet.has(`${sched.scheduleid}:${gm.student.studentid}`)
        ).length;
        const totalCount = sec.groupmates.length;
        const allDone = doneCount === totalCount && totalCount > 0;

        let statusLabel = isUpcoming ? 'Upcoming' : isClosed ? 'Closed' : 'Open';
        let statusClass = isUpcoming ? 'sd-badge-upcoming' : isClosed ? 'sd-badge-closed' : 'sd-badge-open';

        const card = document.createElement('div');
        card.className = `sd-eval-card ${allDone ? 'sd-eval-done' : ''} ${isClosed ? 'sd-eval-closed' : ''}`;

        let matesHtml = '';
        if (sec.groupmates.length === 0) {
          matesHtml = '<p class="cs-hint" style="font-size:13px;">No groupmates found.</p>';
        } else {
          sec.groupmates.forEach(gm => {
            if (!gm.student) return;
            const done = sec.submittedSet.has(`${sched.scheduleid}:${gm.student.studentid}`);
            if (done) {
              matesHtml += `
                <div class="sd-mate-row sd-mate-done">
                  <span class="sd-mate-name">${escHtml(gm.student.studentname)}</span>
                  <span class="sd-mate-status sd-completed-badge">Completed ✓</span>
                </div>`;
            } else if (isActive) {
              const params = new URLSearchParams({
                from:               currentStudentName,
                to:                 gm.student.studentname,
                scheduleId:         sched.scheduleid,
                evaluatorStudentId: studentId,
                evaluateeStudentId: gm.student.studentid,
              });
              matesHtml += `
                <div class="sd-mate-row">
                  <span class="sd-mate-name">${escHtml(gm.student.studentname)}</span>
                  <a href="index.html?${params.toString()}" class="sd-eval-btn">Evaluate →</a>
                </div>`;
            } else {
              matesHtml += `
                <div class="sd-mate-row">
                  <span class="sd-mate-name">${escHtml(gm.student.studentname)}</span>
                  <span class="sd-mate-status sd-pending-badge">${isUpcoming ? 'Not Open Yet' : 'Not Submitted'}</span>
                </div>`;
            }
          });
        }

        card.innerHTML = `
          <div class="sd-card-header">
            <div>
              <div class="sd-eval-title">Peer Evaluation #${evalNum}</div>
              <div class="sd-eval-dates">
                Opens: ${fmtDate(opens)}<br>Due: ${fmtDate(due)}
              </div>
            </div>
            <div class="sd-card-badges">
              <span class="sd-status-badge ${statusClass}">${statusLabel}</span>
              ${allDone ? '<span class="sd-status-badge sd-badge-done">All Done ✓</span>' : `<span class="sd-progress-text">${doneCount}/${totalCount}</span>`}
            </div>
          </div>
          <div class="sd-mates-list">${matesHtml}</div>
        `;
        grid.appendChild(card);
      });

      section.appendChild(grid);
      container.appendChild(section);
    });
  } catch (e) {
    console.error(e);
    container.innerHTML = `<p class="cs-hint" style="text-align:center;padding:40px;color:#b91c1c;">Error loading evaluations: ${e.message}</p>`;
  }
}

function fmtDate(d) {
  return d.toLocaleString('en-SG', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;'); }

document.addEventListener('DOMContentLoaded', init);
