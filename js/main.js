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

  // 2. No session: Fetch live catalog to populate onboarding dropdowns
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

  initOnboarding(portalData, (authenticatedSession) => {
    routeToWorkspace(authenticatedSession);
  });
}

document.addEventListener("DOMContentLoaded", boot);
