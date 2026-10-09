import { http, toApiError } from "./http.js";

export async function getKnowledgeBaseOverview(applicationId) {
  try {
    const res = await http.get(`/applications/${applicationId}/knowledge-base`);
    return res.data;
  } catch (err) {
    throw toApiError(err);
  }
}

export async function getKnowledgeBaseStats(applicationId) {
  try {
    const res = await http.get(`/applications/${applicationId}/knowledge-base/stats`);
    return res.data;
  } catch (err) {
    throw toApiError(err);
  }
}

export async function getKnowledgeGraph(applicationId, { search, nodeTypes, relationshipTypes, limit } = {}) {
  try {
    const res = await http.get(`/applications/${applicationId}/knowledge-base/graph`, {
      params: { search, nodeTypes, relationshipTypes, limit },
    });
    return res.data;
  } catch (err) {
    throw toApiError(err);
  }
}
