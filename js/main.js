// main.js — Gateway Router & Onboarding Orchestrator

import { initTheme } from "./theme.js";
import { API } from "./api.js";
import { loadSession, initOnboarding } from "./auth.js";

/* ==========================================================================
   AUTHORITATIVE BACKEND CONFIG (Live Google Sheets Only)
   ========================================================================== */

async function loadPortalConfig() {
  try {
    const configRes = await API.getPortalConfig();
    if (configRes && configRes.success && Array.isArray(configRes.faculties)) {
      // Ensure Platform Administrator is available in the onboarding account list
      const hasAdmin = configRes.faculties.some(
        (f) => f.role === "admin" || String(f.email).toLowerCase() === "admin@srmap.edu.in"
      );
      if (!hasAdmin) {
        configRes.faculties.unshift({
          id: "admin",
          name: "System Administrator",
          title: "Platform Admin",
          email: "admin@srmap.edu.in",
          role: "admin",
          tracks: []
        });
      }
      return configRes;
    }
    throw new Error(configRes.error || "Invalid response format from Sheets catalog.");
  } catch (err) {
    console.error("Backend getPortalConfig failed:", err);
    throw new Error("Unable to connect to Google Sheets backend. Verify network and GAS deployment.");
  }
}

function showFatalError(message) {
  const el = document.createElement("div");
  el.style.cssText =
    "max-width:640px;margin:80px auto;padding:24px;border-radius:12px;background:#fbe9e8;color:#b91c1c;font-family:sans-serif;font-size:14px;border:1px solid #f87171;text-align:center;";
  el.textContent = message;
  document.body.prepend(el);
}

function toast(message) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = message;
  el.classList.add("visible");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove("visible"), 2600);
}

/* ==========================================================================
   ROLE-BASED REDIRECTION ENGINE
   ========================================================================== */

function routeToWorkspace(session) {
  if (!session || !session.role) {
    localStorage.removeItem("devarena.session");
    window.location.reload();
    return;
  }

  if (session.role === "student") {
    window.location.href = "student/workspace.html";
    return;
  }

  if (session.role === "faculty") {
    window.location.href = "faculty/workspace.html";
    return;
  }

  if (session.role === "admin") {
    window.location.href = "admin/admin.html";
    return;
  }

  console.warn("Unknown session role:", session.role);
  localStorage.removeItem("devarena.session");
  window.location.reload();
}

/* ==========================================================================
   DYNAMIC TRACK / SECTION SELECTOR
   ========================================================================== */

function setupTrackSelection(portalData) {
  const yearSelect = document.getElementById("yearSelect");
  const mentorSelect = document.getElementById("mentorSelect");
  const trackSelect = document.getElementById("studentTrack");
  const routePreviewText = document.getElementById("routePreviewText");

  if (!yearSelect || !mentorSelect || !trackSelect) return;

  function updateTracks() {
    const selectedYear = (yearSelect.value || "").trim();
    const selectedMentorId = (mentorSelect.value || "").trim().toLowerCase();

    trackSelect.innerHTML = "";

    if (!selectedYear || !selectedMentorId) {
      trackSelect.innerHTML = '<option value="" disabled selected>Select Academic Year &amp; Mentor First</option>';
      if (routePreviewText) routePreviewText.textContent = "";
      return;
    }

    const faculty = (portalData?.faculties || []).find(
      (f) => String(f.id).toLowerCase() === selectedMentorId || String(f.email).toLowerCase() === selectedMentorId
    );

    const facultyTracks = faculty?.tracks || [];
    const yearNumber = selectedYear.replace(/[^0-9]/g, "");

    // Match tracks by academic year
    const matchedTracks = facultyTracks.filter((t) => {
      const trackYearNum = String(t.year || "").replace(/[^0-9]/g, "");
      return trackYearNum === yearNumber || String(t.year || "").toLowerCase() === selectedYear.toLowerCase();
    });

    if (matchedTracks.length === 0) {
      trackSelect.innerHTML = `<option value="" disabled selected>No active cohorts for ${selectedYear}</option>`;
      if (routePreviewText) {
        routePreviewText.textContent = `⚠️ No cohort sections registered for ${faculty?.name || 'mentor'} in ${selectedYear}.`;
      }
      return;
    }

    trackSelect.innerHTML = '<option value="" disabled selected>Select your section / track</option>';
    matchedTracks.forEach((t) => {
      const opt = document.createElement("option");
      opt.value = t.id;
      opt.textContent = `${t.name} · ${t.section || t.year || "Cohort"}`;
      trackSelect.appendChild(opt);
    });

    // Auto-select if only one section exists
    if (matchedTracks.length === 1) {
      trackSelect.value = matchedTracks[0].id;
      if (routePreviewText) {
        routePreviewText.textContent = `Assigned Cohort: ${matchedTracks[0].name} (${matchedTracks[0].section || matchedTracks[0].year})`;
      }
    }
  }

  yearSelect.addEventListener("change", updateTracks);
  mentorSelect.addEventListener("change", updateTracks);
  trackSelect.addEventListener("change", () => {
    if (routePreviewText && trackSelect.selectedOptions[0]) {
      routePreviewText.textContent = `Assigned Cohort: ${trackSelect.selectedOptions[0].textContent}`;
    }
  });

  // Guard against submitting without selecting a section
  const form = document.getElementById("onboardingForm");
  form?.addEventListener(
    "submit",
    (e) => {
      const activeTab = document.querySelector(".role-tab.active");
      if (activeTab && activeTab.dataset.role === "student") {
        const chosenTrack = trackSelect.value;
        if (!chosenTrack) {
          e.preventDefault();
          e.stopImmediatePropagation();
          toast("Please choose your enrolled cohort section.");
        }
      }
    },
    true
  );

  updateTracks();
}

/* ==========================================================================
   GATEWAY BOOTSTRAPPER
   ========================================================================== */

async function boot() {
  initTheme();

  // 1. Immediate Session Check: Skip fetching & onboarding if already logged in
  const existingSession = loadSession();
  if (existingSession) {
    routeToWorkspace(existingSession);
    return;
  }

  // 2. Fetch live catalog to populate onboarding dropdowns
  let portalData;
  try {
    portalData = await loadPortalConfig();
  } catch (err) {
    showFatalError(err.message);
    return;
  }

  // 3. Render Onboarding Modal & Attach Success Callback
  const onboardingOverlay = document.getElementById("onboardingOverlay");
  if (onboardingOverlay) {
    onboardingOverlay.removeAttribute("hidden");
  }

  setupTrackSelection(portalData);

  initOnboarding(portalData, (authenticatedSession) => {
    // Ensure the specific chosen section trackId is stored in the session
    const trackSelect = document.getElementById("studentTrack");
    if (trackSelect && trackSelect.value && authenticatedSession.role === "student") {
      authenticatedSession.trackId = trackSelect.value;
      localStorage.setItem("devarena.session", JSON.stringify(authenticatedSession));
    }
    routeToWorkspace(authenticatedSession);
  });
}

document.addEventListener("DOMContentLoaded", boot);
