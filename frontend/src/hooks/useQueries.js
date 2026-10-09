import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getQueryHistory, getQueryHistoryItem, submitQuery } from "../api/queries.js";

export function useQueryHistory(applicationId) {
  return useQuery({
    queryKey: ["query-history", applicationId],
    queryFn: () => getQueryHistory(applicationId),
    enabled: Boolean(applicationId),
  });
}

export function useQueryHistoryItem(applicationId, queryId, options = {}) {
  return useQuery({
    queryKey: ["query-history-item", applicationId, queryId],
    queryFn: () => getQueryHistoryItem(applicationId, queryId),
    enabled: Boolean(applicationId && queryId),
    ...options,
  });
}

export function useSubmitQuery(applicationId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (query) => submitQuery(applicationId, query),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["query-history", applicationId] });
    },
  });
}
