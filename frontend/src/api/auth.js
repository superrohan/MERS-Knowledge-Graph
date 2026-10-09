import { http, toApiError } from "./http.js";

export async function register({ name, email, password }) {
  try {
    const res = await http.post("/auth/register", { name, email, password });
    return res.data;
  } catch (err) {
    throw toApiError(err);
  }
}

export async function login({ email, password }) {
  try {
    const res = await http.post("/auth/login", { email, password });
    return res.data;
  } catch (err) {
    throw toApiError(err);
  }
}

export async function logout() {
  try {
    await http.post("/auth/logout");
  } catch (err) {
    throw toApiError(err);
  }
}
