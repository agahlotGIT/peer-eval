// Uses the UMD build loaded on the page:
// <script src="./node_modules/@supabase/supabase-js/dist/umd/supabase.js"></script>

(() => {
  const SUPABASE_URL = "https://wtmgdpabymkoudaeautv.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_Fqasx6241nxMe-kmi97xWg_dFgXcEI2";

  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    throw new Error("Supabase library not loaded. Make sure supabase.js is included before supabaseClient.js.");
  }

  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

  function toInt(v) {
    if (typeof v === "number" && Number.isInteger(v)) return v;
    if (typeof v === "string" && v.trim().length) {
      const n = Number(v);
      if (Number.isInteger(n)) return n;
    }
    return null;
  }

  async function resolveStudentId({ studentId, studentName, email }) {
    const id = toInt(studentId);
    if (id != null) return id;

    // Fallback: look up by email/name. (Requires SELECT permissions under RLS.)
    let query = client.from("student").select("studentid").limit(1);
    if (typeof email === "string" && email.trim().length) query = query.eq("email", email.trim());
    else if (typeof studentName === "string" && studentName.trim().length)
      query = query.eq("studentname", studentName.trim());
    else throw new Error("Missing evaluator/evaluatee identifier (id/email/name).");

    const { data, error } = await query;
    if (error) throw error;
    if (!data || data.length === 0) throw new Error("Student not found.");
    return data[0].studentid;
  }

  function avgScores(values) {
    const nums = values.map((v) => toInt(v)).filter((v) => v != null);
    if (nums.length === 0) return null;
    const sum = nums.reduce((a, b) => a + b, 0);
    return parseFloat((sum / nums.length).toFixed(2));
  }

  function buildOutcomeScores(answers) {
    // Map your 9 scale questions into the 4 LearningOutcome rows you already have:
    // 1 Communication, 2 Teamwork, 3 Technical Skills, 4 Leadership
    return [
      { outcomeid: 1, score: avgScores([answers?.q1, answers?.q7]) },
      { outcomeid: 2, score: avgScores([answers?.q4, answers?.q5]) },
      { outcomeid: 3, score: avgScores([answers?.q2, answers?.q6]) },
      { outcomeid: 4, score: avgScores([answers?.q3, answers?.q8, answers?.q9]) },
    ].filter((r) => r.score != null);
  }

  async function getNextId(table, idColumn) {
    const { data, error } = await client
      .from(table)
      .select(idColumn)
      .order(idColumn, { ascending: false })
      .limit(1);
    if (error) throw error;
    if (!data || data.length === 0) return 1;
    const current = Number(data[0][idColumn] || 0);
    return current + 1;
  }

  async function submitPeerEvaluation({
    evaluatorStudentId,
    evaluateeStudentId,
    scheduleId,
    fromName,
    toName,
    answers,
    submittedAt,
  }) {
    const evaluatorId = await resolveStudentId({ studentId: evaluatorStudentId, studentName: fromName });
    const evaluateeId = await resolveStudentId({ studentId: evaluateeStudentId, studentName: toName });

    const sched = toInt(scheduleId);
    if (sched == null) throw new Error("Missing scheduleId (add ?scheduleId=... to the URL).");

    const nextEvaluationId = await getNextId("peerevaluation", "evaluationid");

    // Insert evaluation
    const { data: pe, error: peErr } = await client
      .from("peerevaluation")
      .insert({
        evaluationid: nextEvaluationId,
        evaluatorstudentid: evaluatorId,
        evaluateestudentid: evaluateeId,
        scheduleid: sched,
        submitted_at: submittedAt,
      })
      .select("evaluationid")
      .single();
    if (peErr) throw peErr;

    const evaluationId = pe.evaluationid;

    // Insert RubricScore rows
    const comment = typeof answers?.q10 === "string" && answers.q10.trim().length ? answers.q10.trim() : null;
    const mappedScores = buildOutcomeScores(answers);
    let nextScoreId = await getNextId("rubricscore", "scoreid");
    const outcomeScores = mappedScores.map((r) => {
      const row = {
        scoreid: nextScoreId,
        evaluationid: evaluationId,
        outcomeid: r.outcomeid,
        score: r.score,
        comment: r.outcomeid === 1 ? comment : null, // keep the free-text once
        created_at: new Date().toISOString(),
      };
      nextScoreId += 1;
      return row;
    });

    if (outcomeScores.length) {
      const { error: rsErr } = await client.from("rubricscore").insert(outcomeScores);
      if (rsErr) throw rsErr;
    }

    return { evaluationid: evaluationId };
  }

  window.supabaseClient = client;
  window.db = { submitPeerEvaluation };

  // Auth functions - using custom passwords column
  async function signIn(email, password) {
    try {
      console.log("Attempting to sign in with email:", email);

      // First try student table
      let { data, error } = await client
        .from("student")
        .select("studentid, email, password")
        .eq("email", email)
        .single();

      let userRole = 'student';
      let userId = null;

      if (error && error.code === 'PGRST116') { // No rows found
        console.log("User not found in student table, checking professor table...");
        // Try professor table
        const profResult = await client
          .from("professor")
          .select("professorid, email, password")
          .eq("email", email)
          .single();

        if (profResult.error) {
          console.error("User not found in either table:", profResult.error);
          throw new Error("Invalid email or password");
        }

        data = profResult.data;
        userRole = 'professor';
        userId = data.professorid;
      } else if (error) {
        console.error("Database error:", error);
        throw new Error("Invalid email or password");
      } else {
        userId = data.studentid;
      }

      console.log("Found user in", userRole, "table");

      // Verify password
      console.log("Stored password:", data.password, "Provided password:", password);
      if (data.password !== password) {
        console.error("Password mismatch");
        throw new Error("Invalid email or password");
      }

      console.log("Login successful for", userRole, ":", data.email);

      // Store user session in localStorage
      const userSession = {
        id: userId,
        email: data.email,
        role: userRole
      };
      localStorage.setItem('currentUser', JSON.stringify(userSession));
      localStorage.setItem('userRole', userRole);

      // Return user data
      return {
        user: userSession
      };
    } catch (err) {
      console.error("Sign in error:", err);
      throw err;
    }
  }

  async function signOut() {
    // Clear custom authentication data
    localStorage.removeItem('currentUser');
    localStorage.removeItem('userRole');
    localStorage.removeItem('userEmail');
  }

  async function getCurrentUser() {
    // For custom authentication, check localStorage
    const userData = localStorage.getItem('currentUser');
    if (userData) {
      try {
        return JSON.parse(userData);
      } catch (e) {
        localStorage.removeItem('currentUser');
        return null;
      }
    }
    return null;
  }

  window.auth = { signIn, signOut, getCurrentUser };
})();

