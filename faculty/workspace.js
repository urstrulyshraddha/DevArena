/* ==========================================================================
   SRM DevArena — Standalone Faculty Workspace (faculty/workspace.js)
   ========================================================================== */

import { API } from "../js/api.js";
import { initTheme } from "../js/theme.js";

function toast(msg) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("visible");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove("visible"), 2600);
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

async function boot() {
  initTheme();

  // 1. Session Verification
  const session = JSON.parse(localStorage.getItem("devarena.session") || "null");
  if (!session || (session.role !== "faculty" && session.role !== "admin")) {
    window.location.href = "../index.html";
    return;
  }

  // 2. Profile Setup
  const avatarEl = document.getElementById("facultyAvatar");
  const nameEl = document.getElementById("facultyName");
  const emailEl = document.getElementById("facultyEmail");
  const bannerName = document.getElementById("facultyBannerName");
  const bannerMeta = document.getElementById("facultyBannerMeta");

  if (avatarEl) avatarEl.textContent = (session.name || "F").charAt(0).toUpperCase();
  if (nameEl) nameEl.textContent = session.name || "Faculty Member";
  if (emailEl) emailEl.textContent = session.email;
  if (bannerName) bannerName.textContent = session.name;
  if (bannerMeta) bannerMeta.textContent = `${session.title || "Professor"} — ${session.email}`;

  document.getElementById("facultyMenuBtn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    document.getElementById("facultyDropdown")?.classList.toggle("open");
  });
  document.addEventListener("click", () => {
    document.getElementById("facultyDropdown")?.classList.remove("open");
  });

  document.getElementById("logoutBtn")?.addEventListener("click", () => {
    localStorage.removeItem("devarena.session");
    window.location.href = "../index.html";
  });

  // 3. Resolve Faculty Catalog & Tracks
  let portalData = await API.getPortalConfig();
  const faculties = portalData?.faculties || [];
  const activeFaculty = faculties.find((f) => f.email.toLowerCase() === session.email.toLowerCase()) || {
    id: "yasir",
    name: session.name,
    tracks: [{ id: "c2t-y1-aimlf", name: "Code2Think", year: "1st year", section: "AIML - F" }]
  };

  const tracks = activeFaculty.tracks || [];
  let activeTrack = tracks[0] || { id: "c2t-y1-aimlf", name: "Code2Think" };
  let challenges = [];
  let submissions = [];
  let activeChallenge = null;
  let currentInspectingSub = null;

  // 4. Custom Track Dropdown Controller
  function setupTrackDropdown() {
    const container = document.getElementById("wsTrackDropdownWidget");
    const trigger = document.getElementById("wsTrackDropdownTrigger");
    const label = document.getElementById("wsTrackDropdownLabel");
    const menu = document.getElementById("wsTrackDropdownMenu");

    if (!container || !trigger || !label || !menu) return;

    label.textContent = `${activeTrack.name} · ${activeTrack.section || activeTrack.year || ''}`;
    menu.innerHTML = "";

    tracks.forEach((t) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "track-dropdown__option" + (t.id === activeTrack.id ? " is-selected" : "");
      btn.innerHTML = `
        <span class="track-dropdown__option-icon"></span>
        <span>${escapeHtml(t.name)} · ${escapeHtml(t.section || t.year || '')}</span>
      `;

      btn.onclick = async () => {
        activeTrack = t;
        activeChallenge = null;
        label.textContent = `${t.name} · ${t.section || t.year || ''}`;
        container.classList.remove("is-open");
        setupTrackDropdown();
        await loadData();
        renderAll();
      };

      menu.appendChild(btn);
    });

    trigger.onclick = (e) => {
      e.stopPropagation();
      container.classList.toggle("is-open");
    };

    document.addEventListener("click", () => {
      container.classList.remove("is-open");
    });
  }

  setupTrackDropdown();

  // 5. Data Loading
  async function loadData() {
    const cacheKey = `devarena.cache.${activeTrack.id}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        challenges = parsed.challenges || [];
        submissions = parsed.submissions || [];
        renderAll();
      } catch (e) {}
    }

    try {
      const res = await API.getFacultyTrackData(activeTrack.id);
      challenges = (res && Array.isArray(res.challenges)) ? res.challenges : [];
      submissions = (res && Array.isArray(res.submissions)) ? res.submissions : [];
      localStorage.setItem(cacheKey, JSON.stringify({ challenges, submissions }));
      renderAll();
    } catch (err) {
      const chRes = await API.getChallenges(activeTrack.id);
      const subRes = await API.getSubmissions(activeTrack.id);
      challenges = chRes?.challenges || [];
      submissions = subRes?.submissions || [];
      renderAll();
    }
  }

  // 6. Master Render Function
  function renderAll() {
    renderTaskList();
    renderSubmissionsTable();
    renderReReviewRequests();
  }

  // ── Render Task List with Inline Edit Button ──
  function renderTaskList() {
    const list = document.getElementById("taskList");
    const countBadge = document.getElementById("challengeCountBadge");
    if (!list) return;

    list.innerHTML = "";
    if (countBadge) countBadge.textContent = `${challenges.length} configured`;

    const allBtn = document.createElement("button");
    allBtn.className = "task-item" + (!activeChallenge ? " active" : "");
    allBtn.innerHTML = `
      <div class="task-item__content">
        <strong>All Challenges</strong><br>
        <small class="text-muted">View All Submissions</small>
      </div>
    `;
    allBtn.onclick = () => {
      activeChallenge = null;
      renderAll();
    };
    list.appendChild(allBtn);

    challenges.forEach((ch) => {
      const item = document.createElement("div");
      item.className = "task-item" + (activeChallenge?.id === ch.id ? " active" : "");

      item.innerHTML = `
        <div class="task-item__content" style="cursor:pointer; flex:1;">
          <div style="font-weight:600; font-size:0.86rem;">${escapeHtml(ch.title)}</div>
          <div class="task-item-points font-mono text-xs text-muted">${ch.points || 10} pts</div>
        </div>
        <div class="task-item__actions" style="margin-left:8px;">
          <button type="button" class="btn-task-edit" title="Edit Task">Edit</button>
        </div>
      `;

      item.querySelector(".task-item__content").onclick = () => {
        activeChallenge = ch;
        renderAll();
      };

      item.querySelector(".btn-task-edit").onclick = (e) => {
        e.stopPropagation();
        openEditTaskModal(ch);
      };

      list.appendChild(item);
    });
  }

  // ── Helper: Open Modal in Edit Mode ──
  function openEditTaskModal(ch) {
    const modal = document.getElementById("createTaskModal");
    if (!modal) return;
    const headTitle = modal.querySelector(".onboarding-head h2");
    const headSub = modal.querySelector(".onboarding-head p");
    const submitBtn = modal.querySelector('button[type="submit"]');
    const deleteBtn = document.getElementById("deleteTaskBtn");
    const hiddenIdInput = document.getElementById("editChallengeId");

    if (headTitle) headTitle.textContent = "Edit Task / Challenge";
    if (headSub) headSub.textContent = `Modify specifications for ${ch.id.toUpperCase()}`;
    if (submitBtn) submitBtn.textContent = "Save Changes";
    if (deleteBtn) deleteBtn.style.display = "inline-block";
    if (hiddenIdInput) hiddenIdInput.value = ch.id;

    const taskNum = String(ch.id).replace(/[^0-9]/g, "");
    const taskNumInput = document.getElementById("newTaskNumber");
    if (taskNumInput) taskNumInput.value = parseInt(taskNum, 10) || "";

    const titleInput = document.getElementById("newTaskTitle");
    if (titleInput) titleInput.value = ch.title || "";

    const pointsInput = document.getElementById("newTaskPoints");
    if (pointsInput) pointsInput.value = ch.points || ch.maxRawPts || 10;

    const deadlineInput = document.getElementById("newTaskDeadline");
    if (deadlineInput) {
      if (ch.deadline) {
        const d = new Date(ch.deadline);
        deadlineInput.value = !isNaN(d) ? d.toISOString().slice(0, 16) : ch.deadline;
      } else {
        deadlineInput.value = "";
      }
    }

    const statementInput = document.getElementById("newTaskStatement");
    if (statementInput) statementInput.value = ch.statement || "";

    const tests = Array.isArray(ch.sampleTests) ? ch.sampleTests : [];
    const inputField = document.getElementById("newTaskInput");
    const outputField = document.getElementById("newTaskOutput");
    if (tests.length > 0) {
      if (inputField) inputField.value = tests[0].input || "";
      if (outputField) outputField.value = tests[0].expectedOutput || "";
    } else {
      if (inputField) inputField.value = "";
      if (outputField) outputField.value = "";
    }

    modal.removeAttribute("hidden");
  }

  // ── Open Modal in Create Mode ──
  const openTaskBtn = document.getElementById("openTaskModalBtn");
  const createTaskModal = document.getElementById("createTaskModal");
  const createTaskForm = document.getElementById("createTaskForm");

  openTaskBtn?.addEventListener("click", () => {
    if (!createTaskModal) return;
    const headTitle = createTaskModal.querySelector(".onboarding-head h2");
    const headSub = createTaskModal.querySelector(".onboarding-head p");
    const submitBtn = createTaskModal.querySelector('button[type="submit"]');
    const deleteBtn = document.getElementById("deleteTaskBtn");
    const hiddenIdInput = document.getElementById("editChallengeId");

    if (headTitle) headTitle.textContent = "Add New Task / Challenge";
    if (headSub) headSub.textContent = "Configure a lab scenario with explicit numbering and sample test cases.";
    if (submitBtn) submitBtn.textContent = "Publish Task";
    if (deleteBtn) deleteBtn.style.display = "none";
    if (hiddenIdInput) hiddenIdInput.value = "";

    createTaskForm?.reset();
    const pointsInput = document.getElementById("newTaskPoints");
    if (pointsInput) pointsInput.value = 10;

    createTaskModal.removeAttribute("hidden");
  });

  // ── Single Unified Task Form Submit ──
  createTaskForm?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const hiddenIdInput = document.getElementById("editChallengeId");
    const isEdit = Boolean(hiddenIdInput && hiddenIdInput.value);
    const challengeId = hiddenIdInput?.value || "";

    const challengeNumber = document.getElementById("newTaskNumber")?.value.trim() || "";
    const title = document.getElementById("newTaskTitle")?.value.trim() || "";
    const statement = document.getElementById("newTaskStatement")?.value.trim() || "";
    const points = parseFloat(document.getElementById("newTaskPoints")?.value) || 10;
    const deadline = document.getElementById("newTaskDeadline")?.value || "";
    const inputStr = document.getElementById("newTaskInput")?.value || "";
    const outputStr = document.getElementById("newTaskOutput")?.value || "";

    if (!title) {
      toast("Please provide a task title.");
      return;
    }

    const sampleTests = (inputStr || outputStr) ? [{ input: inputStr, expectedOutput: outputStr }] : [];
    const submitBtn = createTaskForm.querySelector('button[type="submit"]');

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = isEdit ? "Saving..." : "Publishing...";
    }

    try {
      let res;
      if (isEdit) {
        res = await API.updateTask({
          challengeId,
          trackId: activeTrack.id,
          title,
          statement,
          points,
          deadline,
          sampleTests
        });
      } else {
        res = await API.createTask({
          challengeNumber,
          trackId: activeTrack.id,
          title,
          statement,
          points,
          deadline,
          sampleTests
        });
      }

      if (res && res.success) {
        toast(isEdit ? "Task updated successfully!" : "Task published successfully!");
        createTaskModal?.setAttribute("hidden", "");
        createTaskForm.reset();

        localStorage.removeItem(`devarena.cache.${activeTrack.id}`);
        await loadData();
      } else {
        toast("Failed: " + (res?.error || "Server error"));
      }
    } catch (err) {
      toast("Error: " + err.message);
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = isEdit ? "Save Changes" : "Publish Task";
      }
    }
  });

  // ── Delete Task Handler ──
  document.getElementById("deleteTaskBtn")?.addEventListener("click", async () => {
    const challengeId = document.getElementById("editChallengeId")?.value;
    if (!challengeId) return;

    if (!confirm(`Are you sure you want to permanently delete task "${challengeId.toUpperCase()}"? This action cannot be undone.`)) {
      return;
    }

    const delBtn = document.getElementById("deleteTaskBtn");
    if (delBtn) {
      delBtn.disabled = true;
      delBtn.textContent = "Deleting...";
    }

    try {
      const res = await API.deleteTask(challengeId, activeTrack.id);
      if (res && res.success) {
        toast(`Task ${challengeId.toUpperCase()} deleted.`);
        createTaskModal?.setAttribute("hidden", "");
        createTaskForm?.reset();

        activeChallenge = null;
        localStorage.removeItem(`devarena.cache.${activeTrack.id}`);
        await loadData();
      } else {
        toast("Failed to delete: " + (res?.error || "Server error"));
      }
    } catch (err) {
      toast("Delete error: " + err.message);
    } finally {
      if (delBtn) {
        delBtn.disabled = false;
        delBtn.textContent = "Delete Task";
      }
    }
  });

  // ── Render Submissions Roster Table ──
  function renderSubmissionsTable() {
    const tbody = document.getElementById("submissionsTableBody");
    const title = document.getElementById("tableTitle");
    const subtitle = document.getElementById("tableSubtitle");
    if (!tbody) return;

    tbody.innerHTML = "";

    if (activeChallenge) {
      title.textContent = activeChallenge.title;
      subtitle.textContent = `Max Points: ${activeChallenge.points || 10} · Deadline: ${activeChallenge.deadline || "None set"}`;
    } else {
      title.textContent = `All Challenges — ${activeTrack.name}`;
      subtitle.textContent = "Full track submission roster";
    }

    const filtered = submissions.filter((s) => {
      if (!activeChallenge) return true;
      return String(s.challengeId) === String(activeChallenge.id);
    });

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:36px; color:var(--text-muted);">
        No submissions recorded yet for this selection.</td></tr>`;
      return;
    }

    filtered.forEach((sub) => {
      const tr = document.createElement("tr");
      const earned = sub.pointsEarned !== null && sub.pointsEarned !== undefined ? sub.pointsEarned : "—";
      const converted = typeof sub.pointsEarned === "number" ? (Math.min(5, sub.pointsEarned / 2)).toFixed(2) : "—";

      const isReReview = String(sub.status || "").trim().toLowerCase() === "re-review requested";
      const pillClass = isReReview
        ? "pill-review-requested"
        : sub.status === "Evaluated"
        ? "pill-done"
        : "pill-review";

      tr.innerHTML = `
        <td><strong class="font-mono">${escapeHtml(sub.regNo)}</strong></td>
        <td><span class="status-pill ${pillClass}">${escapeHtml(sub.status)}</span></td>
        <td class="font-mono text-xs text-muted">${escapeHtml(sub.submittedAt ? sub.submittedAt.slice(0, 10) : '—')}</td>
        <td style="text-align:center;">
          ${sub.codeUrl ? `<a href="${sub.codeUrl}" target="_blank" class="btn btn-outline btn-xs">View Artifact</a>` : '<span class="text-muted text-xs">—</span>'}
        </td>
        <td style="text-align:right;" class="font-mono">${earned}</td>
        <td style="text-align:right;" class="font-mono text-muted">${converted} / 5.00</td>
        <td style="text-align:center;">
          <button type="button" class="btn btn-primary btn-xs inspect-btn">Inspect &amp; Grade</button>
        </td>
      `;

      tr.querySelector(".inspect-btn")?.addEventListener("click", () => {
        openInspectModal(sub);
      });

      tbody.appendChild(tr);
    });
  }

  // ── Render Pending Re-Review Requests in Left Sidebar ──
  function renderReReviewRequests() {
    const listEl = document.getElementById("reReviewList");
    const emptyMsg = document.getElementById("noReReviewMsg");
    if (!listEl) return;

    listEl.innerHTML = "";

    const pendingRequests = submissions.filter(
      (s) => String(s.status || "").trim().toLowerCase() === "re-review requested"
    );

    if (pendingRequests.length === 0) {
      if (emptyMsg) emptyMsg.style.display = "block";
      return;
    }

    if (emptyMsg) emptyMsg.style.display = "none";

    pendingRequests.forEach((sub) => {
      const card = document.createElement("div");
      card.className = "task-item";
      card.style.cssText =
        "display:flex; justify-content:space-between; align-items:center; padding:10px 12px; margin-bottom:8px; border:1px solid rgba(245, 158, 11, 0.3); border-radius:6px; background:rgba(245, 158, 11, 0.06);";

      card.innerHTML = `
        <div>
          <div class="font-mono" style="font-weight:600; font-size:0.8rem;">${escapeHtml(sub.regNo)}</div>
          <div class="text-xs text-muted">Task: ${escapeHtml(String(sub.challengeId || "").toUpperCase())}</div>
        </div>
        <button class="btn btn-outline btn-xs" type="button" style="border-color:#f59e0b; color:#f59e0b;">Inspect</button>
      `;

      card.querySelector("button")?.addEventListener("click", () => {
        openInspectModal(sub);
      });

      listEl.appendChild(card);
    });
  }

  // ── 7. Inspect Modal & Evaluation Studio ──
  function openInspectModal(sub) {
    if (!sub) return;
    currentInspectingSub = sub;

    const modal = document.getElementById("inspectModal");
    if (!modal) return;

    const titleEl = document.getElementById("inspectTitle");
    const metaEl = document.getElementById("inspectMeta");
    if (titleEl) titleEl.textContent = `Evaluate ${sub.regNo}`;
    if (metaEl) metaEl.textContent = `Task ${String(sub.challengeId || "").toUpperCase()} · Submitted on ${sub.submittedAt ? sub.submittedAt.slice(0, 10) : 'Recent'}`;

    const codeLink = document.getElementById("inspectCodeLink");
    if (codeLink) {
      codeLink.href = sub.codeUrl || "#";
      codeLink.style.display = sub.codeUrl ? "inline-flex" : "none";
    }

    let rubric = {};
    if (typeof sub.rubric === "object" && sub.rubric !== null) {
      rubric = sub.rubric;
    } else if (typeof sub.remarks === "string" && sub.remarks.trim().startsWith("{")) {
      try { rubric = JSON.parse(sub.remarks); } catch(e) {}
    }

    // Appeal Alert & Reject Button Visibility
    const appealAlert = document.getElementById("inspectAppealAlert");
    const appealReason = document.getElementById("inspectAppealReason");
    const rejectBtn = document.getElementById("rejectAppealBtn");
    const isReReview = String(sub.status || "").trim().toLowerCase() === "re-review requested";

    if (appealAlert && appealReason) {
      if (isReReview) {
        const match = String(sub.remarks || "").match(/Reason:\s*(.*)/i);
        appealReason.textContent = match ? match[1] : (sub.reason || "Student requested faculty verification of marks.");
        appealAlert.style.display = "block";
        if (rejectBtn) rejectBtn.style.display = "inline-flex";
      } else {
        appealAlert.style.display = "none";
        if (rejectBtn) rejectBtn.style.display = "none";
      }
    }

    // Score & Converted Mark
    const scoreInput = document.getElementById("inspectScoreInput");
    const previewEl = document.getElementById("inspectConvertedPreview");
    const initialPts = typeof sub.pointsEarned === "number" ? sub.pointsEarned : 10;

    if (scoreInput) {
      scoreInput.value = initialPts;
      scoreInput.oninput = () => {
        const val = parseFloat(scoreInput.value) || 0;
        if (previewEl) previewEl.textContent = `${(Math.min(5, val / 2)).toFixed(2)} / 5.00`;
      };
    }
    if (previewEl) {
      previewEl.textContent = `${(Math.min(5, initialPts / 2)).toFixed(2)} / 5.00`;
    }

    // Review Summary / Verdict
    const verdictInput = document.getElementById("inspectVerdictInput");
    if (verdictInput) {
      verdictInput.value = rubric.verdict || "Evaluation verified and approved by faculty reviewer.";
    }

    // Strengths & Weaknesses
    const strengthsArr = Array.isArray(rubric.strengths) ? rubric.strengths : ["Correct logic approach"];
    const weaknessesArr = Array.isArray(rubric.weaknesses_and_bugs) ? rubric.weaknesses_and_bugs : ["Review edge cases"];

    const strengthsInput = document.getElementById("inspectStrengthsInput");
    const weaknessesInput = document.getElementById("inspectWeaknessesInput");
    const guidanceInput = document.getElementById("inspectGuidanceInput");

    if (strengthsInput) strengthsInput.value = strengthsArr.join("\n");
    if (weaknessesInput) weaknessesInput.value = weaknessesArr.join("\n");
    if (guidanceInput) guidanceInput.value = rubric.pedagogical_advice || "Refer to standard lab solutions for reference patterns.";

    modal.removeAttribute("hidden");
  }

  // Confirm & Award Marks Handler
  document.getElementById("saveInspectEvaluationBtn")?.addEventListener("click", async () => {
    if (!currentInspectingSub) return;

    const saveBtn = document.getElementById("saveInspectEvaluationBtn");
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving & Syncing...";

    const pts = parseFloat(document.getElementById("inspectScoreInput")?.value) || 0;
    const verdict = document.getElementById("inspectVerdictInput")?.value.trim() || "";
    const strengths = (document.getElementById("inspectStrengthsInput")?.value || "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    const weaknesses = (document.getElementById("inspectWeaknessesInput")?.value || "")
      .split("\n")
      .map((w) => w.trim())
      .filter(Boolean);
    const guidance = document.getElementById("inspectGuidanceInput")?.value.trim() || "";

    const rubricPayload = {
      score: pts,
      verdict: verdict || "Evaluation verified and finalized by faculty mentor.",
      strengths: strengths.length > 0 ? strengths : ["Implementation verified."],
      weaknesses_and_bugs: weaknesses.length > 0 ? weaknesses : ["No critical syntax or logic bugs detected."],
      pedagogical_advice: guidance || "Lab guidelines met."
    };

    try {
      const res = await API.facultyGradeOverride({
        actionType: "approve",
        trackId: activeTrack.id,
        regNo: currentInspectingSub.regNo,
        challengeId: currentInspectingSub.challengeId,
        rawPoints: pts,
        rubric: rubricPayload
      });

      if (res && res.success === false) {
        throw new Error(res.error || "Failed to update grade.");
      }

      toast(`Marks and rubric updated for ${currentInspectingSub.regNo}!`);
      document.getElementById("inspectModal")?.setAttribute("hidden", "");

      localStorage.removeItem(`devarena.cache.${activeTrack.id}`);
      await loadData();
    } catch (err) {
      toast("Error saving evaluation: " + err.message);
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = "Confirm & Award Marks";
    }
  });

  // Reject Appeal Handler
  document.getElementById("rejectAppealBtn")?.addEventListener("click", async () => {
    if (!currentInspectingSub) return;

    const reason = prompt("Enter a brief reason for rejecting the appeal:", "Faculty reviewed the submission and upheld the original grading rubric.");
    if (reason === null) return; // User clicked Cancel

    const rejectBtn = document.getElementById("rejectAppealBtn");
    rejectBtn.disabled = true;
    rejectBtn.textContent = "Rejecting...";

    try {
      const res = await API.facultyGradeOverride({
        actionType: "reject",
        trackId: activeTrack.id,
        regNo: currentInspectingSub.regNo,
        challengeId: currentInspectingSub.challengeId,
        rejectReason: reason
      });

      if (res && res.success === false) {
        throw new Error(res.error || "Failed to reject appeal.");
      }

      toast(`Appeal rejected and removed from pending queue.`);
      document.getElementById("inspectModal")?.setAttribute("hidden", "");

      localStorage.removeItem(`devarena.cache.${activeTrack.id}`);
      await loadData();
    } catch (err) {
      toast("Error rejecting appeal: " + err.message);
    } finally {
      rejectBtn.disabled = false;
      rejectBtn.textContent = "✕ Reject Appeal (Keep Marks)";
    }
  });

  // Modal Close Handlers
  document.querySelectorAll(".close-modal").forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll(".modal-overlay").forEach((m) => m.setAttribute("hidden", ""));
    };
  });

  document.getElementById("closeCreateTrackBtn")?.addEventListener("click", () => {
    document.getElementById("createTrackModal")?.setAttribute("hidden", "");
  });

  document.getElementById("closeCreateTaskBtn")?.addEventListener("click", () => {
    document.getElementById("createTaskModal")?.setAttribute("hidden", "");
  });

  // 8. Track Creation Handlers
  const openTrackBtn = document.getElementById("openTrackModalBtn");
  const createTrackModal = document.getElementById("createTrackModal");
  const createTrackForm = document.getElementById("createTrackForm");

  openTrackBtn?.addEventListener("click", () => {
    createTrackModal?.removeAttribute("hidden");
  });

  createTrackForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("newTrackName")?.value.trim() || "";
    const year = document.getElementById("newTrackYear")?.value.trim() || "1st Year";
    const section = document.getElementById("newTrackSection")?.value.trim().toUpperCase() || "A";
    const days = document.getElementById("newTrackDays")?.value.trim() || "14";

    if (!name) {
      alert("Track Name is required.");
      return;
    }

    const yrShort = year.toLowerCase().replace(/[^0-9]/g, "") || "1";
    const id = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-y${yrShort}-${section.toLowerCase().replace(/[^a-z0-9]+/g, "")}`;

    const submitBtn = createTrackForm.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Creating...";
    }

    try {
      const res = await API.createTrack({
        track: {
          id,
          name,
          year,
          section,
          challengeDays: `${days} Days`,
          facultyId: activeFaculty.id || session.facultyId || "yasir",
          facultyEmail: session.email
        }
      });

      if (res && res.success) {
        const newTrack = {
          id,
          name,
          year,
          section,
          challengeDays: `${days} Days`,
          facultyId: activeFaculty.id || session.facultyId || "yasir"
        };

        tracks.push(newTrack);
        activeTrack = newTrack;

        setupTrackDropdown();
        createTrackModal?.setAttribute("hidden", "");
        createTrackForm.reset();
        alert(`✅ Track "${name} · ${section}" created successfully!`);

        await loadData();
      } else {
        alert("Failed to create track: " + (res?.error || "Unable to create track."));
      }
    } catch (err) {
      alert("Failed to create track: " + err.message);
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Create Track";
      }
    }
  });

  // ── Open Dedicated Faculty Gradebook Spreadsheet ──
  const openGradebookBtn = document.getElementById("openGradebookBtn");
  openGradebookBtn?.addEventListener("click", async () => {
    openGradebookBtn.disabled = true;
    openGradebookBtn.textContent = "Opening...";

    // Open blank window synchronously on click to bypass modern browser popup blockers
    const sheetTab = window.open("", "_blank");

    try {
      const res = await API.getFacultyGradebook({
        facultyId: activeFaculty.id || session.facultyId || "yasir",
        email: session.email,
        name: session.name,
        trackId: activeTrack.id,
        trackName: activeTrack.name,
        section: activeTrack.section || "A"
      });

      if (res && res.success && res.gradebookUrl) {
        sheetTab.location.href = res.gradebookUrl;
      } else {
        sheetTab.close();
        alert(res?.error || "Unable to retrieve gradebook sheet link.");
      }
    } catch (err) {
      sheetTab.close();
      alert("Error opening gradebook: " + err.message);
    } finally {
      openGradebookBtn.disabled = false;
      openGradebookBtn.innerHTML = `
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
        Open Gradebook Sheet
      `;
    }
  });

  // 9. Automated AI Batch Review Trigger
  document.getElementById("triggerAiReviewBtn")?.addEventListener("click", async () => {
    toast("Triggering automated Gemini AI review on pending queue...");
    try {
      const res = await API.triggerBatchAI(activeTrack.id);
      toast(`AI review finished. Processed: ${res.evaluatedCount || 0}`);
      await loadData();
    } catch (err) {
      toast("AI review batch failed: " + err.message);
    }
  });

  // ── Export Cohort Gradebook to CSV ──
  const exportBtn = document.getElementById("exportGradebookBtn");
  exportBtn?.addEventListener("click", async () => {
    exportBtn.disabled = true;
    exportBtn.textContent = "Generating CSV...";

    try {
      const res = await API.exportTrackGradebook(activeTrack.id, activeFaculty.id);

      if (res && res.success && res.csvData) {
        const blob = new Blob([res.csvData], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = res.fileName || `${activeTrack.id}_Gradebook.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast("Gradebook exported successfully!");
      } else {
        toast("Export failed: " + (res?.error || "Unknown server response"));
      }
    } catch (err) {
      toast("Error exporting gradebook: " + err.message);
    } finally {
      exportBtn.disabled = false;
      exportBtn.innerHTML = `
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        Export CSV
      `;
    }
  });

  // 10. Faculty Feedback Modal Wiring
  const facultyFeedbackModal = document.getElementById("facultyFeedbackModal");
  const openFacultyFeedbackBtn = document.getElementById("openFacultyFeedbackBtn");
  const closeFacultyFeedbackBtn = document.getElementById("closeFacultyFeedbackModalBtn");
  const cancelFacultyFeedbackBtn = document.getElementById("cancelFacultyFeedbackModalBtn");
  const submitFacultyFeedbackBtn = document.getElementById("submitFacultyFeedbackBtn");
  const facultyFeedbackImgInput = document.getElementById("facultyFeedbackImgInput");
  const facultyFeedbackImgNameLabel = document.getElementById("facultyFeedbackImgFileName");

  let facultyImageBase64 = null;
  let facultyImageName = null;
  let facultyImageMime = null;

  facultyFeedbackImgInput?.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      facultyImageBase64 = await API.fileToBase64(file);
      facultyImageName = file.name;
      facultyImageMime = file.type;
      if (facultyFeedbackImgNameLabel) facultyFeedbackImgNameLabel.textContent = file.name;
    } catch (err) {
      toast("Could not read screenshot.");
    }
  });

  const hideFacultyModal = () => {
    if (facultyFeedbackModal) facultyFeedbackModal.hidden = true;
  };

  openFacultyFeedbackBtn?.addEventListener("click", () => {
    if (facultyFeedbackModal) facultyFeedbackModal.hidden = false;
  });

  closeFacultyFeedbackBtn?.addEventListener("click", hideFacultyModal);
  cancelFacultyFeedbackBtn?.addEventListener("click", hideFacultyModal);

  submitFacultyFeedbackBtn?.addEventListener("click", async () => {
    const title = document.getElementById("facultyProblemTitleInput")?.value.trim() || "";
    const type = document.getElementById("facultyProblemTypeInput")?.value.trim() || "";
    const description = document.getElementById("facultyProblemDescArea")?.value.trim() || "";

    if (!title || !description) {
      toast("⚠️ Problem title and description are required.");
      return;
    }

    submitFacultyFeedbackBtn.disabled = true;
    submitFacultyFeedbackBtn.textContent = "Submitting...";

    try {
      const res = await API.submitFeedback({
        role: "faculty",
        userId: session.name || session.email || "Faculty Mentor",
        trackId: activeTrack.id,
        challengeId: activeChallenge?.id || "N/A",
        problemTitle: title,
        problemType: type || "Faculty Report",
        description: description,
        imageBase64: facultyImageBase64,
        imageName: facultyImageName,
        imageMime: facultyImageMime
      });

      if (res && res.success) {
        toast("Your feedback has been sent to Admin and will be resolved accordingly.");
        alert("✅ Your feedback has been sent to Admin and will be resolved accordingly.\nTicket ID: " + (res.ticketId || "Logged"));
        hideFacultyModal();
        document.getElementById("facultyProblemTitleInput").value = "";
        document.getElementById("facultyProblemTypeInput").value = "";
        document.getElementById("facultyProblemDescArea").value = "";
        if (facultyFeedbackImgNameLabel) facultyFeedbackImgNameLabel.textContent = "No screenshot selected";
        facultyImageBase64 = null;
      } else {
        toast("Failed: " + (res?.error || "Server error"));
        alert("Failed to submit feedback: " + (res?.error || "Unknown server response"));
      }
    } catch (err) {
      toast("Error: " + err.message);
    } finally {
      submitFacultyFeedbackBtn.disabled = false;
      submitFacultyFeedbackBtn.textContent = "Submit Report";
    }
  });

  await loadData();
}

document.addEventListener("DOMContentLoaded", boot);
