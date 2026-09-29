/* ==========================================================================
   SRM DevArena — Authentication & Onboarding (js/auth.js)
   ========================================================================== */

import { API } from "./api.js";

const SESSION_KEY = "devarena.session";

/* --------------------------------------------------------------------------
   SESSION HELPERS
   -------------------------------------------------------------------------- */
export function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.warn("Corrupt session in localStorage:", e);
    return null;
  }
}

export function saveSession(sessionData) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
  window.location.reload();
}

// Backwards-compatibility alias
export const getSession = loadSession;
export const setSession = saveSession;

/* --------------------------------------------------------------------------
   HEADER PROFILE BADGE
   -------------------------------------------------------------------------- */
export function initProfileBadge(session, options = {}) {
  const badge = document.getElementById("profileBadge");
  if (!badge || !session) return;

  const avatar = document.getElementById("profileAvatar");
  const nameEl = document.getElementById("profileName");
  const trackEl = document.getElementById("profileTrack");
  const menuBtn = document.getElementById("profileMenuBtn");
  const dropdown = document.getElementById("profileDropdown");
  const logoutBtn = document.getElementById("logoutBtn");

  badge.removeAttribute("hidden");

  const displayName = session.name || session.email || "User";
  if (nameEl) nameEl.textContent = displayName;
  if (avatar) avatar.textContent = displayName.charAt(0).toUpperCase();

  if (trackEl) {
    if (session.role === "student") {
      trackEl.textContent = session.trackName
        ? `${session.trackName} · ${session.section || session.academicYear || ''}`
        : (session.regNo || "Student");
    } else {
      trackEl.textContent = session.title || "Faculty Console";
    }
  }

  if (menuBtn && dropdown) {
    menuBtn.onclick = (e) => {
      e.stopPropagation();
      dropdown.classList.toggle("open");
    };

    document.addEventListener("click", () => {
      dropdown.classList.remove("open");
    });
  }

  if (logoutBtn) {
    logoutBtn.onclick = () => {
      clearSession();
      if (typeof options.onLogout === "function") {
        options.onLogout();
      }
    };
  }
}

/* --------------------------------------------------------------------------
   SELECT ENHANCEMENT (Optional helper)
   -------------------------------------------------------------------------- */
export function enhanceAllSelects() {
  // Retained so workspace/main callers do not throw
}

/* --------------------------------------------------------------------------
   ONBOARDING CONTROLLER
   -------------------------------------------------------------------------- */
export function initOnboarding(portalConfig, onProceed) {
  const form = document.getElementById("onboardingForm");
  const banner = document.getElementById("formBanner");

  const studentFields = document.getElementById("studentFields");
  const facultyFields = document.getElementById("facultyFields");
  const roleTabs = document.querySelectorAll(".role-tab");

  // Student inputs
  const nameInput = document.getElementById("nameInput");
  const regNoInput = document.getElementById("regNoInput");
  const emailInput = document.getElementById("emailInput");
  const yearSelect = document.getElementById("yearSelect");
  const mentorSelect = document.getElementById("mentorSelect");
  const routePreviewText = document.getElementById("routePreviewText");

  // Faculty inputs
  const facultySelectField = document.getElementById("facultySelectField");
  const facultyEmailInput = document.getElementById("facultyEmailInput");
  const facultyPasswordInput = document.getElementById("facultyPasswordInput");
  const togglePasswordBtn = document.getElementById("togglePasswordBtn");

  let currentRole = "student";
  const faculties = (portalConfig && Array.isArray(portalConfig.faculties)) ? portalConfig.faculties : [];

  function showBanner(msg, isError = true) {
    if (!banner) return;
    banner.textContent = msg;
    banner.className = isError ? "form-banner error" : "form-banner success";
    banner.style.display = "block";
  }

  function clearBanner() {
    if (!banner) return;
    banner.textContent = "";
    banner.style.display = "none";
  }

  /* ── 1. Role Tabs Switching (Student vs Faculty) ── */
  roleTabs.forEach(tab => {
    tab.addEventListener("click", () => {
      clearBanner();
      roleTabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      currentRole = tab.dataset.role;

      if (currentRole === "student") {
        if (studentFields) studentFields.removeAttribute("hidden");
        if (facultyFields) facultyFields.setAttribute("hidden", "");
      } else {
        if (studentFields) studentFields.setAttribute("hidden", "");
        if (facultyFields) facultyFields.removeAttribute("hidden");
      }
    });
  });

  /* ── 2. Password Visibility Toggle ── */
  if (togglePasswordBtn && facultyPasswordInput) {
    togglePasswordBtn.addEventListener("click", () => {
      const isPassword = facultyPasswordInput.type === "password";
      facultyPasswordInput.type = isPassword ? "text" : "password";
    });
  }

  /* ── 3. Populate Academic Years ── */
  if (yearSelect) {
    const years = ["1st Year", "2nd Year", "3rd Year", "4th Year"];
    yearSelect.innerHTML = `<option value="" disabled selected>Select Academic Year</option>`;
    years.forEach(yr => {
      const opt = document.createElement("option");
      opt.value = yr;
      opt.textContent = yr;
      yearSelect.appendChild(opt);
    });
    yearSelect.addEventListener("change", updateRoutePreview);
  }

  /* ── 4. Populate Mentors & Faculty Dropdowns from Authoritative Catalog ── */
  const activeFacultyList = faculties.filter(f => f.role === "faculty" || !f.role);

  if (mentorSelect) {
    mentorSelect.innerHTML = `<option value="" disabled selected>Select Faculty Mentor</option>`;
    activeFacultyList.forEach(fac => {
      const opt = document.createElement("option");
      opt.value = fac.id;
      opt.textContent = `${fac.name} (${fac.title || 'Faculty'})`;
      mentorSelect.appendChild(opt);
    });
    mentorSelect.addEventListener("change", updateRoutePreview);
  }

  function updateRoutePreview() {
    if (!routePreviewText) return;
    const facId = mentorSelect?.value;
    const yr = yearSelect?.value;
    if (!facId || !yr) {
      routePreviewText.textContent = "";
      return;
    }
    const faculty = faculties.find(f => f.id === facId);
    const assignedTrack = faculty && Array.isArray(faculty.tracks)
      ? (faculty.tracks.find(t => t.year === yr) || faculty.tracks[0])
      : null;

    if (assignedTrack) {
      routePreviewText.textContent = `Assigned Cohort: ${assignedTrack.name} (${assignedTrack.section || assignedTrack.year})`;
    } else {
      routePreviewText.textContent = `Assigned Mentor: ${faculty ? faculty.name : facId}`;
    }
  }

  if (facultySelectField) {
    facultySelectField.innerHTML = `<option value="" disabled selected>Choose your account</option>`;
    activeFacultyList.forEach(fac => {
      const opt = document.createElement("option");
      opt.value = fac.email;
      opt.dataset.id = fac.id;
      opt.dataset.name = fac.name;
      opt.textContent = `${fac.name} (${fac.title || 'Faculty'})`;
      facultySelectField.appendChild(opt);
    });

    facultySelectField.addEventListener("change", (e) => {
      if (facultyEmailInput) {
        facultyEmailInput.value = e.target.value;
      }
    });
  }

  /* ── 5. Form Submission (Live Auth) ── */
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      clearBanner();

      /* ── Student Flow ── */
      if (currentRole === "student") {
        const name = nameInput?.value.trim();
        const regNo = regNoInput?.value.trim().toUpperCase();
        const email = emailInput?.value.trim().toLowerCase();
        const academicYear = yearSelect?.value;
        const mentorId = mentorSelect?.value;

        if (!name || !regNo || !email || !academicYear || !mentorId) {
          showBanner("Please fill in all student onboarding fields.");
          return;
        }

        if (!/^AP\d{11}$/.test(regNo)) {
          showBanner("Registration number must follow format AP followed by 11 digits (e.g. AP25110090188).");
          return;
        }

        if (!/^[a-z0-9._%+-]+@srmap\.edu\.in$/i.test(email)) {
          showBanner("Must use an official SRM AP email address (@srmap.edu.in).");
          return;
        }

        const faculty = faculties.find(f => f.id === mentorId);
        const assignedTrack = faculty && Array.isArray(faculty.tracks)
          ? (faculty.tracks.find(t => t.year === academicYear) || faculty.tracks[0])
          : null;

        const trackId = assignedTrack ? assignedTrack.id : "c2t-y1-aimlf";
        const trackName = assignedTrack ? assignedTrack.name : "Code2Think";
        const section = assignedTrack ? assignedTrack.section : "AIML-F";

        const submitBtn = form.querySelector('button[type="submit"]');
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = "Validating...";
        }

        try {
          const res = await API.studentLogin({
            name,
            regNo,
            email,
            academicYear,
            mentorId
          });

          if (res.success) {
            const session = {
              role: "student",
              studentId: regNo,
              regNo,
              name,
              email,
              academicYear,
              section,
              mentorId,
              mentorName: faculty ? faculty.name : "Faculty Mentor",
              trackId,
              trackName
            };

            saveSession(session);
            if (typeof onProceed === "function") {
              await onProceed(session);
            } else {
              window.location.reload();
            }
          } else {
            showBanner(res.error || "Student validation failed.");
          }
        } catch (err) {
          showBanner(err.message || "Failed to contact validation server.");
        } finally {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = "Enter DevArena";
          }
        }

      /* ── Faculty Flow ── */
      } else {
        const email = (facultyEmailInput?.value || facultySelectField?.value || "").trim().toLowerCase();
        const password = facultyPasswordInput?.value.trim();

        if (!email || !password) {
          showBanner("Please select your account and enter your password.");
          return;
        }

        const submitBtn = form.querySelector('button[type="submit"]');
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = "Authenticating...";
        }

        try {
          const res = await API.facultyAuth(email, password, "faculty");

          if (res.success) {
            const f = res.faculty;
            const session = {
              role: f.role || "faculty",
              facultyId: f.id,
              name: f.name,
              email: f.email,
              title: f.title
            };

            saveSession(session);
            if (typeof onProceed === "function") {
              await onProceed(session);
            } else {
              window.location.reload();
            }
          } else {
            showBanner(res.error || "Invalid faculty credentials.");
          }
        } catch (err) {
          showBanner(err.message || "Server authentication error.");
        } finally {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = "Enter DevArena";
          }
        }
      }
    });
  }
}

// Backwards-compatibility alias
export const initAuth = (portalConfig) => initOnboarding(portalConfig, () => window.location.reload());
