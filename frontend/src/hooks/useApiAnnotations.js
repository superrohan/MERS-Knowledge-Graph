import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createApiAnnotation,
  deleteApiAnnotation,
  listApiAnnotations,
  updateApiAnnotation,
  verifyApiAnnotation,
} from "../api/apiAnnotations.js";

const apiAnnotationsKey = (applicationId) => ["api-annotations", applicationId];

export function useApiAnnotations(applicationId, options = {}) {
  return useQuery({
    queryKey: apiAnnotationsKey(applicationId),
    queryFn: () => listApiAnnotations(applicationId),
    enabled: Boolean(applicationId),
    ...options,
  });
}

export function useCreateApiAnnotation(applicationId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) => createApiAnnotation(applicationId, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: apiAnnotationsKey(applicationId) }),
  });
}

export function useUpdateApiAnnotation(applicationId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ annotationId, payload }) => updateApiAnnotation(applicationId, annotationId, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: apiAnnotationsKey(applicationId) }),
  });
}

export function useDeleteApiAnnotation(applicationId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (annotationId) => deleteApiAnnotation(applicationId, annotationId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: apiAnnotationsKey(applicationId) }),
  });
}

export function useVerifyApiAnnotation(applicationId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (annotationId) => verifyApiAnnotation(applicationId, annotationId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: apiAnnotationsKey(applicationId) }),
  });
}
