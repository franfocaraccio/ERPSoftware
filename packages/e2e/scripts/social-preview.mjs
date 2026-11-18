// Genera docs/images/social-preview.png (1280x640) desde el HTML que está al
// lado de la imagen. Vive acá porque es el único paquete con Playwright.
//
//   pnpm --filter @erp/e2e preview
//
// Usa el Chrome instalado por defecto; CANAL=chromium usa el de Playwright.
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const imagenes = new URL("../../../docs/images/", import.meta.url);
const html = new URL("social-preview.html", imagenes);
const png = fileURLToPath(new URL("social-preview.png", imagenes));

const navegador = await chromium.launch({ channel: process.env.CANAL ?? "chrome" });
const pagina = await navegador.newPage({
  viewport: { width: 1280, height: 640 },
  deviceScaleFactor: 2,
});
await pagina.goto(html.href);
await pagina.waitForTimeout(400);
await pagina.screenshot({ path: png });
await navegador.close();
console.log("listo:", png);
