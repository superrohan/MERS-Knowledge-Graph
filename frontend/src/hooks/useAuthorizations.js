import { useQuery } from "@tanstack/react-query";

import { getAuthorizations } from "../api/authorization.js";

export function useAuthorizations(applicationId, options = {}) {
  return useQuery({
    queryKey: ["authorizations", applicationId],
    queryFn: () => getAuthorizations(applicationId),
    enabled: Boolean(applicationId),
    ...options,
  });
}
