import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createApplication,
  deleteApplication,
  getApplication,
  listApplications,
} from "../api/applications.js";

export const applicationsKey = ["applications"];
export const applicationKey = (id) => ["applications", id];

export function useApplications(options = {}) {
  return useQuery({
    queryKey: applicationsKey,
    queryFn: listApplications,
    ...options,
  });
}

export function useApplication(id, options = {}) {
  return useQuery({
    queryKey: applicationKey(id),
    queryFn: () => getApplication(id),
    enabled: Boolean(id),
    ...options,
  });
}

export function useCreateApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createApplication,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: applicationsKey });
    },
  });
}

export function useDeleteApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteApplication,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: applicationsKey });
    },
  });
}
