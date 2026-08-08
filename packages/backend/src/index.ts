import "./env.js";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { toNodeHandler } from "better-auth/node";
import cors from "cors";
import express from "express";
import { auth } from "./auth/auth.js";
import { createContext } from "./trpc/context.js";
import { appRouter } from "./trpc/router.js";

const app = express();

app.use(
  cors({
    origin: process.env.FRONTEND_URL ?? "http://localhost:5173",
    credentials: true,
  }),
);

/**
 * TEMPORAL — diagnóstico de resolución de IP del cliente. BORRAR una vez
 * confirmado el comportamiento del proxy de Railway.
 *
 * BetterAuth resuelve la IP leyendo `x-forwarded-for` por su cuenta (no usa
 * `req.ip` de Express). Si el header trae UN solo valor, lo usa. Si trae una
 * cadena de varios saltos, devuelve null salvo que se configure
 * `advanced.ipAddress.trustedProxies`, y entonces TODOS los clientes caen en
 * un único bucket compartido de rate limiting: 3 intentos de login cada 10
 * segundos para toda la plataforma.
 *
 * La documentación de Railway se contradice sobre si su edge proxy reemplaza
 * el header o le appendea, así que hay que medirlo en vez de asumirlo. El
 * rate limiting sólo se activa en producción, por eso no se puede reproducir
 * en local.
 */
const MUESTRAS_IP = 20;
let muestrasIpRestantes = MUESTRAS_IP;
app.use((req, _res, next) => {
  if (muestrasIpRestantes > 0) {
    muestrasIpRestantes--;
    const xff = req.headers["x-forwarded-for"];
    console.log(
      "[ip-debug]",
      JSON.stringify({
        ruta: req.path,
        // Lo único que decide el comportamiento: 1 valor => anda; 2+ => bucket compartido.
        saltosXff: typeof xff === "string" ? xff.split(",").length : Array.isArray(xff) ? -1 : 0,
        xForwardedFor: xff ?? null,
        xRealIp: req.headers["x-real-ip"] ?? null,
        forwarded: req.headers.forwarded ?? null,
        cfConnectingIp: req.headers["cf-connecting-ip"] ?? null,
        restantes: muestrasIpRestantes,
      }),
    );
  }
  next();
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// BetterAuth va ANTES de cualquier body parser: necesita el stream crudo.
// En Express 5 el comodín de ruta lleva nombre.
app.all("/api/auth/*splat", toNodeHandler(auth));

app.use("/trpc", createExpressMiddleware({ router: appRouter, createContext }));

const puerto = Number(process.env.PORT ?? 3001);
app.listen(puerto, () => {
  console.log(`Backend escuchando en http://localhost:${puerto}`);
});
