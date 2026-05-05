// Simple Student Roster Dashboard
let students = [];

// Initialize dashboard
function initDashboard() {
  console.log("🚀 Initializing simple dashboard...");

  // Setup event listeners
  setupEventListeners();

  console.log("✅ Simple dashboard initialized");
}

// Setup event listeners
function setupEventListeners() {
  const loadBtn = document.getElementById('loadStudentsBtn');
  if (loadBtn) {
    loadBtn.addEventListener('click', loadStudents);
  }

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      window.location.href = 'login.html';
    });
  }
}

// Load students from database
async function loadStudents() {
  try {
    console.log("🚀 Loading students from database...");

    const loadBtn = document.getElementById('loadStudentsBtn');
    loadBtn.textContent = 'Loading...';
    loadBtn.disabled = true;

    // Fetch students
    const { data: studentData, error: studentError } = await window.supabaseClient
      .from("student")
      .select("studentid, studentname, email");

    if (studentError) {
      console.error("❌ Error loading students:", studentError);
      alert("Error loading students: " + studentError.message);
      loadBtn.textContent = 'Load Student Roster';
      loadBtn.disabled = false;
      return;
    }

      // Only fetch students for the roster
      students = studentData.map(s => ({ id: s.studentid, name: s.studentname, email: s.email }));

    console.log("✅ Loaded", students.length, "users");

    // Display the list
    displayStudentList();

    loadBtn.textContent = 'Reload Student Roster';
    loadBtn.disabled = false;

  } catch (error) {
    console.error("💥 Error in loadStudents:", error);
    alert("Failed to load students: " + error.message);

    const loadBtn = document.getElementById('loadStudentsBtn');
    loadBtn.textContent = 'Load Student Roster';
    loadBtn.disabled = false;
  }
}

// Display student list
function displayStudentList() {
  const listElement = document.getElementById('studentList');

  if (!listElement) {
    console.error("❌ Student list element not found!");
    return;
  }

  listElement.innerHTML = '';

  if (students.length === 0) {
    listElement.innerHTML = '<p>No students found.</p>';
    return;
  }

  const ul = document.createElement('ul');
  ul.className = 'student-ul';

    students.forEach(student => {
      const li = document.createElement('li');
      li.className = 'student-li';
      const btn = document.createElement('button');
      btn.className = 'student-button';
      btn.type = 'button';
      btn.textContent = `${student.name} (${student.email})`;
      btn.addEventListener('click', () => selectStudent(student));
      li.appendChild(btn);
      ul.appendChild(li);
    });

  listElement.appendChild(ul);

  console.log("✅ Student list displayed");
}

// Select a student and show their details
function selectStudent(student) {
  console.log("👆 Selected student:", student);
  const selectedStudentText = document.getElementById('selectedStudentText');
  const selectedStudentId = document.getElementById('selectedStudentId');

  if (selectedStudentText) {
    selectedStudentText.textContent = `${student.name} (${student.email})`;
  }
  if (selectedStudentId) {
    selectedStudentId.textContent = `ID: ${student.id}`;
  }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', initDashboard);

