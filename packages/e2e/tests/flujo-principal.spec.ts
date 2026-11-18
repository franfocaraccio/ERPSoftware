import { expect, type Page, test } from "@playwright/test";

/**
 * El camino que, si se rompe, deja al sistema sin razón de ser: dar de alta un
 * cliente, facturarle, cobrarle, y que la cuenta corriente lo refleje.
 *
 * Cada paso se afirma sobre lo que ve una persona —una fila, un saldo— y no
 * sobre respuestas de la API: lo que esto prueba es que las piezas están
 * conectadas, que es justamente lo que un test de servicio no puede ver.
 *
 * Las credenciales son las del seed de desarrollo, que sólo existen contra la
 * base local o la efímera del CI.
 */

const CUENTA = { email: "dueno@demo.dev", clave: "dueno-demo-2026" };

/** Un nombre distinto por corrida: los tests comparten base y no la limpian. */
const marca = Date.now().toString().slice(-6);
const CLIENTE = `Cliente E2E ${marca}`;
/** CUIT sintético con dígito verificador válido, de la familia del seed. */
const CUIT = "30710000103";
const IMPORTE = "100000";

async function entrar(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(CUENTA.email);
  await page.getByLabel("Contraseña").fill(CUENTA.clave);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await page.waitForURL("**/panel");
}

test.describe("de la venta al saldo", () => {
  test.beforeEach(async ({ page }) => {
    await entrar(page);
  });

  test("un cliente nuevo, una factura, un cobro y el saldo que queda", async ({ page }) => {
    await test.step("se da de alta el cliente", async () => {
      await page.goto("/clientes");
      await page.getByRole("button", { name: /Nuevo cliente/i }).click();
      await page.getByLabel("Razón social").fill(CLIENTE);
      await page.getByLabel("CUIT").fill(CUIT);
      await page.getByRole("button", { name: /Guardar|Crear/i }).click();

      // Aparece en la lista: es la única prueba de que se guardó de verdad.
      await expect(page.getByText(CLIENTE).first()).toBeVisible();
    });

    await test.step("se le emite una factura", async () => {
      await page.goto("/comprobantes");
      await page.getByRole("button", { name: "Nuevo comprobante" }).click();
      await page.getByRole("menuitem", { name: /Carga manual/i }).click();
      await page.waitForURL("**/comprobantes/nuevo");

      await page.getByLabel("Cliente").selectOption({ label: CLIENTE });
      await page.getByLabel("Punto de venta").fill("1");
      await page.getByLabel("Número").fill(marca);
      await page.getByLabel("Descripción").first().fill("Servicio de prueba");
      await page.getByLabel("Cant.").first().fill("1");
      await page.getByLabel("Precio unit.").first().fill(IMPORTE);

      await page.getByRole("button", { name: /Guardar|Crear/i }).click();
      await expect(page.getByText(CLIENTE).first()).toBeVisible();
    });

    await test.step("el cliente queda debiendo", async () => {
      await page.goto("/clientes");
      await page.getByText(CLIENTE).first().click();
      // El importe aparece formateado a la argentina: 100.000,00
      await expect(page.getByText(/100\.000,00/).first()).toBeVisible();
    });

    await test.step("se registra el cobro", async () => {
      await page.getByRole("button", { name: /Registrar cobro/i }).click();
      await page.getByLabel("Importe").fill(IMPORTE);
      await page
        .getByRole("button", { name: /^Registrar cobro$/i })
        .last()
        .click();
    });

    await test.step("la deuda queda saldada", async () => {
      // Lo que importa no es que el cobro se haya guardado, sino que el saldo
      // lo refleje: ahí es donde se nota si las piezas no están conectadas.
      await expect(page.getByText(/\$\s*0,00/).first()).toBeVisible();
    });
  });
});

test.describe("lo que no debería poder pasar", () => {
  test("sin sesión, la aplicación manda al login y no muestra datos", async ({ page }) => {
    await page.goto("/clientes");
    await expect(page).toHaveURL(/\/login/);
  });
});
