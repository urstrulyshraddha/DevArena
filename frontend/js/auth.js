// auth.js — Role switcher, registration/email validation, password gate, universal custom dropdowns, session persistence & Google Sheets integration

import { API } from './api.js';

const SESSION_KEY = "devarena.session";
const REGNO_PATTERN = /^AP\d{11}$/i;
const SRM_EMAIL_PATTERN = /^[a-z0-9._%+-]+@srmap\.edu\.in$/i;

export function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

function findTrack(portalData, facultyId, trackId) {
  const faculty = portalData.faculties.find((f) => f.id === facultyId);
  if (!faculty) return null;
  const track = faculty.tracks.find((t) => t.id === trackId);
  if (!track) return null;
  return { faculty, track };
}

/* ==========================================================================
   UNIVERSAL CUSTOM FLOATING DROPDOWN ENGINE (NO NATIVE OS MENUS)
   ========================================================================== */
export function enhanceSelect(selectEl) {
  if (!selectEl || selectEl.dataset.enhanced === "true") return;
  selectEl.dataset.enhanced = "true";
  selectEl.style.display = "none"; // Hide native select completely

  const wrapper = document.createElement("div");
  wrapper.className = "custom-select-wrapper";
  if (selectEl.classList.contains("faculty-select")) {
    wrapper.classList.add("custom-select--faculty");
  }
  if (selectEl.id === "langSelect") {
    wrapper.classList.add("custom-select--compact");
  }

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "custom-select-trigger";

  const getSelectedText = () => {
    const opt = selectEl.options[selectEl.selectedIndex];
    return opt && opt.textContent ? opt.textContent : "Select...";
  };

  trigger.innerHTML = `<span class="custom-select-label">${getSelectedText()}</span>`;

  const menu = document.createElement("div");
  menu.className = "custom-select-menu";

  function renderOptions() {
    menu.innerHTML = "";
    Array.from(selectEl.options).forEach((opt, idx) => {
      if (opt.disabled && !opt.value) return; // skip initial placeholder
      const item = document.createElement("div");
      item.className = "custom-select-option" + (opt.selected ? " is-selected" : "");
      item.textContent = opt.textContent;

      item.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        selectEl.selectedIndex = idx;
        trigger.querySelector(".custom-select-label").textContent = opt.textContent;
        menu.querySelectorAll(".custom-select-option").forEach((o) => o.classList.remove("is-selected"));
        item.classList.add("is-selected");
        wrapper.classList.remove("is-open");
        selectEl.dispatchEvent(new Event("change", { bubbles: true }));
      });
      menu.appendChild(item);
    });
  }

  renderOptions();

  trigger.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const isOpen = wrapper.classList.contains("is-open");
    document.querySelectorAll(".custom-select-wrapper.is-open").forEach((w) => w.classList.remove("is-open"));
    if (!isOpen) wrapper.classList.add("is-open");
  });

  // Watch for dynamic DOM option updates inside the hidden native select
  const observer = new MutationObserver(() => {
    renderOptions();
    trigger.querySelector(".custom-select-label").textContent = getSelectedText();
  });
  observer.observe(selectEl, { childList: true, subtree: true });

  wrapper.appendChild(trigger);
  wrapper.appendChild(menu);
  selectEl.parentNode.insertBefore(wrapper, selectEl.nextSibling);
}

export function enhanceAllSelects() {
  document.querySelectorAll("select").forEach((el) => enhanceSelect(el));
}

// Global click outside listener to collapse all custom dropdown menus
document.addEventListener("click", () => {
  document.querySelectorAll(".custom-select-wrapper.is-open").forEach((w) => w.classList.remove("is-open"));
});

/* ==========================================================================
   ONBOARDING GATEWAY & AUTHENTICATION
   ========================================================================== */
export function initOnboarding(portalData, onComplete) {
  const overlay = document.getElementById("onboardingOverlay");
  const roleTabs = document.querySelectorAll(".role-tab");
  const studentFields = document.getElementById("studentFields");
  const facultyFields = document.getElementById("facultyFields");
  const form = document.getElementById("onboardingForm");
  const banner = document.getElementById("formBanner");
  const routePreview = document.getElementById("routePreview");
  const routePreviewText = document.getElementById("routePreviewText");

  const mentorSelect = document.getElementById("mentorSelect");
  const trackSelect = document.getElementById("yearSelect"); // Repurposed for Section/Track
  const facultySelect = document.getElementById("facultySelectField");
  const facultyEmailInput = document.getElementById("facultyEmailInput");
  const facultyPasswordInput = document.getElementById("facultyPasswordInput");
  const togglePasswordBtn = document.getElementById("togglePasswordBtn");

  let currentRole = "student";

  // Password visibility eye toggle
  if (togglePasswordBtn && facultyPasswordInput) {
    togglePasswordBtn.addEventListener("click", () => {
      const isPassword = facultyPasswordInput.getAttribute("type") === "password";
      facultyPasswordInput.setAttribute("type", isPassword ? "text" : "password");
      togglePasswordBtn.style.color = isPassword ? "var(--accent-forest)" : "var(--text-muted)";
    });
  }

  // 1. Force label update robustly
  document.querySelectorAll('label, span, div, p').forEach(el => {
    if (el.childNodes.length === 1 && el.textContent.trim() === "Academic Year") {
      el.textContent = "Section / Track";
    }
  });

  // 2. Populate mentor dropdown
  mentorSelect.innerHTML = '<option value="" disabled selected>Select mentor</option>';
  portalData.faculties
    .filter((f) => f.role !== "admin")
    .forEach((f) => {
      const opt = document.createElement("option");
      opt.value = f.id;
      opt.textContent = `${f.name} — ${f.title}`;
      mentorSelect.appendChild(opt);
    });

  // 3. Set track placeholder BEFORE custom select initialization
  trackSelect.innerHTML = '<option value="" disabled selected>← Select mentor first</option>';

  // 4. Dynamically load tracks based on the mentor selected
  mentorSelect.addEventListener("change", () => {
    const facultyId = mentorSelect.value;
    const faculty = portalData.faculties.find((f) => f.id === facultyId);

    trackSelect.innerHTML = '<option value="" disabled selected>Select your section...</option>';

    if (faculty && faculty.tracks) {
      faculty.tracks.forEach((t) => {
        const opt = document.createElement("option");
        opt.value = t.id;
        opt.textContent = `${t.name} (${t.year})`;
        trackSelect.appendChild(opt);
      });
    }

    enhanceAllSelects(); // Force custom UI to re-render the new options
    updateRoutePreview();
  });

  // 5. Populate faculty / admin accounts dropdown
  if (facultySelect) {
    facultySelect.innerHTML = '<option value="" disabled selected>Select your account</option>';
    portalData.faculties.forEach((f) => {
      const opt = document.createElement("option");
      opt.value = f.id;
      opt.textContent = `${f.name} (${f.title})`;
      facultySelect.appendChild(opt);
    });
  }

  // Init custom dropdowns for the first time
  enhanceAllSelects();

  function setRole(role) {
    currentRole = role;
    roleTabs.forEach((t) => t.classList.toggle("active", t.dataset.role === role));
    studentFields.hidden = role !== "student";
    facultyFields.hidden = role !== "faculty";
    banner.classList.remove("visible");
    updateRoutePreview();
  }

  roleTabs.forEach((tab) => {
    tab.addEventListener("click", () => setRole(tab.dataset.role));
  });

  function updateRoutePreview() {
    if (currentRole !== "student") {
      routePreview.classList.remove("visible");
      return;
    }
    const facultyId = mentorSelect.value;
    const trackId = trackSelect.value;
    if (!facultyId || !trackId) {
      routePreview.classList.remove("visible");
      return;
    }
    const match = findTrack(portalData, facultyId, trackId);
    if (match) {
      routePreviewText.textContent = `You will join "${match.track.name}" under ${match.faculty.name}.`;
      routePreview.classList.add("visible");
    } else {
      routePreviewText.textContent = `Invalid track selection.`;
      routePreview.classList.add("visible");
    }
  }

  trackSelect.addEventListener("change", updateRoutePreview);

  function setFieldError(id, message) {
    const el = document.getElementById(id);
    if (el) el.textContent = message || "";
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    banner.classList.remove("visible");

    const submitBtn = form.querySelector('button[type="submit"]') || form.querySelector('.submit-btn');
    const originalBtnText = submitBtn ? submitBtn.textContent : "Enter";

    if (currentRole === "student") {
      const regNo = document.getElementById("regNoInput").value.trim().toUpperCase();
      const email = document.getElementById("emailInput").value.trim();
      const name = document.getElementById("nameInput").value.trim();
      const trackId = trackSelect.value;
      const facultyId = mentorSelect.value;

      let valid = true;
      if (!name) { setFieldError("nameError", "Enter your full name."); valid = false; } else setFieldError("nameError", "");
      if (!REGNO_PATTERN.test(regNo)) { setFieldError("regNoError", "Enter a valid registration number (e.g. AP21110010045)."); valid = false; } else setFieldError("regNoError", "");
      if (!SRM_EMAIL_PATTERN.test(email)) { setFieldError("emailError", "Use your official @srmap.edu.in email."); valid = false; } else setFieldError("emailError", "");
      if (!trackId) { setFieldError("yearError", "Select your section/track."); valid = false; } else setFieldError("yearError", "");
      if (!facultyId) { setFieldError("mentorError", "Select your faculty mentor."); valid = false; } else setFieldError("mentorError", "");
      if (!valid) return;

      const match = findTrack(portalData, facultyId, trackId);
      if (!match) {
        banner.textContent = `Track setup error.`;
        banner.classList.add("visible");
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Verifying with SRM Gateway...";
      }

      try {
        const response = await API.studentLogin({
          name,
          regNo: regNo,
          email: email.toLowerCase(),
          academicYear: match.track.year, // Safe extract from validated track object
          mentorId: facultyId
        });

        if (!response.success) {
          banner.textContent = response.error || "Gateway validation failed.";
          banner.classList.add("visible");
          return;
        }

        const session = {
          role: "student",
          studentId: response.student?.studentId || regNo,
          regNo: regNo,
          name,
          email: email.toLowerCase(),
          year: match.track.year,
          mentorId: facultyId,
          mentorName: match.faculty.name,
          trackId: match.track.id,
          trackName: match.track.name,
        };

        saveSession(session);
        overlay.setAttribute("hidden", "");
        onComplete(session);
      } catch (err) {
        banner.textContent = "Network error connecting to SRM DevArena backend.";
        banner.classList.add("visible");
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = originalBtnText;
        }
      }
    } else {
      const facultyId = facultySelect.value;
      const email = facultyEmailInput.value.trim();
      const password = facultyPasswordInput.value.trim();

      let valid = true;
      if (!facultyId) { setFieldError("facultySelectError", "Select your account from the list."); valid = false; } else setFieldError("facultySelectError", "");
      if (!SRM_EMAIL_PATTERN.test(email)) { setFieldError("facultyEmailError", "Enter your official @srmap.edu.in email."); valid = false; } else setFieldError("facultyEmailError", "");
      if (!password) { setFieldError("facultyPasswordError", "Password is required."); valid = false; } else setFieldError("facultyPasswordError", "");
      if (!valid) return;

      const account = portalData.faculties.find((f) => f.id === facultyId);
      if (!account) {
        banner.textContent = "Unauthorized account selection.";
        banner.classList.add("visible");
        return;
      }

      if (account.password !== password || account.email.toLowerCase() !== email.toLowerCase()) {
        banner.textContent = "Invalid faculty email or password. Access denied.";
        banner.classList.add("visible");
        return;
      }

      const session = {
        role: "faculty",
        facultyId: account.id,
        name: account.name,
        email: account.email,
        title: account.title,
        isAdmin: account.role === "admin",
        tracks: account.tracks.map((t) => ({ id: t.id, name: t.name, year: t.year })),
      };
      saveSession(session);
      overlay.setAttribute("hidden", "");
      onComplete(session);
    }
  });

  const existing = loadSession();
  if (existing) {
    overlay.setAttribute("hidden", "");
    onComplete(existing);
  } else {
    overlay.removeAttribute("hidden");
    setRole("student");
  }
}

export function initProfileBadge(session, { onLogout }) {
  const badge = document.getElementById("profileBadge");
  const dropdown = document.getElementById("profileDropdown");
  const menuBtn = document.getElementById("profileMenuBtn");
  const avatar = document.getElementById("profileAvatar");
  const nameEl = document.getElementById("profileName");
  const trackEl = document.getElementById("profileTrack");
  const logoutBtn = document.getElementById("logoutBtn");

  if (!badge) return;
  badge.hidden = false;

  const initials = (session.name || "?")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  avatar.textContent = initials || "?";
  nameEl.textContent = session.name;
  trackEl.textContent = session.role === "student" ? session.trackName : (session.isAdmin ? "Admin Console" : "Faculty Console");

  menuBtn.addEventListener("click", () => dropdown.classList.toggle("open"));
  document.addEventListener("click", (e) => {
    if (!badge.contains(e.target)) dropdown.classList.remove("open");
  });

  logoutBtn.addEventListener("click", () => {
    clearSession();
    onLogout();
  });
}
