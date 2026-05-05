let currentCourseId = null;
let allStudents = [];   // { enrollmentid, studentid, studentname, groupid }
let allGroups   = [];   // { groupid, groupname }

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

  await Promise.all([loadCourses(), loadGroups()]);
  setupEventListeners();
}

// ── Database ──────────────────────────────────────────────────────────────────

async function loadCourses() {
  const select = document.getElementById('courseSelect');
  try {
    const { data, error } = await window.supabaseClient
      .from('course')
      .select('courseid, coursecode')
      .order('coursecode');
    if (error) throw error;

    select.innerHTML = '<option value="">— Select a Course —</option>';
    (data || []).forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.courseid;
      opt.textContent = c.coursecode;
      select.appendChild(opt);
    });
  } catch (err) {
    console.error('Error loading courses:', err);
    select.innerHTML = '<option value="">Error loading courses</option>';
  }
}

async function loadGroups() {
  try {
    const { data, error } = await window.supabaseClient
      .from('grouptable')
      .select('groupid, groupname')
      .order('groupname');
    if (error) throw error;
    allGroups = data || [];
    renderGroupChips();
  } catch (err) {
    console.error('Error loading groups:', err);
  }
}

async function loadStudents(courseId) {
  const tbody = document.getElementById('groupsTableBody');
  tbody.innerHTML = '<tr><td colspan="2" class="ir-empty">Loading…</td></tr>';
  allStudents = [];

  try {
    const { data, error } = await window.supabaseClient
      .from('enrollment')
      .select('enrollmentid, studentid, groupid, student(studentid, studentname)')
      .eq('courseid', courseId);
    if (error) throw error;

    allStudents = (data || [])
      .filter(r => r.student)
      .map(r => ({
        enrollmentid: r.enrollmentid,
        studentid:    r.student.studentid,
        studentname:  r.student.studentname,
        groupid:      r.groupid || null,
      }));

    renderTable();
  } catch (err) {
    console.error('Error loading students:', err);
    tbody.innerHTML = '<tr><td colspan="2" class="ir-empty">Error loading students.</td></tr>';
  }
}

async function createGroup(groupname) {
  try {
    const { data: maxRow } = await window.supabaseClient
      .from('grouptable')
      .select('groupid')
      .order('groupid', { ascending: false })
      .limit(1);
    const nextId = maxRow && maxRow.length > 0 ? maxRow[0].groupid + 1 : 1;

    const { data, error } = await window.supabaseClient
      .from('grouptable')
      .insert({ groupid: nextId, groupname })
      .select('groupid, groupname')
      .single();
    if (error) throw error;

    allGroups.push(data);
    allGroups.sort((a, b) => a.groupname.localeCompare(b.groupname));
    renderGroupChips();
    renderTable();         // refresh dropdowns with new group
    return data;
  } catch (err) {
    console.error('Error creating group:', err);
    alert(`Failed to create group: ${err.message}`);
    return null;
  }
}

async function saveChanges() {
  if (!currentCourseId) {
    alert('Please select a course first.');
    return;
  }

  const saveBtn    = document.getElementById('saveBtn');
  const saveStatus = document.getElementById('saveStatus');
  saveBtn.disabled = true;
  saveStatus.textContent = 'Saving…';
  saveStatus.className   = 'ir-save-status';

  try {
    // Collect current dropdown values from the table
    const rows = document.querySelectorAll('#groupsTableBody tr[data-enrollmentid]');
    const updates = [];
    rows.forEach(tr => {
      const enrollmentid = parseInt(tr.dataset.enrollmentid);
      const sel   = tr.querySelector('.eg-group-select');
      const groupid = sel.value ? parseInt(sel.value) : null;
      updates.push({ enrollmentid, groupid });
    });

    for (const u of updates) {
      const { error } = await window.supabaseClient
        .from('enrollment')
        .update({ groupid: u.groupid })
        .eq('enrollmentid', u.enrollmentid);
      if (error) throw error;
    }

    // Sync local state
    updates.forEach(u => {
      const s = allStudents.find(s => s.enrollmentid === u.enrollmentid);
      if (s) s.groupid = u.groupid;
    });

    saveStatus.textContent = 'Saved successfully!';
    saveStatus.className   = 'ir-save-status ir-save-ok';
  } catch (err) {
    console.error('Save error:', err);
    saveStatus.textContent = `Error: ${err.message}`;
    saveStatus.className   = 'ir-save-status ir-save-err';
  } finally {
    saveBtn.disabled = false;
  }
}

// ── Render ────────────────────────────────────────────────────────────────────

function renderTable() {
  const tbody      = document.getElementById('groupsTableBody');
  const search     = document.getElementById('searchInput').value.trim().toLowerCase();
  const filter     = document.getElementById('filterSelect').value;
  const sort       = document.getElementById('sortSelect').value;

  let students = [...allStudents];

  // Search
  if (search) {
    students = students.filter(s => s.studentname.toLowerCase().includes(search));
  }

  // Filter
  if (filter === 'assigned')   students = students.filter(s => s.groupid);
  if (filter === 'unassigned') students = students.filter(s => !s.groupid);

  // Sort
  if (sort === 'name') {
    students.sort((a, b) => a.studentname.localeCompare(b.studentname));
  } else {
    students.sort((a, b) => {
      const ga = groupName(a.groupid);
      const gb = groupName(b.groupid);
      return ga.localeCompare(gb) || a.studentname.localeCompare(b.studentname);
    });
  }

  tbody.innerHTML = '';

  if (students.length === 0) {
    tbody.innerHTML = '<tr><td colspan="2" class="ir-empty">No students match the current filter.</td></tr>';
    return;
  }

  students.forEach(s => {
    const tr = document.createElement('tr');
    tr.dataset.enrollmentid = s.enrollmentid;

    const groupOptions = allGroups.map(g =>
      `<option value="${g.groupid}" ${s.groupid === g.groupid ? 'selected' : ''}>${escHtml(g.groupname)}</option>`
    ).join('');

    tr.innerHTML = `
      <td class="eg-name-cell">${escHtml(s.studentname)}</td>
      <td class="eg-group-cell">
        <select class="ir-pill-select eg-group-select">
          <option value="">— No Group —</option>
          ${groupOptions}
        </select>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function renderGroupChips() {
  const container = document.getElementById('groupChips');
  if (!container) return;
  container.innerHTML = '';
  allGroups.forEach(g => {
    const chip = document.createElement('span');
    chip.className = 'eg-chip';
    chip.textContent = g.groupname;
    container.appendChild(chip);
  });
}

function groupName(gid) {
  if (!gid) return '';
  const g = allGroups.find(g => g.groupid === gid);
  return g ? g.groupname : '';
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

// ── Event listeners ───────────────────────────────────────────────────────────

function setupEventListeners() {
  document.getElementById('courseSelect').addEventListener('change', async e => {
    currentCourseId = e.target.value || null;
    document.getElementById('saveStatus').textContent = '';
    if (currentCourseId) {
      await loadStudents(currentCourseId);
    } else {
      allStudents = [];
      document.getElementById('groupsTableBody').innerHTML =
        '<tr id="egEmptyRow"><td colspan="2" class="ir-empty">Select a course to load students.</td></tr>';
    }
  });

  document.getElementById('searchInput').addEventListener('input', renderTable);
  document.getElementById('filterSelect').addEventListener('change', renderTable);
  document.getElementById('sortSelect').addEventListener('change', renderTable);

  document.getElementById('addGroupBtn').addEventListener('click', async () => {
    const input = document.getElementById('newGroupInput');
    const name  = input.value.trim();
    if (!name) return;
    const result = await createGroup(name);
    if (result) input.value = '';
  });

  document.getElementById('newGroupInput').addEventListener('keydown', async e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('addGroupBtn').click();
    }
  });

  document.getElementById('saveBtn').addEventListener('click', saveChanges);
}

document.addEventListener('DOMContentLoaded', init);
