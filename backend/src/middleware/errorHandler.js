/**
 * Base class for errors that should be surfaced to the client with a
 * specific HTTP status and a stable machine-readable code. Anything that
 * is *not* an AppError is treated as an unexpected server error: the
 * client gets a generic message, the real detail goes to the server log.
 */
export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function notFoundHandler(req, res) {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: `No route matches ${req.method} ${req.path}`,
      requestId: req.requestId,
    },
  });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  if (err instanceof AppError) {
    if (err.status >= 500) {
      console.error(`[${req.requestId}] ${err.code}: ${err.stack ?? err.message}`);
    }
    res.status(err.status).json({
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
        requestId: req.requestId,
      },
    });
    return;
  }

  console.error(`[${req.requestId}] Unhandled error:`, err);
  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred.",
      requestId: req.requestId,
    },
  });
}
