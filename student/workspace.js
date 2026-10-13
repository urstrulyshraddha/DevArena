/* ==========================================================================
   SRM DevArena — Standalone Student Workspace (student/workspace.js)
   Full Anti-Cheating & Unified Single-File Submission Pipeline
   ========================================================================== */

import { API } from "../js/api.js";
import { initTheme } from "../js/theme.js";

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

/* ── Hardened Anti-Copy/Paste & Cheating Prevention ── */
function enforceAntiCheating() {
  const targetElements = [
    document.getElementById("codeEditor"),
    document.getElementById("reflectionArea"),
    document.getElementById("studentTestInput"),
    document.getElementById("studentTestOutput"),
    document.getElementById("problemStatementPanel"),
    document.getElementById("guidelinesPanel")
  ].filter(Boolean);

  targetElements.forEach((el) => {
    // 1. Block clipboard operations
    el.addEventListener("paste", (e) => {
      e.preventDefault();
      toast("⚠️ Pasting is disabled in the student workspace.");
    });

    el.addEventListener("copy", (e) => {
      e.preventDefault();
      toast("⚠️ Copying is disabled in the student workspace.");
    });

    el.addEventListener("cut", (e) => {
      e.preventDefault();
      toast("⚠️ Cutting is disabled in the student workspace.");
    });

    // 2. Block right-click context menu
    el.addEventListener("contextmenu", (e) => {
      e.preventDefault();
    });

    // 3. Block external text drag-and-drop
    el.addEventListener("drop", (e) => {
      e.preventDefault();
    });
    el.addEventListener("dragover", (e) => {
      e.preventDefault();
    });

    // 4. Block keyboard shortcuts (Ctrl/Cmd + C, V, X, Insert, Shift+Insert)
    el.addEventListener("keydown", (e) => {
      const isCmdOrCtrl = e.ctrlKey || e.metaKey;
      const key = e.key ? e.key.toLowerCase() : "";

      if (isCmdOrCtrl && (key === "v" || key === "c" || key === "x")) {
        e.preventDefault();
        toast(`⚠️ Shortcut Ctrl+${key.toUpperCase()} is disabled.`);
      }

      if ((e.shiftKey && e.key === "Insert") || (e.ctrlKey && e.key === "Insert")) {
        e.preventDefault();
        toast("⚠️ Clipboard shortcuts are disabled.");
      }
    });
  });
}

async function boot() {
  initTheme();
  enforceAntiCheating();

  // 1. Session Verification Gate
  const session = JSON.parse(localStorage.getItem("devarena.session") || "null");
  if (!session || session.role !== "student") {
    window.location.href = "../index.html";
    return;
  }

  // 2. Profile Setup
  const avatarEl = document.getElementById("profileAvatar");
  const nameEl = document.getElementById("profileName");
  const trackEl = document.getElementById("profileTrack");

  if (avatarEl) avatarEl.textContent = (session.name || "S").charAt(0).toUpperCase();
  if (nameEl) nameEl.textContent = session.name || session.regNo;
  if (trackEl) trackEl.textContent = session.regNo;

  document.getElementById("profileMenuBtn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    document.getElementById("profileDropdown")?.classList.toggle("open");
  });
  document.addEventListener("click", () => {
    document.getElementById("profileDropdown")?.classList.remove("open");
  });

  document.getElementById("logoutBtn")?.addEventListener("click", () => {
    localStorage.removeItem("devarena.session");
    window.location.href = "../index.html";
  });

  document.getElementById("switchTrackBtn")?.addEventListener("click", () => {
    localStorage.removeItem("devarena.session");
    window.location.href = "../index.html";
  });

  // 3. Resolve Track & Mentor Information
  let portalData = null;
  try {
    portalData = await API.getPortalConfig();
  } catch (err) {
    console.warn("Could not load portal catalog:", err);
  }

  const faculties = portalData?.faculties || [];
  const mentor = faculties.find((f) => f.id === session.mentorId || f.email === session.mentorId) || {
    name: "Dr. Yasir Afaq",
    title: "Faculty Mentor",
    tracks: [{ id: "c2t-y1-aimlf", name: "Code2Think", year: "1st Year", section: "AIML-F" }]
  };

  const assignedTrack = (mentor.tracks && mentor.tracks.length > 0)
    ? mentor.tracks[0]
    : { id: "c2t-y1-aimlf", name: "Code2Think", year: session.academicYear || "1st Year" };

  document.getElementById("trackBannerName").textContent = assignedTrack.name;
  document.getElementById("trackBannerDesc").textContent = `${assignedTrack.year || ''} · ${assignedTrack.section || ''}`;
  document.getElementById("trackBannerMentor").textContent = `Mentored by ${mentor.name} (${mentor.title || 'Faculty'})`;

  let challenges = [];
  let userSubmissions = [];
  let activeChallenge = null;
  let attachedPdfBase64 = null;
  let attachedPdfName = null;

  // 4. Data Loading
  async function loadData() {
    try {
      const chRes = await API.getChallenges(assignedTrack.id);
      challenges = (chRes && Array.isArray(chRes.challenges)) ? chRes.challenges : [];

      const subRes = await API.getSubmissions(assignedTrack.id);
      const allSubs = (subRes && Array.isArray(subRes.submissions)) ? subRes.submissions : [];
      userSubmissions = allSubs.filter((s) => s.regNo.toLowerCase() === session.regNo.toLowerCase());

      if (!activeChallenge && challenges.length > 0) {
        activeChallenge = challenges[0];
      }
    } catch (err) {
      console.error("Data load error:", err);
      toast("Error loading challenges from server.");
    }
  }

  // 5. Update Marks Chip
  function updateMarksChip() {
    const totalEarned = userSubmissions.reduce((sum, s) => sum + (s.pointsEarned || 0), 0);
    const totalPossible = challenges.reduce((sum, c) => sum + (c.points || 10), 0) || 1;
    const converted = ((totalEarned / totalPossible) * 5).toFixed(2);

    const primary = document.getElementById("headerMarksPrimary");
    const secondary = document.getElementById("headerMarksSecondary");
    if (primary) primary.textContent = `Converted Marks: ${converted} / 5.00`;
    if (secondary) secondary.textContent = `${totalEarned} raw pts earned`;
  }

  // 6. Render Challenges List
  function renderChallengeList() {
    const list = document.getElementById("challengeList");
    if (!list) return;
    list.innerHTML = "";

    challenges.forEach((ch, idx) => {
      const sub = userSubmissions.find((s) => String(s.challengeId) === String(ch.id));
      const status = sub ? sub.status : "Pending";
      const isSelected = activeChallenge?.id === ch.id;

      const btn = document.createElement("button");
      btn.className = "task-item" + (isSelected ? " active" : "");
      btn.innerHTML = `
        <div>
          <div><strong>Day ${idx + 1}:</strong> ${escapeHtml(ch.title)}</div>
          <div class="task-item-points font-mono">${ch.points || 10} pts</div>
        </div>
        <span class="status-pill ${status === 'Evaluated' ? 'pill-done' : (sub ? 'pill-review' : 'pill-pending')}">${status}</span>
      `;

      btn.addEventListener("click", () => {
        activeChallenge = ch;
        renderActiveChallenge();
        renderChallengeList();
      });

      list.appendChild(btn);
    });
  }

  // 7. Render Active Challenge Details
  function renderActiveChallenge() {
    if (!activeChallenge) return;

    document.getElementById("activeChallengeTitle").textContent = activeChallenge.title;
    document.getElementById("activeChallengePoints").textContent = `${activeChallenge.points || 10} Marks`;
    document.getElementById("statementText").textContent = activeChallenge.statement;
    document.getElementById("pointsStat").textContent = `${activeChallenge.points || 10} Pts`;

    const sub = userSubmissions.find((s) => String(s.challengeId) === String(activeChallenge.id));
    renderStepper(sub);
    renderSampleCasesDisplay(activeChallenge.sampleTests || []);

    // Set defaults into the student test execution textareas if empty
    const inputField = document.getElementById("studentTestInput");
    const outputField = document.getElementById("studentTestOutput");
    if (activeChallenge.sampleTests && activeChallenge.sampleTests.length > 0) {
      if (inputField && !inputField.value.trim()) {
        inputField.value = activeChallenge.sampleTests.map(t => t.input).join("\n");
      }
      if (outputField && !outputField.value.trim()) {
        outputField.value = activeChallenge.sampleTests.map(t => t.expectedOutput).join("\n");
      }
    }

    const submitBtn = document.getElementById("submitBtn");
    if (sub && sub.status === "Evaluated") {
      submitBtn.textContent = "Submission Evaluated";
      submitBtn.disabled = true;
    } else {
      submitBtn.textContent = sub ? "Resubmit Solution & Reflection" : "Submit Solution & Reflection";
      submitBtn.disabled = false;
    }
  }

  // 8. Stepper Progress Indicator
  function renderStepper(sub) {
    const stepper = document.getElementById("stepper");
    if (!stepper) return;
    const stage = sub ? sub.status : "Not Started";

    stepper.innerHTML = `
      <li class="${sub ? 'completed' : 'active'}">
        <div class="step-marker">1</div>
        <div>
          <div class="step-title">Solution Drafted</div>
          <div class="step-desc">Code, test cases &amp; reflection prepared</div>
        </div>
      </li>
      <li class="${sub ? (stage === 'Evaluated' ? 'completed' : 'active') : ''}">
        <div class="step-marker">2</div>
        <div>
          <div class="step-title">Automated &amp; Mentor Review</div>
          <div class="step-desc">${stage === 'Submitted' ? 'Under Review' : 'Pending submission'}</div>
        </div>
      </li>
      <li class="${stage === 'Evaluated' ? 'completed' : ''}">
        <div class="step-marker">3</div>
        <div>
          <div class="step-title">Graded &amp; Finalized</div>
          <div class="step-desc">${stage === 'Evaluated' ? `Awarded: ${sub.pointsEarned} pts` : 'Awaiting grading'}</div>
        </div>
      </li>
    `;
  }

  // 9. Render Configured Sample Cases as Read-Only Reference Cards
  function renderSampleCasesDisplay(tests) {
    const list = document.getElementById("testRunResultsList");
    const badge = document.getElementById("testRunSummaryBadge");
    if (!list) return;
    list.innerHTML = "";

    if (!tests || tests.length === 0) {
      list.innerHTML = `<div class="test-case-card"><span class="text-xs text-muted">No default sample test cases configured for this challenge.</span></div>`;
      if (badge) badge.textContent = "0 Configured";
      return;
    }

    if (badge) badge.textContent = `${tests.length} Reference Case${tests.length > 1 ? 's' : ''}`;

    tests.forEach((t, i) => {
      const card = document.createElement("div");
      card.className = "test-case-card";
      card.innerHTML = `
        <div class="test-case-card__head">Sample Case ${i + 1}</div>
        <div class="test-case-card__details">
          <div>
            <label>Input (stdin)</label>
            <pre>${escapeHtml(t.input || 'N/A')}</pre>
          </div>
          <div>
            <label>Expected Output (stdout)</label>
            <pre>${escapeHtml(t.expectedOutput || 'N/A')}</pre>
          </div>
        </div>
      `;
      list.appendChild(card);
    });
  }

  // 10. PDF Upload Handler
  document.getElementById("pdfFileInput")?.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.type !== "application/pdf") {
      toast("Only .pdf documents are supported.");
      return;
    }
    try {
      attachedPdfBase64 = await API.fileToBase64(file);
      attachedPdfName = file.name;
      document.getElementById("reflectionFileChip").textContent = `📄 ${file.name}`;
      document.getElementById("reflectionFileChipWrap").removeAttribute("hidden");
      toast("PDF attached successfully.");
    } catch (err) {
      toast("Error reading PDF file.");
    }
  });

  document.getElementById("removePdfBtn")?.addEventListener("click", () => {
    attachedPdfBase64 = null;
    attachedPdfName = null;
    document.getElementById("pdfFileInput").value = "";
    document.getElementById("reflectionFileChipWrap").setAttribute("hidden", "");
  });

  // 11. Tab Switching
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(btn.dataset.tab)?.classList.add("active");
    });
  });

  // 12. Submit Pipeline (Writes Header, Code, Reflection, Tests to Single File)
  document.getElementById("submitBtn")?.addEventListener("click", async () => {
    const code = document.getElementById("codeEditor").value.trim();
    const reflectionText = document.getElementById("reflectionArea").value.trim();
    const studentInput = document.getElementById("studentTestInput")?.value.trim() || "";
    const studentOutput = document.getElementById("studentTestOutput")?.value.trim() || "";

    if (!code) {
      toast("Please enter your solution code before submitting.");
      return;
    }

    const submitBtn = document.getElementById("submitBtn");
    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting to Drive & Sheets...";

    // Assemble the student test verification summary
    const testRunSummary =
`[STUDENT VERIFIED TEST CASES]
INPUT (stdin):
${studentInput || 'None provided'}

OUTPUT (stdout):
${studentOutput || 'None provided'}`;

    const payload = {
      challengeId: activeChallenge.id,
      studentId: session.regNo,
      trackId: assignedTrack.id,
      trackYear: assignedTrack.year || "1st Year",
      facultyName: mentor.name,
      language: document.getElementById("langSelect").value,
      code: code,
      reflectionText: reflectionText,
      testRunSummary: testRunSummary,
      pdfFileName: attachedPdfName
    };

    try {
      const res = await API.submitChallenge(payload);
      if (res && res.success) {
        toast("Unified submission artifact created successfully!");
        await loadData();
        renderActiveChallenge();
        renderChallengeList();
        updateMarksChip();
      } else {
        toast(res.error || "Submission failed.");
      }
    } catch (err) {
      toast("Submission error: " + err.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit Solution & Reflection";
    }
  });

  // Initial Load
  await loadData();
  renderChallengeList();
  renderActiveChallenge();
  updateMarksChip();
}

// ── Language-Aware Code File Attachment & Import ──
  const langSelect = document.getElementById("langSelect");
  const codeFileInput = document.getElementById("codeFileInput");
  const codeUploadExtLabel = document.getElementById("codeUploadExtLabel");
  const codeEditor = document.getElementById("codeEditor");

  const extMap = {
    python: { ext: ".py", accept: ".py" },
    c: { ext: ".c", accept: ".c" },
    cpp: { ext: ".cpp", accept: ".cpp,.cc,.cxx" },
    java: { ext: ".java", accept: ".java" }
  };

  // Synchronize file input accept filter when language changes
  langSelect?.addEventListener("change", (e) => {
    const lang = e.target.value;
    const config = extMap[lang] || { ext: ".py", accept: ".py" };
    if (codeFileInput) codeFileInput.accept = config.accept;
    if (codeUploadExtLabel) codeUploadExtLabel.textContent = config.ext;
  });

  // Read uploaded source file directly into the code editor
  codeFileInput?.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const currentLang = langSelect ? langSelect.value : "python";
    const allowed = extMap[currentLang] || extMap.python;
    const fileExt = "." + file.name.split(".").pop().toLowerCase();

    // Extension validation
    if (!allowed.accept.split(",").includes(fileExt)) {
      toast(`⚠️ Invalid extension. Selected language (${currentLang}) expects ${allowed.ext}`);
      codeFileInput.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const codeText = event.target.result;
      if (codeEditor) {
        codeEditor.value = codeText;
        toast(`Loaded ${file.name} successfully.`);
      }
    };
    reader.onerror = () => {
      toast("Error reading the code file.");
    };

    reader.readAsText(file);
  });


document.addEventListener("DOMContentLoaded", boot);
