import axios from "axios";

import { env } from "../config/env.js";
import { AppError } from "../middleware/errorHandler.js";

const pythonApi = axios.create({
  baseURL: env.pythonServiceUrl,
  timeout: 30000,
  headers: { "X-Internal-Secret": env.internalServiceSecret },
});

function mapPythonError(err) {
  if (err.response) {
    const detail = err.response.data?.detail ?? "The code intelligence service returned an error.";
    if (err.response.status === 502 && String(detail).startsWith("LLM unavailable")) {
      return new AppError(502, "LLM_UNAVAILABLE", "The language model is currently unavailable. Please try again.");
    }
    return new AppError(502, "CODE_INTELLIGENCE_ERROR", detail);
  }
  return new AppError(
    503,
    "CODE_INTELLIGENCE_UNAVAILABLE",
    "Could not reach the code intelligence service. It may be starting up or unreachable.",
  );
}

/**
 * Node's only window into the Python service. Node knows nothing about
 * tree-sitter, the graph/vector stores, or embeddings - just this
 * request/response contract (spec §34).
 */
export const codeIntelligenceClient = {
  async indexRepository({ repositoryId, repositoryPath, commitHash, repoKey }) {
    try {
      const res = await pythonApi.post("/internal/index", {
        repository_id: repositoryId,
        repository_path: repositoryPath,
        commit_hash: commitHash,
        repo_key: repoKey,
      });
      return { jobId: res.data.jobId, status: res.data.status };
    } catch (err) {
      throw mapPythonError(err);
    }
  },

  async getIndexStatus(jobId) {
    try {
      const res = await pythonApi.get(`/internal/index/${jobId}`);
      return res.data;
    } catch (err) {
      throw mapPythonError(err);
    }
  },

  async cancelIndex(jobId) {
    try {
      await pythonApi.post(`/internal/index/${jobId}/cancel`);
    } catch (err) {
      throw mapPythonError(err);
    }
  },

  async query({ repositoryId, query }) {
    try {
      const res = await pythonApi.post("/internal/query", { repository_id: repositoryId, query });
      return res.data;
    } catch (err) {
      throw mapPythonError(err);
    }
  },

  async getRepositoryStats(repositoryId) {
    try {
      const res = await pythonApi.get(`/internal/repositories/${repositoryId}/stats`);
      return res.data;
    } catch (err) {
      throw mapPythonError(err);
    }
  },

  async getGraph(repositoryId, { search, nodeTypes, relationshipTypes, limit } = {}) {
    try {
      const res = await pythonApi.get(`/internal/repositories/${repositoryId}/graph`, {
        params: {
          search,
          node_types: nodeTypes,
          relationship_types: relationshipTypes,
          limit,
        },
      });
      return res.data;
    } catch (err) {
      throw mapPythonError(err);
    }
  },

  async getSource(repositoryId, { path, startLine, endLine }) {
    try {
      const res = await pythonApi.get(`/internal/repositories/${repositoryId}/source`, {
        params: { path, start_line: startLine, end_line: endLine },
      });
      return res.data;
    } catch (err) {
      throw mapPythonError(err);
    }
  },

  async listApiAnnotations(repositoryId) {
    try {
      const res = await pythonApi.get(`/internal/repositories/${repositoryId}/api-annotations`);
      return res.data;
    } catch (err) {
      throw mapPythonError(err);
    }
  },

  async createApiAnnotation(repositoryId, annotation) {
    try {
      const res = await pythonApi.post(`/internal/repositories/${repositoryId}/api-annotations`, annotation);
      return res.data;
    } catch (err) {
      throw mapPythonError(err);
    }
  },

  async updateApiAnnotation(repositoryId, annotationId, annotation) {
    try {
      const res = await pythonApi.put(
        `/internal/repositories/${repositoryId}/api-annotations/${annotationId}`,
        annotation,
      );
      return res.data;
    } catch (err) {
      throw mapPythonError(err);
    }
  },

  async deleteApiAnnotation(repositoryId, annotationId) {
    try {
      await pythonApi.delete(`/internal/repositories/${repositoryId}/api-annotations/${annotationId}`);
    } catch (err) {
      throw mapPythonError(err);
    }
  },

  async verifyApiAnnotation(repositoryId, annotationId) {
    try {
      const res = await pythonApi.post(`/internal/repositories/${repositoryId}/api-annotations/${annotationId}/verify`);
      return res.data;
    } catch (err) {
      throw mapPythonError(err);
    }
  },
};
