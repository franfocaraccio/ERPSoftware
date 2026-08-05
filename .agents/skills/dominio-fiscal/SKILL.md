---
name: dominio-fiscal
description: Reglas de facturación argentina — tipos de comprobante A/B/C por condición IVA, cálculo neto/IVA/total, estados de impuestos y conceptos del dominio.
---

# Dominio fiscal argentino

## Condición IVA y tipo de comprobante

El emisor (la PyME, Responsable Inscripto en el caso general) emite según la condición IVA del receptor:

| Receptor | Comprobante | IVA |
|---|---|---|
| Responsable Inscripto | **A** | Discriminado (neto + IVA por alícuota) |
| Monotributista | **B** | Incluido en el total, no discriminado |
| Exento | **B** | Incluido / no discriminado |
| Consumidor Final | **B** | Incluido, no discriminado |
| (Emisor monotributista) | **C** | Sin IVA (el monotributista no discrimina jamás) |
| Exportación | **E** | Según régimen de exportación |

- La regla vive en `packages/core/invoicing`: `tipoComprobantePermitido(condicionEmisor, condicionReceptor)`.
- CUIT: 11 dígitos con dígito verificador (módulo 11). Validar siempre; la validación vive en `core`.

## Cálculo de una factura

1. Cada ítem: `base = cantidad × precioUnitario` (Money, decimal.js).
2. Agrupar ítems por alícuota de IVA (21%, 10.5%, 27%, 0%, exento/no gravado).
3. Por grupo: `iva = base × alicuota`, con redondeo fiscal a 2 decimales.
4. `neto = Σ bases`, `ivaTotal = Σ ivas`, `total = neto + ivaTotal` — el cierre debe ser **exacto**: la suma de los grupos redondeados es el total declarado (no redondear el total por separado).
5. En comprobantes B el total se muestra con IVA incluido, pero internamente siempre se persiste neto/IVA/total.

## Estados y fechas

- Comprobante de venta: `borrador → enviada → aprobada | rechazada`. Solo `borrador` es editable por el usuario; los demás los escribe el proceso de emisión.
- Impuesto: `Pagado` si `importe_pagado ≥ importe_determinado`; si no, `Vencido` cuando `hoy > fecha_vencimiento`, sino `Pendiente`. Se calcula al leer, nunca se persiste.
- Cheque: `En cartera / Depositado / Acreditado / Rechazado / Endosado` ("Endosado" es descriptivo, sin efectos).
- Proyección de cobro: `fecha_emision + condicion_venta_dias` (facturas), `fecha_pago` (cheques), `fecha_recepcion + condicion_pago_dias` (compras), `fecha_vencimiento` (impuestos).

## KPIs (fórmulas de referencia, viven en `packages/core/kpis`)

- Liquidez corriente = (saldo tesorería + cta. cte. a cobrar 30d) / cta. cte. a pagar 30d — alerta < 1.0
- DSO = (saldo cta. cte. / ventas últimos 30d) × 30 — alerta > plazo pactado + 15d
- DPO = (saldo a pagar / compras últimos 30d) × 30
- Ciclo de conversión de efectivo = DSO + días rotación stock − DPO
- Rotación stock (días) = 30 / (salidas del período / stock promedio) — alerta > 60d
- Margen bruto % = (ventas − costo de ventas) / ventas
- Concentración de cheques: alerta si > 40% del monto en cartera es de un mismo librador
- Impuestos vencidos: alerta si count > 0

## Regla de oro

Ningún cálculo de esta skill se implementa fuera de `packages/core`, y ninguno usa `number`: todo con `Money` / decimal.js.
