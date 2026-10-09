import { http, toApiError } from "./http.js";

export async function getSource(applicationId, { path, startLine, endLine }) {
  try {
    const res = await http.get(`/applications/${applicationId}/source`, {
      params: { path, startLine, endLine },
    });
    return res.data;
  } catch (err) {
    throw toApiError(err);
  }
}
