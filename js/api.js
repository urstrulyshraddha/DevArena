/* ==========================================================================
   SRM DevArena — API Client (js/api.js)
   ========================================================================== */

const GAS_URL = "https://script.google.com/macros/s/AKfycbytb0Z89jwHHoqLpfBDZD4h0sd9VMWGomT6i5ymyNmFVSV6ky2Vec_sunrazRB3x4LaCg/exec";

/**
 * POST helper — sends action in both query param AND request body
 * so it works whether GAS inspects e.parameter or e.postData.contents.
 */
async function post(action, payload = {}) {
  const url = `${GAS_URL}?action=${encodeURIComponent(action)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify({
      action,
      ...payload
    }),
    mode: "cors",
    redirect: "follow"
  });

  const json = await res.json();
  if (json && json.success === false) {
    throw new Error(json.error || "Backend error");
  }
  return json;
}


/**
 * GET helper — encodes action + params into the query string.
 */
async function get(action, params = {}) {
  const qs = new URLSearchParams({ action, ...params }).toString();

  const res = await fetch(`${GAS_URL}?${qs}`, {
    mode: "cors",
    redirect: "follow"
  });

  const json = await res.json();
  if (json && json.success === false) {
    throw new Error(json.error || "Backend error");
  }
  return json;
}

export const API = {
  // Portal & Catalog
  getPortalConfig: () => get("getPortalConfig"),

  // Authentication
  studentLogin: (studentData) => post("studentLogin", studentData),
  facultyAuth: (email, password, role = "faculty") => post("facultyAuth", { email, password, role }),

  // Challenges & Tasks
  getChallenges: (trackId) => get("getChallenges", { trackId }),
  createTask: (taskData) => post("createTask", taskData),
  createTrack: (trackData) => post("createTrack", trackData),
  addFacultyCatalog: (payload) => post("addFacultyCatalog", payload),

  // Submissions & AI
  submitChallenge: (submissionData) => post("submitChallenge", submissionData),
  triggerBatchAI: (trackId) => post("triggerBatchAI", { trackId }),
  getSubmissions: (trackId) => get("getSubmissions", { trackId }),
  facultyGradeOverride: (trackId, regNo, challengeId, rawPoints) =>
    post("facultyGradeOverride", { trackId, regNo, challengeId, rawPoints }),

  // Leaderboard & Analytics
  getLeaderboard: (trackId) => get("getLeaderboard", { trackId }),
  getHistoricalAnalytics: () => get("getHistoricalAnalytics"),

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
