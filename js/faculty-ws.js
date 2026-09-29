/* ==========================================================================
   SRM DevArena — Faculty Oversight Console (js/faculty-workspace.js)
   ========================================================================== */

import { API } from "./api.js";

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

function cleanUrl(urlStr) {
  if (!urlStr) return "";
  const match = String(urlStr).match(/https?:\/\/[^\s\)\"\']+/);
  return match ? match[0] : "";
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

export async function initFacultyWorkspace(session, portalData) {
  const faculties = (portalData && Array.isArray(portalData.faculties)) ? portalData.faculties : [];

  // Resolve faculty object
  const facultyObj = faculties.find(f => f.id === session.facultyId)
    || faculties.find(f => f.email === session.email)
    || faculties.find(f => f.role === "faculty")
    || { name: session.name || "Dr. Yasir Afaq", title: "Faculty", email: session.email, tracks: [] };

  // Set Greeting Banner
  const greetingEl = document.getElementById("facultyGreeting");
  const nameEl = document.getElementById("facultyBannerName");
  const titleEl = document.getElementById("facultyBannerTitle");

  if (greetingEl) greetingEl.textContent = `SRM Faculty Oversight Console · ${facultyObj.name}`;
  if (nameEl) nameEl.textContent = facultyObj.name;
  if (titleEl) titleEl.textContent = `${facultyObj.title || 'Faculty'} — ${facultyObj.email}`;

  const trackSelect = document.getElementById("facultyTrackSelect");
  const daySelect = document.getElementById("facultyDaySelect");

  // Default track to first assigned track
  let activeTrack = (facultyObj.tracks && facultyObj.tracks.length > 0)
    ? facultyObj.tracks[0]
    : { id: "c2t-y1-aimlf", name: "Code2Think", year: "1st year", section: "AIML - F" };

  let challenges = [];
  let submissions = [];
  let activeChallenge = null;
  let activeDayFilter = "ALL";
  let inspectedRecord = null;

  /* ── 1. Populate Section Dropdown ── */
  function populateTrackDropdown() {
    if (!trackSelect) return;
    trackSelect.innerHTML = "";
    (facultyObj.tracks || [activeTrack]).forEach(t => {
      const opt = document.createElement("option");
      opt.value = t.id;
      opt.textContent = `${t.name} · ${t.section || t.year}`;
      if (t.id === activeTrack.id) opt.selected = true;
      trackSelect.appendChild(opt);
    });
  }

  /* ── 2. Populate Day/Challenge Dropdown ── */
  function populateDayDropdown() {
    if (!daySelect) return;
    daySelect.innerHTML = "";

    const allOpt = document.createElement("option");
    allOpt.value = "ALL";
    allOpt.textContent = "All Days";
    daySelect.appendChild(allOpt);

    challenges.forEach((ch, idx) => {
      const opt = document.createElement("option");
      opt.value = ch.id;
      opt.textContent = `Day ${idx + 1} — ${ch.title}`;
      if (activeDayFilter === ch.id) opt.selected = true;
      daySelect.appendChild(opt);
    });

    daySelect.value = activeDayFilter;
  }

  /* ── 3. Fetch Fresh Data From Sheets ── */
  async function loadData() {
    try {
      const [chRes, subRes] = await Promise.all([
        API.getChallenges(activeTrack.id),
        API.getSubmissions(activeTrack.id)
      ]);

      challenges = (chRes && Array.isArray(chRes.challenges)) ? chRes.challenges : [];
      submissions = (subRes && Array.isArray(subRes.submissions)) ? subRes.submissions : [];

      if (!activeChallenge && challenges.length > 0) {
        activeChallenge = challenges[0];
      }
    } catch (err) {
      console.error("Failed to load faculty track data:", err);
      toast("Error loading live data from Google Sheets.");
    }
  }

  /* ── 4. Render Left-Side Challenge List ── */
  function renderChallenges() {
    const list = document.getElementById("facultyChallengeList");
    const countEl = document.getElementById("facultyChallengeCount");
    if (!list) return;
    list.innerHTML = "";

    if (countEl) countEl.textContent = `${challenges.length} challenges configured`;

    if (challenges.length === 0) {
      list.innerHTML = `<p class="text-xs text-muted" style="padding:12px;">No challenges configured for this track.</p>`;
      return;
    }

    challenges.forEach((ch, idx) => {
      const isSelected = ch.id === activeChallenge?.id;
      const btn = document.createElement("button");
      btn.className = "challenge-item" + (isSelected ? " active" : "");
      btn.innerHTML = `
        <span>
          <span class="challenge-item-title">Day ${idx + 1}: ${escapeHtml(ch.title)}</span>
          <div class="task-date-tag">Max Pts: ${ch.points || ch.maxRawPoints || 10}</div>
        </span>
        <div class="task-schedule-meta">
          <span class="text-xs text-muted">${ch.deadline ? ch.deadline.slice(0, 10) : "No limit"}</span>
        </div>
      `;
      btn.addEventListener("click", () => {
        activeChallenge = ch;
        activeDayFilter = ch.id;
        renderAll();
      });
      list.appendChild(btn);
    });
  }

  /* ── 5. Render Live Submissions Table ── */
  function renderSubmissionsTable() {
    const tbody = document.getElementById("facultySubmissionsBody");
    const title = document.getElementById("facultySelectedChallengeTitle");
    const sub = document.getElementById("facultySelectedChallengeSub");
    const deadlineInput = document.getElementById("taskDeadlineInput");
    if (!tbody) return;

    if (title) {
      title.textContent = activeDayFilter === "ALL"
        ? `All Days — ${activeTrack.name}${activeTrack.section ? ` · ${activeTrack.section}` : ""}`
        : (activeChallenge?.title || "—");
    }
    if (sub) sub.textContent = `${activeTrack.name} (${activeTrack.year || ''})`;
    if (deadlineInput && activeChallenge) deadlineInput.value = activeChallenge.deadline || "";

    tbody.innerHTML = "";

    const visibleRows = activeDayFilter === "ALL"
      ? submissions
      : submissions.filter(s => String(s.challengeId) === String(activeDayFilter));

    if (visibleRows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:28px; color:var(--text-muted);">
           No submissions recorded yet for this selection.</td></tr>`;
      return;
    }

    visibleRows.forEach(subItem => {
      const matchedChallenge = challenges.find(c => String(c.id) === String(subItem.challengeId));
      const chTitle = matchedChallenge ? matchedChallenge.title : `Challenge ${subItem.challengeId}`;
      const status = subItem.status || "Submitted";
      const earnedMarks = (subItem.pointsEarned !== null && subItem.pointsEarned !== undefined)
        ? `${subItem.pointsEarned} pts`
        : "—";

      const rawCodeUrl = cleanUrl(subItem.codeUrl);
      const rawPdfUrl = cleanUrl(subItem.pdfUrl);
      const submittedAt = subItem.submittedAt ? subItem.submittedAt.slice(0, 16).replace("T", " ") : "—";

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>
          <div class="student-name font-mono">${escapeHtml(subItem.regNo)}</div>
          <div class="text-faint text-xs">${escapeHtml(chTitle)}</div>
        </td>
        <td><span class="status-pill ${statusPillClass(status)}">${escapeHtml(status)}</span></td>
        <td class="font-mono text-xs">${escapeHtml(submittedAt)}</td>
        <td>
          ${rawPdfUrl
            ? `<a class="file-chip" href="${rawPdfUrl}" target="_blank" rel="noopener noreferrer">📄 View PDF</a>`
            : '<span class="text-faint text-xs">No PDF</span>'}
        </td>
        <td>
          ${rawCodeUrl
            ? `<a class="btn btn-outline btn-sm" href="${rawCodeUrl}" target="_blank" rel="noopener noreferrer">View File</a>`
            : '<span class="text-faint text-xs">No file</span>'}
        </td>
        <td style="text-align:right;" class="font-mono font-bold">${earnedMarks}</td>
        <td style="text-align:right;">
          <button class="btn btn-outline btn-sm inspect-btn">Inspect &amp; Grade</button>
        </td>
      `;

      const inspectBtn = tr.querySelector(".inspect-btn");
      if (inspectBtn) {
        inspectBtn.addEventListener("click", () => {
          openDrawer(subItem, matchedChallenge);
        });
      }
      tbody.appendChild(tr);
    });
  }

  /* ── 6. Drawer Controller ── */
  function openDrawer(subItem, matchedChallenge) {
    inspectedRecord = { subItem, matchedChallenge };
    const drawer = document.getElementById("facultyReviewDrawer");
    if (!drawer) return;
    drawer.removeAttribute("hidden");

    const nameTitle = document.getElementById("inspectStudentName");
    if (nameTitle) {
      nameTitle.textContent = `Reviewing: ${subItem.regNo} — ${matchedChallenge?.title || subItem.challengeId}`;
    }

    const aiNote = document.getElementById("inspectAiNotes");
    if (aiNote) {
      if (subItem.aiRemarks) {
        aiNote.textContent = typeof subItem.aiRemarks === "string"
          ? subItem.aiRemarks
          : `AI Score: ${subItem.aiRemarks.score ?? "—"}/10\nFeedback: ${subItem.aiRemarks.feedback || ""}`;
        aiNote.style.display = "block";
      } else {
        aiNote.style.display = "none";
      }
    }

    const viewFileBtn = document.getElementById("inspectViewFileBtn");
    const rawCodeUrl = cleanUrl(subItem.codeUrl);
    if (viewFileBtn) {
      if (rawCodeUrl) {
        viewFileBtn.href = rawCodeUrl;
        viewFileBtn.target = "_blank";
        viewFileBtn.rel = "noopener noreferrer";
        viewFileBtn.textContent = "Open Drive File (Code + AI Report)";
        viewFileBtn.style.display = "inline-flex";
      } else {
        viewFileBtn.style.display = "none";
      }
    }

    const inspectCode = document.getElementById("inspectCode");
    if (inspectCode) {
      inspectCode.value = "// Click 'Open Drive File' above to view full source code directly in Google Drive.";
    }

    const chip = document.getElementById("inspectPdfChip");
    const rawPdfUrl = cleanUrl(subItem.pdfUrl);
    if (chip) {
      if (rawPdfUrl) {
        chip.innerHTML = `<a href="${rawPdfUrl}" target="_blank" rel="noopener noreferrer">📄 Open Submitted PDF</a>`;
        chip.style.display = "inline-flex";
      } else {
        chip.textContent = "No PDF file attached.";
      }
    }

    const gradeInput = document.getElementById("facultyGradeInput");
    if (gradeInput) {
      const maxPts = matchedChallenge?.points || 10;
      gradeInput.value = (subItem.pointsEarned !== null && subItem.pointsEarned !== undefined)
        ? subItem.pointsEarned
        : maxPts;
    }

    drawer.scrollIntoView({ behavior: "smooth" });
  }

  function renderAll() {
    populateDayDropdown();
    renderChallenges();
    renderSubmissionsTable();
  }

  /* ── 7. Event Listeners ── */
  if (trackSelect) {
    trackSelect.onchange = async (e) => {
      activeTrack = (facultyObj.tracks || []).find(t => t.id === e.target.value) || activeTrack;
      activeChallenge = null;
      activeDayFilter = "ALL";
      await loadData();
      renderAll();
    };
  }

  if (daySelect) {
    daySelect.onchange = (e) => {
      activeDayFilter = e.target.value;
      if (activeDayFilter !== "ALL") {
        activeChallenge = challenges.find(c => c.id === activeDayFilter) || activeChallenge;
      }
      renderAll();
    };
  }

  const closeDrawerBtn = document.getElementById("closeDrawerBtn");
  if (closeDrawerBtn) {
    closeDrawerBtn.onclick = () => {
      const drawer = document.getElementById("facultyReviewDrawer");
      if (drawer) drawer.setAttribute("hidden", "");
    };
  }

  const facultySaveGradeBtn = document.getElementById("facultySaveGradeBtn");
  if (facultySaveGradeBtn) {
    facultySaveGradeBtn.onclick = async () => {
      if (!inspectedRecord) return;
      const pts = parseFloat(document.getElementById("facultyGradeInput")?.value);
      if (isNaN(pts) || pts < 0) {
        toast("Please enter a valid point value.");
        return;
      }

      facultySaveGradeBtn.disabled = true;
      facultySaveGradeBtn.textContent = "Saving...";

      try {
        await API.facultyGradeOverride(
          activeTrack.id,
          inspectedRecord.subItem.regNo,
          inspectedRecord.subItem.challengeId,
          pts
        );

        toast(`Score saved to Google Sheets for ${inspectedRecord.subItem.regNo}!`);
        await loadData();
        renderAll();
        document.getElementById("facultyReviewDrawer")?.setAttribute("hidden", "");
      } catch (err) {
        toast("Error saving override: " + err.message);
      } finally {
        facultySaveGradeBtn.disabled = false;
        facultySaveGradeBtn.textContent = "Approve & Record Marks";
      }
    };
  }

  const triggerAiReviewBtn = document.getElementById("triggerAiReviewBtn");
  if (triggerAiReviewBtn) {
    triggerAiReviewBtn.onclick = async () => {
      triggerAiReviewBtn.disabled = true;
      triggerAiReviewBtn.textContent = "Gemini Evaluating...";
      toast(`AI review triggered for "${activeTrack.name}"!`);
      try {
        const res = await API.triggerBatchAI(activeTrack.id);
        toast(`AI Review completed for ${res?.evaluatedCount || 0} submissions!`);
      } catch (err) {
        toast("AI Review error: " + err.message);
      } finally {
        triggerAiReviewBtn.disabled = false;
        triggerAiReviewBtn.textContent = "⚡ Trigger Automated AI Review";
        await loadData();
        renderAll();
      }
    };
  }

  /* ── 8. Boot Console ── */
  populateTrackDropdown();
  await loadData();
  renderAll();
}
