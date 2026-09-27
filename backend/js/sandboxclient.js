/**
 * SRM DevArena - Sandbox Execution Client (Google Apps Script)
 */

// Replace with your public deployed runner URL (Render/Railway/VPS or ngrok for local)
const SANDBOX_BASE_URL = "https://your-runner-service.onrender.com";

function runSingleTestCase(language, code, stdin, expectedOutput) {
  const payload = {
    language: language.toLowerCase(),
    code: code,
    stdin: stdin || "",
    expectedOutput: expectedOutput || null,
    timeoutMs: 2000
  };

  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(`${SANDBOX_BASE_URL}/execute`, options);
  return JSON.parse(response.getContentText());
}

function runBatchTestCases(language, code, testCases) {
  const payload = {
    language: language.toLowerCase(),
    code: code,
    testCases: testCases, // [{ input: "...", expectedOutput: "..." }]
    timeoutMs: 2000
  };

  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(`${SANDBOX_BASE_URL}/execute-batch`, options);
  return JSON.parse(response.getContentText());
}
