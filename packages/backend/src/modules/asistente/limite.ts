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

export interface ResultadoLimite {
  permitido: boolean;
  restantes: number;
  limite: number;
}

interface Contador {
  dia: string;
  usados: number;
}

/**
 * Día en Argentina: el tope se renueva a la medianoche del usuario, no en UTC.
 * `en-CA` da el formato AAAA-MM-DD, que ordena y compara como string.
 */
export function diaEnArgentina(momento: Date): string {
  return momento.toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
}

/**
 * Crea un contador aislado.
 *
 * El límite y el reloj entran por parámetro en vez de leerse acá adentro
 * para que los tests puedan adelantar el día y usar un tope chico sin tocar
 * variables de entorno globales ni esperar a mañana.
 */
export function crearContador(opciones: { limite: number; reloj?: () => Date }) {
  const { limite, reloj = () => new Date() } = opciones;
  const contadores = new Map<string, Contador>();

  /** Consume una consulta del cupo del tenant. Llamar una vez por mensaje aceptado. */
  return function consumir(tenantId: string): ResultadoLimite {
    const hoy = diaEnArgentina(reloj());
    const actual = contadores.get(tenantId);

    // Si el contador guardado es de otro día, arranca de cero: así el cupo se
    // renueva sin necesidad de barrer el mapa con una tarea periódica.
    const contador = actual && actual.dia === hoy ? actual : { dia: hoy, usados: 0 };

    if (contador.usados >= limite) {
      contadores.set(tenantId, contador);
      return { permitido: false, restantes: 0, limite };
    }

    contador.usados += 1;
    contadores.set(tenantId, contador);

    return { permitido: true, restantes: limite - contador.usados, limite };
  };
}

export const consumirCupo = crearContador({
  limite: Number(process.env.ASISTENTE_LIMITE_DIARIO ?? 100),
});
