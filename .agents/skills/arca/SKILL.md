---
name: arca
description: Integración con ARCA (ex AFIP) — WSAA, WSFEv1, modelo de delegación con certificado único, cache del TA, códigos y errores comunes.
---

# ARCA (facturación electrónica) en este repo

## Arquitectura

- Todo detrás de la interfaz `IFacturacionElectronica` en `packages/arca`. El backend consume la interfaz, nunca SOAP directo.
- Implementación inicial: evaluar `ramiidv/arca-facturacion` (TypeScript, WSFEv1/WSFEX, QR, reintentos). Referencia alternativa: `emilioastarita/facturajs`. **Prohibido `@afipsdk/afip.js`** (requiere access_token pago).
- Archivos previstos: `wsaa.ts` (TRA + firma CMS + cache del TA), `wsfe.ts` (envelope SOAP + parseo), `codigos.ts` (tablas de códigos), `mapper.ts` (nuestro modelo → request ARCA), `qr.ts` (URL del QR según RG 4892).

## Modelo de delegación (clave)

- Operamos con **un solo certificado digital nuestro**. Cada PyME nos delega el servicio "Facturación Electrónica" desde su Administrador de Relaciones de ARCA.
- El CUIT del representado (la PyME) va en `Auth.Cuit` del request a WSFEv1; el certificado firma como nosotros.
- Credenciales (cert + clave privada) viven como secretos del backend, jamás en la base ni en el repo.

## WSAA — Ticket de Acceso

- Un TA **por servicio** (wsfe), NO por tenant. Se guarda en Postgres con su expiración y se **comparte entre todos los tenants**.
- ARCA rechaza pedir un TA nuevo mientras el anterior siga vigente — nunca pedir uno por cliente ni por request. Renovar solo cerca de la expiración, con lock para evitar renovaciones concurrentes.

## WSFEv1 — emisión

- WSFEv1 **no recibe ítems**: recibe totales agregados por alícuota de IVA. La agregación (agrupar ítems por alícuota, sumar bases, IVA por grupo, cierre exacto contra el total) es código nuestro en `packages/core/invoicing` — con tests.
- Numeración sin huecos: `pg_advisory_xact_lock(tenant_id, punto_venta)` + `FECompUltimoAutorizado` antes de emitir. Conexión en session mode.
- Idempotencia: un reintento no puede duplicar un comprobante. Registrar el intento antes de llamar y conciliar contra ARCA si la respuesta se perdió.
- Respuesta: `Resultado` ∈ {A, R, P}; `Errors` y `Observaciones` vienen por separado. **Un CAE puede llegar con observaciones** — se persiste todo.
- Desde abril 2026 el request exige la condición IVA del receptor.
- Comprobante con CAE = inmutable. Correcciones solo por nota de crédito/débito.

## Testing

- Suite contra **homologación** que emita cada tipo soportado: A, B, C, notas de crédito, con una y varias alícuotas. Es la red de seguridad ante cambios normativos.
- URLs de homologación y producción separadas por config; jamás apuntar tests a producción.

## Precaución

Los WSDL, códigos de comprobante/documento/IVA/moneda y las reglas cambian por resolución general. No escribir códigos de memoria: verificar contra la documentación oficial de ARCA (espacio de desarrolladores) y mantener `codigos.ts` como única fuente interna.
