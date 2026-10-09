import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/clients/code-intelligence.client.js", () => ({
  codeIntelligenceClient: {
    listApiAnnotations: vi.fn(),
    createApiAnnotation: vi.fn(),
    updateApiAnnotation: vi.fn(),
    deleteApiAnnotation: vi.fn(),
    verifyApiAnnotation: vi.fn(),
  },
}));

import { codeIntelligenceClient } from "../src/clients/code-intelligence.client.js";
import { createApp } from "../src/app.js";
import { applicationRepository } from "../src/repositories/application.repository.js";
import { registerTestUser } from "./helpers/authUser.js";

const app = createApp();
let authHeader;

async function createApplication() {
  const res = await request(app)
    .post("/api/applications")
    .set("Authorization", authHeader)
    .send({
      name: "Payment Platform",
      aaNumber: "AA-1",
      repositoryUrl: "https://gitlab.com/team/payment-platform",
    });
  return res.body.id;
}

beforeEach(async () => {
  await applicationRepository.clear();
  vi.clearAllMocks();
  ({ authHeader } = await registerTestUser(app));
});

describe("Manual API annotations", () => {
  it("lists annotations for an owned application", async () => {
    const appId = await createApplication();
    codeIntelligenceClient.listApiAnnotations.mockResolvedValue([
      { id: "manual_1", name: "Refund", httpMethod: "POST", routePath: "/refund" },
    ]);

    const res = await request(app).get(`/api/applications/${appId}/api-annotations`).set("Authorization", authHeader);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(codeIntelligenceClient.listApiAnnotations).toHaveBeenCalledWith(appId);
  });

  it("creates an annotation, forwarding validated + normalized fields to the code intelligence service", async () => {
    const appId = await createApplication();
    codeIntelligenceClient.createApiAnnotation.mockResolvedValue({ id: "manual_1", name: "Refund Payment" });

    const res = await request(app)
      .post(`/api/applications/${appId}/api-annotations`)
      .set("Authorization", authHeader)
      .send({
        name: "Refund Payment",
        httpMethod: "post",
        routePath: "/payments/{id}/refund",
        authRequired: true,
        authMechanism: "jwt",
        requiredRoles: ["admin", "  "],
        notes: "Gated behind the API gateway - not visible to the parser.",
      });

    expect(res.status).toBe(201);
    expect(codeIntelligenceClient.createApiAnnotation).toHaveBeenCalledWith(appId, {
      name: "Refund Payment",
      http_method: "POST",
      route_path: "/payments/{id}/refund",
      auth_required: true,
      auth_mechanism: "jwt",
      required_roles: ["admin"],
      notes: "Gated behind the API gateway - not visible to the parser.",
      reference_path: undefined,
    });
  });

  it("rejects an annotation with no name", async () => {
    const appId = await createApplication();
    const res = await request(app)
      .post(`/api/applications/${appId}/api-annotations`)
      .set("Authorization", authHeader)
      .send({ httpMethod: "GET" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(codeIntelligenceClient.createApiAnnotation).not.toHaveBeenCalled();
  });

  it("rejects an unrecognized HTTP method", async () => {
    const appId = await createApplication();
    const res = await request(app)
      .post(`/api/applications/${appId}/api-annotations`)
      .set("Authorization", authHeader)
      .send({ name: "X", httpMethod: "FETCH" });
    expect(res.status).toBe(400);
  });

  it("updates an annotation", async () => {
    const appId = await createApplication();
    codeIntelligenceClient.updateApiAnnotation.mockResolvedValue({ id: "manual_1", name: "Refund Payment (v2)" });

    const res = await request(app)
      .put(`/api/applications/${appId}/api-annotations/manual_1`)
      .set("Authorization", authHeader)
      .send({ name: "Refund Payment (v2)" });

    expect(res.status).toBe(200);
    expect(codeIntelligenceClient.updateApiAnnotation).toHaveBeenCalledWith(
      appId,
      "manual_1",
      expect.objectContaining({ name: "Refund Payment (v2)" }),
    );
  });

  it("deletes an annotation", async () => {
    const appId = await createApplication();
    codeIntelligenceClient.deleteApiAnnotation.mockResolvedValue(undefined);

    const res = await request(app)
      .delete(`/api/applications/${appId}/api-annotations/manual_1`)
      .set("Authorization", authHeader);

    expect(res.status).toBe(204);
    expect(codeIntelligenceClient.deleteApiAnnotation).toHaveBeenCalledWith(appId, "manual_1");
  });

  it("re-verifies an annotation against the code graph", async () => {
    const appId = await createApplication();
    codeIntelligenceClient.verifyApiAnnotation.mockResolvedValue({
      id: "manual_1",
      verificationStatus: "confirmed",
      verificationNotes: "Matches the endpoint detected at src/routes.py.",
    });

    const res = await request(app)
      .post(`/api/applications/${appId}/api-annotations/manual_1/verify`)
      .set("Authorization", authHeader);

    expect(res.status).toBe(200);
    expect(res.body.verificationStatus).toBe("confirmed");
    expect(codeIntelligenceClient.verifyApiAnnotation).toHaveBeenCalledWith(appId, "manual_1");
  });

  it("404s for an application the caller doesn't own / doesn't exist", async () => {
    const res = await request(app)
      .get("/api/applications/app_does-not-exist/api-annotations")
      .set("Authorization", authHeader);
    expect(res.status).toBe(404);
    expect(codeIntelligenceClient.listApiAnnotations).not.toHaveBeenCalled();
  });
});
