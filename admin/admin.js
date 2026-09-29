// admin.js — Admin Console: faculty provisioning (no password assignment),
// section-wise track creation synced to the GAS backend catalog.

import { API } from "../js/api.js";

const ADMIN_PASS = "admin@shraddha2026";

let portalData = { faculties: [] };

function savePortal() {
  localStorage.setItem("devarena.portal", JSON.stringify(portalData));
}

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

function renderAll() {
  const faculties = portalData.faculties || [];
  const tbody = document.getElementById("facultyTableBody");

  let totalTracks = 0;
  faculties.forEach((f) => { totalTracks += (f.tracks || []).length; });

  document.getElementById("statFacultyCount").textContent = faculties.length;
  document.getElementById("statTrackCount").textContent = totalTracks;

  tbody.innerHTML = "";
  if (faculties.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:24px; color:#666;">No faculty accounts provisioned.</td></tr>`;
    return;
  }

  faculties.forEach((f) => {
    const tr = document.createElement("tr");
    const tracksHtml = (f.tracks || []).map((t) =>
      `<span class="track-tag">${trackLabel(t)}</span>`
    ).join("") || '<span style="color:#555; font-size:0.75rem;">None created yet</span>';

    tr.innerHTML = `
      <td>
        <div class="faculty-name">${f.name}</div>
        <div class="faculty-sub">${f.title || "Faculty"}</div>
      </td>
      <td style="font-family:var(--font-mono); color:#bbb;">${f.email}</td>
      <td><span class="track-tag" style="border-color:#22c55e; color:#22c55e;">Self-Activated</span></td>
      <td>${tracksHtml}</td>
      <td style="text-align:right;">
        <button type="button" class="btn-danger-outline delete-btn" data-id="${f.id}">Revoke</button>
      </td>
    `;

    tr.querySelector(".delete-btn").addEventListener("click", () => {
      if (confirm(`Revoke access for ${f.name}? Their tracks will be removed from the live catalog.`)) {
        portalData.faculties = portalData.faculties.filter((item) => item.id !== f.id);
        savePortal();
        renderAll();
        toast(`Revoked ${f.name}`);
      }
    });

    tbody.appendChild(tr);
  });
}

/* ── Provision Faculty + Section-wise Track ── */
document.getElementById("addFacultyForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name    = document.getElementById("newFacultyName").value.trim();
  const title   = document.getElementById("newFacultyTitle").value.trim();
  const email   = document.getElementById("newFacultyEmail").value.trim().toLowerCase();
  const tName   = document.getElementById("newTrackName").value.trim();
  const section = document.getElementById("newTrackSection").value.trim().toUpperCase();
  const year    = document.getElementById("newTrackYear").value;

  if (portalData.faculties.some((f) => f.email === email)) {
    alert("A faculty member with this email already exists!");
    return;
  }

  const id      = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  const trackId = `${tName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${section.toLowerCase().replace(/[^a-z0-9]+/g, "")}`;

  const faculty = { id, name, title, email, role: "faculty" };
  const initialTrack = { id: trackId, name: tName, year, section };

  try {
    await API.addFacultyCatalog(faculty, initialTrack);
  } catch (err) {
    /* Offline/demo fallback: still update local portal */
    console.warn("Backend unreachable, persisting locally.", err);
  }

  portalData.faculties.push({ ...faculty, tracks: [initialTrack] });
  savePortal();
  renderAll();

  document.getElementById("addFacultyForm").reset();
  toast(`Provisioned ${name} — track ${tName} · ${section} created.`);
});

/* ── Security Gate ── */
const gateOverlay = document.getElementById("adminGateOverlay");
const gatePassInput = document.getElementById("adminGatePass");
const gateSubmit = document.getElementById("adminGateSubmit");

if (sessionStorage.getItem("admin.authenticated") === "true") {
  gateOverlay.setAttribute("hidden", "");
  boot();
} else {
  gateOverlay.removeAttribute("hidden");
  gateSubmit.addEventListener("click", () => {
    if (gatePassInput.value === ADMIN_PASS) {
      sessionStorage.setItem("admin.authenticated", "true");
      gateOverlay.setAttribute("hidden", "");
      boot();
    } else {
      document.getElementById("gateError").textContent = "Invalid administrator password.";
    }
  });
}

async function boot() {
  /* Seed the year dropdown */
  const yearSelect = document.getElementById("newTrackYear");
  ["1st Year", "2nd Year", "3rd Year", "4th Year"].forEach((y) => {
    const opt = document.createElement("option");
    opt.value = y; opt.textContent = y;
    yearSelect.appendChild(opt);
  });

  /* Try live catalog first, fall back to local portal data */
  try {
    const res = await API.getPortalConfig();
    portalData = { faculties: res.faculties || [] };
    savePortal();
  } catch {
    try {
      const raw = localStorage.getItem("devarena.portal");
      if (raw) portalData = JSON.parse(raw);
    } catch {}
  }
  renderAll();
}

document.getElementById("purgeCacheBtn").addEventListener("click", () => {
  if (confirm("Reset portal to defaults and purge legacy test accounts?")) {
    localStorage.removeItem("devarena.portal");
    sessionStorage.clear();
    location.reload();
  }
});
