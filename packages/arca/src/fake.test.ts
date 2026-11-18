import { Money } from "@erp/core/money";
import { describe, expect, it } from "vitest";
import { ArcaNoDisponibleError } from "./errores.js";
import { FacturacionElectronicaFake } from "./fake.js";
import type { SolicitudCae } from "./tipos.js";

const ars = (valor: string) => Money.desdeString(valor, "ARS");

function solicitud(parcial: Partial<SolicitudCae> = {}): SolicitudCae {
  return {
    idempotencia: "comprobante-1",
    cuitEmisor: "30710000103",
    puntoVenta: 1,
    clase: "factura",
    letra: "A",
    numero: 1,
    fechaEmision: "2026-11-17",
    condicionIvaReceptor: "responsable_inscripto",
    receptor: { tipoDocumento: "CUIT", numeroDocumento: "30710000138" },
    cotizacion: "1.00",
    neto: ars("1000.00"),
    iva: ars("210.00"),
    total: ars("1210.00"),
    alicuotas: [{ alicuota: "21", baseImponible: ars("1000.00"), importe: ars("210.00") }],
    asociados: [],
    ...parcial,
  };
}

describe("FacturacionElectronicaFake", () => {
  it("autoriza y devuelve un CAE con su vencimiento", async () => {
    const arca = new FacturacionElectronicaFake();
    const r = await arca.autorizar(solicitud());
    expect(r.estado).toBe("autorizado");
    if (r.estado === "autorizado") {
      expect(r.cae).toMatch(/^\d{14}$/);
      expect(r.vencimiento).toBe("2026-11-27");
    }
  });

  it("el comprobante autorizado avanza el último número", async () => {
    const arca = new FacturacionElectronicaFake();
    const punto = {
      cuitEmisor: "30710000103",
      puntoVenta: 1,
      clase: "factura",
      letra: "A",
    } as const;
    expect(await arca.ultimoAutorizado(punto)).toBe(0);
    await arca.autorizar(solicitud());
    expect(await arca.ultimoAutorizado(punto)).toBe(1);
  });

  it("la numeración es por punto de venta, clase y letra", async () => {
    // Cada combinación lleva su propia secuencia: la A del punto 1 no mueve el
    // número de la B del punto 1 ni de la A del punto 2.
    const arca = new FacturacionElectronicaFake();
    await arca.autorizar(solicitud());
    expect(
      await arca.ultimoAutorizado({
        cuitEmisor: "30710000103",
        puntoVenta: 1,
        clase: "factura",
        letra: "B",
      }),
    ).toBe(0);
    expect(
      await arca.ultimoAutorizado({
        cuitEmisor: "30710000103",
        puntoVenta: 2,
        clase: "factura",
        letra: "A",
      }),
    ).toBe(0);
  });

  it("el mismo pedido reintentado devuelve el mismo CAE", async () => {
    // Es la propiedad que hace segura la emisión: un timeout de red seguido de
    // un reintento no puede dejar dos comprobantes fiscales por una venta.
    const arca = new FacturacionElectronicaFake();
    const primera = await arca.autorizar(solicitud());
    const reintento = await arca.autorizar(solicitud());
    expect(reintento).toEqual(primera);
  });

  it("un reintento no consume otro número", async () => {
    const arca = new FacturacionElectronicaFake();
    await arca.autorizar(solicitud());
    await arca.autorizar(solicitud());
    expect(
      await arca.ultimoAutorizado({
        cuitEmisor: "30710000103",
        puntoVenta: 1,
        clase: "factura",
        letra: "A",
      }),
    ).toBe(1);
  });

  it("rechaza un número salteado, como lo hace ARCA", async () => {
    // Pedir el 3 cuando el último autorizado es el 1 deja un hueco en la
    // numeración, y eso ARCA no lo acepta. El fake lo modela para que el
    // código que numera se pueda probar contra esta regla.
    const arca = new FacturacionElectronicaFake();
    await arca.autorizar(solicitud());
    const r = await arca.autorizar(solicitud({ idempotencia: "comprobante-3", numero: 3 }));
    expect(r.estado).toBe("rechazado");
    if (r.estado === "rechazado") {
      expect(r.errores[0]?.mensaje).toContain("numeración");
    }
  });

  it("un rechazo no consume el número", async () => {
    const arca = new FacturacionElectronicaFake();
    const r = await arca.autorizar(solicitud({ numero: 7 }));
    expect(r.estado).toBe("rechazado");
    expect(
      await arca.ultimoAutorizado({
        cuitEmisor: "30710000103",
        puntoVenta: 1,
        clase: "factura",
        letra: "A",
      }),
    ).toBe(0);
  });

  it("rechaza un total que no es la suma de neto más IVA", async () => {
    // Es la validación que más rechazos reales produce, así que conviene que
    // el fake la tenga: un error de redondeo de un centavo vuelve rechazado.
    const arca = new FacturacionElectronicaFake();
    const r = await arca.autorizar(solicitud({ total: ars("1210.01") }));
    expect(r.estado).toBe("rechazado");
    if (r.estado === "rechazado") {
      expect(r.errores[0]?.mensaje).toContain("total");
    }
  });

  it("una letra A exige identificar al receptor con CUIT", async () => {
    const arca = new FacturacionElectronicaFake();
    const r = await arca.autorizar(solicitud({ receptor: null }));
    expect(r.estado).toBe("rechazado");
    if (r.estado === "rechazado") {
      expect(r.errores[0]?.mensaje).toContain("receptor");
    }
  });

  it("una letra B a consumidor final puede ir sin receptor identificado", async () => {
    const arca = new FacturacionElectronicaFake();
    const r = await arca.autorizar(
      solicitud({ letra: "B", condicionIvaReceptor: "consumidor_final", receptor: null }),
    );
    expect(r.estado).toBe("autorizado");
  });

  it("una nota de crédito tiene que decir qué comprobante corrige", async () => {
    const arca = new FacturacionElectronicaFake();
    const r = await arca.autorizar(solicitud({ clase: "nota_credito", asociados: [] }));
    expect(r.estado).toBe("rechazado");
    if (r.estado === "rechazado") {
      expect(r.errores[0]?.mensaje).toContain("asociado");
    }
  });

  it("se le puede pedir que falle, para probar los reintentos", async () => {
    // Un servicio caído no es un rechazo: el comprobante no se emitió y hay
    // que volver a intentar. Son dos caminos distintos en el código que llama.
    const arca = new FacturacionElectronicaFake({ caidoLasPrimeras: 2 });
    await expect(arca.autorizar(solicitud())).rejects.toThrow(ArcaNoDisponibleError);
    await expect(arca.autorizar(solicitud())).rejects.toThrow(ArcaNoDisponibleError);
    const r = await arca.autorizar(solicitud());
    expect(r.estado).toBe("autorizado");
  });

  it("caerse no consume número ni deja la idempotencia tomada", async () => {
    const arca = new FacturacionElectronicaFake({ caidoLasPrimeras: 1 });
    await expect(arca.autorizar(solicitud())).rejects.toThrow(ArcaNoDisponibleError);
    const r = await arca.autorizar(solicitud());
    expect(r.estado).toBe("autorizado");
    if (r.estado === "autorizado") {
      expect(r.cae).toMatch(/^\d{14}$/);
    }
  });

  it("dos comprobantes distintos reciben CAEs distintos", async () => {
    const arca = new FacturacionElectronicaFake();
    const primera = await arca.autorizar(solicitud());
    const segunda = await arca.autorizar(solicitud({ idempotencia: "comprobante-2", numero: 2 }));
    expect(primera.estado === "autorizado" && segunda.estado === "autorizado").toBe(true);
    if (primera.estado === "autorizado" && segunda.estado === "autorizado") {
      expect(segunda.cae).not.toBe(primera.cae);
    }
  });

  it("el CAE es determinista: el mismo comprobante da el mismo número", async () => {
    // Para que un test pueda afirmar un CAE concreto sin depender del reloj.
    const uno = await new FacturacionElectronicaFake().autorizar(solicitud());
    const otro = await new FacturacionElectronicaFake().autorizar(solicitud());
    expect(uno).toEqual(otro);
  });
});
