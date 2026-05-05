function getParam(name, fallback) {
  const url = new URL(window.location.href);
  const v = url.searchParams.get(name);
  return v && v.trim().length ? v.trim() : fallback;
}

const STORAGE_KEY = "peer_eval_draft_v1";

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

function clearDraft() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

function openModal() {
  const modal = document.getElementById("modal");
  if (!modal) return;
  modal.setAttribute("data-open", "true");
  modal.setAttribute("aria-hidden", "false");
}

function closeModal() {
  const modal = document.getElementById("modal");
  if (!modal) return;
  modal.removeAttribute("data-open");
  modal.setAttribute("aria-hidden", "true");
}

function setStatus(text) {
  const el = document.getElementById("statusText");
  if (el) el.textContent = text;
}

function formatErrorMessage(err) {
  if (err instanceof Error && err.message) return err.message;
  if (err && typeof err === "object") {
    const e = err;
    const code = typeof e.code === "string" ? e.code : "";
    const msg = typeof e.message === "string" ? e.message : "";
    const details = typeof e.details === "string" ? e.details : "";
    const hint = typeof e.hint === "string" ? e.hint : "";
    const joined = [msg, details, hint].filter(Boolean).join(" | ");
    if (code && joined) return `${code}: ${joined}`;
    if (joined) return joined;
    if (code) return code;
  }
  return "Submission failed.";
}

async function submitToSupabase(payload) {
  if (!window.db || typeof window.db.submitPeerEvaluation !== "function") {
    throw new Error("Supabase client not initialized.");
  }

  return await window.db.submitPeerEvaluation({
    evaluatorStudentId: payload.evaluatorStudentId,
    evaluateeStudentId: payload.evaluateeStudentId,
    scheduleId: payload.scheduleId,
    fromName: payload.from,
    toName: payload.to,
    answers: payload.answers,
    submittedAt: payload.submittedAt,
  });
}

function buildDashboardUrl() {
  return `./sHome.html`;
}

function init() {
  const yesBtn = document.getElementById("yesBtn");
  const noBtn = document.getElementById("noBtn");
  const closeBtn = document.getElementById("closeModalBtn");
  const modal = document.getElementById("modal");

  const from = encodeURIComponent(getParam("from", "Student A"));
  const to = encodeURIComponent(getParam("to", "Student B"));
  const backUrl = `./index.html?from=${from}&to=${to}`;

  if (yesBtn) {
    yesBtn.addEventListener("click", async () => {
      setStatus("");
      yesBtn.disabled = true;
      noBtn && (noBtn.disabled = true);

      try {
        const draft = readDraft();
        if (!draft || !draft.answers) {
          throw new Error("No saved answers found. Please go back and complete the form.");
        }

        const scheduleId = getParam("scheduleId", "");
        const evaluatorStudentId = getParam("evaluatorStudentId", "");
        const evaluateeStudentId = getParam("evaluateeStudentId", "");

        const payload = {
          from: getParam("from", "Student A"),
          to: getParam("to", "Student B"),
          answers: draft.answers,
          submittedAt: new Date().toISOString(),
          scheduleId,
          evaluatorStudentId,
          evaluateeStudentId,
        };

        await submitToSupabase(payload);

        clearDraft();
        window.location.href = buildDashboardUrl();
      } catch (e) {
        console.error("Submit failed:", e);
        setStatus(formatErrorMessage(e));
      } finally {
        yesBtn.disabled = false;
        noBtn && (noBtn.disabled = false);
      }
    });
  }

  if (noBtn) {
    noBtn.addEventListener("click", () => {
      window.location.href = backUrl;
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      closeModal();
    });
  }

  if (modal) {
    modal.addEventListener("click", (e) => {
      const t = e.target;
      if (t && t instanceof HTMLElement && t.dataset.close === "true") closeModal();
    });
  }

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });
}

init();

