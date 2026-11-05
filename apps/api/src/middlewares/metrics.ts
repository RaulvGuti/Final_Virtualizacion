import { NextFunction, Request, Response } from "express";
import { httpRequestDuration, httpRequestsTotal } from "../metrics";

export function metricsMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const end = httpRequestDuration.startTimer();

  res.on("finish", () => {
    const route = req.route?.path ?? req.path;
    const labels = {
      method: req.method,
      route,
      status_code: res.statusCode.toString(),
    };

    httpRequestsTotal.inc(labels);
    end(labels);
  });

  next();
}
