// Evaluation Status Page
let currentUser   = null;
let allStudents   = [];
let enrollments   = [];
let courseMap     = {};
let groupMap      = {};
let selectedStudent   = null;
let allEvaluationData = [];
let averageScoreChart = null;
let groupStatusChart  = null;

// Overall Statistics charts
let osSubmissionsChart = null;
let osCompletionChart  = null;
let osStatusPie        = null;

// Initialize evaluation status page
async function initEvaluationStatus() {
  try {
    console.log("🚀 Initializing evaluation status page...");

    // Check authentication
    const user = await window.auth.getCurrentUser();
    if (!user || user.role !== 'professor') {
      window.location.href = 'login.html';
      return;
    }
    currentUser = user;

    // Setup event listeners
    setupEventListeners();

    // Load roster, overview stats, and professor courses in parallel
    await Promise.all([loadStudentRoster(), loadOverviewStats(), loadProfessorCourses()]);

    console.log("✅ Evaluation status page initialized");
  } catch (error) {
    console.error("❌ Failed to initialize evaluation status page:", error);
  }
}

// Setup event listeners
function setupEventListeners() {
  document.getElementById('backBtn')?.addEventListener('click', () => {
    window.location.href = 'pDash.html';
  });

  document.getElementById('loadRosterBtn')?.addEventListener('click', loadStudentRoster);

  document.getElementById('backStudentBtn')?.addEventListener('click', () => {
    selectedStudent = null;
    document.getElementById('studentStatsSection').style.display = 'none';
    document.querySelector('.roster-section').style.display = 'block';
  });

  document.getElementById('studentSearch')?.addEventListener('input', applyFilters);
  document.getElementById('courseFilter')?.addEventListener('change', () => {
    refreshGroupDropdown();
    applyFilters();
  });
  document.getElementById('groupFilter')?.addEventListener('change', applyFilters);

  // Tab switching
  document.querySelectorAll('.eval-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.eval-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      document.getElementById('tabRoster').style.display  = tab === 'roster'  ? '' : 'none';
      document.getElementById('tabOverall').style.display = tab === 'overall' ? '' : 'none';
    });
  });

  // Overall Statistics filters
  document.getElementById('osCourseSelect')?.addEventListener('change', onOsCourseChange);
  document.getElementById('osLoadBtn')?.addEventListener('click', loadOverallCharts);
}

// Load overview statistics
async function loadOverviewStats() {
  try {
    console.log("📊 Loading overview statistics...");

    const [totalEvals, completedGroups, avgScores] = await Promise.all([
      getTotalEvaluationStats(),
      getCompletedGroupsStats(),
      getAverageScoresByQuestion()
    ]);

    displayOverviewStats(totalEvals, completedGroups, avgScores);
  } catch (error) {
    console.error("❌ Error loading overview stats:", error);
  }
}

// Get total evaluations submitted
async function getTotalEvaluationStats() {
  try {
    const { count, error } = await window.supabaseClient
      .from('peerevaluation')
      .select('*', { count: 'exact', head: true });

    if (error) throw error;
    return count || 0;
  } catch (error) {
    console.error("Error getting evaluation count:", error);
    return 0;
  }
}

// Get number of completed groups
async function getCompletedGroupsStats() {
  try {
    // A group is "completed" if all its students have submitted evaluations
    // This is a simplified version - may need more complex logic
    const { data, error } = await window.supabaseClient
      .from('grouptable')
      .select('groupid, groupname');

    if (error) throw error;
    return data?.length || 0;
  } catch (error) {
    console.error("Error getting groups count:", error);
    return 0;
  }
}

// Get average scores by question
async function getAverageScoresByQuestion() {
  try {
    const { data, error } = await window.supabaseClient
      .from('rubricscore')
      .select('outcomeid, score');

    if (error) throw error;

    // Calculate averages by outcome
    const scoresByOutcome = {};
    data.forEach(row => {
      if (!scoresByOutcome[row.outcomeid]) {
        scoresByOutcome[row.outcomeid] = { total: 0, count: 0 };
      }
      scoresByOutcome[row.outcomeid].total += row.score;
      scoresByOutcome[row.outcomeid].count += 1;
    });

    // Calculate averages
    const averages = {};
    Object.keys(scoresByOutcome).forEach(outcomeId => {
      const avg = scoresByOutcome[outcomeId].total / scoresByOutcome[outcomeId].count;
      averages[outcomeId] = avg.toFixed(1);
    });

    return averages;
  } catch (error) {
    console.error("Error getting average scores:", error);
    return {};
  }
}

// Display overview stats
function displayOverviewStats(totalEvals, completedGroups, avgScores) {
  const statsContainer = document.getElementById('statsContainer');

  const avgScoresText = Object.keys(avgScores).length > 0
    ? Object.entries(avgScores).map(([id, score]) => `Q${id}: ${score}`).join(' | ')
    : 'No data available';

  statsContainer.innerHTML = `
    <div class="stat-box">
      <h3>Total Evaluations Submitted</h3>
      <div class="stat-value">${totalEvals}</div>
    </div>
    <div class="stat-box">
      <h3>Groups with Data</h3>
      <div class="stat-value">${completedGroups}</div>
    </div>
    <div class="stat-box">
      <h3>Average Scores by Criterion</h3>
      <div class="stat-value small">${avgScoresText}</div>
    </div>
  `;

  console.log("✅ Overview stats displayed");
}

// Load student roster (students + enrollments + courses + groups in parallel)
async function loadStudentRoster() {
  const loadBtn = document.getElementById('loadRosterBtn');
  if (loadBtn) { loadBtn.textContent = 'Loading…'; loadBtn.disabled = true; }

  try {
    const [
      { data: studentData, error: sErr },
      { data: enrollData,  error: eErr },
      { data: courseData,  error: cErr },
      { data: groupData,   error: gErr },
    ] = await Promise.all([
      window.supabaseClient.from('student').select('studentid, studentname, email').order('studentname'),
      window.supabaseClient.from('enrollment').select('studentid, courseid, groupid'),
      window.supabaseClient.from('course').select('courseid, coursecode'),
      window.supabaseClient.from('grouptable').select('groupid, groupname'),
    ]);
    if (sErr) throw sErr;
    if (eErr) throw eErr;
    if (cErr) throw cErr;
    if (gErr) throw gErr;

    // Build lookup maps
    courseMap = {};
    (courseData || []).forEach(c => { courseMap[c.courseid] = c.coursecode; });
    groupMap = {};
    (groupData || []).forEach(g => { groupMap[g.groupid] = g.groupname; });
    enrollments = enrollData || [];

    allStudents = (studentData || []).map(s => {
      const myEnrollments = enrollments.filter(e => e.studentid === s.studentid);
      return {
        id:      s.studentid,
        name:    s.studentname,
        email:   s.email,
        courseIds: myEnrollments.map(e => e.courseid),
        groupIds:  myEnrollments.map(e => e.groupid),
      };
    });

    populateCourseDropdown();
    refreshGroupDropdown();
    applyFilters();
  } catch (err) {
    console.error('❌ Error loading roster:', err);
    document.getElementById('studentRosterList').innerHTML =
      '<p class="no-data">Error loading roster.</p>';
  } finally {
    if (loadBtn) { loadBtn.textContent = 'Reload'; loadBtn.disabled = false; }
  }
}

function populateCourseDropdown() {
  const sel = document.getElementById('courseFilter');
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = '<option value="">All Courses</option>';
  Object.entries(courseMap)
    .sort((a, b) => a[1].localeCompare(b[1]))
    .forEach(([id, code]) => {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = code;
      sel.appendChild(opt);
    });
  sel.value = current;
}

function refreshGroupDropdown() {
  const courseSel = document.getElementById('courseFilter');
  const groupSel  = document.getElementById('groupFilter');
  if (!courseSel || !groupSel) return;

  const selectedCourseId = courseSel.value ? Number(courseSel.value) : null;
  const currentGroup = groupSel.value;

  // Determine which groupIds are relevant for the selected course
  const relevantGroupIds = selectedCourseId
    ? [...new Set(enrollments.filter(e => e.courseid === selectedCourseId).map(e => e.groupid))]
    : [...new Set(enrollments.map(e => e.groupid))];

  groupSel.innerHTML = '<option value="">All Groups</option>';
  relevantGroupIds
    .map(id => ({ id, name: groupMap[id] || `Group ${id}` }))
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach(({ id, name }) => {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = name;
      groupSel.appendChild(opt);
    });

  // Restore selection if still valid
  if ([...groupSel.options].some(o => o.value === currentGroup)) {
    groupSel.value = currentGroup;
  }
}

function applyFilters() {
  const query      = (document.getElementById('studentSearch')?.value || '').toLowerCase().trim();
  const courseId   = document.getElementById('courseFilter')?.value
                       ? Number(document.getElementById('courseFilter').value) : null;
  const groupId    = document.getElementById('groupFilter')?.value
                       ? Number(document.getElementById('groupFilter').value) : null;

  const filtered = allStudents.filter(s => {
    if (query && !s.name.toLowerCase().includes(query) && !s.email.toLowerCase().includes(query)) return false;
    if (courseId && !s.courseIds.includes(courseId)) return false;
    if (groupId  && !s.groupIds.includes(groupId))   return false;
    return true;
  });

  renderRosterList(filtered);
}

function renderRosterList(list) {
  const listEl   = document.getElementById('studentRosterList');
  const countEl  = document.getElementById('rosterCount');
  if (!listEl) return;

  if (countEl) countEl.textContent = `${list.length} student${list.length !== 1 ? 's' : ''}`;

  if (list.length === 0) {
    listEl.innerHTML = '<p class="no-data">No students match the filters.</p>';
    return;
  }

  const ul = document.createElement('ul');
  ul.className = 'student-click-list';
  list.forEach(student => {
    const li  = document.createElement('li');
    li.className = 'student-click-item';
    const btn = document.createElement('button');
    btn.className = 'student-link-btn';
    btn.type = 'button';
    btn.textContent = `${student.name} (${student.email})`;
    btn.addEventListener('click', () => loadStudentStats(student));
    li.appendChild(btn);
    ul.appendChild(li);
  });

  listEl.innerHTML = '';
  listEl.appendChild(ul);
}

// Load statistics for a specific student
async function loadStudentStats(student) {
  try {
    console.log("📈 Loading stats for student:", student.name);

    selectedStudent = student;

    // Hide roster, show stats
    document.querySelector('.roster-section').style.display = 'none';
    document.getElementById('studentStatsSection').style.display = 'block';
    document.getElementById('selectedStudentName').textContent = student.name;

    // Load all related data
    const [feedbackData, pendingData] = await Promise.all([
      getStudentFeedback(student.id),
      getPendingEvaluations(student.id)
    ]);

    // Display feedback table
    displayFeedbackTable(feedbackData);

    // Display pending evaluations table
    displayPendingTable(pendingData);

    // Create charts
    createStudentCharts(feedbackData, pendingData);

    console.log("✅ Student stats loaded");
  } catch (error) {
    console.error("❌ Error loading student stats:", error);
    alert("Failed to load student statistics: " + error.message);
  }
}

// Get feedback for a student
async function getStudentFeedback(studentId) {
  try {
    // Query peerevaluation where the student is the evaluatee
    const { data: evalData, error: evalError } = await window.supabaseClient
      .from('peerevaluation')
      .select('evaluationid, evaluateestudentid, scheduleid')
      .eq('evaluateestudentid', studentId);

    if (evalError) throw evalError;

    if (!evalData || evalData.length === 0) {
      return [];
    }

    // For each evaluation, get the rubric scores and outcome details
    const allFeedback = [];
    for (const evaluation of evalData) {
      // Get rubric scores for this evaluation
      const { data: scoreData, error: scoreError } = await window.supabaseClient
        .from('rubricscore')
        .select('scoreid, evaluationid, outcomeid, score, comment')
        .eq('evaluationid', evaluation.evaluationid);

      if (scoreError) throw scoreError;

      // Get evaluation schedule details (course and group)
      const { data: scheduleData, error: scheduleError } = await window.supabaseClient
        .from('evaluationschedule')
        .select('scheduleid, courseid, groupid')
        .eq('scheduleid', evaluation.scheduleid)
        .single();

      if (scheduleError && scheduleError.code !== 'PGRST116') throw scheduleError;

      // Get course details
      let courseCode = 'N/A';
      let groupName = 'N/A';
      if (scheduleData) {
        const { data: courseData, error: courseError } = await window.supabaseClient
          .from('course')
          .select('coursecode')
          .eq('courseid', scheduleData.courseid)
          .single();
        if (courseError && courseError.code !== 'PGRST116') throw courseError;
        if (courseData) courseCode = courseData.coursecode;

        // Get group details
        const { data: groupData, error: groupError } = await window.supabaseClient
          .from('grouptable')
          .select('groupname')
          .eq('groupid', scheduleData.groupid)
          .single();
        if (groupError && groupError.code !== 'PGRST116') throw groupError;
        if (groupData) groupName = groupData.groupname;
      }

      // Get outcome names for all scores
      for (const score of scoreData) {
        const { data: outcomeData, error: outcomeError } = await window.supabaseClient
          .from('learningoutcome')
          .select('outcomename')
          .eq('outcomeid', score.outcomeid)
          .single();

        if (outcomeError && outcomeError.code !== 'PGRST116') throw outcomeError;

        allFeedback.push({
          evaluationid: evaluation.evaluationid,
          courseCode: courseCode,
          groupName: groupName,
          outcomeName: outcomeData?.outcomename || `Outcome ${score.outcomeid}`,
          score: score.score,
          comment: score.comment
        });
      }
    }

    return allFeedback;
  } catch (error) {
    console.error("Error getting feedback:", error);
    return [];
  }
}

// Get pending evaluations for a student
async function getPendingEvaluations(studentId) {
  try {
    // For now, this is a simplified version that queries enrollments
    // In a real scenario, you'd compare what evaluations they're enrolled in
    // vs what they've actually submitted
    const { data, error } = await window.supabaseClient
      .from('enrollment')
      .select('studentid, courseid, groupid')
      .eq('studentid', studentId);

    if (error) throw error;

    const pendingList = [];
    for (const enrollment of data || []) {
      // Get course code
      const { data: courseData, error: courseError } = await window.supabaseClient
        .from('course')
        .select('coursecode')
        .eq('courseid', enrollment.courseid)
        .single();

      if (courseError && courseError.code !== 'PGRST116') throw courseError;

      // Get group name
      const { data: groupData, error: groupError } = await window.supabaseClient
        .from('grouptable')
        .select('groupname')
        .eq('groupid', enrollment.groupid)
        .single();

      if (groupError && groupError.code !== 'PGRST116') throw groupError;

      pendingList.push({
        studentName: 'Another Student',
        courseCode: courseData?.coursecode || 'N/A',
        groupName: groupData?.groupname || 'N/A',
        dueDate: '2026-03-31',
        status: 'Pending'
      });
    }

    return pendingList;
  } catch (error) {
    console.error("Error getting pending evaluations:", error);
    return [];
  }
}

// Display feedback table
function displayFeedbackTable(feedbackData) {
  const tbody = document.getElementById('feedbackTableBody');

  if (!tbody) return;

  tbody.innerHTML = '';

  if (feedbackData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="no-data">No feedback data available</td></tr>';
    return;
  }

  feedbackData.forEach(feedback => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${feedback.courseCode}</td>
      <td>${feedback.groupName}</td>
      <td>${feedback.outcomeName}</td>
      <td>${feedback.comment || 'No comment'}</td>
    `;
    tbody.appendChild(row);
  });

  console.log("✅ Feedback table displayed");
}

// Display pending evaluations table
function displayPendingTable(pendingData) {
  const tbody = document.getElementById('pendingTableBody');

  if (!tbody) return;

  tbody.innerHTML = '';

  if (pendingData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="no-data">No pending evaluations</td></tr>';
    return;
  }

  pendingData.forEach(pending => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${pending.studentName}</td>
      <td>${pending.courseCode}</td>
      <td>${pending.groupName}</td>
      <td>${pending.dueDate}</td>
      <td><span class="status-badge pending">${pending.status}</span></td>
    `;
    tbody.appendChild(row);
  });

  console.log("✅ Pending table displayed");
}

// Create charts for student
function createStudentCharts(feedbackData, pendingData) {
  // Destroy existing charts if they exist
  if (averageScoreChart) {
    averageScoreChart.destroy();
  }
  if (groupStatusChart) {
    groupStatusChart.destroy();
  }

  // Average score chart
  createAverageScoreChart(feedbackData);

  // Group status chart
  createGroupStatusChart(feedbackData, pendingData);
}

// Create average score by criterion chart
function createAverageScoreChart(feedbackData) {
  const ctx = document.getElementById('averageScoreChart');

  if (!ctx) return;

  // Group scores by outcome
  const scoresByOutcome = {};
  feedbackData.forEach(feedback => {
    const outcomeName = feedback.outcomeName;
    if (!scoresByOutcome[outcomeName]) {
      scoresByOutcome[outcomeName] = [];
    }
    scoresByOutcome[outcomeName].push(feedback.score);
  });

  // Calculate averages
  const labels = Object.keys(scoresByOutcome);
  const averages = labels.map(label => {
    const scores = scoresByOutcome[label];
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    return avg.toFixed(1);
  });

  averageScoreChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Average Score',
        data: averages,
        backgroundColor: '#4c69b7',
        borderRadius: 6,
        borderSkipped: false,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { beginAtZero: true, max: 5, ticks: { font: { size: 11 } }, grid: { color: 'rgba(0,0,0,0.06)' } },
        x: { grid: { display: false }, ticks: { font: { size: 11 } } },
      },
      plugins: { legend: { display: false } },
    }
  });

  console.log("✅ Average score chart created");
}

// Create submitted vs pending by group chart
function createGroupStatusChart(feedbackData, pendingData) {
  const ctx = document.getElementById('groupStatusChart');

  if (!ctx) return;

  // Group submitted evaluations
  const submittedByGroup = {};
  feedbackData.forEach(feedback => {
    const groupName = feedback.groupName;
    submittedByGroup[groupName] = (submittedByGroup[groupName] || 0) + 1;
  });

  // Group pending evaluations
  const pendingByGroup = {};
  pendingData.forEach(pending => {
    const groupName = pending.groupName;
    pendingByGroup[groupName] = (pendingByGroup[groupName] || 0) + 1;
  });

  const allGroups = [...new Set([...Object.keys(submittedByGroup), ...Object.keys(pendingByGroup)])];
  const submitted = allGroups.map(group => submittedByGroup[group] || 0);
  const pending = allGroups.map(group => pendingByGroup[group] || 0);

  groupStatusChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: allGroups,
      datasets: [
        {
          label: 'Submitted',
          data: submitted,
          backgroundColor: '#0e1b63',
          borderRadius: 6,
          borderSkipped: false,
        },
        {
          label: 'Pending',
          data: pending,
          backgroundColor: '#b8963a',
          borderRadius: 6,
          borderSkipped: false,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 11 } } },
        y: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 11 } }, grid: { color: 'rgba(0,0,0,0.06)' } },
      },
      plugins: {
        legend: { position: 'top', labels: { font: { size: 11 }, boxWidth: 12 } },
      }
    }
  });

  console.log("✅ Group status chart created");
}

// ─── Overall Statistics ───────────────────────────────────────────────────────

async function loadProfessorCourses() {
  if (!currentUser) return;
  const { data: courses, error } = await window.supabaseClient
    .from('course')
    .select('courseid, coursecode')
    .eq('professorid', currentUser.id)
    .order('coursecode');
  if (error) { console.error('loadProfessorCourses:', error); return; }

  const sel = document.getElementById('osCourseSelect');
  (courses || []).forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.courseid;
    opt.textContent = c.coursecode;
    sel.appendChild(opt);
  });
}

async function onOsCourseChange() {
  const courseId = Number(document.getElementById('osCourseSelect').value);
  const groupsRow = document.getElementById('osGroupsRow');
  const pillsEl   = document.getElementById('osGroupPills');
  const hint      = document.getElementById('osFilterHint');
  const loadBtn   = document.getElementById('osLoadBtn');

  // Reset
  document.getElementById('osChartsArea').style.display = 'none';
  loadBtn.disabled = true;

  if (!courseId) {
    groupsRow.style.display = 'none';
    hint.textContent = 'Select a course to begin';
    return;
  }

  hint.textContent = 'Loading groups…';
  pillsEl.innerHTML = '';

  // Fetch groups in this course
  const { data: enr } = await window.supabaseClient
    .from('enrollment')
    .select('groupid')
    .eq('courseid', courseId);

  const groupIds = [...new Set((enr || []).map(e => e.groupid).filter(Boolean))];
  if (groupIds.length === 0) {
    groupsRow.style.display = 'none';
    hint.textContent = 'No groups found for this course.';
    return;
  }

  const { data: groups } = await window.supabaseClient
    .from('grouptable')
    .select('groupid, groupname')
    .in('groupid', groupIds)
    .order('groupname');

  // Render pill checkboxes
  (groups || []).forEach(g => {
    const label = document.createElement('label');
    label.className = 'os-pill';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = g.groupid;
    cb.checked = true;
    cb.addEventListener('change', updateOsLoadBtn);
    label.appendChild(cb);
    label.appendChild(document.createTextNode(g.groupname));
    pillsEl.appendChild(label);
  });

  groupsRow.style.display = '';
  hint.textContent = 'Choose groups then click Load Charts';
  updateOsLoadBtn();
}

function updateOsLoadBtn() {
  const courseId  = document.getElementById('osCourseSelect').value;
  const anyGroup  = [...document.querySelectorAll('#osGroupPills input:checked')].length > 0;
  document.getElementById('osLoadBtn').disabled = !courseId || !anyGroup;
}

async function loadOverallCharts() {
  const courseId       = Number(document.getElementById('osCourseSelect').value);
  const selectedGids   = [...document.querySelectorAll('#osGroupPills input:checked')]
                           .map(cb => Number(cb.value));
  if (!courseId || selectedGids.length === 0) return;

  const btn = document.getElementById('osLoadBtn');
  btn.textContent = 'Loading…';
  btn.disabled = true;

  try {
    // Fetch in parallel: groups, schedules, enrollments
    const [
      { data: groups },
      { data: schedules },
      { data: enrData },
    ] = await Promise.all([
      window.supabaseClient.from('grouptable').select('groupid, groupname').in('groupid', selectedGids),
      window.supabaseClient.from('evaluationschedule').select('scheduleid, groupid').eq('courseid', courseId).in('groupid', selectedGids),
      window.supabaseClient.from('enrollment').select('studentid, groupid').eq('courseid', courseId).in('groupid', selectedGids),
    ]);

    const gidToName = {};
    (groups || []).forEach(g => { gidToName[g.groupid] = g.groupname; });

    const schedMap = {};  // scheduleid → groupid
    (schedules || []).forEach(s => { schedMap[s.scheduleid] = s.groupid; });

    const schedIdsPerGroup = {};  // groupid → scheduleid[]
    (schedules || []).forEach(s => {
      schedIdsPerGroup[s.groupid] = schedIdsPerGroup[s.groupid] || [];
      schedIdsPerGroup[s.groupid].push(s.scheduleid);
    });

    const membersPerGroup = {};  // groupid → count
    (enrData || []).forEach(e => {
      membersPerGroup[e.groupid] = (membersPerGroup[e.groupid] || 0) + 1;
    });

    // Fetch submitted evaluations for these schedules
    const scheduleIds = Object.keys(schedMap).map(Number);
    let evals = [];
    if (scheduleIds.length > 0) {
      const { data: evData } = await window.supabaseClient
        .from('peerevaluation')
        .select('scheduleid')
        .in('scheduleid', scheduleIds);
      evals = evData || [];
    }

    const submittedPerGroup = {};
    evals.forEach(ev => {
      const gid = schedMap[ev.scheduleid];
      if (gid) submittedPerGroup[gid] = (submittedPerGroup[gid] || 0) + 1;
    });

    // Expected per group = schedules × n × (n-1)
    const expectedPerGroup = {};
    selectedGids.forEach(gid => {
      const n  = membersPerGroup[gid] || 0;
      const ns = (schedIdsPerGroup[gid] || []).length;
      expectedPerGroup[gid] = n * (n - 1) * ns;
    });

    // Sort groups alphabetically
    const sortedGids = [...selectedGids].sort((a, b) =>
      (gidToName[a] || '').localeCompare(gidToName[b] || ''));
    const labels   = sortedGids.map(gid => gidToName[gid] || `Group ${gid}`);
    const submitted = sortedGids.map(gid => submittedPerGroup[gid] || 0);
    const rates     = sortedGids.map(gid => {
      const exp = expectedPerGroup[gid] || 0;
      const sub = submittedPerGroup[gid] || 0;
      return exp === 0 ? 0 : Math.min(100, Math.round((sub / exp) * 100));
    });

    const totalSub  = evals.length;
    const totalExp  = selectedGids.reduce((s, gid) => s + (expectedPerGroup[gid] || 0), 0);
    const totalMiss = Math.max(0, totalExp - totalSub);

    // Update chart titles with course code
    const courseCode = document.getElementById('osCourseSelect').selectedOptions[0]?.text || '';
    document.getElementById('osSubmissionsTitle').textContent = `Submissions by Group — ${courseCode}`;
    document.getElementById('osCompletionTitle').textContent  = `Completion Rate by Group — ${courseCode}`;

    // Destroy old charts
    osSubmissionsChart?.destroy();
    osCompletionChart?.destroy();
    osStatusPie?.destroy();

    const chartDefaults = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
    };

    // Chart 1: Submissions
    osSubmissionsChart = new Chart(
      document.getElementById('osSubmissionsChart').getContext('2d'), {
      type: 'bar',
      data: { labels, datasets: [{ label: 'Submissions', data: submitted,
        backgroundColor: '#4c69b7', borderRadius: 6, borderSkipped: false }] },
      options: { ...chartDefaults, scales: {
        x: { grid: { display: false }, ticks: { font: { size: 11 } } },
        y: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 11 } }, grid: { color: 'rgba(0,0,0,0.06)' } },
      }},
    });

    // Chart 2: Completion rate
    osCompletionChart = new Chart(
      document.getElementById('osCompletionChart').getContext('2d'), {
      type: 'bar',
      data: { labels, datasets: [{ label: 'Completion %', data: rates,
        backgroundColor: '#0e1b63', borderRadius: 6, borderSkipped: false }] },
      options: { ...chartDefaults, scales: {
        x: { grid: { display: false }, ticks: { font: { size: 11 } } },
        y: { beginAtZero: true, max: 100,
          ticks: { font: { size: 11 }, callback: v => v + '%' },
          grid: { color: 'rgba(0,0,0,0.06)' } },
      }},
    });

    // Chart 3: Pie
    osStatusPie = new Chart(
      document.getElementById('osStatusPie').getContext('2d'), {
      type: 'pie',
      data: {
        labels: ['Submitted', 'Missing'],
        datasets: [{ data: [totalSub, totalMiss],
          backgroundColor: ['#4c69b7', '#b8963a'], borderWidth: 0 }],
      },
      options: { responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'right', labels: { font: { size: 12 }, padding: 16 } } } },
    });

    document.getElementById('osChartsArea').style.display = '';
  } catch (e) {
    console.error('loadOverallCharts:', e);
  } finally {
    btn.textContent = 'Load Charts';
    btn.disabled = false;
  }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', initEvaluationStatus);