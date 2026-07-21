import type { NextFunction, Request, RequestHandler, Response } from "express";

export function errorMessage(err: unknown): string {
  return String(err);
}

// Register AFTER all routes.
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  console.error(`[subodha-server] ${req.method} ${req.path} failed:`, err);
  res.status(500).json({ error: errorMessage(err) });
}
