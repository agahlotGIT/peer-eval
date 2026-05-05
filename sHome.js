const MONTHS = ['January','February','March','April','May','June',
                 'July','August','September','October','November','December'];
const DAY_LABELS = ['SUN','MON','TUE','WED','THU','FRI','SAT'];

let calYear, calMonth;

async function init() {
  const user = await window.auth.getCurrentUser();
  if (!user || user.role !== 'student') {
    window.location.href = 'login.html';
    return;
  }
  initCalendar();
  await Promise.all([loadCourses(user.id), loadTodo(user.id)]);
}

function initCalendar() {
  const now = new Date();
  calYear = now.getFullYear();
  calMonth = now.getMonth();

  document.getElementById('calPrev').addEventListener('click', () => {
    calMonth--;
    if (calMonth < 0) { calMonth = 11; calYear--; }
    renderCalendar();
  });
  document.getElementById('calNext').addEventListener('click', () => {
    calMonth++;
    if (calMonth > 11) { calMonth = 0; calYear++; }
    renderCalendar();
  });

  renderCalendar();
}

function renderCalendar() {
  document.getElementById('calMonthLabel').textContent = `${MONTHS[calMonth]} ${calYear}`;

  const daysEl = document.getElementById('calDays');
  daysEl.innerHTML = DAY_LABELS.map(d => `<div class="shome-cal-day-label">${d}</div>`).join('');

  const grid = document.getElementById('calGrid');
  grid.innerHTML = '';

  const today = new Date();
  const firstDayOfWeek = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth   = new Date(calYear, calMonth + 1, 0).getDate();
  const prevMonthDays = new Date(calYear, calMonth, 0).getDate();

  for (let i = firstDayOfWeek - 1; i >= 0; i--) {
    addCell(grid, prevMonthDays - i, 'other-month');
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const isToday = d === today.getDate() &&
                    calMonth === today.getMonth() &&
                    calYear === today.getFullYear();
    addCell(grid, d, isToday ? 'today' : '');
  }
  const remainder = (7 - (grid.children.length % 7)) % 7;
  for (let d = 1; d <= remainder; d++) addCell(grid, d, 'other-month');
}

function addCell(grid, text, cls) {
  const cell = document.createElement('div');
  cell.className = 'shome-cal-cell' + (cls ? ' ' + cls : '');
  cell.textContent = text;
  grid.appendChild(cell);
}

async function loadCourses(studentId) {
  const container = document.getElementById('coursesList');
  try {
    const { data: enrollments, error } = await window.supabaseClient
      .from('enrollment')
      .select('courseid')
      .eq('studentid', studentId);
    if (error) throw error;

    if (!enrollments || enrollments.length === 0) {
      container.innerHTML = '<p class="shome-hint">No courses enrolled yet.</p>';
      return;
    }

    const courseIds = [...new Set(enrollments.map(e => e.courseid))];
    const { data: courses, error: cErr } = await window.supabaseClient
      .from('course')
      .select('*')
      .in('courseid', courseIds)
      .order('coursecode');
    if (cErr) throw cErr;

    if (!courses || courses.length === 0) {
      container.innerHTML = '<p class="shome-hint">No course details found.</p>';
      return;
    }

    container.innerHTML = courses.map(c => {
      const prof = c.professorname || c.professor_name || c.instructorname || '';
      return `<div class="shome-course-card">
        <div class="shome-course-code">${esc(c.coursecode || '')}</div>
        ${prof ? `<div class="shome-course-prof">Professor ${esc(prof)}</div>` : ''}
      </div>`;
    }).join('');
  } catch (e) {
    console.error(e);
    container.innerHTML = '<p class="shome-hint">Error loading courses.</p>';
  }
}

async function loadTodo(studentId) {
  const container = document.getElementById('todoList');
  try {
    const { data: enrollments } = await window.supabaseClient
      .from('enrollment')
      .select('courseid, groupid')
      .eq('studentid', studentId)
      .not('groupid', 'is', null);

    if (!enrollments || enrollments.length === 0) {
      container.innerHTML = '<p class="shome-hint">No pending tasks.</p>';
      return;
    }

    const { data: submitted } = await window.supabaseClient
      .from('peerevaluation')
      .select('evaluateestudentid, scheduleid')
      .eq('evaluatorstudentid', studentId);
    const submittedSet = new Set((submitted || []).map(s => `${s.scheduleid}:${s.evaluateestudentid}`));

    const now = new Date();

    const todoSets = await Promise.all(enrollments.map(async enr => {
      const [{ data: schedules }, { data: groupmates }] = await Promise.all([
        window.supabaseClient
          .from('evaluationschedule')
          .select('scheduleid, opens_at, due_at')
          .eq('courseid', enr.courseid)
          .eq('groupid', enr.groupid)
          .order('scheduleid'),
        window.supabaseClient
          .from('enrollment')
          .select('studentid, student(studentid, studentname)')
          .eq('courseid', enr.courseid)
          .eq('groupid', enr.groupid)
          .neq('studentid', studentId),
      ]);

      const schedList = schedules || [];
      const mates     = groupmates || [];

      return schedList
        .filter(s => now >= new Date(s.opens_at) && now <= new Date(s.due_at))
        .filter(sched =>
          mates.some(gm => gm.student && !submittedSet.has(`${sched.scheduleid}:${gm.student.studentid}`))
        )
        .map(sched => {
          const evalNum = schedList.map(s => s.scheduleid).indexOf(sched.scheduleid) + 1;
          return `Complete Eval #${evalNum}`;
        });
    }));

    const todos = todoSets.flat();

    if (todos.length === 0) {
      container.innerHTML = '<p class="shome-hint shome-hint--done">All caught up!</p>';
      return;
    }

    container.innerHTML = todos.slice(0, 5)
      .map(label => `<a href="sDash.html" class="shome-todo-item">${esc(label)}</a>`)
      .join('');
  } catch (e) {
    console.error(e);
    container.innerHTML = '<p class="shome-hint">Error loading tasks.</p>';
  }
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
}

document.addEventListener('DOMContentLoaded', init);
