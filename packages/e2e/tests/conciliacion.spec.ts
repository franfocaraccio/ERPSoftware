import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { escribirExtracto } from "../lib/extracto.js";

/**
 * Conciliar una cuenta contra el Excel del banco.
 *
 * Es el único camino del sistema cuya entrada es un archivo binario, y el
 * único donde el backend decide por su cuenta qué significa cada línea. Los
 * tests de `@erp/core` prueban el criterio de casamiento y los del servicio la
 * escritura; esto prueba que un `.xlsx` que sale de un disco llega entero
 * hasta la base pasando por el navegador, el multipart y el parser.
 *
 * El extracto se genera en el momento, con las dos situaciones que importan:
 * una línea que corresponde a un movimiento ya cargado —el sistema tiene que
 * proponer conciliar— y otra que el banco cobró por su cuenta y que nadie
 * cargó —el sistema tiene que proponer crearla—. Un extracto donde todo casa
 * no prueba la mitad interesante.
 *
 * Las credenciales son las del seed de desarrollo, que sólo existen contra la
 * base local o la efímera del CI.
 */

const CUENTA = { email: "dueno@demo.dev", clave: "dueno-demo-2026" };

/** Un nombre distinto por corrida: los tests no limpian la base. */
const marca = Date.now().toString().slice(-6);
const CUENTA_BANCO = `Banco Concilia ${marca}`;

/**
 * El día de hoy en Argentina, no en la máquina.
 *
 * Importa: entre las 21 y la medianoche de Argentina, UTC ya está en el día
 * siguiente, y el CI corre en UTC. Con la fecha de la máquina, el movimiento
 * quedaría un día después que la línea del extracto —todavía dentro de la
 * tolerancia, pero por un motivo que nadie eligió— y el test diría cosas
 * distintas según la hora a la que se corre.
 */
function hoyEnArgentina(): string {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
  });
}

/** Días antes de hoy, contados sobre la fecha argentina y no sobre la máquina. */
function haceDias(dias: number): string {
  // Mediodía UTC: sumar o restar días no puede cruzar a otro día por el huso.
  const base = new Date(`${hoyEnArgentina()}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() - dias);
  return base.toISOString().slice(0, 10);
}

const HOY = hoyEnArgentina();
const ANTEAYER = haceDias(2);

/** El movimiento que ya está cargado, y que el extracto tiene que reconocer. */
const YA_CARGADO = { importe: "187500", concepto: `Alquiler del depósito ${marca}` };

/** Lo que el banco cobró y nadie cargó. */
const SOLO_EN_EL_BANCO = `COMISION MANTENIMIENTO ${marca}`;

async function entrar(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(CUENTA.email);
  await page.getByLabel("Contraseña").fill(CUENTA.clave);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await page.waitForURL("**/panel");
}

async function irA(page: Page, pestania: string) {
  await page.goto("/tesoreria");
  await page.getByRole("tab", { name: pestania }).click();
}

test.describe("conciliar con el banco", () => {
  test("el extracto reconoce lo que ya estaba cargado y ofrece crear lo que falta", async ({
    page,
  }) => {
    await entrar(page);

    await test.step("una cuenta nueva con un movimiento cargado a mano", async () => {
      await page.goto("/tesoreria");
      await page.getByRole("button", { name: "Nueva cuenta" }).click();
      await page.getByLabel("Nombre de la cuenta").fill(CUENTA_BANCO);
      await page.getByRole("button", { name: "Crear cuenta" }).click();
      await expect(page.getByText(CUENTA_BANCO).first()).toBeVisible();

      await irA(page, "Movimientos");
      await page.getByRole("button", { name: "Nuevo movimiento" }).click();

      // La pantalla tiene sus propios filtros de fecha y de cuenta, con las
      // mismas etiquetas que el formulario. Se acota al formulario y no se
      // desambigua campo por campo: así no hay que volver acá si mañana se
      // agrega otro filtro.
      const formulario = page
        .locator("form")
        .filter({ has: page.getByRole("button", { name: "Registrar movimiento" }) });

      await formulario.getByLabel("Fecha").fill(HOY);
      await formulario.getByLabel("Cuenta").selectOption({ label: `${CUENTA_BANCO} (ARS)` });
      await formulario.getByLabel("Tipo").selectOption("egreso");
      await formulario.getByLabel("Importe").fill(YA_CARGADO.importe);
      await formulario.getByLabel("Concepto").fill(YA_CARGADO.concepto);
      await formulario.getByRole("button", { name: "Registrar movimiento" }).click();

      // Que la fila aparezca es lo que prueba que se guardó.
      await expect(page.getByText(YA_CARGADO.concepto).first()).toBeVisible();
    });

    await test.step("se sube el extracto del banco", async () => {
      const ruta = join(mkdtempSync(join(tmpdir(), "extracto-e2e-")), "extracto.xlsx");
      await escribirExtracto(ruta, {
        cabecera: [`BANCO DE PRUEBA · ${CUENTA_BANCO}`],
        saldoInicial: "1000000.00",
        // En orden cronológico y con fechas distintas, a propósito: con dos
        // líneas del mismo día el lector no puede ordenarlas por fecha y cae
        // en su rama de desempate por saldo. Esa rama tiene sus propios
        // tests; mezclarla acá haría que este fallara por el motivo de al
        // lado del que se quiere probar.
        movimientos: [
          { fecha: ANTEAYER, descripcion: SOLO_EN_EL_BANCO, importe: "-4321.00" },
          // Mismo importe, mismo sentido y misma fecha que el de arriba.
          {
            fecha: HOY,
            descripcion: "DEBITO AUTOMATICO ALQUILER",
            importe: `-${YA_CARGADO.importe}.00`,
          },
        ],
      });

      await irA(page, "Conciliación");
      await page.getByLabel("Cuenta").selectOption({ label: `${CUENTA_BANCO} (ARS)` });

      // El input de archivo está oculto a propósito: lo que se ve es el botón.
      const chooser = page.waitForEvent("filechooser");
      await page.getByRole("button", { name: /Subir extracto/ }).click();
      await (await chooser).setFiles(ruta);
    });

    await test.step("el sistema reconoce una línea y ofrece crear la otra", async () => {
      // Que la línea esté en pantalla prueba que el Excel llegó y se leyó.
      await expect(page.getByText(SOLO_EN_EL_BANCO)).toBeVisible();
      await expect(page.getByText("DEBITO AUTOMATICO ALQUILER")).toBeVisible();

      // El saldo corrido del archivo cierra: si no, el aviso diría otra cosa.
      await expect(page.getByText(/El saldo cierra línea por línea/)).toBeVisible();

      // Cada línea trae ya elegido qué hacer con ella, y es ahí donde se ve
      // que el casamiento funcionó: una propone conciliar contra el
      // movimiento cargado, la otra crearlo porque no hay con qué casarla.
      // Las filas van en el orden del extracto: primero la comisión, que no
      // tiene con qué casar, y después el alquiler, que sí.
      const decisiones = page.getByRole("combobox", { name: /Qué hacer con la línea/ });
      await expect(decisiones).toHaveCount(2);
      await expect(decisiones.first()).toHaveValue("crear");
      await expect(decisiones.last()).toHaveValue(/^conciliar:/);
    });

    await test.step("al confirmar, se concilia una y se crea la otra", async () => {
      await page.getByRole("button", { name: /^Confirmar \d+ decisi/ }).click();

      // El resumen es la pantalla contando qué hizo, en sus palabras.
      await expect(page.getByText(/Listo: .*1 conciliadas.*1 creadas/)).toBeVisible();
    });

    await test.step("el movimiento que faltaba quedó cargado", async () => {
      // Confirmación independiente del resumen: la comisión que sólo estaba
      // en el papel del banco ahora es un movimiento de la cuenta.
      await irA(page, "Movimientos");
      await expect(page.getByText(SOLO_EN_EL_BANCO).first()).toBeVisible();
    });
  });
});
