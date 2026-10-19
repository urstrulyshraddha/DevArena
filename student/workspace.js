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
        toast(`⚠️ Further attempts of cheating will raise trigger in faculty dashboard.`);
      }

      if ((e.shiftKey && e.key === "Insert") || (e.ctrlKey && e.key === "Insert")) {
        e.preventDefault();
        toast("⚠️ Further attempts of cheating will raise trigger in faculty dashboard.");
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

  // 3. Resolve Exact Track & Mentor Information
  let portalData = null;
  try {
    portalData = await API.getPortalConfig();
  } catch (err) {
    console.warn("Could not load portal catalog:", err);
  }

  const faculties = portalData?.faculties || [];
  let mentor = faculties.find((f) => f.id === session.mentorId || f.email === session.mentorId);

  // Strictly look up session.trackId
  let assignedTrack = null;
  if (session.trackId) {
    for (const f of faculties) {
      const found = (f.tracks || []).find((t) => t.id === session.trackId);
      if (found) {
        assignedTrack = found;
        if (!mentor) mentor = f;
        break;
      }
    }
  }

  // If not found in dynamic catalog, build directly from session
  if (!assignedTrack) {
    assignedTrack = {
      id: session.trackId,
      name: session.trackName || "Assigned Track",
      year: session.academicYear || "1st Year",
      section: ""
    };
  }

  if (!mentor) {
    mentor = { name: "Faculty Mentor", title: "Assistant Professor" };
  }

  const trackBannerName = document.getElementById("trackBannerName");
  const trackBannerDesc = document.getElementById("trackBannerDesc");
  const trackBannerMentor = document.getElementById("trackBannerMentor");

  if (trackBannerName) trackBannerName.textContent = assignedTrack.name;
  if (trackBannerDesc) {
    const secStr = assignedTrack.section ? ` · ${assignedTrack.section}` : "";
    trackBannerDesc.textContent = `${assignedTrack.year || session.academicYear || ''}${secStr}`;
  }
  if (trackBannerMentor) {
    trackBannerMentor.textContent = `Mentored by ${mentor.name} (${mentor.title || 'Faculty'})`;
  }

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

      const titleEl = document.getElementById("activeChallengeTitle");
      const ptsEl = document.getElementById("activeChallengePoints");
      const stmtEl = document.getElementById("statementText");
      const pointsStatEl = document.getElementById("pointsStat");

      if (titleEl) titleEl.textContent = activeChallenge.title;
      if (ptsEl) ptsEl.textContent = `${activeChallenge.points || 10} Marks`;
      if (stmtEl) stmtEl.textContent = activeChallenge.statement;
      if (pointsStatEl) pointsStatEl.textContent = `${activeChallenge.points || 10} Pts`;

      const sub = userSubmissions.find((s) => String(s.challengeId) === String(activeChallenge.id));
      renderStepper(sub);
      renderSampleCasesDisplay(activeChallenge.sampleTests || []);

      // ── Clean Slate Reset: Keep student fields completely empty for custom runs ──
      const inputField = document.getElementById("studentTestInput");
      const outputField = document.getElementById("studentTestOutput");
      const reflField = document.getElementById("reflectionArea");
      const codeField = document.getElementById("codeEditor");

      if (inputField) inputField.value = "";
      if (outputField) outputField.value = "";
      if (reflField) reflField.value = "";
      if (codeField && !sub) codeField.value = "";

      // Reset attached PDF chip if switching tasks
      attachedPdfBase64 = null;
      attachedPdfName = null;
      const pdfInput = document.getElementById("pdfFileInput");
      if (pdfInput) pdfInput.value = "";
      document.getElementById("reflectionFileChipWrap")?.setAttribute("hidden", "");

      const submitBtn = document.getElementById("submitBtn");
      let viewReportBtn = document.getElementById("viewReportBtn");

      if (!viewReportBtn && submitBtn && submitBtn.parentNode) {
        viewReportBtn = document.createElement("button");
        viewReportBtn.type = "button";
        viewReportBtn.id = "viewReportBtn";
        viewReportBtn.className = "btn btn-outline";
        viewReportBtn.style.marginRight = "10px";
        viewReportBtn.textContent = "📋 View Evaluation Report";
        submitBtn.parentNode.insertBefore(viewReportBtn, submitBtn);
      }

      const now = new Date();
      const deadlineDate = activeChallenge.deadline ? new Date(activeChallenge.deadline) : null;
      const isExpired = deadlineDate && !isNaN(deadlineDate.getTime()) && now > deadlineDate;

      if (sub && (sub.status === "Evaluated" || sub.status === "Re-Review Requested")) {
        if (viewReportBtn) {
          viewReportBtn.style.display = "inline-flex";
          viewReportBtn.onclick = () => openStudentReportModal(activeChallenge.id);
        }
        if (submitBtn) {
          if (isExpired) {
            submitBtn.disabled = true;
            submitBtn.textContent = "Deadline Passed";
            submitBtn.classList.remove("btn-primary");
            submitBtn.classList.add("btn-outline");
            submitBtn.title = `Submissions closed on ${deadlineDate.toLocaleString()}`;
          } else {
            submitBtn.disabled = false;
            submitBtn.textContent = "Resubmit Solution";
            submitBtn.classList.add("btn-primary");
            submitBtn.classList.remove("btn-outline");
            submitBtn.title = "";
          }
        }
      } else {
        if (viewReportBtn) viewReportBtn.style.display = "none";
        if (submitBtn) {
          if (isExpired) {
            submitBtn.disabled = true;
            submitBtn.textContent = "Deadline Passed";
            submitBtn.classList.remove("btn-primary");
            submitBtn.classList.add("btn-outline");
            submitBtn.title = `Submissions closed on ${deadlineDate.toLocaleString()}`;
          } else {
            submitBtn.disabled = false;
            submitBtn.textContent = sub ? "Resubmit Solution & Reflection" : "Submit Solution & Reflection";
            submitBtn.classList.add("btn-primary");
            submitBtn.classList.remove("btn-outline");
            submitBtn.title = "";
          }
        }
      }
  }


  // 8. Dynamic 3-Stage + Appeal Stepper
    function renderStepper(sub) {
      const stepper = document.getElementById("stepper");
      if (!stepper) return;

      const hasSubmitted = Boolean(sub);
      const status = String(sub?.status || "").trim();
      const remarks = String(sub?.remarks || "");
      const verdict = String(sub?.rubric?.verdict || "");

      // ── Check Evaluation Flags (AI + Faculty Completion) ──
      // In DevArena, 'Evaluated' indicates AI grading has been vetted/finalized by faculty
      const isBothEvaluated = status === "Evaluated" || status === "Re-Review Requested";

      // ── Check Marks Awarded ──
      const hasMarks = isBothEvaluated && (sub?.pointsEarned !== null && sub?.pointsEarned !== undefined);
      const earnedPts = hasMarks ? sub.pointsEarned : null;

      // ── Check Re-Evaluation / Appeal State ──
      const isAppealed = status === "Re-Review Requested" ||
        remarks.includes("Reason:") ||
        verdict.includes("[Re-Review Upheld]") ||
        remarks.includes("[Appeal Rejected]") ||
        Boolean(sub?.rubric?.appealReason);

      const isAppealPending = status === "Re-Review Requested";
      const isAppealRejected = remarks.includes("[Appeal Rejected]") || status === "Re-Review Rejected" || verdict.includes("[Appeal Rejected]");
      const isAppealAccepted = (isBothEvaluated && !isAppealPending && !isAppealRejected && (verdict.includes("[Re-Review Upheld]") || remarks.includes("Reason:")));

      // ── Stage 1: Submission ──
      const s1Class = hasSubmitted ? "completed" : "active";
      const s1Desc = hasSubmitted
        ? `Submitted on ${sub.submittedAt ? sub.submittedAt.slice(0, 10) : 'Recent'}`
        : "Code, inputs & reflection prepared";

      // ── Stage 2: Evaluated (Both AI & Faculty) ──
      let s2Class = "";
      let s2Desc = "Awaiting evaluation by AI & Faculty";
      if (hasSubmitted) {
        if (isBothEvaluated) {
          s2Class = "completed";
          s2Desc = "Verified by AI Rubric & Faculty Mentor";
        } else {
          s2Class = "active";
          s2Desc = "Pending review by Faculty Mentor";
        }
      }

      // ── Stage 3: Marks Awarded ──
      let s3Class = "";
      let s3Desc = "Marks pending mentor finalization";
      if (isBothEvaluated) {
        if (hasMarks) {
          s3Class = "completed";
          s3Desc = `Awarded: ${earnedPts} / 10 Pts (Click to view report)`;
        } else {
          s3Class = "active";
          s3Desc = "Grading calculation in progress";
        }
      }

      // ── Dynamic Stage 4: Re-Evaluation (Only renders if appeal was initiated) ──
      let stage4Html = "";
      if (isAppealed) {
        if (isAppealPending) {
          stage4Html = `
            <li class="active appeal-pending">
              <div class="step-marker font-mono">4</div>
              <div>
                <div class="step-title" style="color: #f59e0b;">Re-Evaluation In Progress</div>
                <div class="step-desc">Faculty mentor is reviewing your appeal.</div>
              </div>
            </li>
          `;
        } else if (isAppealRejected) {
          stage4Html = `
            <li class="rejected appeal-rejected" id="stepperAppealStep" style="cursor:pointer;">
              <div class="step-marker font-mono" style="background:#ef4444; border-color:#ef4444; color:#fff;">✕</div>
              <div>
                <div class="step-title" style="color: #ef4444;">Faculty Rejected Re-Evaluation</div>
                <div class="step-desc">Original marks upheld. Click to view feedback.</div>
              </div>
            </li>
          `;
        } else if (isAppealAccepted) {
          stage4Html = `
            <li class="completed appeal-accepted" id="stepperAppealStep" style="cursor:pointer;">
              <div class="step-marker font-mono">✓</div>
              <div>
                <div class="step-title" style="color: #10b981;">Re-Evaluation Completed</div>
                <div class="step-desc">Faculty accepted appeal and finalized marks.</div>
              </div>
            </li>
          `;
        }
      }

      stepper.innerHTML = `
        <li class="${s1Class}">
          <div class="step-marker font-mono">1</div>
          <div>
            <div class="step-title">Submission</div>
            <div class="step-desc">${s1Desc}</div>
          </div>
        </li>
        <li class="${s2Class}">
          <div class="step-marker font-mono">2</div>
          <div>
            <div class="step-title">Evaluated</div>
            <div class="step-desc">${s2Desc}</div>
          </div>
        </li>
        <li class="${s3Class}" style="${hasMarks ? 'cursor:pointer;' : ''}" id="stepperGradeStep">
          <div class="step-marker font-mono">3</div>
          <div>
            <div class="step-title">Marks Awarded</div>
            <div class="step-desc">${s3Desc}</div>
          </div>
        </li>
        ${stage4Html}
      `;

      // Click listeners to open evaluation report
      if (hasMarks) {
        document.getElementById("stepperGradeStep")?.addEventListener("click", () => {
          if (activeChallenge) openStudentReportModal(activeChallenge.id);
        });
      }

      if (document.getElementById("stepperAppealStep")) {
        document.getElementById("stepperAppealStep")?.addEventListener("click", () => {
          if (activeChallenge) openStudentReportModal(activeChallenge.id);
        });
      }
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

  // 12. Submit Pipeline (Strict Mandatory Gating on Code, Input, Output & Reflection)
  document.getElementById("submitBtn")?.addEventListener("click", async () => {
    const code = document.getElementById("codeEditor")?.value.trim() || "";
    const studentInput = document.getElementById("studentTestInput")?.value.trim() || "";
    const studentOutput = document.getElementById("studentTestOutput")?.value.trim() || "";
    const reflectionText = document.getElementById("reflectionArea")?.value.trim() || "";

    // ── Field 1: Code Solution ──
    if (!code) {
      toast("⚠️ Code Solution is required before submitting.");
      document.getElementById("codeEditor")?.focus();
      return;
    }

    // ── Field 2: Test Case Input (stdin) ──
    if (!studentInput) {
      toast("⚠️ Test Case Inputs (stdin) cannot be empty.");
      document.getElementById("studentTestInput")?.focus();
      return;
    }

    // ── Field 3: Expected / Observed Output (stdout) ──
    if (!studentOutput) {
      toast("⚠️ Expected / Observed Output (stdout) cannot be empty.");
      document.getElementById("studentTestOutput")?.focus();
      return;
    }

    // ── Field 4: Reflection (Text or attached PDF) ──
    if (!reflectionText && !attachedPdfBase64) {
      toast("⚠️ Reflection is mandatory. Provide written notes or attach a PDF.");
      document.getElementById("reflectionArea")?.focus();
      return;
    }

    if (reflectionText.length < 15 && !attachedPdfBase64) {
      toast("⚠️ Reflection must be at least 15 characters explaining your approach.");
      document.getElementById("reflectionArea")?.focus();
      return;
    }

    const sub = userSubmissions.find((s) => String(s.challengeId) === String(activeChallenge.id));
    if (sub && sub.status === "Evaluated") {
      if (!confirm("You have already received marks for this task. Submitting again will update your solution file on Drive. Proceed?")) {
        return;
      }
    }

    const submitBtn = document.getElementById("submitBtn");
    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting to Drive & Sheets...";

    const testRunSummary =
`[STUDENT VERIFIED TEST CASES]
INPUT (stdin):
${studentInput}

OUTPUT (stdout):
${studentOutput}`;

    const payload = {
      challengeId: activeChallenge.id,
      studentId: session.regNo,
      regNo: session.regNo,
      trackId: assignedTrack.id,
      trackYear: assignedTrack.year || session.academicYear || "1st Year",
      facultyName: mentor.name,
      language: document.getElementById("langSelect")?.value || "c",
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
        toast(res?.error || "Submission failed.");
      }
    } catch (err) {
      toast("Submission error: " + err.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = sub ? "Resubmit Solution" : "Submit Solution & Reflection";
    }
  });

  //13. ── Student Feedback Modal Wiring ──
    const feedbackModal = document.getElementById("feedbackModal");
    const openFeedbackBtn = document.getElementById("openFeedbackModalBtn");
    const closeFeedbackBtn = document.getElementById("closeFeedbackModalBtn");
    const cancelFeedbackBtn = document.getElementById("cancelFeedbackModalBtn");
    const submitFeedbackBtn = document.getElementById("submitFeedbackBtn");
    const feedbackImgInput = document.getElementById("feedbackImgInput");
    const feedbackImgNameLabel = document.getElementById("feedbackImgFileName");

    let feedbackImageBase64 = null;
    let feedbackImageName = null;
    let feedbackImageMime = null;

    feedbackImgInput?.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        feedbackImageBase64 = await API.fileToBase64(file);
        feedbackImageName = file.name;
        feedbackImageMime = file.type;
        if (feedbackImgNameLabel) feedbackImgNameLabel.textContent = file.name;
      } catch (err) {
        toast("Could not read screenshot.");
      }
    });

    const hideFeedbackModal = () => {
      if (feedbackModal) feedbackModal.hidden = true;
    };

    openFeedbackBtn?.addEventListener("click", () => {
      if (feedbackModal) feedbackModal.hidden = false;
    });

    closeFeedbackBtn?.addEventListener("click", hideFeedbackModal);
    cancelFeedbackBtn?.addEventListener("click", hideFeedbackModal);

    submitFeedbackBtn?.addEventListener("click", async () => {
      const title = document.getElementById("feedbackTitleInput")?.value.trim() || "";
      const type = document.getElementById("feedbackTypeInput")?.value.trim() || "";
      const description = document.getElementById("feedbackMessageArea")?.value.trim() || "";

      if (!title || !description) {
        toast("⚠️ Title and description are required.");
        return;
      }

      submitFeedbackBtn.disabled = true;
      submitFeedbackBtn.textContent = "Submitting...";

      try {
        const res = await API.submitFeedback({
          role: "student",
          userId: session.regNo,
          trackId: assignedTrack.id,
          challengeId: activeChallenge?.id || "N/A",
          problemTitle: title,
          problemType: type || "General Problem",
          description: description,
          imageBase64: feedbackImageBase64,
          imageName: feedbackImageName,
          imageMime: feedbackImageMime
        });

        if (res && res.success) {
                toast("Your feedback has been sent to Admin and will be resolved accordingly.");
                alert("✅ Your feedback has been sent to Admin and will be resolved accordingly.\nTicket ID: " + (res.ticketId || "Logged"));
                hideFeedbackModal();
                document.getElementById("feedbackTitleInput").value = "";
                document.getElementById("feedbackTypeInput").value = "";
                document.getElementById("feedbackMessageArea").value = "";
                if (feedbackImgNameLabel) feedbackImgNameLabel.textContent = "No screenshot selected";
                feedbackImageBase64 = null;
              } else {
                toast("Failed: " + (res?.error || "Server error"));
                alert("Failed to submit report: " + (res?.error || "Unknown server response"));
              }
      } catch (err) {
        toast("Error: " + err.message);
      } finally {
        submitFeedbackBtn.disabled = false;
        submitFeedbackBtn.textContent = "Submit Report";
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

langSelect?.addEventListener("change", (e) => {
  const lang = e.target.value;
  const config = extMap[lang] || { ext: ".py", accept: ".py" };
  if (codeFileInput) codeFileInput.accept = config.accept;
  if (codeUploadExtLabel) codeUploadExtLabel.textContent = config.ext;
});

codeFileInput?.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const currentLang = langSelect ? langSelect.value : "python";
  const allowed = extMap[currentLang] || extMap.python;
  const fileExt = "." + file.name.split(".").pop().toLowerCase();

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

// ── Open Student Report & Review Modal ──
async function openStudentReportModal(challengeId) {
  const session = JSON.parse(localStorage.getItem("devarena.session") || "{}");
  const modal = document.getElementById("studentReportModal");
  if (!modal) return;

  const trackId = session.trackId || "c2t-y1-aimlf";
  const regNo = session.regNo;

  try {
    const res = await API.getStudentSubmissionReport(trackId, regNo, challengeId);
    if (!res || !res.success) {
      alert(res?.error || "Submission record not found for this task.");
      return;
    }

    const sub = res.report;
    const rubric = sub.rubric || {};

    document.getElementById("reportModalTitle").textContent = `Task ${challengeId.toUpperCase()} Assessment`;
    document.getElementById("reportRawScore").textContent = `${sub.rawPoints} / 10`;
    document.getElementById("reportConvertedMark").textContent = `${sub.convertedMarks} / 5.00`;
    document.getElementById("reportStatusBadge").innerHTML = `<span class="status-pill pill-done">${escapeHtml(sub.status)}</span>`;
    document.getElementById("reportVerdict").textContent = rubric.verdict || "No specific comments recorded.";
    document.getElementById("reportGuidance").textContent = rubric.pedagogical_advice || "Review the lab notes for reference solutions.";

    // Render Strengths
    const strengthsEl = document.getElementById("reportStrengthsList");
    strengthsEl.innerHTML = "";
    (rubric.strengths || ["Correct approach overall"]).forEach((s) => {
      const li = document.createElement("li");
      li.textContent = s;
      strengthsEl.appendChild(li);
    });

    // Render Weaknesses
    const weaknessesEl = document.getElementById("reportWeaknessesList");
    weaknessesEl.innerHTML = "";
    (rubric.weaknesses_and_bugs || ["No critical syntax or boundary bugs detected."]).forEach((w) => {
      const li = document.createElement("li");
      li.textContent = w;
      weaknessesEl.appendChild(li);
    });

    // ── Setup Re-Review Appeal Listeners (1-Appeal Barrier) ──
    const reReviewBox = document.getElementById("reReviewFormBox");
    const toggleBtn = document.getElementById("toggleReReviewBtn");
    const submitReReviewBtn = document.getElementById("submitReReviewBtn");

    const isAppealed = (rubric && rubric.appealCount >= 1) ||
      String(sub.rubric?.verdict || "").includes("[Re-Review Upheld]") ||
      String(rubric.appealReason || "").length > 0;

    if (isAppealed) {
      toggleBtn.disabled = true;
      toggleBtn.textContent = "Re-Evaluation Utilized (1/1)";
      toggleBtn.style.opacity = "0.5";
      toggleBtn.style.cursor = "not-allowed";
      reReviewBox?.setAttribute("hidden", "");
    } else if (sub.status === "Re-Review Requested") {
      toggleBtn.disabled = true;
      toggleBtn.textContent = "Re-Evaluation Pending Faculty Review";
      toggleBtn.style.opacity = "0.7";
      toggleBtn.style.cursor = "not-allowed";
      reReviewBox?.setAttribute("hidden", "");
    } else {
      toggleBtn.disabled = false;
      toggleBtn.textContent = "Request Faculty Re-Evaluation";
      toggleBtn.style.opacity = "1";
      toggleBtn.style.cursor = "pointer";
      toggleBtn.onclick = () => reReviewBox?.removeAttribute("hidden");
    }

    document.getElementById("cancelReReviewBtn").onclick = () => reReviewBox?.setAttribute("hidden", "");

    submitReReviewBtn.onclick = async () => {
      const reason = document.getElementById("reReviewReasonInput").value.trim();
      if (!reason) {
        alert("Please provide a reason for re-evaluation.");
        return;
      }
      submitReReviewBtn.disabled = true;
      submitReReviewBtn.textContent = "Submitting...";

      try {
        const revRes = await API.requestReEvaluation(trackId, regNo, challengeId, reason);
        if (revRes && revRes.success) {
          alert("Re-evaluation appeal sent to your faculty mentor.");
          modal.setAttribute("hidden", "");
          window.location.reload();
        } else {
          alert("Error: " + (revRes?.error || "Could not submit request."));
        }
      } catch (err) {
        alert("Error submitting request: " + err.message);
      } finally {
        submitReReviewBtn.disabled = false;
        submitReReviewBtn.textContent = "Submit Appeal";
      }
    };

    modal.removeAttribute("hidden");
  } catch (err) {
    alert("Failed to load report: " + err.message);
  }
}

// Close Button & Backdrop Dismissal
document.getElementById("closeReportModalBtn")?.addEventListener("click", () => {
  document.getElementById("studentReportModal")?.setAttribute("hidden", "");
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    document.getElementById("studentReportModal")?.setAttribute("hidden", "");
  }
});

document.addEventListener("DOMContentLoaded", boot);
