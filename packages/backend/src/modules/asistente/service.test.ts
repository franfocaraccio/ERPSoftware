import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "../../db/client.js";
import { crearTenantDePrueba, limpiarTenantsDePrueba } from "../../test/tenant.js";
import {
  guardarPregunta,
  guardarRespuesta,
  listarConversaciones,
  listarMensajes,
} from "./service.js";

let tenantA: { tenantId: string; usuarioId: string };
let tenantB: { tenantId: string; usuarioId: string };

const consumo = { modelo: "gpt-test", entrada: 5260, salida: 61, cache: 4864 };

beforeAll(async () => {
  tenantA = await crearTenantDePrueba();
  tenantB = await crearTenantDePrueba();
});

afterAll(async () => {
  await limpiarTenantsDePrueba();
  await pool.end();
});

describe("asistente service (integración, RLS activo)", () => {
  it("guarda la pregunta y la respuesta en orden", async () => {
    const conversacion = randomUUID();

    await guardarPregunta(tenantA, conversacion, "¿cómo creo un cliente?");
    await guardarRespuesta(tenantA, conversacion, "Andá a Clientes.", consumo);

    const mensajes = await listarMensajes(tenantA, conversacion);

    expect(mensajes.map((m) => [m.rol, m.contenido])).toEqual([
      ["user", "¿cómo creo un cliente?"],
      ["assistant", "Andá a Clientes."],
    ]);
  });

  it("guarda el consumo de tokens junto a la respuesta", async () => {
    const conversacion = randomUUID();
    await guardarPregunta(tenantA, conversacion, "hola");
    await guardarRespuesta(tenantA, conversacion, "hola", consumo);

    const respuesta = (await listarMensajes(tenantA, conversacion)).find(
      (m) => m.rol === "assistant",
    );

    expect(respuesta).toMatchObject({
      modelo: "gpt-test",
      tokensEntrada: 5260,
      tokensSalida: 61,
      tokensCache: 4864,
    });
  });

  it("no duplica la conversación cuando llegan varios turnos con el mismo id", async () => {
    // El cliente manda el mismo id en cada turno; el primero la crea y el
    // resto solo corre la marca de tiempo. Sin el upsert, el segundo turno
    // reventaría por clave duplicada y se perdería la conversación entera.
    const conversacion = randomUUID();

    await guardarPregunta(tenantA, conversacion, "primera");
    await guardarPregunta(tenantA, conversacion, "segunda");
    await guardarPregunta(tenantA, conversacion, "tercera");

    const conversaciones = await listarConversaciones(tenantA);
    const mensajes = await listarMensajes(tenantA, conversacion);

    expect(conversaciones.filter((c) => c.id === conversacion)).toHaveLength(1);
    expect(mensajes).toHaveLength(3);
  });

  it("corre ultimo_mensaje en cada turno", async () => {
    const conversacion = randomUUID();
    await guardarPregunta(tenantA, conversacion, "primera");
    const antes = (await listarConversaciones(tenantA)).find((c) => c.id === conversacion);

    await new Promise((r) => setTimeout(r, 10));
    await guardarPregunta(tenantA, conversacion, "segunda");
    const despues = (await listarConversaciones(tenantA)).find((c) => c.id === conversacion);

    expect(despues?.ultimoMensaje.getTime()).toBeGreaterThan(antes?.ultimoMensaje.getTime() ?? 0);
  });

  it("ordena las conversaciones de la más reciente a la más vieja", async () => {
    const vieja = randomUUID();
    const nueva = randomUUID();

    await guardarPregunta(tenantB, vieja, "hace rato");
    await new Promise((r) => setTimeout(r, 10));
    await guardarPregunta(tenantB, nueva, "recién");

    const conversaciones = await listarConversaciones(tenantB);

    expect(conversaciones[0]?.id).toBe(nueva);
  });

  it("una empresa no ve las conversaciones de otra", async () => {
    const conversacion = randomUUID();
    await guardarPregunta(tenantA, conversacion, "algo privado de A");

    const deB = await listarConversaciones(tenantB);
    const mensajesDesdeB = await listarMensajes(tenantB, conversacion);

    expect(deB.map((c) => c.id)).not.toContain(conversacion);
    expect(mensajesDesdeB).toEqual([]);
  });

  it("guarda quién preguntó, incluso si entró por un link de solo lectura", async () => {
    // Quien entra por link no es un usuario de la tabla `user`: se guarda como
    // "acceso:<id>". Si la columna tuviera FK contra user, esto explotaría.
    const porLink = { tenantId: tenantA.tenantId, usuarioId: "acceso:abc-123" };
    const conversacion = randomUUID();

    await guardarPregunta(porLink, conversacion, "desde un link");
    const guardada = (await listarConversaciones(tenantA)).find((c) => c.id === conversacion);

    expect(guardada?.usuarioId).toBe("acceso:abc-123");
  });
});
