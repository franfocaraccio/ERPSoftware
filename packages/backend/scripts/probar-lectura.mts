/**
 * Prueba la lectura de un comprobante contra un archivo real, sin pasar por
 * HTTP ni por la sesión.
 *
 * Es para verificar con facturas de verdad, que es lo único que dice si el
 * lector sirve: los tests cubren la interpretación, no la lectura del papel.
 * Gasta tokens de la API en cada corrida.
 *
 *   pnpm --filter @erp/backend exec tsx scripts/probar-lectura.mts <archivo...>
 *
 * Los archivos NO se guardan en el repo: llevan CUIT, domicilios y a veces
 * datos de tarjetas. Usá los tuyos, desde donde los tengas.
 */
import { readFileSync } from "node:fs";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";

process.loadEnvFile(new URL("../.env", import.meta.url).pathname.slice(1));

const { detectarTipo } = await import("../src/modules/_comunes/tipo-archivo.js");
const { comprobanteLeidoSchema, interpretar, interpretarVenta, INSTRUCCIONES } = await import(
  "../src/modules/comprobantes/lectura.js"
);

const comoVenta = process.argv.includes("--venta");

for (const ruta of process.argv.slice(2).filter((a) => !a.startsWith("--"))) {
  const bytes = readFileSync(ruta);
  const tipo = detectarTipo(bytes);
  console.log(`\n=== ${ruta.split(/[/]/).pop()}  (${tipo}, ${(bytes.length / 1024) | 0} KB)`);
  const t = Date.now();
  const { object, usage } = await generateObject({
    model: openai(process.env.LECTURA_MODELO ?? "gpt-5.4"),
    schema: comprobanteLeidoSchema,
    system: INSTRUCCIONES,
    messages: [
      {
        role: "user",
        content: [
          { type: "file", data: bytes, mediaType: tipo! },
          { type: "text", text: "Leé este comprobante." },
        ],
      },
    ],
  });
  console.log("crudo:", object);
  console.log(
    comoVenta ? "como venta:" : "como compra:",
    comoVenta ? interpretarVenta(object) : interpretar(object),
  );
  console.log(`tokens: ${usage.inputTokens} in / ${usage.outputTokens} out — ${Date.now() - t} ms`);
}
