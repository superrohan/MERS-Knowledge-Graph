import { useMutation } from "@tanstack/react-query";

import { validateGitLabRepository } from "../api/gitlab.js";

export function useGitLabValidation() {
  return useMutation({ mutationFn: validateGitLabRepository });
}
