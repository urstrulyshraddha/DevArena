// main.js — App bootstrap and event orchestration

import { initTheme } from "./theme.js";
import { API } from "./api.js";
import {
  loadSession,
  initOnboarding,
  initProfileBadge,
} from "./auth.js";

import { initStudentWorkspace } from "./student-ws.js";
import { initFacultyWorkspace } from "./faculty-ws.js";
import { initLeaderboardPage } from "./leaderboard.js";

/* ==========================================================================
   DATA LOADING ENGINE (Authoritative Backend First -> Local Fallback)
   ========================================================================== */

async function loadData() {
  let portalData = null;
  let evaluationsSeed = { students: [] };

  // 1. Attempt to load live authoritative portal config from Google Apps Script
  try {
    const configRes = await API.getPortalConfig();
    if (configRes && configRes.success && Array.isArray(configRes.faculties)) {
      portalData = configRes;
      localStorage.setItem("devarena.portal", JSON.stringify(portalData));
    }
  } catch (err) {
    console.warn("Backend getPortalConfig failed; checking local caches & seed:", err);
  }

  // 2. Fallback to localStorage or data/portal.json if backend was unreachable
  if (!portalData) {
    const savedPortalRaw = localStorage.getItem("devarena.portal");
    if (savedPortalRaw) {
      try {
        portalData = JSON.parse(savedPortalRaw);
      } catch (e) {
        console.warn("Stale devarena.portal parse error, falling back to static seed.");
      }
    }
  }

  // 3. Fetch static seed files if needed
  try {
    const [portalRes, evalRes] = await Promise.all([
      !portalData ? fetch("data/portal.json") : Promise.resolve(null),
      fetch("data/evaluations.json").catch(() => null)
    ]);

    if (portalRes && portalRes.ok) {
      portalData = await portalRes.json();
    }

    if (evalRes && evalRes.ok) {
      evaluationsSeed = await evalRes.json();
    }
  } catch (err) {
    console.warn("Could not fetch local seed files:", err);
  }

  if (!portalData) {
    throw new Error("Could not initialize portal catalog from backend or local seed.");
  }

  return { portalData, evaluationsSeed };
}

function showFatalError(message) {
  const el = document.createElement("div");
  el.style.cssText =
    "max-width:640px;margin:80px auto;padding:24px;border-radius:12px;background:#fbe9e8;color:#b91c1c;font-family:sans-serif;font-size:14px;border:1px solid #f87171;";
  el.textContent = message;
  document.body.prepend(el);
}

/* ==========================================================================
   APP BOOTSTRAPPER
   ========================================================================== */

async function boot() {
  initTheme();

  const page = document.body.dataset.page;
  let portalData;
  let evaluationsSeed;

  try {
    ({ portalData, evaluationsSeed } = await loadData());
  } catch (err) {
    showFatalError(err.message);
    return;
  }

  const session = loadSession();

  /* --------------------------------------------------------------------------
     LEADERBOARD PAGE ROUTING
     -------------------------------------------------------------------------- */
  if (page === "leaderboard") {
    if (!session) {
      window.location.href = "index.html";
      return;
    }

    initProfileBadge(session, {
      onLogout: () => {
        window.location.href = "index.html";
      },
    });

    await initLeaderboardPage(portalData, evaluationsSeed, session);
    return;
  }

  /* --------------------------------------------------------------------------
     WORKSPACE ROUTING / WORKFLOW PROCEED HANDLER
     -------------------------------------------------------------------------- */
  const proceed = async (activeSession) => {
    // Hide onboarding modal once a valid session proceeds
    const onboardingOverlay = document.getElementById("onboardingOverlay");
    if (onboardingOverlay) {
      onboardingOverlay.setAttribute("hidden", "");
    }

    initProfileBadge(activeSession, {
      onLogout: () => {
        window.location.reload();
      },
    });

    const studentShell = document.getElementById("workspaceShell");
    const facultyShell = document.getElementById("facultyShell");

    /* ── Student Workspace ── */
    if (activeSession.role === "student") {
      document.body.setAttribute("data-role", "student");

      if (studentShell) studentShell.removeAttribute("hidden");
      if (facultyShell) facultyShell.setAttribute("hidden", "");

      await initStudentWorkspace(activeSession, portalData, evaluationsSeed);
      return;
    }

    /* ── Faculty Workspace ── */
    if (activeSession.role === "faculty") {
      document.body.setAttribute("data-role", "faculty");

      if (facultyShell) facultyShell.removeAttribute("hidden");
      if (studentShell) studentShell.setAttribute("hidden", "");

      initFacultyWorkspace(activeSession, portalData, evaluationsSeed);
      return;
    }

    /* ── Admin (Pending Dedicated Admin Shell) ── */
    /* ── Admin Routing ── */
        if (activeSession.role === "admin") {
          window.location.href = "admin/admin.html";
          return;
        }

    /* ── Unknown Role Fallback ── */
    console.warn("Unknown session role:", activeSession.role);
    localStorage.removeItem("devarena.session");
    window.location.reload();
  };

  /* --------------------------------------------------------------------------
     ONBOARDING VS ACTIVE SESSION
     -------------------------------------------------------------------------- */
  if (session) {
    await proceed(session);
  } else {
    const onboardingOverlay = document.getElementById("onboardingOverlay");
    if (onboardingOverlay) {
      onboardingOverlay.removeAttribute("hidden");
    }
    initOnboarding(portalData, proceed);
  }
}

document.addEventListener("DOMContentLoaded", boot);
