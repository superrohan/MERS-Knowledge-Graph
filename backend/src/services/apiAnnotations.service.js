import { codeIntelligenceClient } from "../clients/code-intelligence.client.js";
import { applicationService } from "./application.service.js";
import { validateApiAnnotationPayload } from "../utils/validation.js";

function toPythonPayload(clean) {
  return {
    name: clean.name,
    http_method: clean.httpMethod,
    route_path: clean.routePath,
    auth_required: clean.authRequired,
    auth_mechanism: clean.authMechanism,
    required_roles: clean.requiredRoles,
    notes: clean.notes,
    reference_path: clean.referencePath,
  };
}

/**
 * Lets a user declare information about an API endpoint themselves -
 * including one the parser can't see (behind a gateway, undocumented in
 * code) - and have it show up in the graph/query answers exactly like a
 * parser-detected one (see ManualApiAnnotationService on the Python
 * side). Available on any application the caller owns, indexed or not -
 * annotations aren't tied to a completed index run.
 */
export class ApiAnnotationsService {
  constructor({ applicationSvc = applicationService, ciClient = codeIntelligenceClient } = {}) {
    this.applicationService = applicationSvc;
    this.codeIntelligenceClient = ciClient;
  }

  async list(applicationId, user) {
    await this.applicationService.get(applicationId, user); // ownership check
    return this.codeIntelligenceClient.listApiAnnotations(applicationId);
  }

  async create(applicationId, user, payload) {
    await this.applicationService.get(applicationId, user);
    const clean = validateApiAnnotationPayload(payload);
    return this.codeIntelligenceClient.createApiAnnotation(applicationId, toPythonPayload(clean));
  }

  async update(applicationId, annotationId, user, payload) {
    await this.applicationService.get(applicationId, user);
    const clean = validateApiAnnotationPayload(payload);
    return this.codeIntelligenceClient.updateApiAnnotation(applicationId, annotationId, toPythonPayload(clean));
  }

  async delete(applicationId, annotationId, user) {
    await this.applicationService.get(applicationId, user);
    return this.codeIntelligenceClient.deleteApiAnnotation(applicationId, annotationId);
  }

  /** Re-checks a declaration against the code graph without changing any
   * declared field - e.g. after a re-index surfaces a matching endpoint
   * that didn't exist yet when this was first declared. */
  async verify(applicationId, annotationId, user) {
    await this.applicationService.get(applicationId, user);
    return this.codeIntelligenceClient.verifyApiAnnotation(applicationId, annotationId);
  }
}

export const apiAnnotationsService = new ApiAnnotationsService();
