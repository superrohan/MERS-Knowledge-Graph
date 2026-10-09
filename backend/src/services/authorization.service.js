import { applicationService } from "./application.service.js";

/**
 * Looks up which authorizations an application's AA (AA/application
 * number, e.g. "AA-12345") is actually cleared for, so that can later be
 * cross-checked against what the code itself implements (does every
 * endpoint that should require, say, "payments-writer" actually enforce
 * it?). Called whenever a user requests an application's authorization
 * picture - see GET /api/applications/:id/authorizations - so it's a
 * normal part of viewing an application, not a one-off report.
 *
 * STUB: the real "AA Authorization Registry" isn't reachable yet, so
 * getAuthorizations() below returns fixed dummy data with the exact
 * shape the real integration is expected to return. The real fetch and
 * the code cross-check that would run on top of it are written out in
 * full at the bottom of this file, left commented out - wire them in
 * once that service's actual base URL/API contract exists.
 */
export class AuthorizationService {
  constructor({ applicationSvc = applicationService } = {}) {
    this.applicationService = applicationSvc;
  }

  /**
   * Returns the authorization requirements for an application's AA
   * number. Ownership-checked the same way every other application
   * sub-resource is (404s rather than leaking whether the id exists).
   */
  async getAuthorizations(applicationId, user) {
    const app = await this.applicationService.get(applicationId, user);

    // DUMMY DATA (active). Stands in for the real AA Authorization
    // Registry response (see fetchAuthorizationsFromRegistry() at the
    // bottom of this file) so the frontend/UI shape can be built and
    // exercised now, before that service is actually reachable.
    // `source: "dummy"` is a real, honest flag - never presented as a
    // fact the way a real fetch's result would be.
    return {
      aaNumber: app.aaNumber,
      source: "dummy",
      fetchedAt: new Date().toISOString(),
      authorizations: [
        {
          code: "AUTH_READ_CUSTOMER_DATA",
          name: "Read Customer Data",
          description: "Allows read access to customer PII fields.",
          requiredRole: "customer-data-reader",
        },
        {
          code: "AUTH_WRITE_PAYMENTS",
          name: "Process Payments",
          description: "Allows initiating payment transactions.",
          requiredRole: "payments-writer",
        },
        {
          code: "AUTH_ADMIN_OVERRIDE",
          name: "Admin Override",
          description: "Allows bypassing standard approval workflows.",
          requiredRole: "admin",
        },
      ],
    };
  }
}

export const authorizationService = new AuthorizationService();

// =====================================================================
// REAL INTEGRATION (commented out until the AA Authorization Registry
// is actually up - swap getAuthorizations()'s dummy `return` above for
// `return this.fetchAuthorizationsFromRegistry(app.aaNumber);` once this
// is live).
//
// Expected env vars (add to config/env.js alongside the other
// integration secrets when this is wired up):
//   AA_AUTHORIZATION_SERVICE_URL   e.g. https://aa-registry.internal
//   AA_AUTHORIZATION_SERVICE_KEY   an API key/token for that service
// =====================================================================
//
// import axios from "axios";
// import { env } from "../config/env.js";
//
// const aaAuthorizationClient = axios.create({
//   baseURL: env.aaAuthorizationServiceUrl,
//   timeout: 10000,
//   headers: { "X-Api-Key": env.aaAuthorizationServiceKey },
// });
//
// AuthorizationService.prototype.fetchAuthorizationsFromRegistry = async function (aaNumber) {
//   const res = await aaAuthorizationClient.get(`/aa/${encodeURIComponent(aaNumber)}/authorizations`);
//   // Expected real response shape (adjust to match the real contract
//   // once it's known - this mirrors the dummy shape above deliberately,
//   // so nothing downstream has to change):
//   //   { aaNumber, authorizations: [{ code, name, description, requiredRole }] }
//   return { ...res.data, source: "aa-authorization-registry", fetchedAt: new Date().toISOString() };
// };

// =====================================================================
// CROSS-CHECK AGAINST WHAT'S ACTUALLY IMPLEMENTED IN CODE (commented
// out - depends on the real fetch above being live). This is the "did
// the developer actually implement the authorization the AA requires,
// and did they implement it correctly" check the AA lookup exists to
// answer in the first place.
//
// Reuses the same graph data the API-extraction pipeline already
// produces (see code-intelligence's SymbolKind.API nodes / requiredRoles
// - app/domain/api_models.py) rather than re-deriving anything: an
// authorization requirement is only ever "implemented" if some detected
// API endpoint's own required_roles actually names it - the same "never
// fabricate, only report what the graph itself shows" rule the manual-
// annotation verification feature already follows (see
// api_annotation_verification.py on the Python side).
// =====================================================================
//
// import { codeIntelligenceClient } from "../clients/code-intelligence.client.js";
//
// AuthorizationService.prototype.verifyAuthorizationsAgainstCode = async function (applicationId, authorizationResult) {
//   const graph = await codeIntelligenceClient.getGraph(applicationId, { nodeTypes: "API", limit: 150 });
//   const apiNodes = graph.nodes.filter((n) => n.kind === "API" && n.api);
//
//   return authorizationResult.authorizations.map((requirement) => {
//     const enforcingEndpoints = apiNodes.filter((n) =>
//       (n.api.requiredRoles ?? []).includes(requirement.requiredRole),
//     );
//     let status;
//     if (enforcingEndpoints.length === 0) {
//       status = "not_implemented"; // the role never appears anywhere in the graph
//     } else if (enforcingEndpoints.every((n) => n.api.authRequired)) {
//       status = "implemented"; // every endpoint naming this role also requires auth
//     } else {
//       status = "partially_implemented"; // named, but not consistently auth-gated
//     }
//     return {
//       ...requirement,
//       status,
//       enforcingEndpoints: enforcingEndpoints.map((n) => ({
//         name: n.name,
//         filePath: n.filePath,
//         routePath: n.api.routePath,
//         httpMethod: n.api.httpMethod,
//       })),
//     };
//   });
// };
