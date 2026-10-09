import { http, toApiError } from "./http.js";

export async function listApplications() {
  try {
    const res = await http.get("/applications");
    return res.data;
  } catch (err) {
    throw toApiError(err);
  }
}

export async function getApplication(id) {
  try {
    const res = await http.get(`/applications/${id}`);
    return res.data;
  } catch (err) {
    throw toApiError(err);
  }
}

export async function createApplication(payload) {
  try {
    const res = await http.post("/applications", payload);
    return res.data;
  } catch (err) {
    throw toApiError(err);
  }
}

export async function deleteApplication(id) {
  try {
    await http.delete(`/applications/${id}`);
  } catch (err) {
    throw toApiError(err);
  }
}
