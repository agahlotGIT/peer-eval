let currentCourseId = null;

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

async function loadRoster(courseId) {
  const tbody = document.getElementById('rosterTableBody');
  tbody.innerHTML = '<tr><td colspan="4" class="ir-empty">Loading…</td></tr>';

  try {
    const { data, error } = await window.supabaseClient
      .from('enrollment')
      .select('studentid, student(studentid, studentname, email)')
      .eq('courseid', courseId);

    if (error) throw error;

    tbody.innerHTML = '';
    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="ir-empty">No students enrolled in this course yet.</td></tr>';
      return;
    }

    data.forEach(row => {
      const s = row.student;
      if (s) appendRow(s.studentid, s.studentname, s.email);
    });
  } catch (err) {
    console.error('Error loading roster:', err);
    tbody.innerHTML = '<tr><td colspan="4" class="ir-empty">Error loading roster.</td></tr>';
  }
}

async function saveChanges() {
  if (!currentCourseId) {
    alert('Please select a course before saving.');
    return;
  }

  const rows = document.querySelectorAll('#rosterTableBody tr:not(#emptyRow)');
  const students = [];
  rows.forEach(tr => {
    const inputs = tr.querySelectorAll('.ir-cell-input');
    const studentid = inputs[0].value.trim();
    const studentname = inputs[1].value.trim();
    const email = inputs[2].value.trim();
    if (studentname || email) students.push({ studentid, studentname, email });
  });

  const saveBtn = document.getElementById('saveBtn');
  const saveStatus = document.getElementById('saveStatus');
  saveBtn.disabled = true;
  saveStatus.textContent = 'Saving…';
  saveStatus.className = 'ir-save-status';

  try {
    for (const s of students) {
      let sid = parseInt(s.studentid);

      if (s.studentid && !isNaN(sid)) {
        const { error } = await window.supabaseClient
          .from('student')
          .upsert({ studentid: sid, studentname: s.studentname, email: s.email }, { onConflict: 'studentid' });
        if (error) throw error;
      } else {
        const { data, error } = await window.supabaseClient
          .from('student')
          .insert({ studentname: s.studentname, email: s.email })
          .select('studentid')
          .single();
        if (error) throw error;
        sid = data.studentid;
      }

      // Check if already enrolled before inserting
      const { data: existing } = await window.supabaseClient
        .from('enrollment')
        .select('enrollmentid')
        .eq('studentid', sid)
        .eq('courseid', parseInt(currentCourseId))
        .limit(1);

      if (!existing || existing.length === 0) {
        const { data: maxRow } = await window.supabaseClient
          .from('enrollment')
          .select('enrollmentid')
          .order('enrollmentid', { ascending: false })
          .limit(1);
        const nextId = maxRow && maxRow.length > 0 ? maxRow[0].enrollmentid + 1 : 1;

        const { error: enrollErr } = await window.supabaseClient
          .from('enrollment')
          .insert({ enrollmentid: nextId, studentid: sid, courseid: parseInt(currentCourseId), created_at: new Date().toISOString() });
        if (enrollErr) throw enrollErr;
      }
    }

    saveStatus.textContent = 'Saved successfully!';
    saveStatus.className = 'ir-save-status ir-save-ok';
  } catch (err) {
    console.error('Save error:', err);
    saveStatus.textContent = `Error: ${err.message}`;
    saveStatus.className = 'ir-save-status ir-save-err';
  } finally {
    saveBtn.disabled = false;
  }
}

// ── Table helpers ─────────────────────────────────────────────────────────────

function appendRow(id = '', name = '', email = '') {
  const tbody = document.getElementById('rosterTableBody');
  const emptyRow = document.getElementById('emptyRow');
  if (emptyRow) emptyRow.remove();

  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td class="ir-th-check"><input type="checkbox" class="ir-row-chk" /></td>
    <td><input class="ir-cell-input" type="text" value="${escHtml(String(id))}" placeholder="Student ID" /></td>
    <td><input class="ir-cell-input" type="text" value="${escHtml(name)}" placeholder="Name" /></td>
    <td><input class="ir-cell-input" type="text" value="${escHtml(email)}" placeholder="Email" /></td>
  `;
  tbody.appendChild(tr);
}

function escHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function parseCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
  const idIdx    = headers.findIndex(h => h.includes('id'));
  const nameIdx  = headers.findIndex(h => h.includes('name'));
  const emailIdx = headers.findIndex(h => h.includes('email'));

  return lines.slice(1).map(line => {
    const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
    return {
      id:    idIdx    >= 0 ? cols[idIdx]    : '',
      name:  nameIdx  >= 0 ? cols[nameIdx]  : '',
      email: emailIdx >= 0 ? cols[emailIdx] : '',
    };
  }).filter(r => r.name || r.email);
}

// ── Event listeners ───────────────────────────────────────────────────────────

function setupEventListeners() {
  document.getElementById('courseSelect').addEventListener('change', async e => {
    currentCourseId = e.target.value || null;
    if (currentCourseId) {
      await loadRoster(currentCourseId);
    } else {
      document.getElementById('rosterTableBody').innerHTML =
        '<tr id="emptyRow"><td colspan="4" class="ir-empty">Select a course to load its roster, or add rows manually.</td></tr>';
    }
  });

  document.getElementById('addRowBtn').addEventListener('click', () => appendRow());

  document.getElementById('importBtn').addEventListener('click', () => {
    document.getElementById('csvFileInput').click();
  });

  document.getElementById('uploadTriggerBtn').addEventListener('click', () => {
    document.getElementById('csvFileInput').click();
  });

  document.getElementById('csvFileInput').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    document.getElementById('uploadFileName').textContent = file.name;
    const reader = new FileReader();
    reader.onload = ev => {
      const rows = parseCSV(ev.target.result);
      document.getElementById('rosterTableBody').innerHTML = '';
      rows.forEach(r => appendRow(r.id, r.name, r.email));
      if (rows.length === 0) {
        document.getElementById('rosterTableBody').innerHTML =
          '<tr id="emptyRow"><td colspan="4" class="ir-empty">No valid rows found in CSV.</td></tr>';
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  document.getElementById('deleteBtn').addEventListener('click', () => {
    document.querySelectorAll('.ir-row-chk:checked').forEach(chk => chk.closest('tr').remove());
    if (document.querySelectorAll('#rosterTableBody tr').length === 0) {
      document.getElementById('rosterTableBody').innerHTML =
        '<tr id="emptyRow"><td colspan="4" class="ir-empty">Select a course to load its roster, or add rows manually.</td></tr>';
    }
  });

  document.getElementById('selectAllChk').addEventListener('change', e => {
    document.querySelectorAll('.ir-row-chk').forEach(chk => { chk.checked = e.target.checked; });
  });

  document.getElementById('saveBtn').addEventListener('click', saveChanges);
}

document.addEventListener('DOMContentLoaded', init);
