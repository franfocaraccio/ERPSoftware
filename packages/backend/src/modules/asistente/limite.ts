/**
 * Tope de consultas por empresa y por día.
 *
 * Un endpoint de LLM es la única ruta de la aplicación donde un request cuesta
 * plata de verdad, así que tiene freno propio desde el primer día.
 *
 * El contador vive en memoria: se pierde en cada redeploy y no se comparte
 * entre instancias. Alcanza mientras haya un solo contenedor y el objetivo sea
 * frenar un uso desbocado, no facturar con precisión. Si el backend escala a
 * más de una instancia, esto hay que moverlo a Postgres o Redis; hasta
 * entonces, una tabla sería complejidad sin beneficio.
 */

const LIMITE_DIARIO_POR_TENANT = Number(process.env.ASISTENTE_LIMITE_DIARIO ?? 100);

interface Contador {
  dia: string;
  usados: number;
}

const contadores = new Map<string, Contador>();

/** Día en Argentina: el tope se renueva a la medianoche del usuario, no en UTC. */
function diaActual(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
}

export interface ResultadoLimite {
  permitido: boolean;
  restantes: number;
  limite: number;
}

/** Consume una consulta del cupo del tenant. Llamar una vez por mensaje aceptado. */
export function consumirCupo(tenantId: string): ResultadoLimite {
  const hoy = diaActual();
  const actual = contadores.get(tenantId);

  const contador = actual && actual.dia === hoy ? actual : { dia: hoy, usados: 0 };

  if (contador.usados >= LIMITE_DIARIO_POR_TENANT) {
    contadores.set(tenantId, contador);
    return { permitido: false, restantes: 0, limite: LIMITE_DIARIO_POR_TENANT };
  }

  contador.usados += 1;
  contadores.set(tenantId, contador);

  return {
    permitido: true,
    restantes: LIMITE_DIARIO_POR_TENANT - contador.usados,
    limite: LIMITE_DIARIO_POR_TENANT,
  };
}
