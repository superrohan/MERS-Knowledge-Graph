import { useQuery } from "@tanstack/react-query";

import { getKnowledgeBaseStats, getKnowledgeGraph } from "../api/knowledgeBase.js";

export function useKnowledgeBaseStats(applicationId, options = {}) {
  return useQuery({
    queryKey: ["knowledge-base-stats", applicationId],
    queryFn: () => getKnowledgeBaseStats(applicationId),
    enabled: Boolean(applicationId),
    ...options,
  });
}

export function useKnowledgeGraph(applicationId, filters, options = {}) {
  return useQuery({
    queryKey: ["knowledge-graph", applicationId, filters],
    queryFn: () => getKnowledgeGraph(applicationId, filters),
    enabled: Boolean(applicationId),
    ...options,
  });
}
