import { authService } from "../services/auth.service.js";
import { AppError } from "./errorHandler.js";

function extractToken(req) {
  const header = req.get("authorization");
  if (header && header.startsWith("Bearer ")) {
    return header.slice("Bearer ".length).trim();
  }
  // The browser's native EventSource (used for live job-progress
  // streaming, GET .../jobs/:jobId/events) can't set a custom
  // Authorization header, so that one caller passes the token as a
  // query param instead. Every other client call goes through axios
  // with a real header, so this fallback is only ever exercised there -
  // and that path is excluded from access logs (see app.js) specifically
  // because of this.
  if (typeof req.query?.token === "string" && req.query.token.length > 0) {
    return req.query.token;
  }
  return null;
}

/** Real session authentication - replaces the old fixed-identity
 * mockAuth. Resolves the bearer token to a real, Postgres-persisted user
 * and attaches it to req.user exactly the same shape mockAuth used to
 * (`{ id, tenantId }`, plus name/email now available too), so none of
 * the downstream ownership/tenant-scoping logic needed to change. */
export async function authenticate(req, _res, next) {
  const token = extractToken(req);
  if (!token) {
    next(new AppError(401, "UNAUTHENTICATED", "Sign in to continue."));
    return;
  }

  const user = await authService.getSessionUser(token);
  if (!user) {
    next(new AppError(401, "UNAUTHENTICATED", "Your session has expired - sign in again."));
    return;
  }

  req.user = { id: user.id, tenantId: user.tenantId, name: user.name, email: user.email };
  next();
}
