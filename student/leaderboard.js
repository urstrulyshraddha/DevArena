/* ==========================================================================
   SRM DevArena — Student Leaderboard Controller (student/leaderboard.js)
   Personal Trajectory & Cohort Standings
   ========================================================================== */

import { API } from "../js/api.js";
import { initTheme } from "../js/theme.js";

function escapeHtml(str) {
  return String(str || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

let session = null;
let assignedTrack = null;
let currentStandings = [];
let mySubmissions = [];
let challenges = [];

async function boot() {
  initTheme();

  // 1. Session Gate
  session = JSON.parse(localStorage.getItem("devarena.session") || "null");
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

  // 3. Resolve Track
  let portalData = null;
  try {
    portalData = await API.getPortalConfig();
  } catch (err) {
    console.warn("Could not load portal catalog:", err);
  }

  const faculties = portalData?.faculties || [];
  const mentor = faculties.find((f) => f.id === session.mentorId || f.email === session.mentorId);
  assignedTrack = (mentor && mentor.tracks && mentor.tracks.length > 0)
    ? mentor.tracks[0]
    : { id: "c2t-y1-aimlf", name: "Code2Think", section: "AIML-F", year: "1st Year" };

  document.getElementById("studentStandingSubtitle").textContent =
    `Track: ${assignedTrack.name} · ${assignedTrack.section || assignedTrack.year}`;
  document.getElementById("tableFilterLabel").textContent =
    `${assignedTrack.name} · ${assignedTrack.section || assignedTrack.year}`;

  // 4. Fetch Live Standings & Personal Trajectory
  await fetchAndRender();
}

async function fetchAndRender() {
  try {
    const [lbRes, chRes, subRes] = await Promise.all([
      API.getLeaderboard(assignedTrack.id),
      API.getChallenges(assignedTrack.id),
      API.getSubmissions(assignedTrack.id)
    ]);

    currentStandings = (lbRes && Array.isArray(lbRes.standings)) ? lbRes.standings : [];
    challenges = (chRes && Array.isArray(chRes.challenges)) ? chRes.challenges : [];

    const allSubs = (subRes && Array.isArray(subRes.submissions)) ? subRes.submissions : [];
    mySubmissions = allSubs.filter((s) => String(s.regNo).toUpperCase() === String(session.regNo).toUpperCase());

  } catch (err) {
    console.error("Leaderboard fetch error:", err);
    currentStandings = [];
    challenges = [];
    mySubmissions = [];
  }

  renderPersonalStats();
  renderPersonalTrajectoryGraph();
  renderTable();
}

function renderPersonalStats() {
  const myIndex = currentStandings.findIndex(
    (s) => String(s.regNo).toUpperCase() === String(session.regNo).toUpperCase()
  );

  const myRecord = myIndex !== -1 ? currentStandings[myIndex] : null;
  const myRank = myIndex !== -1 ? `#${myIndex + 1}` : "—";
  const myPoints = myRecord ? (myRecord.marks || 0) : 0;
  const myMarks = (Math.min(5, myPoints / 2)).toFixed(2);

  document.getElementById("myRankVal").textContent = myRank;
  document.getElementById("myRawPointsVal").textContent = `${myPoints} pts`;
  document.getElementById("myMarksVal").textContent = `${myMarks} / 5.00`;
}

/**
 * Graphs only the logged-in student's score across all configured tasks/days
 */
function renderPersonalTrajectoryGraph() {
  const countLabel = document.getElementById("cohortSizeLabel");
  const fillPath = document.getElementById("curveFill");
  const strokePath = document.getElementById("curveStroke");
  const pointsGroup = document.getElementById("curvePoints");

  if (!fillPath || !strokePath || !pointsGroup) return;

  const totalTasks = challenges.length || 1;
  const evaluatedCount = mySubmissions.filter(s => s.status === "Evaluated").length;

  if (countLabel) {
    countLabel.textContent = `Completed: ${evaluatedCount}/${totalTasks} Tasks`;
  }

  // Build points array for each configured challenge
  const taskScores = challenges.map((ch, idx) => {
    const sub = mySubmissions.find(s => String(s.challengeId) === String(ch.id));
    const score = (sub && typeof sub.pointsEarned === "number") ? sub.pointsEarned : 0;
    return {
      day: `Day ${idx + 1}`,
      title: ch.title,
      score: score,
      max: ch.points || 10,
      isEvaluated: sub && sub.status === "Evaluated"
    };
  });

  if (taskScores.length === 0) {
    fillPath.setAttribute("d", "M0,90 L500,90 Z");
    strokePath.setAttribute("d", "M0,90 L500,90");
    pointsGroup.innerHTML = "";
    return;
  }

  const width = 500;
  const height = 90;
  const paddingX = 35;
  const paddingY = 16;
  const maxScale = 10;

  const points = taskScores.map((t, idx) => {
    const x = taskScores.length === 1
      ? width / 2
      : paddingX + (idx / (taskScores.length - 1)) * (width - 2 * paddingX);
    const y = height - paddingY - (t.score / maxScale) * (height - 2 * paddingY);
    return { ...t, x, y };
  });

  // Construct SVG Curve
  let pathD = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const cp1x = prev.x + (curr.x - prev.x) / 2;
    const cp2x = cp1x;
    pathD += ` C ${cp1x} ${prev.y}, ${cp2x} ${curr.y}, ${curr.x} ${curr.y}`;
  }

  strokePath.setAttribute("d", pathD);
  fillPath.setAttribute("d", `${pathD} L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height} Z`);

  // Render clickable/hoverable dots
  pointsGroup.innerHTML = "";
  points.forEach((pt) => {
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", pt.x);
    circle.setAttribute("cy", pt.y);
    circle.setAttribute("r", pt.isEvaluated ? "5" : "3.5");
    circle.setAttribute("class", "curve-dot");

    if (pt.isEvaluated) {
      circle.setAttribute("style", "fill: #34d399; stroke: #fff; stroke-width: 2;");
    } else {
      circle.setAttribute("style", "fill: #64748b; stroke: var(--surface); stroke-width: 1.5;");
    }

    const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
    title.textContent = `${pt.day} (${pt.title}): ${pt.score}/${pt.max} pts`;
    circle.appendChild(title);

    pointsGroup.appendChild(circle);
  });
}

function renderTable() {
  const tbody = document.getElementById("studentRankTableBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (currentStandings.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:32px; color:var(--text-muted);">
      No student records available yet.</td></tr>`;
    return;
  }

  currentStandings.forEach((st, idx) => {
    const rank = idx + 1;
    const rawPoints = typeof st.marks === "number" ? st.marks : 0;
    const convertedMarks = (Math.min(5, rawPoints / 2)).toFixed(2);
    const isMe = String(st.regNo).toUpperCase() === String(session.regNo).toUpperCase();

    const medalHtml = rank === 1 ? `<span class="medal-badge medal-gold">🥇</span>` :
                      rank === 2 ? `<span class="medal-badge medal-silver">🥈</span>` :
                      rank === 3 ? `<span class="medal-badge medal-bronze">🥉</span>` :
                      `#${rank}`;

    const tr = document.createElement("tr");
    if (isMe) tr.className = "is-current-user";

    tr.innerHTML = `
      <td class="font-mono font-bold">${medalHtml}</td>
      <td>
        <div class="student-regno">${escapeHtml(st.regNo)} ${isMe ? '<small style="color:#38bdf8; font-size:0.75rem;">(You)</small>' : ''}</div>
        <div class="student-subname">${escapeHtml(st.name || st.regNo)}</div>
      </td>
      <td>
        <span class="track-badge">${escapeHtml(assignedTrack.name)}</span>
      </td>
      <td>
        <span class="raw-points-val">${rawPoints} pts</span>
      </td>
      <td>
        <span class="converted-marks-val">${convertedMarks} / 5.00</span>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

document.addEventListener("DOMContentLoaded", boot);
