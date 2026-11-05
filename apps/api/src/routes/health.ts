import { Router, Request, Response } from "express";
import { pool } from "../config/db";

const router = Router();

router.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

router.get("/ready", async (_req: Request, res: Response) => {
  try {
    await pool.query("SELECT 1");
    res.status(200).json({
      status: "ready",
      database: "connected",
    });
  } catch {
    res.status(503).json({
      status: "not_ready",
      database: "disconnected",
    });
  }
});

export default router;
