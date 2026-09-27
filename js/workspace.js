// workspace.js — Student Workspace (Multi-Language, Strict PDF Validation, AI I/O Fields)
// & Faculty Management Console (Track Creator, Deadlines, Moderation, Live Drive/Sheets Sync)

import { computeConvertedMarks } from "./leaderboard.js";
import { enhanceAllSelects } from "./auth.js";
import { API } from "./api.js";

const PORTAL_KEY = "devarena.portal";
const EVAL_KEY = "devarena.evaluations";
const STAGE_NAMES = ["Submitted", "AI Review Queued", "Automated Review", "Faculty Review", "Evaluated"];
const STAGE_DESCRIPTIONS = [
  "Your code and PDF reflection have been received in Google Drive.",
  "Your code and custom test cases are queued for Gemini.",
  "Gemini 2.5 Flash-Lite automated rubric evaluation is running.",
  "Your faculty mentor reviews the automated results.",
  "Final scaled university marks have been recorded.",
];

const CODE_TEMPLATES = {
  c: `#include <stdio.h>\n\nint main() {\n    // Solution in C\n    return 0;\n}\n`,
  cpp: `#include <iostream>\nusing namespace std;\n\nint main() {\n    // Solution in C++\n    return 0;\n}\n`,
  python: `# Solution in Python 3\nimport sys\n\ndef main():\n    pass\n\nif __name__ == '__main__':\n    main()\n`,
  java: `import java.util.Scanner;\n\npublic class Main {\n    public static void main(String[] args) {\n        // Solution in Java\n    }\n}\n`
};

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
  timers: [],
};

export function loadPortalState(seedData) {
  try {
    const raw = localStorage.getItem(PORTAL_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  localStorage.setItem(PORTAL_KEY, JSON.stringify(seedData));
  return seedData;
}

export function loadEvaluationsState(seedData) {
  try {
    const raw = localStorage.getItem(EVAL_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  localStorage.setItem(EVAL_KEY, JSON.stringify(seedData));
  return seedData;
}

function persistPortal() {
  localStorage.setItem(PORTAL_KEY, JSON.stringify(state.portalData));
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

/* ==========================================================================
   STUDENT WORKSPACE ENGINE
   ========================================================================== */
function getOrCreateStudentRecord() {
  let student = state.evalData.students.find((s) => s.regNo === state.session.regNo);
  if (!student) {
    student = {
      studentId: state.session.studentId || null,
      regNo: state.session.regNo,
      name: state.session.name,
      email: state.session.email,
      trackId: state.session.trackId,
      year: state.session.year,
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
  for (const faculty of state.portalData.faculties) {
    const track = faculty.tracks.find((t) => t.id === trackId);
    if (track) return track;
  }
  return null;
}

function refreshStudentHeaderMarks() {
  const maxPoints = state.track.challenges.reduce((sum, c) => sum + (c.points || 0), 0);
  const totalPoints = state.track.challenges.reduce((sum, c) => {
    const sub = state.student.submissions[c.id];
    return sum + (sub && sub.status === "Evaluated" && typeof sub.pointsEarned === "number" ? sub.pointsEarned : 0);
  }, 0);

  const { convertedMarks, maxMarks } = computeConvertedMarks(totalPoints, maxPoints, state.portalData.conversionScale);
  const primary = document.getElementById("headerMarksPrimary");
  const secondary = document.getElementById("headerMarksSecondary");
  if (primary) primary.textContent = `Converted Marks: ${convertedMarks} / ${maxMarks} Marks`;
  if (secondary) secondary.hidden = true;
}

function renderChallengeList() {
  const list = document.getElementById("challengeList");
  if (!list) return;
  list.innerHTML = "";
  state.track.challenges.forEach((challenge) => {
    const submission = state.student.submissions[challenge.id];
    const status = submission ? submission.status : "Not Started";

    const btn = document.createElement("button");
    btn.className = "challenge-item" + (challenge.id === state.activeChallengeId ? " active" : "");
    btn.innerHTML = `
      <span>
        <span class="challenge-item-title">${escapeHtml(challenge.title)}</span><br/>
        <span class="challenge-item-points font-mono">${(challenge.points * state.portalData.conversionScale).toFixed(1)} marks</span>
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
  return state.track.challenges.find((c) => c.id === state.activeChallengeId);
}

function renderDetailPanel() {
  const challenge = currentChallenge();
  if (!challenge) return;
  const submission = state.student.submissions[challenge.id] || null;

  document.getElementById("activeChallengeTitle").textContent = challenge.title;
  document.getElementById("activeChallengePoints").textContent = `${(challenge.points * state.portalData.conversionScale).toFixed(1)} marks`;

  document.getElementById("statementText").textContent = challenge.statement;
  document.getElementById("timeLimitStat").textContent = `${challenge.constraints?.timeLimitMs || 1000} ms`;
  document.getElementById("memoryLimitStat").textContent = `${challenge.constraints?.memoryLimitMb || 64} MB`;
  document.getElementById("pointsStat").textContent = `${(challenge.points * state.portalData.conversionScale).toFixed(1)} m`;
  document.getElementById("ioRulesText").textContent = challenge.constraints?.ioRules || "Standard input/output.";

  // Language & Code editor setup
  const lang = submission?.language || state.selectedLanguage || "c";
  state.selectedLanguage = lang;
  const langSelect = document.getElementById("langSelect");
  if (langSelect) langSelect.value = lang;

  const editor = document.getElementById("codeEditor");
  editor.value = submission?.code || CODE_TEMPLATES[lang] || CODE_TEMPLATES.c;

  // Reflection textarea & PDF states
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
  const isEvaluated = submission?.status === "Evaluated";
  const isReReviewRequested = submission?.status === "Re-Review Requested";
  const isProcessing = submission && !isEvaluated && !isReReviewRequested && submission.stage < 5;

  submitBtn.disabled = !!isProcessing;
  submitBtn.textContent = isProcessing ? "Evaluation in progress…" : submission ? "Resubmit Solution" : "Submit for Evaluation";

  reReviewWrap.innerHTML = "";
  if (isEvaluated) {
    const btn = document.createElement("button");
    btn.className = "btn btn-danger-outline btn-sm";
    btn.textContent = "Request Faculty Re-Review";
    btn.addEventListener("click", () => document.getElementById("reReviewOverlay").removeAttribute("hidden"));
    reReviewWrap.appendChild(btn);
  } else if (isReReviewRequested) {
    const note = document.createElement("div");
    note.className = "rereview-note";
    note.textContent = `Re-review requested: "${submission.reReview.justification}" — awaiting faculty review.`;
    reReviewWrap.appendChild(note);
  }
}

async function submitSolution() {
  const challenge = currentChallenge();
  const code = document.getElementById("codeEditor").value.trim();
  const reflectionText = document.getElementById("reflectionArea").value.trim();

  const studentInput = document.getElementById("studentTestInput")?.value.trim() || "";
  const studentOutput = document.getElementById("studentTestOutput")?.value.trim() || "";

  const pdfFile = state.pendingPdfFile;
  const pdfName = state.pendingPdfName || state.student.submissions[challenge.id]?.reflectionFile;
  const submitBtn = document.getElementById("submitBtn");

  if (!code) {
    toast("Please enter your solution code before submitting.");
    return;
  }
  if (!reflectionText && !pdfFile && !pdfName) {
    toast("Please write your reflection notes or attach a .pdf document.");
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "Uploading to SRM Drive & DB...";

  try {
    const studentId = state.session.regNo; // Strictly use the AP... registration number

    const res = await API.submitChallenge({
      challengeId: challenge.id,
      studentId: studentId,
      trackId: state.session.trackId, // Sends the specific section mapping
      language: state.selectedLanguage,
      code: code,
      studentInput: studentInput,
      studentOutput: studentOutput,
      pdfFile: pdfFile
    });

    if (!res.success) {
      toast(res.error || "Submission failed to record on server.");
      return;
    }

    let submission = state.student.submissions[challenge.id];
    if (!submission) {
      submission = {
        submissionId: res.submissionId || null,
        status: "Submitted",
        stage: 1,
        language: state.selectedLanguage,
        pointsEarned: null,
        code,
        studentInput,
        studentOutput,
        reflection: reflectionText,
        reflectionFile: pdfName || null,
        submittedAt: todayISO(),
        reReview: null
      };
      state.student.submissions[challenge.id] = submission;
    } else {
      submission.submissionId = res.submissionId || submission.submissionId;
      submission.code = code;
      submission.language = state.selectedLanguage;
      submission.studentInput = studentInput;
      submission.studentOutput = studentOutput;
      submission.reflection = reflectionText;
      submission.reflectionFile = pdfName || null;
      submission.status = "Submitted";
      submission.stage = 1;
      submission.pointsEarned = null;
      submission.reReview = null;
      submission.submittedAt = todayISO();
    }
    state.pendingPdfFile = null;
    state.pendingPdfName = null;

    persistEval();
    renderChallengeList();
    renderStepper(submission);
    renderActionArea(submission);
    toast("Submission uploaded to Google Drive & recorded in database!");
  } catch (err) {
    toast("Network error transmitting submission files.");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Resubmit Solution";
  }
}

export async function initWorkspace(session, portalData, evaluationsSeed) {
  state.session = session;
  state.portalData = loadPortalState(portalData);
  state.evalData = loadEvaluationsState(evaluationsSeed);
  state.track = findTrack(session.trackId);
  state.student = getOrCreateStudentRecord();

  try {
    const res = await API.getChallenges(session.trackId);
    if (res && Array.isArray(res.challenges) && res.challenges.length > 0) {
      state.track.challenges = res.challenges;
    }
  } catch (e) {
    console.warn("Using local challenges fallback:", e);
  }

  state.activeChallengeId = state.track.challenges[0]?.id || null;

  document.getElementById("trackBannerName").textContent = state.track.name;
  document.getElementById("trackBannerDesc").textContent = state.track.description;
  document.getElementById("trackBannerMentor").textContent = `${state.session.mentorName} · ${state.session.year}`;

  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(btn.dataset.tab).classList.add("active");
    });
  });

  const langSelect = document.getElementById("langSelect");
  if (langSelect) {
    langSelect.addEventListener("change", (e) => {
      state.selectedLanguage = e.target.value;
      const editor = document.getElementById("codeEditor");
      if (!editor.value || Object.values(CODE_TEMPLATES).includes(editor.value)) {
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
        document.getElementById("codeEditor").value = String(reader.result || "");
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
      if (state.student.submissions[state.activeChallengeId]) {
        state.student.submissions[state.activeChallengeId].reflectionFile = null;
      }
      if (chipWrap) chipWrap.hidden = true;
      toast("Attached PDF removed.");
    });
  }

  document.getElementById("submitBtn").addEventListener("click", submitSolution);

  document.getElementById("reReviewCancelBtn").addEventListener("click", () => {
    document.getElementById("reReviewOverlay").setAttribute("hidden", "");
  });
  document.getElementById("reReviewSubmitBtn").addEventListener("click", () => {
    const text = document.getElementById("reReviewJustification").value.trim();
    if (!text) { toast("Please provide a reason."); return; }
    const ch = currentChallenge();
    state.student.submissions[ch.id].status = "Re-Review Requested";
    state.student.submissions[ch.id].reReview = { requested: true, justification: text, requestedAt: todayISO() };
    persistEval();
    renderChallengeList();
    renderDetailPanel();
    document.getElementById("reReviewOverlay").setAttribute("hidden", "");
    toast("Re-review request submitted to faculty.");
  });

  renderChallengeList();
  renderDetailPanel();
  refreshStudentHeaderMarks();

  enhanceAllSelects();
}

/* ==========================================================================
   FACULTY MANAGEMENT CONSOLE
   ========================================================================== */
export function initFacultyWorkspace(session, portalData, evaluationsSeed) {
  state.session = session;
  state.portalData = loadPortalState(portalData);
  state.evalData = loadEvaluationsState(evaluationsSeed);

  const facultyObj = state.portalData.faculties.find((f) => f.id === session.facultyId) || state.portalData.faculties[0];

  document.getElementById("facultyGreeting").textContent = `SRM Faculty Oversight Console · ${facultyObj.name}`;
  document.getElementById("facultyBannerName").textContent = facultyObj.name;
  document.getElementById("facultyBannerTitle").textContent = `${facultyObj.title} — ${facultyObj.email}`;

  const trackSelect = document.getElementById("facultyTrackSelect");
  let activeFacultyTrack = facultyObj.tracks[0] || null;
  let activeChallenge = activeFacultyTrack?.challenges[0] || null;
  let inspectedRecord = null;

  function populateTrackDropdown() {
    trackSelect.innerHTML = "";
    facultyObj.tracks.forEach((t) => {
      const opt = document.createElement("option");
      opt.value = t.id;
      opt.textContent = `${t.name} (${t.year})`;
      if (activeFacultyTrack && t.id === activeFacultyTrack.id) opt.selected = true;
      trackSelect.appendChild(opt);
    });
  }

  trackSelect.addEventListener("change", (e) => {
    activeFacultyTrack = facultyObj.tracks.find((t) => t.id === e.target.value);
    activeChallenge = activeFacultyTrack?.challenges[0] || null;
    renderFacultyAll();
  });

  function renderFacultyAll() {
    renderFacultyChallenges();
    renderFacultySubmissions();
    renderFacultyReReviews();
  }

  function renderFacultyChallenges() {
    const list = document.getElementById("facultyChallengeList");
    const countEl = document.getElementById("facultyChallengeCount");
    if (!list || !activeFacultyTrack) return;
    list.innerHTML = "";
    countEl.textContent = `${activeFacultyTrack.challenges.length} challenges configured`;

    activeFacultyTrack.challenges.forEach((ch) => {
      const isSelected = ch.id === activeChallenge?.id;
      const btn = document.createElement("button");
      btn.className = "challenge-item" + (isSelected ? " active" : "");
      btn.innerHTML = `
        <span>
          <span class="challenge-item-title">${escapeHtml(ch.title)}</span>
          <div class="task-date-tag">Date: ${ch.assignedDate || "Active"} · ${ch.isActive ? "🟢 Published" : "⚪ Draft"}</div>
        </span>
        <div class="task-schedule-meta">
          <span class="font-mono text-xs font-bold">${(ch.points * state.portalData.conversionScale).toFixed(1)} m</span>
          <span class="text-xs text-muted">${ch.deadline ? ch.deadline.replace("T", " ") : "No limit"}</span>
        </div>
      `;
      btn.addEventListener("click", () => {
        activeChallenge = ch;
        renderFacultyAll();
      });
      list.appendChild(btn);
    });
  }

  function renderFacultySubmissions() {
    const tbody = document.getElementById("facultySubmissionsBody");
    const title = document.getElementById("facultySelectedChallengeTitle");
    const sub = document.getElementById("facultySelectedChallengeSub");
    const deadlineInput = document.getElementById("taskDeadlineInput");

    if (!tbody || !activeChallenge) return;

    title.textContent = activeChallenge.title;
    sub.textContent = `${activeFacultyTrack.name} (${activeFacultyTrack.year}) · Max Points: ${activeChallenge.points} (${(activeChallenge.points * state.portalData.conversionScale).toFixed(1)} Marks)`;
    if (deadlineInput) deadlineInput.value = activeChallenge.deadline || "";

    const students = state.evalData.students.filter((s) => s.trackId === activeFacultyTrack.id);
    tbody.innerHTML = "";

    if (students.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 24px; color: var(--text-muted);">No enrolled students in ${activeFacultyTrack.name}.</td></tr>`;
      return;
    }

    students.forEach((student) => {
      const submission = student.submissions[activeChallenge.id];
      const status = submission ? submission.status : "Not Started";
      const earnedMarks = submission && typeof submission.pointsEarned === "number"
        ? (submission.pointsEarned * state.portalData.conversionScale).toFixed(1)
        : "—";

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>
          <div class="student-name">${escapeHtml(student.name)}</div>
          <div class="student-reg font-mono">${escapeHtml(student.regNo)}</div>
        </td>
        <td><span class="status-pill ${statusPillClass(status)}">${escapeHtml(status)}</span></td>
        <td class="font-mono text-xs">${submission?.submittedAt || "—"}</td>
        <td>
          ${submission?.reflectionFile ? `<span class="file-chip">📄 ${escapeHtml(submission.reflectionFile)}</span>` : '<span class="text-faint text-xs">No PDF attached</span>'}
        </td>
        <td style="text-align:right;" class="font-mono font-bold">${earnedMarks} m</td>
        <td style="text-align:right;">
          ${submission ? `<button class="btn btn-outline btn-sm inspect-btn">Inspect &amp; Grade</button>` : '<span class="text-faint text-xs">Pending</span>'}
        </td>
      `;

      const inspectBtn = tr.querySelector(".inspect-btn");
      if (inspectBtn) {
        inspectBtn.addEventListener("click", () => openFacultyInspect(student, submission));
      }
      tbody.appendChild(tr);
    });
  }

  function renderFacultyReReviews() {
    const list = document.getElementById("facultyReReviewList");
    if (!list) return;
    list.innerHTML = "";

    const students = state.evalData.students.filter((s) => s.trackId === activeFacultyTrack.id);
    let count = 0;

    students.forEach((st) => {
      Object.entries(st.submissions || {}).forEach(([chId, sub]) => {
        if (sub.status === "Re-Review Requested" && sub.reReview) {
          count++;
          const chObj = activeFacultyTrack.challenges.find((c) => c.id === chId);
          const div = document.createElement("div");
          div.className = "re-review-item";
          div.innerHTML = `
            <strong>${escapeHtml(st.name)} (${st.regNo}) — ${escapeHtml(chObj?.title || chId)}</strong>
            <p style="margin: 4px 0;">"${escapeHtml(sub.reReview.justification)}"</p>
            <button class="btn btn-outline btn-sm review-act-btn">Review Now</button>
          `;
          div.querySelector(".review-act-btn").addEventListener("click", () => {
            activeChallenge = chObj || activeChallenge;
            renderFacultyAll();
            openFacultyInspect(st, sub);
          });
          list.appendChild(div);
        }
      });
    });

    if (count === 0) {
      list.innerHTML = `<p class="text-xs text-muted" style="margin:0;">No pending student re-review requests.</p>`;
    }
  }

  function openFacultyInspect(student, submission) {
    inspectedRecord = { student, submission };
    const drawer = document.getElementById("facultyReviewDrawer");
    drawer.hidden = false;

    document.getElementById("inspectStudentName").textContent = `Reviewing: ${student.name} (${student.regNo}) — ${activeChallenge.title}`;
    document.getElementById("inspectCode").value = submission.code || "// No code available";

    const chip = document.getElementById("inspectPdfChip");
    if (submission.reflectionFile) {
      chip.textContent = `Attached PDF: ${submission.reflectionFile}`;
      chip.style.display = "inline-flex";
    } else {
      chip.textContent = "No PDF file uploaded.";
    }

    const gradeInput = document.getElementById("facultyGradeInput");
    gradeInput.value = typeof submission.pointsEarned === "number" ? submission.pointsEarned : activeChallenge.points;
    drawer.scrollIntoView({ behavior: "smooth" });
  }

  document.getElementById("closeDrawerBtn").addEventListener("click", () => {
    document.getElementById("facultyReviewDrawer").hidden = true;
  });

  document.getElementById("facultySaveGradeBtn").addEventListener("click", async () => {
    if (!inspectedRecord) return;
    const pts = parseFloat(document.getElementById("facultyGradeInput").value);
    if (isNaN(pts) || pts < 0 || pts > activeChallenge.points) {
      toast(`Points must be between 0 and ${activeChallenge.points}.`);
      return;
    }

    const saveBtn = document.getElementById("facultySaveGradeBtn");
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving to Sheets...";

    try {
      if (inspectedRecord.submission.submissionId) {
        await API.facultyGradeOverride(inspectedRecord.submission.submissionId, pts);
      }

      inspectedRecord.submission.pointsEarned = pts;
      inspectedRecord.submission.status = "Evaluated";
      inspectedRecord.submission.stage = 5;
      inspectedRecord.submission.reReview = null;

      const student = inspectedRecord.student;
      const total = activeFacultyTrack.challenges.reduce((sum, c) => {
        const s = student.submissions[c.id];
        return sum + (s && s.status === "Evaluated" && typeof s.pointsEarned === "number" ? s.pointsEarned : 0);
      }, 0);
      student.progress.push({ day: student.progress.length + 1, score: total });

      persistEval();
      renderFacultyAll();
      document.getElementById("facultyReviewDrawer").hidden = true;
      toast(`Score approved for ${student.name}. Converted marks recorded.`);
    } catch (e) {
      toast("Error saving override to backend.");
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = "Approve & Record Marks";
    }
  });

  document.getElementById("saveDeadlineBtn").addEventListener("click", () => {
    const val = document.getElementById("taskDeadlineInput").value;
    activeChallenge.deadline = val;
    persistPortal();
    renderFacultyChallenges();
    toast(`Deadline updated to ${val.replace("T", " ")}.`);
  });

  document.getElementById("triggerAiReviewBtn").addEventListener("click", async () => {
    const btn = document.getElementById("triggerAiReviewBtn");
    btn.disabled = true;
    btn.textContent = "Gemini Flash-Lite Evaluating...";

    toast(`Automated AI Review triggered for "${activeChallenge.title}"! Processing submissions via Gemini...`);

    try {
      const res = await API.triggerBatchAI(activeFacultyTrack.id);
      toast(`AI Review completed for ${res.evaluatedCount || 0} submissions! Ready for faculty review.`);
    } catch (e) {
      toast("AI Evaluation encountered an error or hit rate limit.");
    } finally {
      btn.disabled = false;
      btn.textContent = "Trigger Automated AI Review";
      renderFacultyAll();
    }
  });

  const createTrackModal = document.getElementById("createTrackModal");
  const yearSelect = document.getElementById("newTrackYear");
  yearSelect.innerHTML = "";
  state.portalData.years.forEach((y) => {
    const opt = document.createElement("option");
    opt.value = y;
    opt.textContent = y;
    yearSelect.appendChild(opt);
  });

  document.getElementById("openCreateTrackModalBtn").addEventListener("click", () => {
    createTrackModal.removeAttribute("hidden");
  });
  document.getElementById("closeCreateTrackBtn").addEventListener("click", () => {
    createTrackModal.setAttribute("hidden", "");
  });

  document.getElementById("createTrackForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = document.getElementById("newTrackName").value.trim();
    const year = yearSelect.value;
    const desc = document.getElementById("newTrackDesc").value.trim();

    const newTrack = {
      id: name.toLowerCase().replace(/[^a-z0-9]/g, "-"),
      name,
      year,
      description: desc,
      challenges: []
    };

    facultyObj.tracks.push(newTrack);
    persistPortal();

    activeFacultyTrack = newTrack;
    activeChallenge = null;
    populateTrackDropdown();
    renderFacultyAll();
    createTrackModal.setAttribute("hidden", "");
    toast(`Challenge Track "${name}" created successfully!`);
  });

  const createTaskModal = document.getElementById("createTaskModal");
  document.getElementById("openCreateTaskModalBtn").addEventListener("click", () => {
    createTaskModal.removeAttribute("hidden");
  });
  document.getElementById("closeCreateTaskBtn").addEventListener("click", () => {
    createTaskModal.setAttribute("hidden", "");
  });

  document.getElementById("createTaskForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const title = document.getElementById("newTaskTitle").value.trim();
    const points = parseInt(document.getElementById("newTaskPoints").value, 10);
    const deadline = document.getElementById("newTaskDeadline").value;
    const statement = document.getElementById("newTaskStatement").value.trim();

    const newTask = {
      id: `${activeFacultyTrack.id}-${activeFacultyTrack.challenges.length + 1}`,
      title,
      points,
      assignedDate: todayISO(),
      deadline,
      isActive: true,
      statement,
      constraints: {
        timeLimitMs: 1000,
        memoryLimitMb: 64,
        ioRules: "Standard input/output."
      }
    };

    activeFacultyTrack.challenges.push(newTask);
    persistPortal();

    activeChallenge = newTask;
    renderFacultyAll();
    createTaskModal.setAttribute("hidden", "");
    toast(`Task "${title}" added to ${activeFacultyTrack.name}!`);
  });

  populateTrackDropdown();
  renderFacultyAll();
  enhanceAllSelects();
}
