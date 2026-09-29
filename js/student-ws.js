/* ==========================================================================
   SRM DevArena — Student Workspace (js/student-ws.js)
   ========================================================================== */

import { computeConvertedMarks } from "./leaderboard.js";
import { API } from "./api.js";

const PORTAL_KEY = "devarena.portal";
const EVAL_KEY = "devarena.evaluations";
const STAGE_NAMES = ["Submitted", "AI Review Queued", "Automated Review", "Faculty Review", "Evaluated"];
const STAGE_DESCRIPTIONS = [
  "Your code and PDF reflection have been received in Google Drive.",
  "Your code and custom test cases are queued for Gemini.",
  "Gemini automated rubric evaluation is running.",
  "Your faculty mentor reviews the automated results.",
  "Final scaled university marks have been recorded.",
];

const CODE_TEMPLATES = {
  c: `#include <stdio.h>\n\nint main() {\n    // Solution in C\n    return 0;\n}\n`,
  cpp: `#include <iostream>\nusing namespace std;\n\nint main() {\n    // Solution in C++\n    return 0;\n}\n`,
  python: `# Solution in Python 3\nimport sys\n\ndef main():\n    pass\n\nif __name__ == '__main__':\n    main()\n`,
  java: `import java.util.Scanner;\n\npublic class Main {\n    public static void main(String[] args) {\n        // Solution in Java\n    }\n}\n`
};

/* Starter challenges shown when the backend returns an empty list */
const DEFAULT_CHALLENGES = [
  {
    id: "ch_reverse_digits",
    title: "Reverse the Digits",
    statement:
      "Given a positive integer N, print the number formed by reversing its digits.\n\nInput: A single integer N (1 ≤ N ≤ 10^9).\nOutput: The reversed integer (without leading zeros).\n\nExample:\nInput: 12345\nOutput: 54321",
    points: 10,
    constraints: { timeLimitMs: 1000, memoryLimitMb: 64, ioRules: "Standard input/output." },
  },
  {
    id: "ch_prime_sieve",
    title: "Prime Sieve Counter",
    statement:
      "Given an integer N, count the number of prime numbers less than or equal to N using the Sieve of Eratosthenes.\n\nInput: A single integer N (2 ≤ N ≤ 10^6).\nOutput: A single integer — the count of primes ≤ N.\n\nExample:\nInput: 10\nOutput: 4",
    points: 15,
    constraints: { timeLimitMs: 2000, memoryLimitMb: 128, ioRules: "Standard input/output." },
  },
  {
    id: "ch_fizzbuzz",
    title: "FizzBuzz Sequence",
    statement:
      "Print integers 1 to N. For multiples of 3 print \"Fizz\", for multiples of 5 print \"Buzz\", for multiples of both print \"FizzBuzz\".\n\nInput: A single integer N (1 ≤ N ≤ 10^5).\nOutput: N lines of output.\n\nExample (N = 5):\n1\n2\nFizz\n4\nBuzz",
    points: 10,
    constraints: { timeLimitMs: 1000, memoryLimitMb: 64, ioRules: "Standard input/output." },
  },
  {
    id: "ch_matrix_transpose",
    title: "Matrix Transpose",
    statement:
      "Given an M×N matrix, print its transpose.\n\nInput: First line: M N. Next M lines: N space-separated integers.\nOutput: N lines of M space-separated integers.\n\nExample:\nInput:\n2 3\n1 2 3\n4 5 6\nOutput:\n1 4\n2 5\n3 6",
    points: 10,
    constraints: { timeLimitMs: 1000, memoryLimitMb: 64, ioRules: "Standard input/output." },
  },
];

let state = {
  portalData: null,
  evalData: null,
  session: null,
  track: null,
  student: null,
  activeChallengeId: null,
  selectedLanguage: "c",
  pendingPdfFile: null,
  pendingPdfName: null,
};

function loadPortalState(seedData) {
  try {
    const raw = localStorage.getItem(PORTAL_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  localStorage.setItem(PORTAL_KEY, JSON.stringify(seedData));
  return seedData;
}

function loadEvaluationsState(seedData) {
  try {
    const raw = localStorage.getItem(EVAL_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  const fallback = seedData || { students: [] };
  localStorage.setItem(EVAL_KEY, JSON.stringify(fallback));
  return fallback;
}

function persistEval() {
  localStorage.setItem(EVAL_KEY, JSON.stringify(state.evalData));
}

function toast(message) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = message;
  el.classList.add("visible");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove("visible"), 2600);
}

function escapeHtml(str) {
  return String(str || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function statusPillClass(status) {
  switch (status) {
    case "Submitted":
    case "AI Review Queued": return "pill-progress";
    case "Automated Review":
    case "Faculty Review": return "pill-review";
    case "Evaluated": return "pill-done";
    case "Re-Review Requested": return "pill-rereview";
    default: return "pill-pending";
  }
}

function getOrCreateStudentRecord() {
  if (!state.evalData) state.evalData = { students: [] };
  if (!state.evalData.students) state.evalData.students = [];

  let student = state.evalData.students.find((s) => s.regNo === state.session.regNo);
  if (!student) {
    student = {
      studentId: state.session.studentId || null,
      regNo: state.session.regNo,
      name: state.session.name,
      email: state.session.email,
      trackId: state.session.trackId,
      year: state.session.academicYear || state.session.year,
      mentorId: state.session.mentorId,
      submissions: {},
      progress: [],
    };
    state.evalData.students.push(student);
    persistEval();
  } else if (state.session.studentId && !student.studentId) {
    student.studentId = state.session.studentId;
    persistEval();
  }
  return student;
}

function findTrack(trackId) {
  if (!state.portalData || !Array.isArray(state.portalData.faculties)) return null;
  for (const faculty of state.portalData.faculties) {
    if (Array.isArray(faculty.tracks)) {
      const track = faculty.tracks.find((t) => t.id === trackId);
      if (track) return track;
    }
  }
  return null;
}

function refreshStudentHeaderMarks() {
  if (!state.track || !Array.isArray(state.track.challenges)) return;
  const conversionScale = state.portalData?.conversionScale || 0.25;
  const maxPoints = state.track.challenges.reduce((sum, c) => sum + (c.points || c.maxRawPoints || 10), 0);
  const totalPoints = state.track.challenges.reduce((sum, c) => {
    const sub = state.student?.submissions?.[c.id];
    return sum + (sub && sub.status === "Evaluated" && typeof sub.pointsEarned === "number" ? sub.pointsEarned : 0);
  }, 0);

  const { convertedMarks, maxMarks } = computeConvertedMarks(totalPoints, maxPoints, conversionScale);
  const primary = document.getElementById("headerMarksPrimary");
  const secondary = document.getElementById("headerMarksSecondary");
  if (primary) primary.textContent = `Converted Marks: ${convertedMarks} / ${maxMarks} Marks`;
  if (secondary) secondary.hidden = true;
}

function renderChallengeList() {
  const list = document.getElementById("challengeList");
  if (!list || !state.track || !Array.isArray(state.track.challenges)) return;
  list.innerHTML = "";
  const conversionScale = state.portalData?.conversionScale || 0.25;

  state.track.challenges.forEach((challenge) => {
    const submission = state.student?.submissions?.[challenge.id];
    const status = submission ? submission.status : "Not Started";
    const rawPts = challenge.points || challenge.maxRawPoints || 10;

    const btn = document.createElement("button");
    btn.className = "challenge-item" + (challenge.id === state.activeChallengeId ? " active" : "");
    btn.innerHTML = `
      <span>
        <span class="challenge-item-title">${escapeHtml(challenge.title)}</span><br/>
        <span class="challenge-item-points font-mono">${(rawPts * conversionScale).toFixed(1)} marks</span>
      </span>
      <span class="status-pill ${statusPillClass(status)}">${escapeHtml(status)}</span>
    `;
    btn.addEventListener("click", () => {
      state.activeChallengeId = challenge.id;
      renderChallengeList();
      renderDetailPanel();
    });
    list.appendChild(btn);
  });
}

function currentChallenge() {
  if (!state.track || !Array.isArray(state.track.challenges)) return null;
  return state.track.challenges.find((c) => c.id === state.activeChallengeId);
}

function renderDetailPanel() {
  const challenge = currentChallenge();
  if (!challenge) return;
  const submission = state.student?.submissions?.[challenge.id] || null;
  const conversionScale = state.portalData?.conversionScale || 0.25;
  const rawPts = challenge.points || challenge.maxRawPoints || 10;

  document.getElementById("activeChallengeTitle").textContent = challenge.title;
  document.getElementById("activeChallengePoints").textContent = `${(rawPts * conversionScale).toFixed(1)} marks`;

  document.getElementById("statementText").textContent = challenge.statement;
  document.getElementById("timeLimitStat").textContent = `${challenge.constraints?.timeLimitMs || 1000} ms`;
  document.getElementById("memoryLimitStat").textContent = `${challenge.constraints?.memoryLimitMb || 64} MB`;
  document.getElementById("pointsStat").textContent = `${(rawPts * conversionScale).toFixed(1)} m`;
  document.getElementById("ioRulesText").textContent = challenge.constraints?.ioRules || "Standard input/output.";

  const lang = submission?.language || state.selectedLanguage || "c";
  state.selectedLanguage = lang;
  const langSelect = document.getElementById("langSelect");
  if (langSelect) langSelect.value = lang;

  const editor = document.getElementById("codeEditor");
  editor.value = submission?.code || CODE_TEMPLATES[lang] || CODE_TEMPLATES.c;

  const reflectionArea = document.getElementById("reflectionArea");
  if (reflectionArea) reflectionArea.value = submission?.reflection || "";

  const chipWrap = document.getElementById("reflectionFileChipWrap");
  const chip = document.getElementById("reflectionFileChip");
  const attachedFile = submission?.reflectionFile || state.pendingPdfName;

  if (attachedFile && chipWrap && chip) {
    chip.textContent = `Attached: ${attachedFile}`;
    chipWrap.hidden = false;
  } else if (chipWrap) {
    chipWrap.hidden = true;
  }

  renderStudentIoFields(submission);
  renderStepper(submission);
  renderActionArea(submission);
}

function renderStudentIoFields(submission) {
  const listEl = document.getElementById("testRunResultsList");
  const badgeEl = document.getElementById("testRunSummaryBadge");
  const runBtn = document.getElementById("runSampleTestsBtn");

  if (badgeEl) badgeEl.style.display = "none";
  if (runBtn) runBtn.style.display = "none";
  if (!listEl) return;

  listEl.innerHTML = `
    <div style="padding: 16px; background: var(--bg-surface); border: 1px solid var(--border-light); border-radius: 8px;">
      <div style="display: flex; gap: 16px; flex-wrap: wrap;">
        <div style="flex: 1; min-width: 200px;">
          <label style="display: block; font-size: 0.75rem; font-weight: 700; color: var(--text-muted); margin-bottom: 6px;">YOUR TEST INPUT</label>
          <textarea id="studentTestInput" style="width: 100%; height: 100px; font-family: monospace; font-size: 0.85rem; padding: 10px; border: 1px solid var(--border-light); border-radius: 4px; background: #fff; resize: vertical;" placeholder="e.g. 3 5">${escapeHtml(submission?.studentInput || '')}</textarea>
        </div>
        <div style="flex: 1; min-width: 200px;">
          <label style="display: block; font-size: 0.75rem; font-weight: 700; color: var(--text-muted); margin-bottom: 6px;">YOUR TEST OUTPUT</label>
          <textarea id="studentTestOutput" style="width: 100%; height: 100px; font-family: monospace; font-size: 0.85rem; padding: 10px; border: 1px solid var(--border-light); border-radius: 4px; background: #fff; resize: vertical;" placeholder="e.g. 8">${escapeHtml(submission?.studentOutput || '')}</textarea>
        </div>
      </div>
    </div>
  `;
}

function renderStepper(submission) {
  const stepperEl = document.getElementById("stepper");
  if (!stepperEl) return;
  stepperEl.innerHTML = "";
  const stage = submission ? submission.stage : 0;
  const isReReview = submission?.status === "Re-Review Requested";

  STAGE_NAMES.forEach((name, idx) => {
    const stepNum = idx + 1;
    const li = document.createElement("li");
    let cls = "";
    if (stepNum < stage || (stepNum === stage && stepNum < 5)) cls = "completed";
    if (stepNum === stage) cls = stage === 5 ? "completed" : "active";
    if (stepNum === 5 && isReReview) cls = "rereview";
    li.className = cls;

    const marker = stepNum <= stage ? (stepNum === 5 && isReReview ? "!" : "✓") : String(stepNum);
    li.innerHTML = `
      <span class="step-marker">${stepNum <= stage ? marker : stepNum}</span>
      <div class="step-title">${stepNum}. ${name}</div>
      <div class="step-desc">${STAGE_DESCRIPTIONS[idx]}</div>
    `;
    stepperEl.appendChild(li);
  });
}

function renderActionArea(submission) {
  const submitBtn = document.getElementById("submitBtn");
  const reReviewWrap = document.getElementById("reReviewWrap");
  if (!submitBtn) return;

  const isEvaluated = submission?.status === "Evaluated";
  const isReReviewRequested = submission?.status === "Re-Review Requested";
  const isProcessing = submission && !isEvaluated && !isReReviewRequested && submission.stage < 5;

  submitBtn.disabled = !!isProcessing;
  submitBtn.textContent = isProcessing ? "Evaluation in progress…" : submission ? "Resubmit Solution" : "Submit for Evaluation";

  if (!reReviewWrap) return;
  reReviewWrap.innerHTML = "";
  if (isEvaluated) {
    const btn = document.createElement("button");
    btn.className = "btn btn-danger-outline btn-sm";
    btn.textContent = "Request Faculty Re-Review";
    btn.addEventListener("click", () => document.getElementById("reReviewOverlay")?.removeAttribute("hidden"));
    reReviewWrap.appendChild(btn);
  } else if (isReReviewRequested) {
    const note = document.createElement("div");
    note.className = "rereview-note";
    note.textContent = `Re-review requested: "${submission.reReview?.justification || ''}" — awaiting faculty review.`;
    reReviewWrap.appendChild(note);
  }
}

async function submitSolution() {
  const challenge = currentChallenge();
  if (!challenge) return;

  const code = document.getElementById("codeEditor")?.value.trim();
  if (!code) { toast("Write some code before submitting."); return; }

  const studentInput  = document.getElementById("studentTestInput")?.value || "";
  const studentOutput = document.getElementById("studentTestOutput")?.value || "";

  const pdfFileInput = document.getElementById("pdfFileInput");
  const pdfFile = state.pendingPdfFile || pdfFileInput?.files?.[0] || null;

  const submitBtn = document.getElementById("submitBtn");
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "Uploading to Drive & Sheets...";
  }

  try {
    let pdfBase64 = null;
    let pdfFileName = null;

    if (pdfFile) {
      pdfFileName = pdfFile.name;
      pdfBase64 = await API.fileToBase64(pdfFile);
    }

    const payload = {
      challengeId: challenge.id,
      studentId: state.session.regNo || state.session.studentId,
      trackId: state.session.trackId,
      trackYear: state.session.academicYear || state.session.year,
      facultyName: state.session.mentorName,
      language: state.selectedLanguage || "c",
      code,
      studentInput,
      studentOutput,
      pdfBase64,
      pdfFileName,
    };

    const res = await API.submitChallenge(payload);

    state.student.submissions[challenge.id] = {
      ...(state.student.submissions[challenge.id] || {}),
      status: "Submitted",
      stage: 1,
      code,
      studentInput,
      studentOutput,
      language: state.selectedLanguage,
      reflectionFile: pdfFileName || state.student.submissions[challenge.id]?.reflectionFile || null,
      submittedAt: new Date().toISOString(),
      codeUrl: res?.codeUrl || null,
      submissionId: res?.submissionId || null,
    };
    persistEval();

    renderChallengeList();
    renderDetailPanel();
    toast("Solution submitted — file stored in Google Drive. AI review will follow.");
  } catch (err) {
    toast("Submission failed: " + (err.message || err));
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit Solution";
    }
  }
}

export async function initStudentWorkspace(session, portalData, evaluationsSeed) {
  state.session = session;
  state.portalData = loadPortalState(portalData);
  state.evalData = loadEvaluationsState(evaluationsSeed);
  state.track = findTrack(session.trackId) || {
    id: session.trackId || "default_track",
    name: session.trackName || "Programming Track",
    description: "Academic Programming Track",
    challenges: []
  };
  state.student = getOrCreateStudentRecord();

  // Fetch challenges from backend; fall back to local, then starter set
  try {
    const res = await API.getChallenges(session.trackId);
    if (res && Array.isArray(res.challenges) && res.challenges.length > 0) {
      state.track.challenges = res.challenges;
    }
  } catch (e) {
    console.warn("Backend getChallenges unavailable, using local fallback:", e);
  }

  // If challenges are still empty (backend + catalog both missed), use starter set
  if (!Array.isArray(state.track.challenges) || state.track.challenges.length === 0) {
    console.info("No challenges loaded — injecting default starter set.");
    state.track.challenges = DEFAULT_CHALLENGES;
  }

  // Always default to the first challenge so the detail panel renders immediately
  state.activeChallengeId = state.track.challenges[0]?.id || null;

  // --- Populate the track banner with safe fallbacks ---
  const trackBannerName = document.getElementById("trackBannerName");
  const trackBannerDesc = document.getElementById("trackBannerDesc");
  const trackBannerMentor = document.getElementById("trackBannerMentor");

  const trackName = state.track.name || session.trackName || "Programming Track";
  const trackDesc = state.track.description || "Solve challenges, upload code, and receive AI + faculty evaluations.";
  const mentorName = session.mentorName || "Faculty Mentor";
  const academicYear = session.academicYear || session.year || new Date().getFullYear();

  if (trackBannerName) trackBannerName.textContent = trackName;
  if (trackBannerDesc) trackBannerDesc.textContent = trackDesc;
  if (trackBannerMentor) trackBannerMentor.textContent = `${mentorName} · ${academicYear}`;

  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      const targetPanel = document.getElementById(btn.dataset.tab);
      if (targetPanel) targetPanel.classList.add("active");
    });
  });

  const langSelect = document.getElementById("langSelect");
  if (langSelect) {
    langSelect.addEventListener("change", (e) => {
      state.selectedLanguage = e.target.value;
      const editor = document.getElementById("codeEditor");
      if (editor && (!editor.value || Object.values(CODE_TEMPLATES).includes(editor.value))) {
        editor.value = CODE_TEMPLATES[state.selectedLanguage] || "";
      }
      toast(`Language switched to ${e.target.options[e.target.selectedIndex].text}`);
    });
  }

  const codeFileInput = document.getElementById("codeFileInput");
  if (codeFileInput) {
    codeFileInput.addEventListener("change", () => {
      const file = codeFileInput.files[0];
      if (!file) return;
      const ext = file.name.split(".").pop().toLowerCase();
      if (!["c", "cpp", "py", "java"].includes(ext)) {
        toast("Please upload a .c, .cpp, .py, or .java source file.");
        codeFileInput.value = "";
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const editor = document.getElementById("codeEditor");
        if (editor) editor.value = String(reader.result || "");
        if (ext === "cpp") state.selectedLanguage = "cpp";
        else if (ext === "py") state.selectedLanguage = "python";
        else if (ext === "java") state.selectedLanguage = "java";
        else state.selectedLanguage = "c";
        if (langSelect) langSelect.value = state.selectedLanguage;
        toast(`Loaded ${file.name}`);
      };
      reader.readAsText(file);
      codeFileInput.value = "";
    });
  }

  const pdfFileInput = document.getElementById("pdfFileInput");
  const chipWrap = document.getElementById("reflectionFileChipWrap");
  const chip = document.getElementById("reflectionFileChip");
  const removePdfBtn = document.getElementById("removePdfBtn");

  if (pdfFileInput) {
    pdfFileInput.addEventListener("change", () => {
      const file = pdfFileInput.files[0];
      if (!file) return;

      const isPdfExt = file.name.toLowerCase().endsWith(".pdf");
      const isPdfMime = file.type === "application/pdf" || file.type === "";

      if (!isPdfExt || !isPdfMime) {
        toast("Invalid file! Only .pdf reflection documents are accepted.");
        pdfFileInput.value = "";
        return;
      }

      state.pendingPdfFile = file;
      state.pendingPdfName = file.name;
      if (chip) chip.textContent = `Attached: ${file.name}`;
      if (chipWrap) chipWrap.hidden = false;
      toast(`Attached PDF: ${file.name}`);
      pdfFileInput.value = "";
    });
  }

  if (removePdfBtn) {
    removePdfBtn.addEventListener("click", () => {
      state.pendingPdfFile = null;
      state.pendingPdfName = null;
      if (state.student?.submissions?.[state.activeChallengeId]) {
        state.student.submissions[state.activeChallengeId].reflectionFile = null;
      }
      if (chipWrap) chipWrap.hidden = true;
      toast("Attached PDF removed.");
    });
  }

  const submitBtn = document.getElementById("submitBtn");
  if (submitBtn) {
    submitBtn.replaceWith(submitBtn.cloneNode(true));
    document.getElementById("submitBtn").addEventListener("click", submitSolution);
  }

  const reReviewCancelBtn = document.getElementById("reReviewCancelBtn");
  if (reReviewCancelBtn) {
    reReviewCancelBtn.addEventListener("click", () => {
      document.getElementById("reReviewOverlay")?.setAttribute("hidden", "");
    });
  }

  const reReviewSubmitBtn = document.getElementById("reReviewSubmitBtn");
  if (reReviewSubmitBtn) {
    reReviewSubmitBtn.addEventListener("click", () => {
      const text = document.getElementById("reReviewJustification")?.value.trim();
      if (!text) { toast("Please provide a reason."); return; }
      const ch = currentChallenge();
      if (!ch) return;
      state.student.submissions[ch.id].status = "Re-Review Requested";
      state.student.submissions[ch.id].reReview = { requested: true, justification: text, requestedAt: todayISO() };
      persistEval();
      renderChallengeList();
      renderDetailPanel();
      document.getElementById("reReviewOverlay")?.setAttribute("hidden", "");
      toast("Re-review request submitted to faculty.");
    });
  }

  renderChallengeList();
  renderDetailPanel();
  refreshStudentHeaderMarks();
}
