import { http, toApiError } from "./http.js";

export async function submitQuery(applicationId, query) {
  try {
    const res = await http.post(`/applications/${applicationId}/query`, { query });
    return res.data;
  } catch (err) {
    throw toApiError(err);
  }
}

export async function getQueryHistory(applicationId) {
  try {
    const res = await http.get(`/applications/${applicationId}/query-history`);
    return res.data;
  } catch (err) {
    throw toApiError(err);
  }
}

export async function getQueryHistoryItem(applicationId, queryId) {
  try {
    const res = await http.get(`/applications/${applicationId}/query-history/${queryId}`);
    return res.data;
  } catch (err) {
    throw toApiError(err);
  }
}
