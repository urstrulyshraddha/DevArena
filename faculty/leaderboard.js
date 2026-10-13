/* ==========================================================================
   SRM DevArena — Faculty Leaderboard Controller (faculty/leaderboard.js)
   ========================================================================== */

import { API } from "../js/api.js";
import { initTheme } from "../js/theme.js";

function escapeHtml(str) {
  return String(str || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function toast(message) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = message;
  el.classList.add("visible");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove("visible"), 2600);
}

let activeSession = null;
let portalData = null;
let assignedTracks = [];
let selectedTrackId = "all";
let searchQuery = "";
let currentStandings = [];

async function boot() {
  initTheme();

  // 1. Session Gate
  activeSession = JSON.parse(localStorage.getItem("devarena.session") || "null");
  if (!activeSession || (activeSession.role !== "faculty" && activeSession.role !== "admin")) {
    window.location.href = "../index.html";
    return;
  }

  // 2. Profile Setup
  const avatarEl = document.getElementById("profileAvatar");
  const nameEl = document.getElementById("profileName");
  const trackEl = document.getElementById("profileTrack");
  const menuBtn = document.getElementById("profileMenuBtn");
  const dropdown = document.getElementById("profileDropdown");
  const logoutBtn = document.getElementById("logoutBtn");

  if (avatarEl) avatarEl.textContent = (activeSession.name || "F").charAt(0).toUpperCase();
  if (nameEl) nameEl.textContent = activeSession.name || "Faculty Member";
  if (trackEl) trackEl.textContent = activeSession.email || "Faculty";

  if (menuBtn && dropdown) {
    menuBtn.onclick = (e) => {
      e.stopPropagation();
      dropdown.classList.toggle("open");
    };
    document.addEventListener("click", () => dropdown.classList.remove("open"));
  }

  if (logoutBtn) {
    logoutBtn.onclick = () => {
      localStorage.removeItem("devarena.session");
      window.location.href = "../index.html";
    };
  }

  document.getElementById("switchTrackBtn")?.addEventListener("click", () => {
    localStorage.removeItem("devarena.session");
    window.location.href = "../index.html";
  });

  // 3. Load Portal Config to resolve faculty tracks
  try {
    portalData = await API.getPortalConfig();
  } catch (err) {
    console.error("Portal config error:", err);
    toast("Backend error: Could not load tracks catalog.");
  }

  const faculties = portalData?.faculties || [];
  const facultyObj = faculties.find((f) => f.id === activeSession.facultyId)
    || faculties.find((f) => f.email === activeSession.email)
    || faculties.find((f) => f.role === "faculty");

  assignedTracks = facultyObj?.tracks || [];

  // Fallback: If no specific tracks assigned, pull all available
  if (assignedTracks.length === 0) {
    faculties.forEach((f) => {
      (f.tracks || []).forEach((t) => {
        if (!assignedTracks.some((ex) => ex.id === t.id)) assignedTracks.push(t);
      });
    });
  }

  if (assignedTracks.length === 0) {
    assignedTracks = [{ id: "c2t-y1-aimlf", name: "Code2Think", section: "AIML-F", year: "1st Year" }];
  }

  selectedTrackId = assignedTracks[0].id;

  // 4. Setup Toolbar Select & Search
  populateTrackSelect();

  document.getElementById("leaderboardSearchInput")?.addEventListener("input", (e) => {
    searchQuery = e.target.value.trim().toLowerCase();
    renderTable();
  });

  await fetchAndRender();
}

function populateTrackSelect() {
  const select = document.getElementById("leaderboardTrackSelect");
  if (!select) return;
  select.innerHTML = "";

  const allOpt = document.createElement("option");
  allOpt.value = "all";
  allOpt.textContent = "All Assigned Tracks";
  select.appendChild(allOpt);

  assignedTracks.forEach((t) => {
    const opt = document.createElement("option");
    opt.value = t.id;
    opt.textContent = `${t.name} · ${t.section || t.year}`;
    if (t.id === selectedTrackId) opt.selected = true;
    select.appendChild(opt);
  });

  select.onchange = async (e) => {
    selectedTrackId = e.target.value;
    await fetchAndRender();
  };
}

async function fetchAndRender() {
  const tableFilterLabel = document.getElementById("tableFilterLabel");
  if (tableFilterLabel) {
    const match = assignedTracks.find((t) => t.id === selectedTrackId);
    tableFilterLabel.textContent = match ? `${match.name} · ${match.section || match.year}` : "All Assigned Cohorts";
  }

  try {
    const res = await API.getLeaderboard(selectedTrackId, activeSession?.email);
    currentStandings = (res && Array.isArray(res.standings)) ? res.standings : [];
  } catch (err) {
    console.error("Leaderboard fetch failed:", err);
    currentStandings = [];
  }

  renderMetrics();
  renderTable();
}

function renderMetrics() {
  const strip = document.getElementById("summaryStrip");
  if (!strip) return;

  const cohortSize = currentStandings.length;
  const topPoints = currentStandings[0]?.marks ?? 0;
  const avgPoints = cohortSize
    ? (currentStandings.reduce((sum, s) => sum + (s.marks || 0), 0) / cohortSize).toFixed(1)
    : 0;

  strip.innerHTML = `
    <div class="stat-card card" style="padding:16px 20px;">
      <span class="label text-xs text-muted font-mono" style="text-transform:uppercase;">Enrolled Students</span>
      <div class="value font-mono" style="font-size:1.6rem; font-weight:700; margin-top:4px;">${cohortSize}</div>
      <span class="sub text-xs text-faint">active in cohort</span>
    </div>
    <div class="stat-card card" style="padding:16px 20px;">
      <span class="label text-xs text-muted font-mono" style="text-transform:uppercase;">Highest Score</span>
      <div class="value font-mono" style="font-size:1.6rem; font-weight:700; color:var(--success); margin-top:4px;">
        ${topPoints} <small style="font-size:0.75rem; color:var(--text-muted);">pts</small>
      </div>
      <span class="sub text-xs text-faint">top raw points</span>
    </div>
    <div class="stat-card card" style="padding:16px 20px;">
      <span class="label text-xs text-muted font-mono" style="text-transform:uppercase;">Cohort Average</span>
      <div class="value font-mono" style="font-size:1.6rem; font-weight:700; margin-top:4px;">
        ${avgPoints} <small style="font-size:0.75rem; color:var(--text-muted);">pts</small>
      </div>
      <span class="sub text-xs text-faint">mean cohort score</span>
    </div>
    <div class="stat-card card" style="padding:16px 20px;">
      <span class="label text-xs text-muted font-mono" style="text-transform:uppercase;">Moderation View</span>
      <div class="value font-mono" style="font-size:1.4rem; font-weight:700; color:var(--accent-navy); margin-top:4px;">Faculty</div>
      <span class="sub text-xs text-faint">${escapeHtml(activeSession.name || "Mentor")}</span>
    </div>
  `;
}

function renderTable() {
  const tbody = document.getElementById("facultyRankTableBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const filtered = currentStandings.filter((s) => {
    if (!searchQuery) return true;
    return (s.regNo && s.regNo.toLowerCase().includes(searchQuery))
        || (s.name && s.name.toLowerCase().includes(searchQuery));
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:36px; color:var(--text-muted);">
      No student records found matching this criteria.</td></tr>`;
    return;
  }

  filtered.forEach((st, idx) => {
      const rank = idx + 1;
      const rawPoints = typeof st.marks === "number" ? st.marks : 0;
      const convertedMarks = (Math.min(5, rawPoints / 2)).toFixed(2);

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="col-rank font-mono font-bold">#${rank}</td>
        <td class="col-student">
          <div class="student-regno">${escapeHtml(st.regNo)}</div>
          <div class="student-subname">${escapeHtml(st.name || st.regNo)}</div>
        </td>
        <td class="col-track">
          <span class="track-badge">
            ${escapeHtml(selectedTrackId === "all" ? (st.trackId || "c2t-y1-aimlf") : selectedTrackId)}
          </span>
        </td>
        <td class="col-points">
          <span class="raw-points-val">${rawPoints} pts</span>
        </td>
        <td class="col-marks">
          <span class="converted-marks-val">${convertedMarks} / 5.00</span>
        </td>
      `;
      tbody.appendChild(tr);
    });
}

function rankBadgeClass(rank) {
  if (rank === 1) return "top1";
  if (rank === 2) return "top2";
  if (rank === 3) return "top3";
  return "";
}

document.addEventListener("DOMContentLoaded", boot);
