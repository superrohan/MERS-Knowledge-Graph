import { useQuery } from "@tanstack/react-query";

import { getSource } from "../api/source.js";

const CONTEXT_LINES = 6;

export function useSource(applicationId, citation) {
  const startLine = citation ? Math.max(1, citation.startLine - CONTEXT_LINES) : undefined;
  const endLine = citation ? citation.endLine + CONTEXT_LINES : undefined;

  return useQuery({
    queryKey: ["source", applicationId, citation?.filePath, startLine, endLine],
    queryFn: () => getSource(applicationId, { path: citation.filePath, startLine, endLine }),
    enabled: Boolean(applicationId && citation?.filePath),
  });
}
