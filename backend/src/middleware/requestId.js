import { randomUUID } from "node:crypto";

/**
 * Attaches a unique request ID to every incoming request and echoes it back
 * on the response, so a single request can be traced through Node and,
 * later, through the Python service and audit logs.
 */
export function requestId(req, res, next) {
  const incoming = req.header("x-request-id");
  const id = incoming && incoming.length > 0 ? incoming : randomUUID();
  req.requestId = id;
  res.setHeader("x-request-id", id);
  next();
}
