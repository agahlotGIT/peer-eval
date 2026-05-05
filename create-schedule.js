// ── State ─────────────────────────────────────────────────────────────────────
let currentCourseId  = null;
let calYear          = new Date().getFullYear();
let calMonth         = new Date().getMonth();
let selectedDate     = null;
let selectedSlot     = null;  // { label, startHour, startMin }
let selectedGroupIds = new Set();
let courseGroups     = [];    // { groupid, groupname }

const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];
const DAYS   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

// Generate 1-hour time slots 8 AM – 7 PM
const TIME_SLOTS = [];
for (let h = 8; h < 19; h++) {
  TIME_SLOTS.push({ label: `${fmt12(h)}:00 – ${fmt12(h + 1)}:00`, startHour: h, startMin: 0 });
}

function fmt12(h) {
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12  = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${h12}:00 ${ampm}`;
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  const user = await window.auth.getCurrentUser();
  if (!user || user.role !== 'professor') {
    window.location.href = 'login.html';
    return;
  }
  document.getElementById('backBtn').addEventListener('click', () => {
    window.location.href = 'pDash.html';
  });
  await loadCourses();
  renderCalendar();
  renderTimeSlots();
  setupListeners();
}

// ── Database ──────────────────────────────────────────────────────────────────
async function loadCourses() {
  const sel = document.getElementById('courseSelect');
  try {
    const { data, error } = await window.supabaseClient
      .from('course').select('courseid, coursecode').order('coursecode');
    if (error) throw error;
    sel.innerHTML = '<option value="">— Select a Course —</option>';
    (data || []).forEach(c => {
      const o = document.createElement('option');
      o.value = c.courseid; o.textContent = c.coursecode;
      sel.appendChild(o);
    });
  } catch (e) {
    sel.innerHTML = '<option value="">Error loading</option>';
  }
}

async function loadGroups(courseId) {
  const panel = document.getElementById('rosterPanel');
  panel.innerHTML = '<p class="cs-hint">Loading…</p>';
  selectedGroupIds.clear();
  courseGroups = [];
  try {
    // Get distinct groupids enrolled in this course
    const { data: enrollData, error: eErr } = await window.supabaseClient
      .from('enrollment')
      .select('groupid')
      .eq('courseid', courseId)
      .not('groupid', 'is', null);
    if (eErr) throw eErr;

    const gids = [...new Set((enrollData || []).map(r => r.groupid))];
    if (gids.length === 0) {
      panel.innerHTML = '<p class="cs-hint">No groups found for this course.</p>';
      return;
    }

    const { data: gData, error: gErr } = await window.supabaseClient
      .from('grouptable').select('groupid, groupname').in('groupid', gids).order('groupname');
    if (gErr) throw gErr;

    courseGroups = gData || [];
    renderGroupRoster();
  } catch (e) {
    panel.innerHTML = `<p class="cs-hint">Error: ${e.message}</p>`;
  }
}

async function loadExistingSchedules(courseId) {
  const container = document.getElementById('existingSchedules');
  container.innerHTML = '<p class="cs-hint">Loading…</p>';
  try {
    const { data, error } = await window.supabaseClient
      .from('evaluationschedule')
      .select('scheduleid, courseid, groupid, opens_at, due_at')
      .eq('courseid', courseId)
      .order('scheduleid');
    if (error) throw error;

    if (!data || data.length === 0) {
      container.innerHTML = '<p class="cs-hint">No schedules yet for this course.</p>';
      return;
    }

    // Load group names and completion stats
    const now = new Date();
    const rows = await Promise.all(data.map(async (s, idx) => {
      const group = courseGroups.find(g => g.groupid === s.groupid);
      const groupName = group ? group.groupname : `Group ${s.groupid}`;

      // Count expected pairs (all groupmates evaluate each other)
      const { count: enrollCount } = await window.supabaseClient
        .from('enrollment').select('studentid', { count: 'exact', head: true })
        .eq('courseid', courseId).eq('groupid', s.groupid);
      const n = enrollCount || 0;
      const expected = n * (n - 1); // n*(n-1) ordered pairs

      // Count submitted evaluations for this schedule
      const { count: doneCount } = await window.supabaseClient
        .from('peerevaluation').select('evaluationid', { count: 'exact', head: true })
        .eq('scheduleid', s.scheduleid);

      const opens = new Date(s.opens_at);
      const due   = new Date(s.due_at);
      let status = 'upcoming';
      if (now >= opens && now <= due) status = 'active';
      if (now > due) status = 'closed';

      return { ...s, groupName, evalNum: idx + 1, expected, done: doneCount || 0, status, opens, due };
    }));

    container.innerHTML = '';
    rows.forEach(r => {
      const card = document.createElement('div');
      card.className = `cs-sched-card cs-sched-${r.status}`;
      card.innerHTML = `
        <div class="cs-sched-num">Peer Evaluation #${r.evalNum}</div>
        <div class="cs-sched-meta">
          <span class="cs-sched-group">${escHtml(r.groupName)}</span>
          <span class="cs-sched-badge cs-badge-${r.status}">${r.status.charAt(0).toUpperCase() + r.status.slice(1)}</span>
        </div>
        <div class="cs-sched-dates">
          <span>Opens: ${fmtDate(r.opens)}</span>
          <span>Due: ${fmtDate(r.due)}</span>
        </div>
        <div class="cs-sched-progress">
          <div class="cs-progress-bar">
            <div class="cs-progress-fill" style="width:${r.expected ? Math.round((r.done / r.expected) * 100) : 0}%"></div>
          </div>
          <span class="cs-progress-label">${r.done}/${r.expected} completed</span>
        </div>
      `;
      container.appendChild(card);
    });
  } catch (e) {
    container.innerHTML = `<p class="cs-hint">Error: ${e.message}</p>`;
  }
}

async function createSchedule() {
  if (!currentCourseId)        return showCreateStatus('Please select a course.', false);
  if (!selectedDate)           return showCreateStatus('Please select a date.', false);
  if (!selectedSlot)           return showCreateStatus('Please select a time slot.', false);
  if (selectedGroupIds.size === 0) return showCreateStatus('Please select at least one group.', false);

  const createBtn = document.getElementById('createBtn');
  createBtn.disabled = true;
  showCreateStatus('Creating…', null);

  try {
    const duration = parseInt(document.getElementById('durationSelect').value);
    const opens = new Date(selectedDate);
    opens.setHours(selectedSlot.startHour, selectedSlot.startMin, 0, 0);
    const due = new Date(opens);
    due.setDate(due.getDate() + duration);

    for (const groupId of selectedGroupIds) {
      const { data: maxRow } = await window.supabaseClient
        .from('evaluationschedule').select('scheduleid').order('scheduleid', { ascending: false }).limit(1);
      const nextId = maxRow?.[0]?.scheduleid != null ? maxRow[0].scheduleid + 1 : 1;

      const { error } = await window.supabaseClient.from('evaluationschedule').insert({
        scheduleid: nextId,
        courseid:   parseInt(currentCourseId),
        groupid:    groupId,
        opens_at:   opens.toISOString(),
        due_at:     due.toISOString(),
        created_at: new Date().toISOString(),
      });
      if (error) throw error;
    }

    showCreateStatus('Schedule created!', true);
    // Reset selections
    selectedDate = null; selectedSlot = null; selectedGroupIds.clear();
    renderCalendar(); renderTimeSlots(); renderGroupRoster();
    updateSummary();
    await loadExistingSchedules(currentCourseId);
  } catch (e) {
    showCreateStatus(`Error: ${e.message}`, false);
  } finally {
    createBtn.disabled = false;
  }
}

// ── Render ────────────────────────────────────────────────────────────────────
function renderCalendar() {
  const firstDay     = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth  = new Date(calYear, calMonth + 1, 0).getDate();
  const today        = new Date();
  today.setHours(0, 0, 0, 0);

  let html = `
    <div class="cs-cal-header">
      <button class="cs-cal-nav" id="calPrev">‹</button>
      <span class="cs-cal-month">${MONTHS[calMonth]} ${calYear}</span>
      <button class="cs-cal-nav" id="calNext">›</button>
    </div>
    <div class="cs-cal-grid">
  `;
  DAYS.forEach(d => { html += `<div class="cs-cal-label">${d}</div>`; });
  for (let i = 0; i < firstDay; i++) html += `<div class="cs-cal-cell cs-cal-empty"></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(calYear, calMonth, d);
    const iso  = `${calYear}-${pad(calMonth + 1)}-${pad(d)}`;
    const isToday    = date.getTime() === today.getTime();
    const isSelected = selectedDate && date.getTime() === selectedDate.getTime();
    const isPast     = date < today;
    html += `<div class="cs-cal-cell ${isToday ? 'cs-cal-today' : ''} ${isSelected ? 'cs-cal-sel' : ''} ${isPast ? 'cs-cal-past' : ''}" data-iso="${iso}">${d}</div>`;
  }
  html += `</div>`;

  document.getElementById('calendarWidget').innerHTML = html;

  document.getElementById('calPrev').onclick = () => {
    calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; } renderCalendar();
  };
  document.getElementById('calNext').onclick = () => {
    calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; } renderCalendar();
  };
  document.querySelectorAll('.cs-cal-cell:not(.cs-cal-empty):not(.cs-cal-past)').forEach(cell => {
    cell.onclick = () => {
      const [y, m, d] = cell.dataset.iso.split('-').map(Number);
      selectedDate = new Date(y, m - 1, d);
      renderCalendar();
      updateSummary();
    };
  });
}

function renderTimeSlots() {
  const panel = document.getElementById('timePanel');
  panel.innerHTML = '';
  TIME_SLOTS.forEach(slot => {
    const btn = document.createElement('button');
    btn.className = `cs-slot-btn ${selectedSlot && selectedSlot.label === slot.label ? 'cs-slot-sel' : ''}`;
    btn.textContent = slot.label;
    btn.onclick = () => { selectedSlot = slot; renderTimeSlots(); updateSummary(); };
    panel.appendChild(btn);
  });
}

function renderGroupRoster() {
  const panel = document.getElementById('rosterPanel');
  panel.innerHTML = '';
  if (courseGroups.length === 0) {
    panel.innerHTML = '<p class="cs-hint">No groups found.</p>';
    return;
  }
  courseGroups.forEach(g => {
    const btn = document.createElement('button');
    btn.className = `cs-slot-btn ${selectedGroupIds.has(g.groupid) ? 'cs-slot-sel' : ''}`;
    btn.textContent = g.groupname;
    btn.onclick = () => {
      if (selectedGroupIds.has(g.groupid)) selectedGroupIds.delete(g.groupid);
      else selectedGroupIds.add(g.groupid);
      renderGroupRoster();
      updateSummary();
    };
    panel.appendChild(btn);
  });
}

function updateSummary() {
  const duration = parseInt(document.getElementById('durationSelect').value);
  let opensStr = '—', dueStr = '—', groupStr = '—';

  if (selectedDate && selectedSlot) {
    const opens = new Date(selectedDate);
    opens.setHours(selectedSlot.startHour, selectedSlot.startMin, 0, 0);
    const due = new Date(opens);
    due.setDate(due.getDate() + duration);
    opensStr = fmtDate(opens);
    dueStr   = fmtDate(due);
  }
  if (selectedGroupIds.size > 0) {
    groupStr = courseGroups.filter(g => selectedGroupIds.has(g.groupid)).map(g => g.groupname).join(', ');
  }

  document.getElementById('summaryOpens').textContent = `Opens: ${opensStr}`;
  document.getElementById('summaryDue').textContent   = `Due: ${dueStr}`;
  document.getElementById('summaryGroup').textContent = `Group: ${groupStr}`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(d) {
  return d.toLocaleString('en-SG', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function pad(n) { return String(n).padStart(2, '0'); }
function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;'); }
function showCreateStatus(msg, ok) {
  const el = document.getElementById('createStatus');
  el.textContent = msg;
  el.className = `ir-save-status ${ok === true ? 'ir-save-ok' : ok === false ? 'ir-save-err' : ''}`;
}

// ── Listeners ─────────────────────────────────────────────────────────────────
function setupListeners() {
  document.getElementById('courseSelect').addEventListener('change', async e => {
    currentCourseId = e.target.value || null;
    selectedGroupIds.clear();
    document.getElementById('createStatus').textContent = '';
    if (currentCourseId) {
      await loadGroups(currentCourseId);
      await loadExistingSchedules(currentCourseId);
    } else {
      document.getElementById('rosterPanel').innerHTML    = '<p class="cs-hint">Select a course first.</p>';
      document.getElementById('existingSchedules').innerHTML = '<p class="cs-hint">Select a course to see schedules.</p>';
    }
    updateSummary();
  });

  document.getElementById('durationSelect').addEventListener('change', updateSummary);
  document.getElementById('createBtn').addEventListener('click', createSchedule);
}

document.addEventListener('DOMContentLoaded', init);
