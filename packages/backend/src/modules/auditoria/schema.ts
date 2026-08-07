import { z } from "zod";

/**
 * Tablas que dejan rastro en el audit log, agrupadas por cómo las nombra el
 * usuario. La UI filtra por módulo, no por nombre de tabla: nadie que use el
 * sistema sabe qué es `permisos_panel`.
 */
export const MODULOS_AUDITABLES = {
  clientes: { etiqueta: "Clientes", tablas: ["clientes"] },
  proveedores: { etiqueta: "Proveedores", tablas: ["proveedores"] },
  stock: { etiqueta: "Stock", tablas: ["productos"] },
  tesoreria: { etiqueta: "Tesorería", tablas: ["cuentas", "movimientos", "cheques"] },
  impuestos: { etiqueta: "Impuestos", tablas: ["impuestos"] },
  comprobantes: {
    etiqueta: "Comprobantes",
    tablas: ["comprobantes_venta", "comprobantes_compra"],
  },
  equipo: { etiqueta: "Equipo y permisos", tablas: ["member", "permisos_panel"] },
  parametros: { etiqueta: "Parámetros", tablas: ["parametros"] },
} as const;

export type ModuloAuditable = keyof typeof MODULOS_AUDITABLES;

const fechaSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (YYYY-MM-DD)");

export const auditoriaListarSchema = z.object({
  desde: fechaSchema.optional(),
  hasta: fechaSchema.optional(),
  modulo: z
    .enum(Object.keys(MODULOS_AUDITABLES) as [ModuloAuditable, ...ModuloAuditable[]])
    .optional(),
  usuarioId: z.string().min(1).optional(),
  pagina: z.number().int().min(1).default(1),
  tamanoPagina: z.number().int().min(1).max(100).default(25),
});

export type AuditoriaListar = z.infer<typeof auditoriaListarSchema>;
