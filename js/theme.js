// theme.js — Robust light/dark toggle engine with system sync + localStorage
// Exposes: initTheme(), toggleTheme(), getTheme()

const THEME_KEY = "devarena.theme"; // "light" | "dark" | "system"

function systemPrefersDark() {
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function resolveTheme(pref) {
  if (pref === "system" || !pref) return systemPrefersDark() ? "dark" : "light";
  return pref;
}

function applyTheme(resolved) {
  document.documentElement.setAttribute("data-theme", resolved);
  const btn = document.querySelector(".theme-toggle");
  if (btn) {
    btn.setAttribute(
      "aria-label",
      resolved === "dark" ? "Switch to light theme" : "Switch to dark theme"
    );
  }
}

export function getStoredPreference() {
  return localStorage.getItem(THEME_KEY) || "system";
}

export function getTheme() {
  return document.documentElement.getAttribute("data-theme") || "light";
}

export function setThemePreference(pref) {
  localStorage.setItem(THEME_KEY, pref);
  applyTheme(resolveTheme(pref));
}

export function toggleTheme() {
  const current = getTheme();
  const next = current === "dark" ? "light" : "dark";
  setThemePreference(next);
}

export function initTheme() {
  // Apply immediately to avoid a flash of the wrong theme
  applyTheme(resolveTheme(getStoredPreference()));

  // Keep in sync with system changes, but only while user hasn't pinned a theme manually
  if (window.matchMedia) {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (getStoredPreference() === "system") {
        applyTheme(resolveTheme("system"));
      }
    };
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }

  const btn = document.querySelector(".theme-toggle");
  if (btn) {
    btn.addEventListener("click", () => toggleTheme());
  }
}
