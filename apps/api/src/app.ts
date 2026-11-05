import "dotenv/config";
import express, { Application, Request, Response } from "express";
import cors from "cors";
import { metricsMiddleware } from "./middlewares/metrics";
import healthRouter from "./routes/health";
import metricsRouter from "./routes/metrics";
import productsRouter from "./routes/products";

const app: Application = express();

app.use(cors());
app.use(express.json());
app.use(metricsMiddleware);

app.get("/", (_req: Request, res: Response) => {
  res.json({ status: "ok", service: "KubeLab API" });
});

app.use(healthRouter);
app.use(metricsRouter);
app.use("/api/products", productsRouter);

export default app;
