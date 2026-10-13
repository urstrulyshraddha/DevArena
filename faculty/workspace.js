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

  // 5. Data Loading (Instant Hydration + SWR Fetch)
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
      console.warn("Falling back to split fetching:", err);
      const chRes = await API.getChallenges(activeTrack.id);
      const subRes = await API.getSubmissions(activeTrack.id);
      challenges = chRes?.challenges || [];
      submissions = subRes?.submissions || [];
      renderAll();
    }
  }

  // 6. Render UI
  function renderAll() {
    renderTaskList();
    renderSubmissionsTable();
  }

  function renderTaskList() {
    const list = document.getElementById("taskList");
    const countBadge = document.getElementById("challengeCountBadge");
    if (!list) return;

    list.innerHTML = "";
    countBadge.textContent = `${challenges.length} configured`;

    const allBtn = document.createElement("button");
    allBtn.className = "task-item" + (!activeChallenge ? " active" : "");
    allBtn.innerHTML = `<span><strong>All Challenges</strong><br><small class="text-muted">View All Submissions</small></span>`;
    allBtn.onclick = () => {
      activeChallenge = null;
      renderAll();
    };
    list.appendChild(allBtn);

    challenges.forEach((ch) => {
      const btn = document.createElement("button");
      btn.className = "task-item" + (activeChallenge?.id === ch.id ? " active" : "");
      btn.innerHTML = `
        <div>
          <div>${escapeHtml(ch.title)}</div>
          <div class="task-item-points font-mono">${ch.points || 10} pts</div>
        </div>
      `;
      btn.onclick = () => {
        activeChallenge = ch;
        renderAll();
      };
      list.appendChild(btn);
    });
  }

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

      tr.innerHTML = `
        <td><strong class="font-mono">${escapeHtml(sub.regNo)}</strong></td>
        <td><span class="status-pill ${sub.status === 'Evaluated' ? 'pill-done' : 'pill-review'}">${escapeHtml(sub.status)}</span></td>
        <td class="font-mono text-xs text-muted">${escapeHtml(sub.submittedAt ? sub.submittedAt.slice(0, 10) : '—')}</td>
        <td style="text-align:center;">
          ${sub.codeUrl ? `<a href="${sub.codeUrl}" target="_blank" class="btn btn-outline btn-xs">View Artifact</a>` : '<span class="text-muted text-xs">—</span>'}
        </td>
        <td style="text-align:right;" class="font-mono">${earned}</td>
        <td style="text-align:right;" class="font-mono text-muted">${converted} / 5.00</td>
        <td style="text-align:center;">
          <button class="btn btn-primary btn-xs inspect-btn">Inspect &amp; Grade</button>
        </td>
      `;

      tr.querySelector(".inspect-btn")?.addEventListener("click", () => {
        openInspectModal(sub);
      });

      tbody.appendChild(tr);
    });
  }

  // 7. Inspect Modal
  let currentInspectingSub = null;
  function openInspectModal(sub) {
    currentInspectingSub = sub;
    const modal = document.getElementById("inspectModal");
    document.getElementById("inspectTitle").textContent = `Evaluate ${sub.regNo}`;
    document.getElementById("inspectCodePreview").textContent = sub.codeUrl ? `Drive Link: ${sub.codeUrl}` : "No code attached.";
    document.getElementById("overridePointsInput").value = typeof sub.pointsEarned === "number" ? sub.pointsEarned : 10;
    modal.removeAttribute("hidden");
  }

  document.getElementById("saveOverrideGradeBtn")?.addEventListener("click", async () => {
    if (!currentInspectingSub) return;
    const pts = parseFloat(document.getElementById("overridePointsInput").value);
    try {
      await API.facultyGradeOverride(activeTrack.id, currentInspectingSub.regNo, currentInspectingSub.challengeId, pts);
      toast("Grade saved successfully.");
      document.getElementById("inspectModal").setAttribute("hidden", "");
      await loadData();
    } catch (err) {
      toast("Error saving grade: " + err.message);
    }
  });

  document.querySelectorAll(".close-modal").forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll(".modal-overlay").forEach((m) => m.setAttribute("hidden", ""));
    };
  });

  // Modal Triggers
  document.getElementById("openTaskModalBtn")?.addEventListener("click", () => {
    document.getElementById("taskModal").removeAttribute("hidden");
  });

  document.getElementById("saveTaskBtn")?.addEventListener("click", async () => {
    const title = document.getElementById("newTaskTitle").value.trim();
    const statement = document.getElementById("newTaskStatement").value.trim();
    const points = parseFloat(document.getElementById("newTaskPoints").value) || 10;
    const deadline = document.getElementById("newTaskDeadline").value;

    if (!title) {
      toast("Please provide a title.");
      return;
    }

    try {
      await API.createTask({
        trackId: activeTrack.id,
        title,
        statement,
        points,
        deadline,
        sampleTests: []
      });
      toast("Task created successfully!");
      document.getElementById("taskModal").setAttribute("hidden", "");
      await loadData();
    } catch (err) {
      toast("Failed to create task: " + err.message);
    }
  });

  document.getElementById("openTrackModalBtn")?.addEventListener("click", () => {
    document.getElementById("trackModal").removeAttribute("hidden");
  });

  document.getElementById("saveTrackBtn")?.addEventListener("click", async () => {
    const id = document.getElementById("newTrackId").value.trim();
    const name = document.getElementById("newTrackName").value.trim();
    const year = document.getElementById("newTrackYear").value.trim();
    const section = document.getElementById("newTrackSection").value.trim();

    if (!id || !name) {
      toast("Track ID and Name are required.");
      return;
    }

    try {
      await API.createTrack({
        track: { id, name, year, section, facultyId: activeFaculty.id }
      });
      toast("Track created! Reloading...");
      setTimeout(() => window.location.reload(), 1000);
    } catch (err) {
      toast("Failed to create track: " + err.message);
    }
  });

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

  await loadData();
}

document.addEventListener("DOMContentLoaded", boot);
