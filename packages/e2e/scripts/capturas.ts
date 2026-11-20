import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "@playwright/test";
import { escribirExtracto } from "../lib/extracto.js";

/**
 * Las capturas del README, sacadas de la aplicación andando.
 *
 * Vive en el repositorio por la misma razón que el fuente de la imagen de
 * preview: una captura que nadie puede volver a sacar queda vieja y nadie se
 * entera. Con esto, actualizar las imágenes después de un cambio de diseño es
 * un comando.
 *
 * Necesita la aplicación local levantada y la base con los datos de
 * demostración cargados:
 *
 *   docker compose up -d
 *   pnpm --filter @erp/backend dev      # y el frontend en otra terminal
 *   pnpm --filter @erp/e2e capturas
 *
 * Usa el Chrome del sistema en vez del Chromium que Playwright descarga: esto
 * es una herramienta de escritorio, no el CI, y bajar 130 MB no se justifica
 * para sacar ocho PNG.
 */

const APP = process.env.E2E_URL ?? "http://localhost:5173";
const SALIDA = fileURLToPath(new URL("../../../docs/images", import.meta.url));
const EMPRESA = "Demo prueba";
const CUENTA = "Banco Nación — cuenta corriente";

const CREDENCIALES = { email: "dueno@demo.dev", clave: "dueno-demo-2026" };

/**
 * El extracto que se sube para la captura de conciliación.
 *
 * Son movimientos que la base de demostración ya tiene entre el 12 y el 18 de
 * noviembre, más dos líneas que no existen en el sistema —la comisión y el
 * impuesto al débito— para que la pantalla muestre las dos propuestas que de
 * verdad importan: conciliar lo que casa y crear lo que el banco cobró por su
 * cuenta. Un extracto donde todo casa no muestra para qué sirve la pantalla.
 *
 * El saldo inicial es el de la cuenta al 11 de noviembre; el corrido lo
 * calcula `escribirExtracto`.
 */
const EXTRACTO = {
  cabecera: [
    "BANCO DE LA NACION ARGENTINA",
    "CUENTA CORRIENTE EN PESOS 0000-00000000/0",
    "PERIODO: 12/11/2026 AL 18/11/2026",
  ],
  saldoInicial: "8413152.00",
  movimientos: [
    {
      fecha: "2026-11-12",
      descripcion: "TRANSFERENCIA RECIBIDA · METALURGICA PILAR SA",
      importe: "970662.00",
    },
    {
      fecha: "2026-11-12",
      descripcion: "DEBITO AUTOMATICO SERVICIOS",
      importe: "-145000.00",
    },
    {
      fecha: "2026-11-13",
      descripcion: "COMISION MANTENIMIENTO DE CUENTA",
      importe: "-18150.00",
    },
    {
      fecha: "2026-11-14",
      descripcion: "TRANSFERENCIA RECIBIDA · FERRETERIA INDUSTRIAL MYM",
      importe: "2044900.00",
    },
    {
      fecha: "2026-11-14",
      descripcion: "TRANSFERENCIA ENVIADA · ACEROS DEL PLATA SA",
      importe: "-1645600.00",
    },
    {
      fecha: "2026-11-14",
      descripcion: "TRANSFERENCIA ENVIADA · TORNILLOS CORDOBA SRL",
      importe: "-379940.00",
    },
    {
      fecha: "2026-11-15",
      descripcion: "TRANSFERENCIA RECIBIDA · CORRALON BELGRANO SRL",
      importe: "970662.00",
    },
    {
      fecha: "2026-11-17",
      descripcion: "IMPUESTO LEY 25.413 DEBITOS",
      importe: "-12780.00",
    },
    {
      fecha: "2026-11-18",
      descripcion: "TRANSFERENCIA RECIBIDA · DISTRIBUIDORA DEL SUR SA",
      importe: "831270.00",
    },
  ],
};

/** La pregunta del asistente: se responde con datos de la empresa, no con ayuda. */
const PREGUNTA = "¿Quiénes me deben plata y cuánto?";

async function entrar(pagina: Page): Promise<void> {
  await pagina.goto(`${APP}/login`, { waitUntil: "networkidle" });
  await pagina.getByRole("textbox", { name: "Email" }).fill(CREDENCIALES.email);
  await pagina.getByRole("textbox", { name: "Contraseña" }).fill(CREDENCIALES.clave);
  await pagina.getByRole("button", { name: "Ingresar" }).click();
  await pagina.waitForURL("**/panel", { timeout: 20_000 });
  await pagina.waitForLoadState("networkidle");
}

async function elegirEmpresa(pagina: Page): Promise<void> {
  const actual = pagina.locator("header").getByText(/Demo/).first();
  if ((await actual.textContent())?.includes(EMPRESA)) {
    return;
  }
  await actual.click();
  await pagina.getByRole("option", { name: EMPRESA }).click();
  await pagina.waitForLoadState("networkidle");
  await pagina.waitForTimeout(2500);
}

/** El asistente flota sobre la esquina y tapa el contenido de las demás pantallas. */
async function ocultarElAsistente(pagina: Page): Promise<void> {
  await pagina
    .evaluate(() => {
      const boton = document.querySelector('[aria-label="Abrir el asistente de ayuda"]');
      if (boton instanceof HTMLElement) {
        boton.style.visibility = "hidden";
      }
    })
    .catch(() => {
      // Si no está en esta pantalla, no hay nada que ocultar.
    });
}

async function sacar(
  pagina: Page,
  nombre: string,
  opciones: { url?: string; desplazar?: number; espera?: number } = {},
): Promise<void> {
  const { url, desplazar = 0, espera = 2500 } = opciones;
  if (url) {
    await pagina.goto(`${APP}${url}`, { waitUntil: "networkidle" });
  }
  await pagina.waitForTimeout(espera);
  if (desplazar) {
    await pagina.evaluate((y) => window.scrollTo(0, y), desplazar);
    await pagina.waitForTimeout(1200);
  }
  await ocultarElAsistente(pagina);
  await pagina.waitForSelector("main, h1", { timeout: 15_000 });
  await pagina.screenshot({ path: join(SALIDA, `${nombre}.png`) });
  console.log("ok:", nombre);
}

/** Conciliación con un extracto ya leído y las propuestas a la vista. */
async function sacarConciliacion(pagina: Page): Promise<void> {
  const ruta = join(mkdtempSync(join(tmpdir(), "extracto-")), "extracto.xlsx");
  await escribirExtracto(ruta, EXTRACTO);

  await pagina.goto(`${APP}/tesoreria`, { waitUntil: "networkidle" });
  await pagina.getByRole("tab", { name: "Conciliación" }).click();
  await pagina.getByLabel("Cuenta").selectOption({ label: `${CUENTA} (ARS)` });

  // El input de archivo está oculto a propósito: el botón es lo que se ve.
  const chooser = pagina.waitForEvent("filechooser");
  await pagina.getByRole("button", { name: /Subir extracto/ }).click();
  await (await chooser).setFiles(ruta);

  // La propuesta llegó cuando aparece una línea que sólo está en el extracto.
  await pagina.getByText("COMISION MANTENIMIENTO DE CUENTA").first().waitFor({ timeout: 30_000 });
  await pagina.waitForTimeout(1200);
  await ocultarElAsistente(pagina);
  await pagina.screenshot({ path: join(SALIDA, "conciliacion.png") });
  console.log("ok: conciliacion");
}

/** El asistente con una respuesta puesta, que es lo único que prueba que anda. */
async function sacarAsistente(pagina: Page): Promise<void> {
  await pagina.goto(`${APP}/panel`, { waitUntil: "networkidle" });
  await pagina.getByRole("button", { name: "Abrir el asistente de ayuda" }).click();

  // Es un <section> con nombre accesible, así que el rol es `region`, no
  // `dialog`: no atrapa el foco ni se cierra con Escape.
  const panel = pagina.getByRole("region", { name: "Asistente de ayuda" });
  await panel.getByPlaceholder("Escribí tu consulta").fill(PREGUNTA);
  await panel.getByRole("button", { name: "Enviar" }).click();

  // "Pensando…" aparece al mandar y se va con el **primer** token, no con el
  // último: esperarlo a él y nada más captura una burbuja de una palabra, que
  // es exactamente lo que pasó la primera vez.
  const pensando = panel.getByRole("status");
  await pensando.waitFor({ state: "visible", timeout: 20_000 });
  await pensando.waitFor({ state: "detached", timeout: 120_000 });

  // Con el streaming ya empezado, se espera a que el texto deje de crecer:
  // cuatro lecturas iguales son dos segundos quieto.
  let anterior = -1;
  let quietas = 0;
  for (let intento = 0; intento < 120 && quietas < 4; intento++) {
    const largo = ((await panel.textContent()) ?? "").length;
    if (largo === anterior) {
      quietas += 1;
    } else {
      quietas = 0;
      anterior = largo;
    }
    await pagina.waitForTimeout(500);
  }

  if ((await panel.getByRole("alert").count()) > 0) {
    throw new Error("El asistente contestó con un error: la captura mostraría eso.");
  }

  // El panel sigue el final mientras streamea, y con una respuesta larga la
  // pregunta queda arriba, fuera de cuadro. Para la captura importa que se
  // vean las dos: se sube el historial hasta el tope de la pregunta.
  await panel.evaluate((seccion) => {
    const historial = seccion.querySelector(".overflow-y-auto");
    const pregunta = seccion.querySelector(".ml-auto");
    if (historial instanceof HTMLElement && pregunta instanceof HTMLElement) {
      historial.scrollTop = pregunta.offsetTop - 12;
    }
  });
  await pagina.waitForTimeout(400);

  await pagina.screenshot({ path: join(SALIDA, "asistente.png") });
  console.log("ok: asistente");
}

const navegador = await chromium.launch({ channel: "chrome" });
const contexto = await navegador.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  colorScheme: "dark",
  locale: "es-AR",
  timezoneId: "America/Argentina/Buenos_Aires",
});
const pagina = await contexto.newPage();

/**
 * Las capturas, por nombre.
 *
 * Se pueden pedir algunas sueltas —`pnpm capturas asistente conciliacion`—
 * para no rehacer las ocho cada vez que se ajusta una.
 */
const CAPTURAS: Record<string, (pagina: Page) => Promise<void>> = {
  panel: (p) => sacar(p, "panel", { url: "/panel", desplazar: 560 }),
  comprobantes: (p) => sacar(p, "comprobantes", { url: "/comprobantes" }),
  tesoreria: (p) => sacar(p, "tesoreria", { url: "/tesoreria" }),
  resultados: (p) => sacar(p, "resultados", { url: "/resultados" }),
  stock: (p) => sacar(p, "stock", { url: "/stock" }),
  conciliacion: sacarConciliacion,
  asistente: sacarAsistente,
};

const pedidas = process.argv.slice(2);
const desconocidas = pedidas.filter((n) => !(n in CAPTURAS));
if (desconocidas.length > 0) {
  throw new Error(
    `No existen estas capturas: ${desconocidas.join(", ")}. Hay: ${Object.keys(CAPTURAS).join(", ")}.`,
  );
}
const aSacar = pedidas.length > 0 ? pedidas : Object.keys(CAPTURAS);

try {
  await entrar(pagina);
  await elegirEmpresa(pagina);
  for (const nombre of aSacar) {
    await CAPTURAS[nombre]?.(pagina);
  }
} finally {
  await navegador.close();
}
console.log("listo");
