// main.js — App bootstrap and event orchestration with live cloud async hydration

import { initTheme } from "./theme.js";
import { loadSession, initOnboarding, initProfileBadge } from "./auth.js";
import { initWorkspace, initFacultyWorkspace } from "./workspace.js";
import { initLeaderboardPage } from "./leaderboard.js";

async function loadData() {
  const [portalRes, evalRes] = await Promise.all([
    fetch("data/portal.json"),
    fetch("data/evaluations.json"),
  ]);
  if (!portalRes.ok || !evalRes.ok) {
    throw new Error("Could not load portal data. Please run via a local server (python -m http.server 8000).");
  }
  const portalData = await portalRes.json();
  const evaluationsSeed = await evalRes.json();
  return { portalData, evaluationsSeed };
}

function showFatalError(message) {
  const el = document.createElement("div");
  el.style.cssText = "max-width:640px;margin:80px auto;padding:24px;border-radius:12px;background:#fbe9e8;color:#b91c1c;font-family:sans-serif;font-size:14px;";
  el.textContent = message;
  document.body.prepend(el);
}

async function boot() {
  initTheme();

  const page = document.body.dataset.page; // "index" | "leaderboard"

  let portalData, evaluationsSeed;
  try {
    ({ portalData, evaluationsSeed } = await loadData());
  } catch (err) {
    showFatalError(err.message);
    return;
  }

  // AUTO-PURGE LEGACY MURALI FROM LOCALSTORAGE
  const savedPortalRaw = localStorage.getItem("devarena.portal");
  if (savedPortalRaw) {
    if (savedPortalRaw.includes('"murali"') || savedPortalRaw.includes("Murali")) {
      localStorage.removeItem("devarena.portal"); // purge stale cache
    } else {
      try {
        portalData = JSON.parse(savedPortalRaw);
      } catch (e) {
        console.warn("Using freshly fetched portal.json");
      }
    }
  }

  const session = loadSession();

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

  // page === "index"
  const proceed = async (activeSession) => {
    initProfileBadge(activeSession, {
      onLogout: () => {
        window.location.reload();
      },
    });

    if (activeSession.role === "faculty") {
      document.body.setAttribute("data-role", "faculty");
      const facultyShell = document.getElementById("facultyShell");
      if (facultyShell) facultyShell.removeAttribute("hidden");
      const studentShell = document.getElementById("workspaceShell");
      if (studentShell) studentShell.setAttribute("hidden", "");
      initFacultyWorkspace(activeSession, portalData, evaluationsSeed);
    } else {
      document.body.setAttribute("data-role", "student");
      const studentShell = document.getElementById("workspaceShell");
      if (studentShell) studentShell.removeAttribute("hidden");
      const facultyShell = document.getElementById("facultyShell");
      if (facultyShell) facultyShell.setAttribute("hidden", "");
      await initWorkspace(activeSession, portalData, evaluationsSeed);
    }
  };

  initOnboarding(portalData, proceed);
}

document.addEventListener("DOMContentLoaded", boot);
