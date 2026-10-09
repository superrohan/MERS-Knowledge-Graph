import { http, toApiError } from "./http.js";

/**
 * Authorization requirements for an application's AA number - currently
 * dummy data from the backend stub (see
 * backend/src/services/authorization.service.js) until the real AA
 * Authorization Registry integration is wired up. Called whenever a
 * user requests to view an application (see pages/ApplicationPage.jsx),
 * the same way its other details are.
 */
export async function getAuthorizations(applicationId) {
  try {
    const res = await http.get(`/applications/${applicationId}/authorizations`);
    return res.data;
  } catch (err) {
    throw toApiError(err);
  }
}
