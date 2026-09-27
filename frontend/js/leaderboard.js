// leaderboard.js — Points-to-marks conversion, locked track cohort ranking,
// live Google Sheets cloud sync, and custom dark-glowing SVG performance curve for SRM DevArena.

import { API } from "./api.js";

/* --------------------------------- 1. CONVERSION FORMULA --------------------------------- */
export function computeConvertedMarks(totalPoints, maxPoints, scale = 0.25) {
  const convertedMarks = Math.round(totalPoints * scale * 10) / 10;
  const maxMarks = Math.round(maxPoints * scale * 10) / 10;
  return { convertedMarks, maxMarks, totalPoints, maxPoints };
}

/* --------------------------------- 2. TRACK HELPERS --------------------------------- */
function allTracks(portalData) {
  const tracks = [];
  (portalData.faculties || []).forEach((f) => {
    (f.tracks || []).forEach((t) => {
      tracks.push({ ...t, facultyName: f.name, facultyId: f.id });
    });
  });
  return tracks;
}

function trackMaxPoints(track) {
  return (track.challenges || []).reduce((sum, c) => sum + (c.points || 0), 0);
}

function studentTotalPoints(student) {
  return Object.values(student.submissions || {}).reduce((sum, sub) => {
    if (sub && sub.status === "Evaluated" && typeof sub.pointsEarned === "number") {
      return sum + sub.pointsEarned;
    }
    return sum;
  }, 0);
}

function studentCompletedCount(student) {
  return Object.values(student.submissions || {}).filter(
    (sub) => sub && sub.status === "Evaluated"
  ).length;
}

/* --------------------------------- 3. LEADERBOARD BUILDER --------------------------------- */
export function buildLeaderboard(portalData, evalData, trackFilterId) {
  const tracks = allTracks(portalData);
  const trackById = Object.fromEntries(tracks.map((t) => [t.id, t]));
  const scale = portalData.conversionScale || 0.25;

  return (evalData.students || [])
    .filter((s) => !trackFilterId || trackFilterId === "all" || s.trackId === trackFilterId)
    .map((s) => {
      const track = trackById[s.trackId];
      const maxPoints = track ? trackMaxPoints(track) : 0;
      const totalPoints = studentTotalPoints(s);
      const completedCount = studentCompletedCount(s);
      const { convertedMarks, maxMarks } = computeConvertedMarks(totalPoints, maxPoints, scale);

      return {
        regNo: s.regNo,
        name: s.name,
        email: s.email,
        trackId: s.trackId,
        trackName: track ? track.name : s.trackId,
        completedCount,
        totalPoints,
        maxPoints,
        convertedMarks,
        maxMarks,
        progress: s.progress || []
      };
    })
    .sort((a, b) => b.convertedMarks - a.convertedMarks || b.totalPoints - a.totalPoints);
}

/* --------------------------------- 4. PROGRESS SERIES --------------------------------- */
function normalizeSeries(progress, dayCount, scale) {
  const series = [];
  let lastScore = 0;

  for (let day = 1; day <= dayCount; day++) {
    const entry = (progress || []).find((p) => p.day === day);
    if (entry && typeof entry.score === "number") {
      lastScore = entry.score;
    }
    series.push(Math.round(lastScore * scale * 10) / 10);
  }
  return series;
}

/* --------------------------------- 5. SMOOTH BEZIER CURVE GENERATOR --------------------------------- */
function getBezierPath(points) {
  if (!points || points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;

  let path = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(i - 1, 0)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(i + 2, points.length - 1)];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    path += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return path;
}

/**
 * Renders the dark emerald glowing area curve
 */
export function renderDarkGlowingGraph(container, tooltipEl, series) {
  if (!container) return;

  const width = 560;
  const height = 250;
  const padding = { top: 24, right: 28, bottom: 34, left: 24 };

  const dataValues = Array.isArray(series) && series.length > 0 ? series : [0, 0, 0, 0];
  const count = Math.max(dataValues.length, 4);
  const maxVal = Math.max(1, ...dataValues) * 1.25;

  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  const xFor = (i) => padding.left + (i / (count - 1)) * plotW;
  const yFor = (v) => padding.top + plotH - (v / maxVal) * plotH;

  const pointCoords = dataValues.map((val, idx) => ({
    x: xFor(idx),
    y: yFor(val),
    val,
    day: idx + 1
  }));

  // Vertical Dotted Grid Lines & Month/Day labels
  const gridLines = [];
  const xLabels = [];
  const step = Math.max(1, Math.floor(count / 6));

  for (let i = 0; i < count; i += step) {
    const x = xFor(i);
    gridLines.push(`<line class="dark-grid-line" x1="${x.toFixed(1)}" y1="${padding.top}" x2="${x.toFixed(1)}" y2="${height - padding.bottom}" />`);
    xLabels.push(`<text class="dark-axis-label" x="${x.toFixed(1)}" y="${height - 12}" text-anchor="middle">Day ${i + 1}</text>`);
  }

  // Safe fallback if fewer than 2 points exist
  const strokePath = getBezierPath(pointCoords);
  const lastPoint = pointCoords[pointCoords.length - 1] || { x: padding.left, y: padding.top };
  const firstPoint = pointCoords[0] || { x: padding.left, y: padding.top };
  const areaPath = strokePath ? `${strokePath} L ${lastPoint.x.toFixed(1)} ${(height - padding.bottom).toFixed(1)} L ${firstPoint.x.toFixed(1)} ${(height - padding.bottom).toFixed(1)} Z` : "";

  container.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Student performance curve">
      <defs>
        <linearGradient id="emeraldGlowGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#40d39c" stop-opacity="0.35" />
          <stop offset="70%" stop-color="#1f5c4a" stop-opacity="0.10" />
          <stop offset="100%" stop-color="#0b171a" stop-opacity="0.0" />
        </linearGradient>
      </defs>

      ${gridLines.join("")}
      ${xLabels.join("")}

      <path class="dark-curve-area" d="${areaPath}" fill="url(#emeraldGlowGradient)" />
      <path class="dark-curve-line" d="${strokePath}" fill="none" />

      <!-- Peak Node Ring -->
      <circle class="dark-peak-ring" cx="${lastPoint.x.toFixed(1)}" cy="${lastPoint.y.toFixed(1)}" r="6" />

      <line id="darkHoverLine" class="dark-hover-crosshair" x1="${firstPoint.x}" y1="${padding.top}" x2="${firstPoint.x}" y2="${height - padding.bottom}" />
      <rect id="darkHoverCapture" x="${padding.left}" y="${padding.top}" width="${plotW}" height="${plotH}" fill="transparent" style="cursor: crosshair;" />
    </svg>
  `;

  // Interactive Hovering & Crosshair
  const svg = container.querySelector("svg");
  const hoverLine = svg.querySelector("#darkHoverLine");
  const captureRect = svg.querySelector("#darkHoverCapture");

  if (!captureRect || !hoverLine || !tooltipEl) return;

  captureRect.addEventListener("mousemove", (e) => {
    const rect = svg.getBoundingClientRect();
    const scaleX = width / rect.width;
    const mouseX = (e.clientX - rect.left) * scaleX;
    const ratio = Math.max(0, Math.min(1, (mouseX - padding.left) / plotW));
    const index = Math.round(ratio * (count - 1));

    const point = pointCoords[Math.min(index, pointCoords.length - 1)];
    if (!point) return;

    hoverLine.setAttribute("x1", point.x);
    hoverLine.setAttribute("x2", point.x);
    hoverLine.style.opacity = "1";

    const containerRect = container.getBoundingClientRect();
    const tooltipX = (rect.left - containerRect.left) + (point.x / width) * rect.width;
    const tooltipY = (rect.top - containerRect.top) + (point.y / height) * rect.height;

    tooltipEl.style.left = `${tooltipX}px`;
    tooltipEl.style.top = `${tooltipY}px`;
    tooltipEl.innerHTML = `
      <span style="color:#40d39c; font-weight:700;">Day ${point.day}</span><br/>
      Converted Marks: <strong>${point.val} m</strong>
    `;
    tooltipEl.classList.add("visible");
  });

  captureRect.addEventListener("mouseleave", () => {
    hoverLine.style.opacity = "0";
    tooltipEl.classList.remove("visible");
  });
}

/* --------------------------------- 6. BOOTSTRAP LEADERBOARD PAGE --------------------------------- */
export async function initLeaderboardPage(portalData, evalData, session) {
  const isFaculty = session?.role === "faculty";
  document.body.setAttribute("data-role", session?.role || "student");

  const tracks = allTracks(portalData);
  const filterWrap = document.getElementById("trackFilter");
  const summaryStrip = document.getElementById("summaryStrip");
  const tableBody = document.getElementById("rankTableBody");
  const graphCard = document.getElementById("studentPerformanceCard");
  const graphContainer = document.getElementById("performanceGraph");
  const tooltipEl = document.getElementById("graphTooltip");
  const userBanner = document.getElementById("userStandingBanner");
  const tableFilterLabel = document.getElementById("tableFilterLabel");
  const headerPrimary = document.getElementById("headerMarksPrimary");
  const headerSecondary = document.getElementById("headerMarksSecondary");
  const leaderboardGrid = document.getElementById("leaderboardGrid");

  let activeTrackId = !isFaculty ? session.trackId : "all";

  // Role separation for graph and filters
  if (isFaculty) {
    if (graphCard) graphCard.style.display = "none";
    if (leaderboardGrid) leaderboardGrid.classList.add("is-faculty-view");

    if (filterWrap) {
      filterWrap.innerHTML = "";
      const allBtn = document.createElement("button");
      allBtn.type = "button";
      allBtn.textContent = "All Tracks";
      allBtn.dataset.trackId = "all";
      allBtn.classList.add("active");
      filterWrap.appendChild(allBtn);

      tracks.forEach((t) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = t.name;
        btn.dataset.trackId = t.id;
        filterWrap.appendChild(btn);
      });

      filterWrap.addEventListener("click", async (e) => {
        const btn = e.target.closest("button");
        if (btn && btn.dataset.trackId) {
          activeTrackId = btn.dataset.trackId;
          filterWrap.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b.dataset.trackId === activeTrackId));
          await renderLeaderboard();
        }
      });
    }
  } else {
    if (filterWrap) filterWrap.style.display = "none";
    if (graphCard) graphCard.style.display = "block";
    if (leaderboardGrid) leaderboardGrid.classList.remove("is-faculty-view");
  }

  async function renderLeaderboard() {
    const scale = portalData.conversionScale || 0.25;

    // Attempt live fetch from backend; fallback to local evalData
    let rows = [];
    try {
      const liveData = await API.getLeaderboard(activeTrackId, session?.email);
      if (liveData && Array.isArray(liveData.standings) && liveData.standings.length > 0) {
        const studentTrack = tracks.find((t) => t.id === activeTrackId);
        const maxPts = studentTrack ? trackMaxPoints(studentTrack) : 10;
        const { maxMarks } = computeConvertedMarks(maxPts, maxPts, scale);

        rows = liveData.standings.map((s) => ({
          regNo: s.regNo,
          name: s.name,
          email: s.email || "",
          trackId: activeTrackId,
          trackName: studentTrack ? studentTrack.name : "Active Track",
          completedCount: s.completed || 0,
          totalPoints: Math.round((s.marks / scale) * 10) / 10,
          maxPoints: maxPts,
          convertedMarks: s.marks,
          maxMarks: maxMarks,
          progress: []
        }));
      } else {
        rows = buildLeaderboard(portalData, evalData, activeTrackId);
      }
    } catch (e) {
      console.warn("Backend leaderboard fetch failed, using local cache:", e);
      rows = buildLeaderboard(portalData, evalData, activeTrackId);
    }

    const cohortSize = rows.length;
    const topMarks = rows[0]?.convertedMarks ?? 0;
    const meanMarks = cohortSize
      ? Math.round((rows.reduce((sum, r) => sum + r.convertedMarks, 0) / cohortSize) * 10) / 10
      : 0;

    const meRow = !isFaculty ? rows.find((r) => r.regNo === session.regNo) : null;
    const myRank = meRow ? rows.indexOf(meRow) + 1 : null;

    if (tableFilterLabel) {
      const match = tracks.find((t) => t.id === activeTrackId);
      tableFilterLabel.textContent = match ? match.name : "All Cohorts";
    }

    // 1. Metric Strip
    if (summaryStrip) {
      summaryStrip.innerHTML = `
        <div class="summary-card">
          <span class="label">Cohort Size</span>
          <span class="value font-mono">${cohortSize}</span>
          <span class="sub">enrolled peers ranked</span>
        </div>
        <div class="summary-card accent">
          <span class="label">Highest Score</span>
          <span class="value font-mono">${topMarks} <small style="font-size:0.75rem;">marks</small></span>
          <span class="sub">top converted score</span>
        </div>
        <div class="summary-card">
          <span class="label">Cohort Average</span>
          <span class="value font-mono">${meanMarks} <small style="font-size:0.75rem;">marks</small></span>
          <span class="sub">mean scaled marks</span>
        </div>
        <div class="summary-card ${meRow ? "accent" : ""}">
          <span class="label">${!isFaculty ? "Your Standing" : "Faculty Moderation"}</span>
          <span class="value font-mono">${myRank ? `#${myRank}` : (isFaculty ? "Faculty" : "—")}</span>
          <span class="sub">${meRow ? `${meRow.convertedMarks} /${meRow.maxMarks} marks` : "mentor overview"}</span>
        </div>
      `;
    }

    // 2. Student Standing Card
    if (meRow && userBanner && !isFaculty) {
      userBanner.hidden = false;
      document.getElementById("bannerRank").textContent = `Rank #${myRank}`;
      document.getElementById("bannerTrack").textContent = `(${meRow.trackName})`;
      document.getElementById("bannerCompleted").textContent = `${meRow.completedCount}`;
      document.getElementById("bannerMarks").textContent = `${meRow.convertedMarks} / ${meRow.maxMarks}`;
    } else if (userBanner) {
      userBanner.hidden = true;
    }

    // 3. Rankings Table
    if (tableBody) {
      tableBody.innerHTML = "";
      if (rows.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 28px; color: var(--text-muted);">No student records found for this cohort.</td></tr>`;
      } else {
        rows.forEach((r, idx) => {
          const isCurrent = !isFaculty && r.regNo === session.regNo;
          const rankIndex = idx + 1;
          const rankBadgeClass = rankIndex === 1 ? "top1" : rankIndex === 2 ? "top2" : rankIndex === 3 ? "top3" : "";

          const tr = document.createElement("tr");
          if (isCurrent) tr.className = "me";
          tr.innerHTML = `
            <td style="text-align: center;">
              <span class="rank-cell ${rankBadgeClass}">${rankIndex}</span>
            </td>
            <td>
              <div class="student-meta">
                <span class="student-name">${escapeHtml(r.name)} ${isCurrent ? "(You)" : ""}</span>
                <span class="student-reg font-mono">${escapeHtml(r.regNo)}</span>
              </div>
            </td>
            <td>
              <span class="student-track">${escapeHtml(r.trackName)}</span>
            </td>
            <td class="marks-cell">
              <span class="primary font-mono">${r.convertedMarks} / ${r.maxMarks} Marks</span>
              ${isFaculty ? `<span class="secondary font-mono points-tag">${r.totalPoints} /${r.maxPoints} pts</span>` : ''}
            </td>
          `;
          tableBody.appendChild(tr);
        });
      }
    }

    // 4. Render Dark Glowing Graph (Students Only)
    if (!isFaculty && graphContainer) {
      const activeStudent = (evalData.students || []).find((s) => s.regNo === session.regNo);
      const studentTrack = tracks.find((t) => t.id === session.trackId);
      const dayCount = Math.max(4, (studentTrack?.challenges || []).length);

      let mySeries = [0, 0, 0, 0];
      try {
        const analytics = await API.getHistoricalAnalytics(session.email);
        if (analytics && Array.isArray(analytics.history) && analytics.history.length > 0) {
          mySeries = analytics.history.map((h) => h.marks);
          while (mySeries.length < dayCount) mySeries.push(mySeries[mySeries.length - 1] || 0);
        } else {
          mySeries = activeStudent ? normalizeSeries(activeStudent.progress || [], dayCount, scale) : [0, 0, 0, 0];
        }
      } catch (e) {
        mySeries = activeStudent ? normalizeSeries(activeStudent.progress || [], dayCount, scale) : [0, 0, 0, 0];
      }

      renderDarkGlowingGraph(graphContainer, tooltipEl, mySeries);
    }

    // 5. Header Marks Badge
    if (headerPrimary && meRow && !isFaculty) {
      headerPrimary.textContent = `Converted Marks: ${meRow.convertedMarks} / ${meRow.maxMarks} Marks`;
      if (headerSecondary) headerSecondary.hidden = true;
    } else if (headerPrimary) {
      headerPrimary.textContent = isFaculty ? `${session.name} (Faculty)` : "Cohort Standings";
      if (headerSecondary && isFaculty) {
        headerSecondary.hidden = false;
        headerSecondary.textContent = "Faculty Moderation View";
      }
    }
  }

  function escapeHtml(str) {
    return String(str || "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  await renderLeaderboard();
}
