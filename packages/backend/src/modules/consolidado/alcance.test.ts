import { TRPCError } from "@trpc/server";
import { afterAll, describe, expect, it } from "vitest";
import { pool } from "../../db/client.js";
import { crearTenantDePrueba, limpiarTenantsDePrueba } from "../../test/tenant.js";
import type { Sesion } from "../../trpc/context.js";
import { appRouter } from "../../trpc/router.js";
import { createCallerFactory } from "../../trpc/trpc.js";

const crearCaller = createCallerFactory(appRouter);

/** La sesión sintética que arma `context.ts` para un link de solo lectura. */
function sesionDeLink(tenantId: string, modulos: string[] | null): Sesion {
  return {
    usuarioId: "acceso:prueba",
    email: "",
    nombre: "Contador",
    activeOrganizationId: tenantId,
    rolOrganizacion: "solo_lectura",
    esAdminPlataforma: false,
    dosFactoresVerificado: false,
    esAccesoPorLink: true,
    modulosPermitidos: modulos,
  };
}

afterAll(async () => {
  await limpiarTenantsDePrueba();
  await pool.end();
});

describe("alcance de un link de solo lectura", () => {
  it("un link sólo de Impuestos no puede leer Clientes", async () => {
    const t = await crearTenantDePrueba();
    const caller = crearCaller({
      session: sesionDeLink(t.tenantId, ["impuestos"]),
      headers: new Headers(),
    });

    const error = await caller.clientes
      .listar({ pagina: 1, tamanoPagina: 10 })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TRPCError);
    expect((error as TRPCError).code).toBe("FORBIDDEN");

    // Lo suyo sí.
    await expect(caller.impuestos.posicionIva()).resolves.toBeDefined();
  });

  it("un link sin alcance (los de antes) sigue viendo todo", async () => {
    const t = await crearTenantDePrueba();
    const caller = crearCaller({ session: sesionDeLink(t.tenantId, null), headers: new Headers() });
    await expect(caller.clientes.listar({ pagina: 1, tamanoPagina: 10 })).resolves.toBeDefined();
  });
});
