import "./env.js";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { toNodeHandler } from "better-auth/node";
import cors from "cors";
import express from "express";
import { auth } from "./auth/auth.js";
import { verificarMigraciones } from "./db/migraciones.js";
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

// BetterAuth va ANTES de cualquier body parser: necesita el stream crudo.
// En Express 5 el comodín de ruta lleva nombre.
app.all("/api/auth/*splat", toNodeHandler(auth));

app.use("/trpc", createExpressMiddleware({ router: appRouter, createContext }));

// Antes de escuchar, no después: si la base está atrasada conviene que el
// deploy falle y Railway conserve la versión anterior, en vez de dejar arriba
// un backend que va a contestar 500 cada vez que toque una columna nueva.
await verificarMigraciones();

const puerto = Number(process.env.PORT ?? 3001);
app.listen(puerto, () => {
  console.log(`Backend escuchando en http://localhost:${puerto}`);
});
