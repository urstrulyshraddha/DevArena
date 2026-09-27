// admin.js — Admin Console engine for faculty provisioning and credentials oversight

const PORTAL_KEY = "devarena.portal";
const ADMIN_PASS = "admin@shraddha2026";

let portalData = null;

function loadPortal() {
  const raw = localStorage.getItem(PORTAL_KEY);
  if (raw) {
    try {
      portalData = JSON.parse(raw);
      return;
    } catch {}
  }
  // Fallback to fetch
  fetch("../data/portal.json")
    .then((r) => r.json())
    .then((data) => {
      portalData = data;
      savePortal();
      renderAll();
    });
}

function savePortal() {
  localStorage.setItem(PORTAL_KEY, JSON.stringify(portalData));
}

function toast(msg) {
  const el = document.getElementById("adminToast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("visible");
  setTimeout(() => el.classList.remove("visible"), 2500);
}

function renderAll() {
  if (!portalData) return;

  const faculties = portalData.faculties || [];
  const tbody = document.getElementById("facultyTableBody");

  // Calculate Stats
  let totalTracks = 0;
  let totalChallenges = 0;
  faculties.forEach((f) => {
    (f.tracks || []).forEach((t) => {
      totalTracks++;
      totalChallenges += (t.challenges || []).length;
    });
  });

  document.getElementById("statFacultyCount").textContent = faculties.length;
  document.getElementById("statTrackCount").textContent = totalTracks;
  document.getElementById("statChallengeCount").textContent = totalChallenges;

  // Render Table
  tbody.innerHTML = "";
  if (faculties.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:24px; color:#666;">No faculty accounts provisioned.</td></tr>`;
    return;
  }

  faculties.forEach((f) => {
    const tr = document.createElement("tr");

    const tracksHtml = (f.tracks || []).map((t) =>
      `<span class="track-tag">${t.name} (${t.year})</span>`
    ).join("") || '<span style="color:#555; font-size:0.75rem;">None created yet</span>';

    tr.innerHTML = `
      <td>
        <div class="faculty-name">${f.name}</div>
        <div class="faculty-sub">${f.title || "Faculty"}</div>
      </td>
      <td style="font-family:var(--font-mono); color:#bbb;">${f.email}</td>
      <td>
        <span class="password-cell">
          <span class="pass-text" data-hidden="true" data-pass="${f.password}">••••••••</span>
          <button type="button" class="btn-icon toggle-pass-btn" title="Toggle Password">👁</button>
        </span>
      </td>
      <td>${tracksHtml}</td>
      <td style="text-align:right;">
        <button type="button" class="btn-danger-outline delete-btn" data-id="${f.id}">Revoke</button>
      </td>
    `;

    // Password view toggle
    const toggleBtn = tr.querySelector(".toggle-pass-btn");
    const passText = tr.querySelector(".pass-text");
    toggleBtn.addEventListener("click", () => {
      const isHidden = passText.dataset.hidden === "true";
      passText.textContent = isHidden ? passText.dataset.pass : "••••••••";
      passText.dataset.hidden = isHidden ? "false" : "true";
    });

    // Revoke faculty
    tr.querySelector(".delete-btn").addEventListener("click", () => {
      if (confirm(`Revoke access for ${f.name}? Their tracks will be removed.`)) {
        portalData.faculties = portalData.faculties.filter((item) => item.id !== f.id);
        savePortal();
        renderAll();
        toast(`Revoked ${f.name}`);
      }
    });

    tbody.appendChild(tr);
  });
}

// Add New Faculty Form (Simplified: Credentials Only)
document.getElementById("addFacultyForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = document.getElementById("newFacultyName").value.trim();
  const title = document.getElementById("newFacultyTitle").value.trim();
  const email = document.getElementById("newFacultyEmail").value.trim().toLowerCase();
  const password = document.getElementById("newFacultyPassword").value.trim();

  if (portalData.faculties.some((f) => f.email === email)) {
    alert("A faculty member with this email already exists!");
    return;
  }

  const id = name.toLowerCase().replace(/[^a-z0-9]/g, "");

  const newFaculty = {
    id,
    name,
    title,
    email,
    password,
    role: "faculty",
    tracks: [] // Faculty creates tracks inside their own console
  };

  portalData.faculties.push(newFaculty);
  savePortal();
  renderAll();

  document.getElementById("addFacultyForm").reset();
  toast(`Provisioned ${name} successfully!`);
});

// Admin Security Gate Check
const gateOverlay = document.getElementById("adminGateOverlay");
const gatePassInput = document.getElementById("adminGatePass");
const gateSubmit = document.getElementById("adminGateSubmit");

if (sessionStorage.getItem("admin.authenticated") === "true") {
  gateOverlay.setAttribute("hidden", "");
  loadPortal();
  renderAll();
} else {
  gateOverlay.removeAttribute("hidden");
  gateSubmit.addEventListener("click", () => {
    if (gatePassInput.value === ADMIN_PASS) {
      sessionStorage.setItem("admin.authenticated", "true");
      gateOverlay.setAttribute("hidden", "");
      loadPortal();
      renderAll();
    } else {
      document.getElementById("gateError").textContent = "Invalid administrator password.";
    }
  });
}

// Purge System Cache button
document.getElementById("purgeCacheBtn").addEventListener("click", () => {
  if (confirm("Reset portal to defaults and purge legacy test accounts?")) {
    localStorage.removeItem(PORTAL_KEY);
    sessionStorage.clear();
    location.reload();
  }
});
