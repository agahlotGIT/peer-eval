// Professor Dashboard (pDash)
let currentProfessor = null;

// Initialize professor dashboard
async function initPDash() {
  try {
    console.log("🚀 Initializing professor dashboard...");

    // Check authentication and role
    const user = await window.auth.getCurrentUser();
    console.log("Current user from auth:", user);
    if (!user || user.role !== 'professor') {
      console.log("❌ Not authenticated as professor, redirecting to login");
      window.location.href = 'login.html';
      return;
    }

    currentProfessor = user;
    console.log("✅ Professor authenticated:", user);

    // Display professor name
    displayProfessorInfo();

    // Load dashboard stats and charts in parallel
    await Promise.all([loadDashboardStats(), loadCharts()]);

    // Setup event listeners
    setupEventListeners();

    console.log("✅ Professor dashboard initialized");
  } catch (error) {
    console.error("❌ Failed to initialize professor dashboard:", error);
    alert("Failed to load dashboard. Please try logging in again.");
    window.location.href = 'login.html';
  }
}

// Display professor information
function displayProfessorInfo() {
  const nameElement = document.getElementById('professorName');
  if (nameElement && currentProfessor) {
    // For now, just show email. Later we can fetch full name from professor table
    nameElement.textContent = currentProfessor.email;
  }
}

// Load dashboard statistics
async function loadDashboardStats() {
  try {
    console.log("📊 Loading dashboard statistics...");

    // Load stats in parallel
    const [studentCount, evaluationCount, completionStats] = await Promise.all([
      getTotalStudents(),
      getActiveEvaluations(),
      getCompletionRate()
    ]);

    // Update UI
    document.getElementById('totalStudents').textContent = studentCount;
    document.getElementById('activeEvaluations').textContent = evaluationCount;
    document.getElementById('completionRate').textContent = `${completionStats}%`;

    console.log("✅ Dashboard stats loaded");
  } catch (error) {
    console.error("❌ Error loading dashboard stats:", error);
    // Don't show alert, just log - stats are not critical
  }
}

// Get total students count
async function getTotalStudents() {
  try {
    const { count, error } = await window.supabaseClient
      .from('student')
      .select('*', { count: 'exact', head: true });

    if (error) throw error;
    return count || 0;
  } catch (error) {
    console.error("Error getting student count:", error);
    return 0;
  }
}

// Get active evaluations count
async function getActiveEvaluations() {
  try {
    // Count evaluations that are currently open (opens_at <= now <= due_at)
    const now = new Date().toISOString();
    const { count, error } = await window.supabaseClient
      .from('evaluationschedule')
      .select('*', { count: 'exact', head: true })
      .lte('opens_at', now)
      .gte('due_at', now);

    if (error) throw error;
    return count || 0;
  } catch (error) {
    console.error("Error getting active evaluations:", error);
    return 0;
  }
}

// Get completion rate
async function getCompletionRate() {
  try {
    // Get total possible evaluations vs completed
    // This is complex - for now, return a placeholder
    // In a real implementation, we'd count expected vs actual peerevaluations
    return 0; // Placeholder
  } catch (error) {
    console.error("Error getting completion rate:", error);
    return 0;
  }
}

// Setup event listeners
function setupEventListeners() {
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await window.auth.signOut();
      window.location.href = 'login.html';
    });
  }
}

// Navigate to different sections
function navigateTo(section) {
  console.log("🧭 Navigating to:", section);

  switch (section) {
    case 'import-roster':
      window.location.href = 'import-roster.html';
      break;
    case 'edit-groups':
      window.location.href = 'edit-groups.html';
      break;
    case 'create-schedule':
      window.location.href = 'create-schedule.html';
      break;
    case 'evaluation-status':
      window.location.href = 'evaluation-status.html';
      break;
    default:
      console.error("Unknown navigation section:", section);
  }
}

// ─── Charts ──────────────────────────────────────────────────────────────────

async function loadCharts() {
  await Promise.all([loadWeeklyChart(), loadProfessorChart(), loadNoEvalsTable()]);
}

// Chart 1: Peer Evaluations Scheduled by Week (line chart)
async function loadWeeklyChart() {
  try {
    const { data, error } = await window.supabaseClient
      .from('evaluationschedule')
      .select('opens_at');
    if (error) throw error;

    // Group by Monday of each week
    const counts = {};
    (data || []).forEach(row => {
      const monday = getMonday(new Date(row.opens_at));
      const key = monday.toISOString().slice(0, 10);
      counts[key] = (counts[key] || 0) + 1;
    });

    const sorted = Object.keys(counts).sort();
    const labels = sorted.map(k => {
      const d = new Date(k);
      return d.toLocaleDateString('en-SG', { day: 'numeric', month: 'short' });
    });
    const values = sorted.map(k => counts[k]);

    const ctx = document.getElementById('weeklyChart').getContext('2d');
    new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Evaluations',
          data: values,
          borderColor: '#0e1b63',
          backgroundColor: 'rgba(14, 27, 99, 0.08)',
          borderWidth: 2.5,
          pointBackgroundColor: '#0e1b63',
          pointRadius: 5,
          tension: 0.3,
          fill: true,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 11 } } },
          y: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 11 } }, grid: { color: 'rgba(0,0,0,0.06)' } },
        },
      },
    });
  } catch (e) {
    console.error('Weekly chart error:', e);
  }
}

// Chart 2: Total Evaluations Scheduled by Professor (bar chart)
async function loadProfessorChart() {
  try {
    const [{ data: courses, error: ce }, { data: schedules, error: se }, { data: professors, error: pe }] = await Promise.all([
      window.supabaseClient.from('course').select('courseid, professorid'),
      window.supabaseClient.from('evaluationschedule').select('courseid'),
      window.supabaseClient.from('professor').select('*'),
    ]);
    if (ce) throw ce;
    if (se) throw se;
    if (pe) throw pe;

    // Map professorid → display name
    const profName = {};
    (professors || []).forEach(p => {
      profName[p.professorid] = p.professorname || p.professor_name || p.name || p.email || `Prof ${p.professorid}`;
    });

    // Map courseid → professor name
    const courseToProf = {};
    (courses || []).forEach(c => {
      courseToProf[c.courseid] = profName[c.professorid] || `Prof ${c.professorid}`;
    });

    // Count schedules per professor
    const counts = {};
    (schedules || []).forEach(s => {
      const name = courseToProf[s.courseid];
      if (name) counts[name] = (counts[name] || 0) + 1;
    });

    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const labels = sorted.map(([name]) => name);
    const values = sorted.map(([, v]) => v);

    const ctx = document.getElementById('professorChart').getContext('2d');
    new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Evaluations',
          data: values,
          backgroundColor: '#b8963a',
          borderRadius: 6,
          borderSkipped: false,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 11 } } },
          y: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 11 } }, grid: { color: 'rgba(0,0,0,0.06)' } },
        },
      },
    });
  } catch (e) {
    console.error('Professor chart error:', e);
  }
}

// Chart 3: Professors with No Evaluations Scheduled (table)
async function loadNoEvalsTable() {
  const wrap = document.getElementById('noEvalsTableWrap');
  try {
    const [{ data: courses, error: ce }, { data: schedules, error: se }, { data: professors, error: pe }] = await Promise.all([
      window.supabaseClient.from('course').select('courseid, coursecode, professorid'),
      window.supabaseClient.from('evaluationschedule').select('courseid'),
      window.supabaseClient.from('professor').select('*'),
    ]);
    if (ce) throw ce;
    if (se) throw se;
    if (pe) throw pe;

    // Map professorid → display name
    const profName = {};
    (professors || []).forEach(p => {
      profName[p.professorid] = p.professorname || p.professor_name || p.name || p.email || `Prof ${p.professorid}`;
    });

    const scheduledCourses = new Set((schedules || []).map(s => s.courseid));
    const noEvals = (courses || []).filter(c => !scheduledCourses.has(c.courseid));

    if (noEvals.length === 0) {
      wrap.innerHTML = '<p class="no-data" style="color:#6b7280;font-size:13px;padding:12px 0;">All professors have evaluations scheduled.</p>';
      return;
    }

    const rows = noEvals.map(c => `
      <tr>
        <td>${esc(profName[c.professorid] || '—')}</td>
        <td>${esc(c.coursecode || `Course ${c.courseid}`)}</td>
      </tr>`).join('');

    wrap.innerHTML = `
      <table class="pdash-no-evals-table">
        <thead><tr><th>Professor</th><th>Course</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  } catch (e) {
    console.error('No-evals table error:', e);
    wrap.innerHTML = '<p class="no-data" style="color:#ef4444;font-size:13px;">Error loading data.</p>';
  }
}

function getMonday(d) {
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1 - day);
  const mon = new Date(d);
  mon.setHours(0, 0, 0, 0);
  mon.setDate(d.getDate() + diff);
  return mon;
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', initPDash);