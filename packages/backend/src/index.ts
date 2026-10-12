import "./env.js";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { toNodeHandler } from "better-auth/node";
import cors from "cors";
import express from "express";
import { auth } from "./auth/auth.js";
import { verificarMigraciones } from "./db/migraciones.js";
import { asistenteRouter, inicializarAsistente } from "./modules/asistente/ruta.js";
import { createContext } from "./trpc/context.js";
import { appRouter } from "./trpc/router.js";

const app = express();

app.use(
  cors({
    origin: process.env.FRONTEND_URL ?? "http://localhost:5173",
    credentials: true,
  }),
);

/** Momento de arranque, para saber hace cuánto está vivo este proceso. */
const INICIADO = new Date().toISOString();

/**
 * Estado del proceso, con la versión que está corriendo.
 *
 * El `ok` solo no alcanza: un backend viejo responde que está perfecto. Esto
 * pasó de verdad — una corrida de CI cancelada dejó a Railway sin deployar dos
 * commits, y desde afuera no había forma de notarlo salvo probando endpoint por
 * endpoint hasta encontrar un 404.
 *
 * `RAILWAY_GIT_COMMIT_SHA` la inyecta la plataforma. Fuera de Railway no existe
 * y queda en "desconocida", que es honesto: no la inventamos.
 */
app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    version: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ?? "desconocida",
    iniciado: INICIADO,
  });
});

// BetterAuth va ANTES de cualquier body parser: necesita el stream crudo.
// En Express 5 el comodín de ruta lleva nombre.
app.all("/api/auth/*splat", toNodeHandler(auth));

app.use("/trpc", createExpressMiddleware({ router: appRouter, createContext }));

// El chat va por una ruta Express común y no por tRPC: el streaming de tokens
// es un POST que devuelve un stream, que es justo lo que espera el SDK.
app.use(asistenteRouter);

// Antes de escuchar, no después: si la base está atrasada conviene que el
// deploy falle y Railway conserve la versión anterior, en vez de dejar arriba
// un backend que va a contestar 500 cada vez que toque una columna nueva.
await verificarMigraciones();

// Después de las migraciones y antes de escuchar: si el manual no está donde
// tiene que estar, conviene enterarse en el deploy y no cuando un usuario
// abra el chat y reciba una respuesta inventada.
inicializarAsistente();

const puerto = Number(process.env.PORT ?? 3001);
app.listen(puerto, () => {
  console.log(`Backend escuchando en http://localhost:${puerto}`);
});
