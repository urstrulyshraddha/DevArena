/* ==========================================================================
   SRM DevArena — API Client (js/api.js)
   Robust backend communication with automatic retry and cold-start protection
   ========================================================================== */

const GAS_URL = "https://script.google.com/macros/s/AKfycbytb0Z89jwHHoqLpfBDZD4h0sd9VMWGomT6i5ymyNmFVSV6ky2Vec_sunrazRB3x4LaCg/exec";

/**
 * Resilient fetch wrapper handling GAS cold starts, HTML error redirects,
 * and transient rate-limit (429/503) drops.
 */
async function fetchWithRetry(url, options = {}, retries = 3, delay = 1000) {
  try {
    const res = await fetch(url, {
      ...options,
      mode: "cors",
      redirect: "follow"
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const text = await res.text();

    // Catch Google Apps Script HTML error redirects or permission warnings
    if (text.trim().startsWith("<")) {
      throw new Error("Server returned HTML redirect instead of JSON (Apps Script cold start or auth redirect)");
    }

    const json = JSON.parse(text);
    if (json && json.success === false) {
      throw new Error(json.error || "Backend error");
    }

    return json;
  } catch (err) {
    if (retries > 0) {
      console.warn(`[DevArena API] Request to ${url.slice(0, 70)}... failed: ${err.message}. Retrying in ${delay}ms (${retries} retries left)...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return fetchWithRetry(url, options, retries - 1, delay * 1.5);
    }
    throw err;
  }
}

/**
 * POST helper — sends action in query param AND request body
 * so it works whether GAS inspects e.parameter or e.postData.contents.
 */
async function post(action, payload = {}) {
  const url = `${GAS_URL}?action=${encodeURIComponent(action)}`;

  return fetchWithRetry(url, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify({
      action,
      ...payload
    })
  });
}

/**
 * GET helper — encodes action + params into the query string.
 */
async function get(action, params = {}) {
  const qs = new URLSearchParams({ action, ...params }).toString();
  return fetchWithRetry(`${GAS_URL}?${qs}`, {
    method: "GET"
  });
}

export const API = {
  // Portal & Catalog
  getPortalConfig: () => get("getPortalConfig"),

  // Authentication (Guarantees trackId is explicitly sent to GAS)
  studentLogin: (studentData) => {
    const payload = typeof studentData === "object" ? {
      name: studentData.name,
      regNo: studentData.regNo,
      email: studentData.email,
      academicYear: studentData.academicYear,
      mentorId: studentData.mentorId,
      trackId: studentData.trackId || studentData.track || ""
    } : {};
    return post("studentLogin", payload);
  },

  facultyAuth: (email, password, role = "faculty") => post("facultyAuth", { email, password, role }),

  // Challenges & Tasks
  getChallenges: (trackId) => get("getChallenges", { trackId }),
  createTask: (taskData) => post("createTask", taskData),
  createTrack: (trackData) => post("createTrack", trackData),
  addFacultyCatalog: (payload) => post("addFacultyCatalog", payload),
  revokeFaculty: (facultyId, email) => post("revokeFaculty", { facultyId, email }),
  updateTask: (taskData) => post("updateTask", taskData),
  deleteTask: (challengeId, trackId) => post("deleteTask", { challengeId, trackId }),
  getFacultyGradebook: (payload) => post("getFacultyGradebook", payload),
  getStudentSubmissionReport: (trackId, regNo, challengeId) => post("getStudentSubmissionReport", { trackId, regNo, challengeId }),
  requestReEvaluation: (trackId, regNo, challengeId, reason) => post("requestReEvaluation", { trackId, regNo, challengeId, reason }),
  exportTrackGradebook: (trackId, facultyId) => post("exportTrackGradebook", { trackId, facultyId }),

  // Submissions & AI
  submitChallenge: (submissionData) => post("submitChallenge", submissionData),
  triggerBatchAI: (trackId) => post("triggerBatchAI", { trackId }),
  getSubmissions: (trackId) => get("getSubmissions", { trackId }),
  facultyGradeOverride: (payload) => post("facultyGradeOverride", payload),

  // Leaderboard & Analytics
  getLeaderboard: (trackId, email) => get("getLeaderboard", { trackId, email: email || "" }),
  getHistoricalAnalytics: (email) => get("getHistoricalAnalytics", { email }),


  submitFeedback: (payload) => post("submitFeedback", payload),
    getFeedbackReports: (adminRole) => post("getFeedbackReports", { role: adminRole }),
    updateFeedbackStatus: (adminRole, ticketId, newStatus) => post("updateFeedbackStatus", { role: adminRole, ticketId, newStatus }),

  // Helper utility for file uploads
  fileToBase64: (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64String = reader.result.split(",")[1];
        resolve(base64String);
      };
      reader.onerror = (error) => reject(error);
      reader.readAsDataURL(file);
    });
  }
};
