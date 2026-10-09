import axios from "axios";

import { getStoredSession, setStoredSession } from "./authStorage.js";

const baseURL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api";

export const http = axios.create({
  baseURL,
  timeout: 15000,
});

// Every request carries the current session's bearer token, read fresh
// each time (not captured once at module load) so logging in/out in the
// same tab takes effect immediately without recreating this instance.
http.interceptors.request.use((config) => {
  const session = getStoredSession();
  if (session?.token) {
    config.headers.Authorization = `Bearer ${session.token}`;
  }
  return config;
});

// A 401 means the session is gone (expired, logged out elsewhere, or
// never existed) - clear it and let AuthProvider's listener (see
// context/AuthContext.jsx) update React state, which the route guard
// then turns into a redirect to /login. Never touches the DOM/router
// directly from here - this module doesn't know about React Router.
http.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      setStoredSession(null);
      window.dispatchEvent(new Event("auth:unauthorized"));
    }
    return Promise.reject(error);
  },
);

/**
 * Normalizes an axios error into the shape our UI expects, so components
 * never need to know whether a failure came from the network, a 4xx
 * validation error, or a 5xx server error.
 */
export function toApiError(error) {
  if (error.response) {
    const body = error.response.data?.error;
    return {
      status: error.response.status,
      code: body?.code ?? "UNKNOWN_ERROR",
      message: body?.message ?? "The server returned an unexpected error.",
      requestId: body?.requestId,
    };
  }
  if (error.request) {
    return {
      status: 0,
      code: "NETWORK_ERROR",
      message: "Could not reach the server. Check your connection and try again.",
    };
  }
  return { status: 0, code: "UNKNOWN_ERROR", message: error.message ?? "Something went wrong." };
}
