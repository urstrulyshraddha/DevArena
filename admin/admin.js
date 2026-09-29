// admin/admin.js — Lead Developer & Admin Console

import { API } from "../js/api.js";

let portalData = { faculties: [] };

function toast(msg) {
  const el = document.getElementById("adminToast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("visible");
  setTimeout(() => el.classList.remove("visible"), 2500);
}

function trackLabel(t) {
  return t.section ? `${t.name} · ${t.section} (${t.year})` : `${t.name} (${t.year})`;
}

async function renderAll() {
  const faculties = (portalData && portalData.faculties) ? portalData.faculties : [];
  const tbody = document.getElementById("facultyTableBody");

  let totalTracks = 0;
  faculties.forEach((f) => { totalTracks += (f.tracks || []).length; });

  document.getElementById("statFacultyCount").textContent = faculties.length;
  document.getElementById("statTrackCount").textContent = totalTracks;

  // Fetch total challenges count across all tracks
  try {
    const chRes = await API.getChallenges("all");
    const count = (chRes && Array.isArray(chRes.challenges)) ? chRes.challenges.length : 0;
    document.getElementById("statChallengeCount").textContent = count;
  } catch (e) {
    document.getElementById("statChallengeCount").textContent = "—";
  }

  tbody.innerHTML = "";
  if (faculties.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:24px; color:#666;">No faculty accounts provisioned.</td></tr>`;
    return;
  }

  faculties.forEach((f) => {
    const tr = document.createElement("tr");

    // Account Status with reduced radius (6px)
    const statusBadge = f.role === "admin"
      ? `<span class="status-badge admin">Root Admin</span>`
      : `<span class="status-badge active">Self-Activated</span>`;

    // Managed Tracks rendered as a Dropdown
    let tracksDropdownHtml = '<span style="color:#666; font-size:0.75rem;">None created</span>';
    if (f.tracks && f.tracks.length > 0) {
      tracksDropdownHtml = `
        <select class="table-track-select">
          <option disabled selected>${f.tracks.length} Assigned Track${f.tracks.length > 1 ? 's' : ''}</option>
          ${f.tracks.map(t => `<option value="${t.id}">${trackLabel(t)}</option>`).join("")}
        </select>
      `;
    }

    tr.innerHTML = `
      <td>
        <div class="faculty-name">${f.name}</div>
        <div class="faculty-sub">${f.title || "Faculty Member"}</div>
      </td>
      <td style="font-family:var(--font-mono); color:#bbb;">${f.email}</td>
      <td>${statusBadge}</td>
      <td>${tracksDropdownHtml}</td>
      <td style="text-align:right;">
        ${f.role === "admin"
          ? '<span style="color:#555; font-size:0.75rem;">Protected</span>'
          : `<button type="button" class="btn-danger-outline delete-btn" data-id="${f.id}">Revoke</button>`
        }
      </td>
    `;

    const deleteBtn = tr.querySelector(".delete-btn");
    if (deleteBtn) {
      deleteBtn.addEventListener("click", () => {
        if (confirm(`Revoke access for ${f.name}? (Production rows are safely maintained in Sheets).`)) {
          portalData.faculties = portalData.faculties.filter((item) => item.id !== f.id);
          renderAll();
          toast(`Removed ${f.name} from current view`);
        }
      });
    }

    tbody.appendChild(tr);
  });
}

/* ── Dynamic Multi-Cohort Row Adder ── */
const cohortRowsContainer = document.getElementById("cohortRowsContainer");
const addCohortRowBtn = document.getElementById("addCohortRowBtn");

function addCohortRow() {
  const row = document.createElement("div");
  row.className = "cohort-row";
  row.innerHTML = `
    <input type="text" class="cohort-track-name" placeholder="Track Name (e.g. Code2Think)" value="Code2Think" required />
    <select class="cohort-year-select" required>
      <option value="1st Year">1st Year</option>
      <option value="2nd Year">2nd Year</option>
      <option value="3rd Year">3rd Year</option>
      <option value="4th Year">4th Year</option>
    </select>
    <input type="text" class="cohort-section" placeholder="Section (e.g. CS-C)" required />
    <button type="button" class="btn-remove-cohort" title="Remove">✕</button>
  `;

  row.querySelector(".btn-remove-cohort").addEventListener("click", () => {
    row.remove();
  });

  cohortRowsContainer.appendChild(row);
}

if (addCohortRowBtn) {
  addCohortRowBtn.addEventListener("click", addCohortRow);
}

/* ── Provision Faculty + Multiple Cohorts (Direct to Sheets) ── */
document.getElementById("addFacultyForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name  = document.getElementById("newFacultyName").value.trim();
  const title = document.getElementById("newFacultyTitle").value.trim();
  const email = document.getElementById("newFacultyEmail").value.trim().toLowerCase();

  if (portalData.faculties.some((f) => f.email === email)) {
    alert("A faculty member with this email already exists in the catalog!");
    return;
  }

  // Parse all cohort rows
  const cohortRows = cohortRowsContainer.querySelectorAll(".cohort-row");
  const tracks = [];

  cohortRows.forEach((row) => {
    const tName = row.querySelector(".cohort-track-name").value.trim();
    const year = row.querySelector(".cohort-year-select").value;
    const section = row.querySelector(".cohort-section").value.trim().toUpperCase();

    const yrShort = year.toLowerCase().replace(/[^0-9]/g, "") || "1";
    const trackId = `${tName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-y${yrShort}-${section.toLowerCase().replace(/[^a-z0-9]+/g, "")}`;

    tracks.push({
      id: trackId,
      name: tName,
      year: year,
      section: section
    });
  });

  if (tracks.length === 0) {
    alert("Please allocate at least one cohort / section for this faculty member.");
    return;
  }

  const id = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  const faculty = { id, name, title, email, role: "faculty" };

  const submitBtn = e.target.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = "Writing to Google Sheets...";

  try {
    await API.addFacultyCatalog({ faculty, tracks });

    // Refresh live catalog
    const res = await API.getPortalConfig();
    portalData = { faculties: res.faculties || [] };
    await renderAll();

    document.getElementById("addFacultyForm").reset();
    toast(`Provisioned ${name} with ${tracks.length} assigned cohort${tracks.length > 1 ? 's' : ''}!`);
  } catch (err) {
    alert("Failed to write to Google Sheets: " + err.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "+ Provision Faculty & Sync Cohorts";
  }
});

/* ── Security Gate (Cloud Authenticated) ── */
const gateOverlay = document.getElementById("adminGateOverlay");
const gatePassInput = document.getElementById("adminGatePass");
const gateSubmit = document.getElementById("adminGateSubmit");
const gateError = document.getElementById("gateError");

const activeSession = JSON.parse(localStorage.getItem("devarena.session") || "null");

if (activeSession && activeSession.role === "admin") {
  gateOverlay.setAttribute("hidden", "");
  boot();
} else {
  gateOverlay.removeAttribute("hidden");
  gateSubmit.addEventListener("click", async () => {
    const password = gatePassInput.value.trim();
    if (!password) {
      gateError.textContent = "Please enter admin password.";
      return;
    }

    gateSubmit.disabled = true;
    gateSubmit.textContent = "Verifying...";
    gateError.textContent = "";

    try {
      const res = await API.facultyAuth("shraddha_kondaveeti@srmap.edu.in", password, "admin");
      if (res && res.success) {
        localStorage.setItem("devarena.session", JSON.stringify({
          role: "admin",
          name: res.faculty?.name || "Shraddha Kondaveeti",
          email: "shraddha_kondaveeti@srmap.edu.in",
          facultyId: "shraddha",
          title: "System Admin"
        }));
        gateOverlay.setAttribute("hidden", "");
        boot();
      } else {
        gateError.textContent = res.error || "Invalid master credentials.";
      }
    } catch (err) {
      gateError.textContent = "Authentication error: " + err.message;
    } finally {
      gateSubmit.disabled = false;
      gateSubmit.textContent = "Unlock Console";
    }
  });
}

async function boot() {
  try {
    const res = await API.getPortalConfig();
    portalData = { faculties: res.faculties || [] };
  } catch (err) {
    console.error("Failed to load catalog:", err);
    toast("Backend unreachable.");
  }
  await renderAll();
}

document.getElementById("purgeCacheBtn").addEventListener("click", () => {
  if (confirm("Purge browser session and reload console?")) {
    localStorage.clear();
    sessionStorage.clear();
    location.reload();
  }
});
