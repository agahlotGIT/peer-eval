const QUESTIONS = [
  { id: "q1", prompt: "How would you rate their communication skills?", type: "scale" },
  { id: "q2", prompt: "What would you rate the way they completed work?", type: "scale" },
  { id: "q3", prompt: "How reliable were they with deadlines?", type: "scale" },
  { id: "q4", prompt: "How well did they collaborate with the team?", type: "scale" },
  { id: "q5", prompt: "How proactive were they in contributing ideas?", type: "scale" },
  { id: "q6", prompt: "How would you rate the quality of their deliverables?", type: "scale" },
  { id: "q7", prompt: "How well did they handle feedback?", type: "scale" },
  { id: "q8", prompt: "How well did they take ownership of tasks?", type: "scale" },
  { id: "q9", prompt: "How professional was their attitude?", type: "scale" },
  { id: "q10", prompt: "Anything else you want to share?", type: "text" },
];

const STORAGE_KEY = "peer_eval_draft_v1";

function getParam(name, fallback) {
  const url = new URL(window.location.href);
  const v = url.searchParams.get(name);
  return v && v.trim().length ? v.trim() : fallback;
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function readDraft() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeDraft(draft) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // ignore storage failures
  }
}

function collectAnswers(container) {
  const answers = {};
  for (const q of QUESTIONS) {
    if (q.type === "scale") {
      const chosen = container.querySelector(`input[name="${q.id}"]:checked`);
      if (chosen) answers[q.id] = Number(chosen.value);
      continue;
    }
    if (q.type === "text") {
      const ta = container.querySelector(`textarea[name="${q.id}"]`);
      if (ta) answers[q.id] = ta.value;
      continue;
    }
  }
  return answers;
}

function computeAnsweredCount(container) {
  let answered = 0;

  for (const q of QUESTIONS) {
    if (q.type === "scale") {
      const chosen = container.querySelector(`input[name="${q.id}"]:checked`);
      if (chosen) answered += 1;
      continue;
    }

    if (q.type === "text") {
      const ta = container.querySelector(`textarea[name="${q.id}"]`);
      if (ta && ta.value.trim().length > 0) answered += 1;
      continue;
    }
  }

  return answered;
}

function setProgress(answered) {
  const total = QUESTIONS.length;
  const pct = Math.round((answered / total) * 100);
  const fill = document.getElementById("progressFill");
  const value = document.getElementById("progressValue");
  const pb = document.querySelector(".progress");

  if (fill) fill.style.width = `${pct}%`;
  if (value) value.textContent = `${pct}%`;
  if (pb) pb.setAttribute("aria-valuenow", String(pct));
}

function goToSubmitIfComplete(answered) {
  if (answered !== QUESTIONS.length) return;

  const params = new URLSearchParams();
  const fromNameEl = document.getElementById("fromName");
  const evaluateeSelect = document.getElementById("evaluateeSelect");

  const fromName = (fromNameEl && fromNameEl.textContent && fromNameEl.textContent.trim()) || getParam("from", "Student A");
  params.set("from", fromName);

  // Evaluatee comes from the dropdown (preferred). Fallback to URL param.
  if (evaluateeSelect) {
    const selectedId = evaluateeSelect.value;
    const opt = evaluateeSelect.options[evaluateeSelect.selectedIndex];
    const selectedName = opt ? opt.textContent : getParam("to", "Student B");
    if (selectedId) {
      params.set("evaluateeStudentId", selectedId);
      params.set("to", selectedName || "Student B");
    } else {
      const evaluateeStudentIdFallback = getParam("evaluateeStudentId", "");
      const toFallback = getParam("to", "Student B");
      if (evaluateeStudentIdFallback) params.set("evaluateeStudentId", evaluateeStudentIdFallback);
      params.set("to", toFallback);
    }
  } else {
    params.set("to", getParam("to", "Student B"));
  }

  const scheduleId = getParam("scheduleId", "");
  const evaluatorStudentId = getParam("evaluatorStudentId", "");

  if (scheduleId) params.set("scheduleId", scheduleId);
  if (evaluatorStudentId) params.set("evaluatorStudentId", evaluatorStudentId);

  window.location.href = `./submit.html?${params.toString()}`;
}

function renderScaleQuestion(q) {
  const wrapper = document.createElement("div");
  wrapper.className = "q";

  const prompt = document.createElement("div");
  prompt.className = "q__prompt";
  prompt.textContent = q.prompt;

  const scale = document.createElement("div");
  scale.className = "scale";

  for (let n = 1; n <= 5; n += 1) {
    const label = document.createElement("label");

    const input = document.createElement("input");
    input.type = "radio";
    input.name = q.id;
    input.value = String(n);
    input.setAttribute("aria-label", `${q.prompt} ${n}`);

    const num = document.createElement("div");
    num.textContent = String(n);

    label.appendChild(input);
    label.appendChild(num);
    scale.appendChild(label);
  }

  wrapper.appendChild(prompt);
  wrapper.appendChild(scale);
  return wrapper;
}

function renderTextQuestion(q) {
  const wrapper = document.createElement("div");
  wrapper.className = "q";

  const prompt = document.createElement("div");
  prompt.className = "q__prompt";
  prompt.textContent = q.prompt;

  const box = document.createElement("div");
  box.className = "textbox";

  const ta = document.createElement("textarea");
  ta.name = q.id;
  ta.placeholder = "Write your feedback here…";

  box.appendChild(ta);
  wrapper.appendChild(prompt);
  wrapper.appendChild(box);
  return wrapper;
}

async function init() {
  const container = document.getElementById("questionContainer");
  const nextBtn = document.getElementById("nextBtn");
  if (!container) return;

  // Render questions immediately so the form is visible
  // even if student lookup is slow/unavailable.
  container.innerHTML = "";
  for (const q of QUESTIONS) {
    const node = q.type === "text" ? renderTextQuestion(q) : renderScaleQuestion(q);
    container.appendChild(node);
  }

  const evaluatorStudentIdParam = getParam("evaluatorStudentId", "");
  const evaluateeStudentIdParam = getParam("evaluateeStudentId", "");
  const fromFallback = getParam("from", "Student A");
  const toFallback = getParam("to", "Student B");

  const evaluateeSelect = document.getElementById("evaluateeSelect");

  let evaluatorStudentId = evaluatorStudentIdParam || "";
  let evaluateeStudentId = evaluateeStudentIdParam || "";
  let evaluatorName = fromFallback;
  let evaluateeName = toFallback;

  async function loadStudents() {
    if (!window.supabaseClient) throw new Error("Supabase client not initialized.");

    // If a scheduleId is present, load only the groupmates for that schedule
    const scheduleId = getParam("scheduleId", "");
    const evaluatorId = getParam("evaluatorStudentId", "");
    if (scheduleId && evaluatorId) {
      const { data: sched } = await window.supabaseClient
        .from("evaluationschedule")
        .select("courseid, groupid")
        .eq("scheduleid", scheduleId)
        .single();
      if (sched) {
        const { data: mates, error } = await window.supabaseClient
          .from("enrollment")
          .select("studentid, student(studentid, studentname)")
          .eq("courseid", sched.courseid)
          .eq("groupid", sched.groupid)
          .neq("studentid", evaluatorId);
        if (error) throw error;
        return (mates || [])
          .filter(m => m.student)
          .map(m => ({ studentid: m.student.studentid, studentname: m.student.studentname }));
      }
    }

    // Fallback: load all students (legacy / direct URL access)
    const { data, error } = await window.supabaseClient.from("student").select("studentid, studentname");
    if (error) throw error;
    return data || [];
  }

  if (evaluateeSelect) {
    try {
      const students = await loadStudents();
      if (students.length) {
        evaluateeSelect.innerHTML = "";
        for (const s of students) {
          const opt = document.createElement("option");
          opt.value = String(s.studentid);
          opt.textContent = s.studentname;
          evaluateeSelect.appendChild(opt);
        }

        // Set evaluator name if we have its ID
        if (evaluatorStudentId) {
          const match = students.find((s) => String(s.studentid) === String(evaluatorStudentId));
          if (match) evaluatorName = match.studentname;
        }

        // Set selected evaluatee
        if (evaluateeStudentId) {
          const match = students.find((s) => String(s.studentid) === String(evaluateeStudentId));
          if (match) evaluateeName = match.studentname;
        } else if (students[0]) {
          evaluateeStudentId = String(students[0].studentid);
          evaluateeName = students[0].studentname;
        }

        // Reflect selection in UI
        if (evaluateeStudentId) evaluateeSelect.value = String(evaluateeStudentId);
        setText("fromName", evaluatorName);
      }
    } catch (e) {
      console.error("Failed to load students:", e);
      // Still render the form; dropdown will be empty and submit relies on URL fallback.
      setText("fromName", evaluatorName);
    }
  } else {
    // If dropdown isn't present, keep original behavior.
    setText("fromName", evaluatorName);
  }

  const draft = readDraft();
  const sameByIds =
    draft &&
    draft.evaluatorStudentId &&
    draft.evaluateeStudentId &&
    evaluatorStudentId &&
    evaluateeStudentId &&
    String(draft.evaluatorStudentId) === String(evaluatorStudentId) &&
    String(draft.evaluateeStudentId) === String(evaluateeStudentId);
  const sameByLegacy = draft && draft.from === evaluatorName && draft.to === evaluateeName;

  if ((sameByIds || sameByLegacy) && draft && draft.answers && typeof draft.answers === "object") {
    for (const q of QUESTIONS) {
      const saved = draft.answers[q.id];
      if (q.type === "scale" && typeof saved === "number") {
        const input = container.querySelector(`input[name="${q.id}"][value="${saved}"]`);
        if (input && input instanceof HTMLInputElement) input.checked = true;
      }
      if (q.type === "text" && typeof saved === "string") {
        const ta = container.querySelector(`textarea[name="${q.id}"]`);
        if (ta && ta instanceof HTMLTextAreaElement) ta.value = saved;
      }
    }
  }

  const onAnyChange = () => {
    const answered = computeAnsweredCount(container);
    setProgress(answered);

    const answers = collectAnswers(container);
    // Keep draft grouped by evaluated pair so switching dropdown doesn't show the wrong draft later.
    writeDraft({
      evaluatorStudentId: evaluatorStudentId || getParam("evaluatorStudentId", ""),
      evaluateeStudentId: evaluateeStudentId || getParam("evaluateeStudentId", ""),
      from: evaluatorName,
      to: evaluateeName,
      answers,
      updatedAt: Date.now(),
    });

    if (nextBtn && nextBtn instanceof HTMLButtonElement) {
      nextBtn.disabled = answered !== QUESTIONS.length;
    }
  };

  container.addEventListener("change", onAnyChange);
  container.addEventListener("input", onAnyChange);

  if (evaluateeSelect) {
    evaluateeSelect.addEventListener("change", () => {
      evaluateeStudentId = evaluateeSelect.value;
      const opt = evaluateeSelect.options[evaluateeSelect.selectedIndex];
      evaluateeName = opt ? opt.textContent : evaluateeName;
      // Update draft metadata immediately.
      onAnyChange();
    });
  }

  if (nextBtn && nextBtn instanceof HTMLButtonElement) {
    nextBtn.addEventListener("click", () => {
      const answered = computeAnsweredCount(container);
      if (answered === QUESTIONS.length) {
        goToSubmitIfComplete(answered);
      }
    });
  }

  onAnyChange();
}

init().catch((e) => {
  console.error("Init failed:", e);
});

// Logout functionality
document.getElementById('logoutBtn').addEventListener('click', () => {
  window.authUtils.logout();
});

