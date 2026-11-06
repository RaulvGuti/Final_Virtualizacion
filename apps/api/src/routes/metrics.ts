import { Router, Request, Response } from "express";
import { register } from "../metrics";

const router = Router();

router.get("/metrics", async (_req: Request, res: Response) => {
  res.setHeader("Content-Type", register.contentType);
  res.end(await register.metrics());
});

export default router;
