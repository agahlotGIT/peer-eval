const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MS_PER_DAY = 1000 * 60 * 60 * 24;

let weekStart;   // Monday 00:00:00 of the displayed week
let allEvents = [];

async function init() {
  const user = await window.auth.getCurrentUser();
  if (!user || user.role !== 'student') {
    window.location.href = 'login.html';
    return;
  }

  weekStart = getMonday(new Date());
  allEvents = await loadSchedules(user.id);

  document.getElementById('prevWeek').addEventListener('click', () => {
    weekStart.setDate(weekStart.getDate() - 7);
    render();
  });
  document.getElementById('nextWeek').addEventListener('click', () => {
    weekStart.setDate(weekStart.getDate() + 7);
    render();
  });

  render();
}

// ── Data ──────────────────────────────────────────────────────────────────────

async function loadSchedules(studentId) {
  const { data: enrollments, error } = await window.supabaseClient
    .from('enrollment')
    .select('courseid, groupid')
    .eq('studentid', studentId)
    .not('groupid', 'is', null);
  if (error || !enrollments || enrollments.length === 0) return [];

  const results = await Promise.all(enrollments.map(async enr => {
    const [{ data: schedules }, { data: courseData }] = await Promise.all([
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
    ]);
    return {
      courseName: courseData?.coursecode || `Course ${enr.courseid}`,
      schedules: schedules || [],
    };
  }));

  const events = [];
  results.forEach(({ courseName, schedules }) => {
    schedules.forEach((s, idx) => {
      events.push({
        courseName,
        evalNum: idx + 1,
        opens: new Date(s.opens_at),
        due:   new Date(s.due_at),
      });
    });
  });
  return events;
}

// ── Rendering ─────────────────────────────────────────────────────────────────

function render() {
  const weekDays = getWeekDays();
  const weekEndMs = weekDays[6].getTime() + MS_PER_DAY - 1;
  const today = new Date(); today.setHours(0, 0, 0, 0);

  // Day headers
  DAY_NAMES.forEach((name, i) => {
    const d = weekDays[i];
    const isToday = d.getTime() === today.getTime();
    document.getElementById(`hdr${i}`).innerHTML =
      `<span class="tc-day-name">${name}</span>
       <span class="tc-day-date ${isToday ? 'tc-day-date--today' : ''}">${d.getDate()}</span>`;
  });

  // Week label
  const [wS, wE] = [weekDays[0], weekDays[6]];
  document.getElementById('weekLabel').textContent =
    `${fmtShort(wS)} – ${fmtShort(wE)}, ${wE.getFullYear()}`;

  // Events
  const grid = document.getElementById('eventsGrid');
  grid.innerHTML = '';

  const now = new Date();
  const visible = allEvents.filter(e =>
    e.opens.getTime() <= weekEndMs && e.due.getTime() >= weekStart.getTime()
  );

  if (visible.length === 0) {
    grid.innerHTML = '<p class="tc-empty">No evaluations scheduled this week.</p>';
    return;
  }

  visible.forEach(ev => {
    // Clamp to week boundaries and compute column span (1-indexed)
    const startMs   = Math.max(ev.opens.getTime(), weekStart.getTime());
    const endMs     = Math.min(ev.due.getTime(),   weekEndMs);
    const colStart  = Math.floor((startMs - weekStart.getTime()) / MS_PER_DAY) + 1;
    const colEnd    = Math.floor((endMs   - weekStart.getTime()) / MS_PER_DAY) + 2; // exclusive

    const isOpen     = now >= ev.opens && now <= ev.due;
    const isUpcoming = now < ev.opens;
    const statusLabel = isUpcoming ? 'Upcoming' : isOpen ? 'Open' : 'Closed';
    const modClass    = isUpcoming ? 'tc-event--upcoming'
                      : isOpen     ? 'tc-event--open'
                      :              'tc-event--closed';

    const el = document.createElement('div');
    el.className = `tc-event ${modClass}`;
    el.style.gridColumn = `${colStart} / ${colEnd}`;
    el.innerHTML =
      `<span class="tc-event-name">${esc(ev.courseName)} · Eval #${ev.evalNum}</span>
       <span class="tc-event-status">${statusLabel}</span>
       <span class="tc-event-dates">${fmtDate(ev.opens)} – ${fmtDate(ev.due)}</span>`;
    grid.appendChild(el);
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getMonday(d) {
  const day  = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const mon  = new Date(d);
  mon.setDate(d.getDate() + diff);
  mon.setHours(0, 0, 0, 0);
  return mon;
}

function getWeekDays() {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });
}

function fmtShort(d) {
  return d.toLocaleDateString('en-SG', { day: 'numeric', month: 'short' });
}

function fmtDate(d) {
  return d.toLocaleString('en-SG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
}

document.addEventListener('DOMContentLoaded', init);
