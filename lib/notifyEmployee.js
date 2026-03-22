/**
 * notifyEmployee — Universal Push Notification Utility
 * 
 * Sends a push notification to a specific employee via /api/push/send.
 * This is a client-side helper (fire-and-forget, non-blocking).
 * Failures are silently swallowed so they never interrupt user actions.
 * 
 * @param {string} employeeId - UUID of the target employee
 * @param {string} title      - Notification title (max ~50 chars)
 * @param {string} body       - Notification body (max ~120 chars)
 * @param {string} url        - Deep-link URL to open on tap (e.g. '/tasks')
 */
export function notifyEmployee(employeeId, title, body, url = '/notifications') {
  if (!employeeId) return; // Guard: no ID, no request
  
  fetch('/api/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ assigned_to: employeeId, title, body, url })
  }).catch(() => {}); // Non-blocking: push failure must NEVER interrupt the primary action
}

/**
 * notifyAll — Notify multiple employees at once (fire-and-forget)
 * @param {string[]} employeeIds - Array of employee UUIDs
 */
export function notifyAll(employeeIds = [], title, body, url = '/notifications') {
  if (!employeeIds?.length) return;
  employeeIds.forEach(id => notifyEmployee(id, title, body, url));
}
