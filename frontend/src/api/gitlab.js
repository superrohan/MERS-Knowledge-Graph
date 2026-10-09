import { http, toApiError } from "./http.js";

/** `accessToken` is only needed for a private repository - omit it (or
 * pass undefined) for a public one. Sent in the POST body, never a query
 * string, so it's never written to server access logs. */
export async function validateGitLabRepository({ repositoryUrl, accessToken }) {
  try {
    const res = await http.post("/gitlab/validate", { repositoryUrl, accessToken });
    return res.data;
  } catch (err) {
    throw toApiError(err);
  }
}
