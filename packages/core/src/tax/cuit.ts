const PESOS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2] as const;

/** Quita guiones y espacios: "33-69345023-9" → "33693450239". */
export function normalizarCuit(cuit: string): string {
  return cuit.replaceAll(/[\s-]/g, "");
}

/**
 * Valida un CUIT/CUIL por su dígito verificador (módulo 11).
 * Acepta el formato con o sin guiones. Un resto que exigiría verificador 10
 * se considera inválido: ARCA no emite esos prefijos.
 */
export function validarCuit(cuit: string): boolean {
  const limpio = normalizarCuit(cuit);
  if (!/^\d{11}$/.test(limpio)) {
    return false;
  }
  const digitos = [...limpio].map(Number);
  const suma = PESOS.reduce((acc, peso, i) => acc + peso * (digitos[i] ?? 0), 0);
  const resto = suma % 11;
  const verificador = resto === 0 ? 0 : 11 - resto;
  if (verificador === 10) {
    return false;
  }
  return verificador === digitos[10];
}
