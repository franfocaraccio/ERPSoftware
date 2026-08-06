import "./env.js";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import cors from "cors";
import express from "express";
import { createContext } from "./trpc/context.js";
import { appRouter } from "./trpc/router.js";

const app = express();

app.use(
  cors({
    origin: process.env.FRONTEND_URL ?? "http://localhost:5173",
    credentials: true,
  }),
);

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/trpc", createExpressMiddleware({ router: appRouter, createContext }));

const puerto = Number(process.env.PORT ?? 3001);
app.listen(puerto, () => {
  console.log(`Backend escuchando en http://localhost:${puerto}`);
});
