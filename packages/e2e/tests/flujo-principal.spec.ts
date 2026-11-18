import { expect, type Page, test } from "@playwright/test";

/**
 * El camino que, si se rompe, deja al sistema sin razón de ser: dar de alta un
 * cliente, facturarle, cobrarle, y que la cuenta corriente lo refleje.
 *
 * Cada paso se afirma sobre lo que ve una persona y no sobre respuestas de la
 * API: lo que esto prueba es que las piezas están conectadas, que es
 * justamente lo que un test de servicio no puede ver.
 *
 * Dos cosas del dominio están acá y no son detalles del test:
 *
 * - **Un borrador no genera deuda.** El formulario crea un borrador; recién
 *   al emitirlo el comprobante entra en la cuenta corriente. Por eso el test
 *   emite, y por eso la primera versión de este archivo estaba mal.
 * - **El saldo se afirma por su etiqueta, no por su número.** La ficha dice
 *   "Saldo a cobrar" cuando hay deuda y "Saldo" cuando no, así que el test no
 *   depende de la alícuota de IVA que el formulario traiga por defecto.
 *
 * Las credenciales son las del seed de desarrollo, que sólo existen contra la
 * base local o la efímera del CI.
 */

const CUENTA = { email: "dueno@demo.dev", clave: "dueno-demo-2026" };

/** Un nombre y un número distintos por corrida: los tests no limpian la base. */
const marca = Date.now().toString().slice(-6);
const CLIENTE = `Cliente E2E ${marca}`;
const PUNTO_VENTA = "1";

/**
 * Un CUIT sintético válido y distinto en cada corrida.
 *
 * Tiene que ser válido porque el alta lo verifica, y distinto porque el CUIT
 * es único por empresa: con uno fijo, la segunda corrida no crea nada. Eso
 * pasó, y el test lo daba por bueno igual.
 */
function cuitSintetico(base: string): string {
  const PESOS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const cuerpo = `30${base.padStart(8, "0")}`;
  const suma = PESOS.reduce((acc, peso, i) => acc + peso * Number(cuerpo[i]), 0);
  const resto = suma % 11;
  const verificador = resto === 0 ? 0 : 11 - resto;
  // ARCA no emite CUITs cuyo verificador daría 10: se prueba con el siguiente.
  return verificador === 10 ? cuitSintetico(String(Number(base) + 1)) : `${cuerpo}${verificador}`;
}

const CUIT = cuitSintetico(marca);
const CUENTA_BANCO = `Banco E2E ${marca}`;

async function entrar(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(CUENTA.email);
  await page.getByLabel("Contraseña").fill(CUENTA.clave);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await page.waitForURL("**/panel");
}

/** Cómo la lista arma el texto del link: "A 0001-00123456". */
const numeroEnLista = `${PUNTO_VENTA.padStart(4, "0")}-${marca.padStart(8, "0")}`;

test.describe("de la venta al saldo", () => {
  test("un cliente nuevo, una factura emitida, un cobro y el saldo que queda", async ({ page }) => {
    await entrar(page);

    await test.step("la empresa necesita una cuenta donde recibir la plata", async () => {
      // Una organización recién creada no tiene ninguna, y sin cuenta no se
      // puede registrar un cobro. Es el primer paso real de cualquier alta.
      await page.goto("/tesoreria");
      await page.getByRole("button", { name: "Nueva cuenta" }).click();
      await page.getByLabel("Nombre de la cuenta").fill(CUENTA_BANCO);
      await page.getByRole("button", { name: "Crear cuenta" }).click();
      await expect(page.getByText(CUENTA_BANCO).first()).toBeVisible();
    });

    await test.step("se da de alta el cliente", async () => {
      await page.goto("/clientes");
      await page.getByRole("link", { name: "Nuevo cliente" }).first().click();
      await page.waitForURL("**/clientes/nuevo");

      await page.getByLabel("Razón social").fill(CLIENTE);
      await page.getByLabel("CUIT").fill(CUIT);
      await page.getByRole("button", { name: "Crear cliente" }).click();

      // Salir del formulario es lo que prueba que se guardó: si el alta falla
      // —un CUIT repetido, por ejemplo— la página se queda donde está.
      await page.waitForURL(/\/clientes$/);
      await expect(page.getByText(CLIENTE).first()).toBeVisible();
    });

    await test.step("se le carga una factura", async () => {
      await page.goto("/comprobantes");
      await page.getByRole("button", { name: "Nuevo comprobante" }).click();
      await page.getByRole("menuitem", { name: "Carga manual" }).click();
      await page.waitForURL("**/comprobantes/nuevo");

      await page.getByLabel("Cliente").selectOption({ label: CLIENTE });
      await page.getByLabel("Punto de venta").fill(PUNTO_VENTA);
      await page.getByLabel("Número").fill(marca);
      await page.getByLabel("Descripción").first().fill("Servicio de prueba");
      await page.getByLabel("Cant.").first().fill("1");
      await page.getByLabel("Precio unit.").first().fill("100000");

      await page.getByRole("button", { name: "Crear borrador" }).click();
      await page.waitForURL("**/comprobantes");
    });

    await test.step("emitirla es lo que la convierte en deuda", async () => {
      await page.getByRole("link", { name: new RegExp(numeroEnLista) }).click();
      await page.waitForURL("**/comprobantes/**");

      await page.getByRole("button", { name: "Emitir" }).click();
      // Emitida, aparece la cobranza y con ella el botón de cobrar.
      await expect(page.getByRole("button", { name: "Registrar cobro" })).toBeVisible();
    });

    await test.step("el cliente queda debiendo", async () => {
      await page.goto("/clientes");
      await page.getByRole("link", { name: CLIENTE }).click();
      await expect(page.getByText("Saldo a cobrar")).toBeVisible();
    });

    await test.step("se registra el cobro por el total pendiente", async () => {
      await page.goto("/comprobantes");
      await page.getByRole("link", { name: new RegExp(numeroEnLista) }).click();
      await page.getByRole("button", { name: "Registrar cobro" }).click();
      // El importe viene con lo pendiente ya cargado; falta decir a qué
      // cuenta entra, que es lo único que el formulario no puede suponer.
      await page.getByLabel("Cuenta").selectOption({ label: CUENTA_BANCO });
      await page.getByRole("button", { name: "Registrar", exact: true }).click();
      await expect(page.getByRole("button", { name: "Registrar cobro" })).toBeHidden();
    });

    await test.step("la deuda queda saldada", async () => {
      // Lo que importa no es que el cobro se haya guardado, sino que la cuenta
      // corriente lo refleje: ahí se nota si las piezas no están conectadas.
      await page.goto("/clientes");
      await page.getByRole("link", { name: CLIENTE }).click();
      await expect(page.getByText("Saldo a cobrar")).toBeHidden();
      await expect(page.getByText("Saldo", { exact: true })).toBeVisible();
    });
  });
});

test.describe("lo que no debería poder pasar", () => {
  test("sin sesión, la aplicación manda al login y no muestra datos", async ({ page }) => {
    await page.goto("/clientes");
    await expect(page).toHaveURL(/\/login/);
  });
});
