import { http, toApiError } from "./http.js";

export async function listApiAnnotations(applicationId) {
  try {
    const res = await http.get(`/applications/${applicationId}/api-annotations`);
    return res.data;
  } catch (err) {
    throw toApiError(err);
  }
}

export async function createApiAnnotation(applicationId, payload) {
  try {
    const res = await http.post(`/applications/${applicationId}/api-annotations`, payload);
    return res.data;
  } catch (err) {
    throw toApiError(err);
  }
}

export async function updateApiAnnotation(applicationId, annotationId, payload) {
  try {
    const res = await http.put(`/applications/${applicationId}/api-annotations/${annotationId}`, payload);
    return res.data;
  } catch (err) {
    throw toApiError(err);
  }
}

export async function deleteApiAnnotation(applicationId, annotationId) {
  try {
    await http.delete(`/applications/${applicationId}/api-annotations/${annotationId}`);
  } catch (err) {
    throw toApiError(err);
  }
}

export async function verifyApiAnnotation(applicationId, annotationId) {
  try {
    const res = await http.post(`/applications/${applicationId}/api-annotations/${annotationId}/verify`);
    return res.data;
  } catch (err) {
    throw toApiError(err);
  }
}
