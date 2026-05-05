const OUTCOME_LABELS = ['Communication', 'Teamwork', 'Technical', 'Leadership'];
const CHART_COLORS   = ['#b8963a', '#c8a84a', '#7a6020', '#e8c870'];

let pieChart, barChart;

async function init() {
  const user = await window.auth.getCurrentUser();
  if (!user || user.role !== 'student') {
    window.location.href = 'login.html';
    return;
  }
  await loadData(user.id);
}

async function loadData(studentId) {
  // Fetch all data in parallel
  const [
    { data: enrollments },
    { data: myEvals },
  ] = await Promise.all([
    window.supabaseClient
      .from('enrollment')
      .select('courseid, groupid')
      .eq('studentid', studentId)
      .not('groupid', 'is', null),
    window.supabaseClient
      .from('peerevaluation')
      .select('evaluationid')
      .eq('evaluateestudentid', studentId),
  ]);

  // Build outcome score averages for the charts
  const evalIds = (myEvals || []).map(e => e.evaluationid);
  const outcomeMap = { 1: [], 2: [], 3: [], 4: [] };

  if (evalIds.length > 0) {
    const { data: scores } = await window.supabaseClient
      .from('rubricscore')
      .select('outcomeid, score')
      .in('evaluationid', evalIds);

    (scores || []).forEach(s => {
      if (outcomeMap[s.outcomeid]) outcomeMap[s.outcomeid].push(s.score);
    });
  }

  const outcomeAvgs = [1, 2, 3, 4].map(id => {
    const arr = outcomeMap[id];
    if (!arr.length) return 0;
    return Math.round((arr.reduce((a, b) => a + b, 0) / arr.length / 5) * 100);
  });

  renderPieChart(outcomeAvgs);
  renderBarChart(outcomeAvgs);

  // Load groupmates and their scores
  if (!enrollments || enrollments.length === 0) {
    document.getElementById('studentGrid').innerHTML = '<p class="shome-hint">No group data found.</p>';
    return;
  }

  const enr = enrollments[0];
  const { data: groupmates } = await window.supabaseClient
    .from('enrollment')
    .select('studentid, student(studentid, studentname)')
    .eq('courseid', enr.courseid)
    .eq('groupid', enr.groupid)
    .neq('studentid', studentId);

  if (!groupmates || groupmates.length === 0) {
    document.getElementById('studentGrid').innerHTML = '<p class="shome-hint">No groupmates found.</p>';
    return;
  }

  const students = await Promise.all(
    groupmates
      .filter(gm => gm.student)
      .map(async gm => {
        const { data: theirEvals } = await window.supabaseClient
          .from('peerevaluation')
          .select('evaluationid')
          .eq('evaluateestudentid', gm.student.studentid);

        const ids = (theirEvals || []).map(e => e.evaluationid);
        let avg = 0;

        if (ids.length > 0) {
          const { data: sc } = await window.supabaseClient
            .from('rubricscore')
            .select('score')
            .in('evaluationid', ids);
          const vals = (sc || []).map(s => s.score).filter(v => v != null);
          if (vals.length) {
            avg = Math.round((vals.reduce((a, b) => a + b, 0) / vals.length / 5) * 100);
          }
        }

        return { name: gm.student.studentname, avg };
      })
  );

  renderStudentCards(students);
}

function renderPieChart(data) {
  const ctx = document.getElementById('pieChart').getContext('2d');
  if (pieChart) pieChart.destroy();
  pieChart = new Chart(ctx, {
    type: 'pie',
    plugins: [ChartDataLabels],
    data: {
      labels: OUTCOME_LABELS,
      datasets: [{
        data,
        backgroundColor: CHART_COLORS,
        borderColor: '#1a2563',
        borderWidth: 1,
      }],
    },
    options: {
      plugins: {
        legend: { display: false },
        datalabels: {
          color: '#fff',
          font: { weight: 'bold', size: 12 },
          formatter: v => v ? `${v}%` : '',
        },
        tooltip: {
          callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed}%` },
        },
      },
    },
  });
}

function renderBarChart(data) {
  const ctx = document.getElementById('barChart').getContext('2d');
  if (barChart) barChart.destroy();
  barChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.map(v => `${v}%`),
      datasets: [{
        data,
        backgroundColor: CHART_COLORS,
        borderRadius: 4,
      }],
    },
    options: {
      plugins: {
        legend: { display: false },
        datalabels: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => OUTCOME_LABELS[items[0].dataIndex],
            label: ctx => ` ${ctx.parsed.y}%`,
          },
        },
      },
      scales: {
        y: { display: false, min: 0, max: 100 },
        x: {
          ticks: { color: '#fff', font: { size: 11, weight: '600' } },
          grid: { display: false },
          border: { color: 'rgba(255,255,255,0.3)' },
        },
      },
    },
  });
}

function renderStudentCards(students) {
  const grid = document.getElementById('studentGrid');
  if (!students.length) {
    grid.innerHTML = '<p class="shome-hint">No groupmates found.</p>';
    return;
  }
  grid.innerHTML = students.map(s => `
    <div class="glo-student-card">
      <div class="glo-student-name">${esc(s.name)}</div>
      <div class="glo-student-score">Average Score: ${s.avg}%</div>
    </div>
  `).join('');
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
}

document.addEventListener('DOMContentLoaded', init);
