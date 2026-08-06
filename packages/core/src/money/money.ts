import { Decimal } from "decimal.js";

// Clon propio de Decimal: no tocamos la configuración global de la librería.
// Precisión alta para cálculos intermedios; el redondeo a 2 decimales es
// SIEMPRE explícito vía redondeoFiscal().
const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export type Moneda = "ARS" | "USD";

export class ImporteInvalidoError extends Error {
  constructor(valor: string) {
    super(`Importe inválido: "${valor}"`);
    this.name = "ImporteInvalidoError";
  }
}

export class MonedaDistintaError extends Error {
  constructor(a: Moneda, b: Moneda) {
    super(`No se puede operar entre monedas distintas: ${a} y ${b}`);
    this.name = "MonedaDistintaError";
  }
}

const FORMATO_DECIMAL = /^-?\d+(\.\d+)?$/;

/**
 * Value object para valores monetarios. Regla dura del proyecto: NUNCA `number`
 * para dinero — este objeto viaja como string por el borde de tRPC y como
 * `numeric` en Postgres.
 *
 * Inmutable: toda operación devuelve una instancia nueva. Las operaciones entre
 * monedas distintas lanzan MonedaDistintaError (ARS y USD conviven, no se mezclan).
 */
export class Money {
  private constructor(
    private readonly valor: Decimal,
    readonly moneda: Moneda,
  ) {}

  /** Único punto de entrada desde datos externos (DB, tRPC). Solo strings decimales. */
  static desdeString(valor: string, moneda: Moneda): Money {
    if (!FORMATO_DECIMAL.test(valor)) {
      throw new ImporteInvalidoError(valor);
    }
    return new Money(new D(valor), moneda);
  }

  static cero(moneda: Moneda): Money {
    return new Money(new D(0), moneda);
  }

  static sumarTodos(importes: readonly Money[], moneda: Moneda): Money {
    return importes.reduce((acc, m) => acc.sumar(m), Money.cero(moneda));
  }

  private exigirMismaMoneda(otro: Money): void {
    if (this.moneda !== otro.moneda) {
      throw new MonedaDistintaError(this.moneda, otro.moneda);
    }
  }

  sumar(otro: Money): Money {
    this.exigirMismaMoneda(otro);
    return new Money(this.valor.plus(otro.valor), this.moneda);
  }

  restar(otro: Money): Money {
    this.exigirMismaMoneda(otro);
    return new Money(this.valor.minus(otro.valor), this.moneda);
  }

  /** Multiplica por un factor adimensional (cantidad, cotización). */
  multiplicarPor(factor: string): Money {
    if (!FORMATO_DECIMAL.test(factor)) {
      throw new ImporteInvalidoError(factor);
    }
    return new Money(this.valor.times(new D(factor)), this.moneda);
  }

  /** Aplica un porcentaje (ej: alícuota de IVA "21") SIN redondear. */
  porcentaje(tasa: string): Money {
    return this.multiplicarPor(tasa).multiplicarPor("0.01");
  }

  negar(): Money {
    return new Money(this.valor.negated(), this.moneda);
  }

  /**
   * Redondeo fiscal: 2 decimales, mitad hacia arriba (alejándose de cero).
   * Es el único redondeo permitido para importes que se persisten o declaran.
   */
  redondeoFiscal(): Money {
    return new Money(this.valor.toDecimalPlaces(2, Decimal.ROUND_HALF_UP), this.moneda);
  }

  igualA(otro: Money): boolean {
    return this.moneda === otro.moneda && this.valor.equals(otro.valor);
  }

  mayorQue(otro: Money): boolean {
    this.exigirMismaMoneda(otro);
    return this.valor.greaterThan(otro.valor);
  }

  menorQue(otro: Money): boolean {
    this.exigirMismaMoneda(otro);
    return this.valor.lessThan(otro.valor);
  }

  esCero(): boolean {
    return this.valor.isZero();
  }

  esPositivo(): boolean {
    return this.valor.greaterThan(0);
  }

  esNegativo(): boolean {
    return this.valor.lessThan(0);
  }

  /** Representación exacta, sin redondeo ni relleno de decimales. */
  aString(): string {
    return this.valor.toString();
  }

  /** Para el borde tRPC y la persistencia: redondeo fiscal + 2 decimales fijos. */
  aStringFiscal(): string {
    return this.valor.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
  }
}
