/**
 * SRM DevArena - Unified API Client Service
 * Bridges Vanilla JS frontend to the Google Apps Script Web App.
 * Code execution delegated entirely to AI evaluation.
 */

const GAS_ENDPOINT = 'https://script.google.com/macros/s/AKfycbytb0Z89jwHHoqLpfBDZD4h0sd9VMWGomT6i5ymyNmFVSV6ky2Vec_sunrazRB3x4LaCg/exec';
const SESSION_KEY = 'devarena.session';

export const API = {
  getSession: () => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
  setSession: (user) => {
    try {
      const current = API.getSession() || {};
      localStorage.setItem(SESSION_KEY, JSON.stringify({ ...current, ...user }));
    } catch (e) {
      console.error('Session write error:', e);
    }
  },
  clearSession: () => localStorage.removeItem(SESSION_KEY),

  async post(action, payload = {}) {
    try {
      const response = await fetch(GAS_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action, ...payload })
      });
      return await response.json();
    } catch (err) {
      console.error(`API Error [POST ${action}]:`, err);
      throw err;
    }
  },

  async get(action, params = {}) {
    try {
      const query = new URLSearchParams({ action, ...params }).toString();
      const response = await fetch(`${GAS_ENDPOINT}?${query}`);
      return await response.json();
    } catch (err) {
      console.error(`API Error [GET ${action}]:`, err);
      throw err;
    }
  },

  async studentLogin(studentData) {
    const res = await this.post('studentLogin', studentData);
    if (res.success && res.student) {
      this.setSession(res.student);
    }
    return res;
  },

  async getChallenges(trackId) {
    return await this.get('getChallenges', { trackId });
  },

  // Final Submission (Code + Base64 PDF + Custom I/O to Drive & Sheets)
  async submitChallenge({ challengeId, studentId, trackId, language, code, pdfFile, studentInput, studentOutput }) {
    let pdfBase64 = null;
    let pdfFileName = null;

    if (pdfFile) {
      pdfFileName = pdfFile.name;
      pdfBase64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = (error) => reject(error);
        reader.readAsDataURL(pdfFile);
      });
    }

    return await this.post('submitChallenge', {
      challengeId,
      studentId,
      trackId,
      language,
      code,
      studentInput,
      studentOutput,
      pdfBase64,
      pdfFileName
    });
  },

  async getLeaderboard(trackId, userEmail) {
    return await this.get('getLeaderboard', { trackId, userEmail });
  },

  async getHistoricalAnalytics(userEmail) {
    return await this.get('getHistoricalAnalytics', { userEmail });
  },

  async triggerBatchAI(trackId) {
    return await this.post('triggerBatchAI', { trackId });
  },

  async facultyGradeOverride(submissionId, rawPoints) {
    return await this.post('facultyGradeOverride', {
      submissionId,
      rawPoints: parseFloat(rawPoints)
    });
  }
};
