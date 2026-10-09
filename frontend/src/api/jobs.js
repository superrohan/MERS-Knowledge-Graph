import { getStoredSession } from "./authStorage.js";
import { http, toApiError } from "./http.js";

export async function startIndexing(applicationId) {
  try {
    const res = await http.post(`/applications/${applicationId}/index`);
    return res.data;
  } catch (err) {
    throw toApiError(err);
  }
}

export async function getJob(applicationId, jobId) {
  try {
    const res = await http.get(`/applications/${applicationId}/jobs/${jobId}`);
    return res.data;
  } catch (err) {
    throw toApiError(err);
  }
}

export async function cancelJob(applicationId, jobId) {
  try {
    const res = await http.post(`/applications/${applicationId}/jobs/${jobId}/cancel`);
    return res.data;
  } catch (err) {
    throw toApiError(err);
  }
}

export function jobEventsUrl(applicationId, jobId) {
  const base = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api";
  // The browser's native EventSource can't set an Authorization header,
  // so this one endpoint accepts the session token as a query param
  // instead (see backend/src/middleware/auth.js) - every other request
  // goes through the http.js interceptor's real header.
  const token = getStoredSession()?.token;
  const query = token ? `?token=${encodeURIComponent(token)}` : "";
  return `${base}/applications/${applicationId}/jobs/${jobId}/events${query}`;
}
