import { AppError } from "../middleware/errorHandler.js";

export function requireString(value, field) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new AppError(400, "VALIDATION_ERROR", `${field} is required.`);
  }
  return value.trim();
}

/**
 * Accepts:
 *  - https://gitlab.com/namespace/project(.git)
 *  - https://gitlab.company.com/group/subgroup/project
 *  - git@gitlab.com:namespace/project.git
 *  - file:///path/to/repo (local fixture repos, used for testing/dev)
 */
export function isValidGitLabUrl(url) {
  if (typeof url !== "string" || url.trim().length === 0) return false;
  const trimmed = url.trim();

  if (trimmed.startsWith("file://")) {
    return trimmed.length > "file://".length;
  }

  if (/^git@[^:]+:[^/]+\/.+/.test(trimmed)) {
    return true;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
    const pathSegments = parsed.pathname.replace(/\.git$/, "").split("/").filter(Boolean);
    return pathSegments.length >= 2;
  } catch {
    return false;
  }
}

export function requireGitLabUrl(url) {
  const trimmed = requireString(url, "GitLab repository URL");
  if (!isValidGitLabUrl(trimmed)) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "GitLab repository URL must look like https://gitlab.example.com/namespace/project.",
    );
  }
  return trimmed;
}

const HTTP_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);

function cleanOptionalString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

/**
 * Validates a user-declared API annotation (spec: let the user tell the
 * system about an endpoint themselves, including ones the parser can't
 * see - behind a gateway, undocumented in code, etc.). Everything but
 * the name is optional - a user may only know the route path, or only
 * want to flag that an endpoint requires auth, without filling in every
 * field.
 */
export function validateApiAnnotationPayload(payload = {}) {
  const name = requireString(payload.name, "Endpoint name");

  const httpMethod = cleanOptionalString(payload.httpMethod)?.toUpperCase();
  if (httpMethod && !HTTP_METHODS.has(httpMethod)) {
    throw new AppError(400, "VALIDATION_ERROR", `Unknown HTTP method "${httpMethod}".`);
  }

  const requiredRoles = Array.isArray(payload.requiredRoles)
    ? payload.requiredRoles.filter((r) => typeof r === "string" && r.trim()).map((r) => r.trim())
    : [];

  return {
    name,
    httpMethod,
    routePath: cleanOptionalString(payload.routePath),
    authRequired: Boolean(payload.authRequired),
    authMechanism: cleanOptionalString(payload.authMechanism),
    requiredRoles,
    notes: cleanOptionalString(payload.notes),
    referencePath: cleanOptionalString(payload.referencePath),
  };
}
