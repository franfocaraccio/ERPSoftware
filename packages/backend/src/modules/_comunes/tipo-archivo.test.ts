import { describe, expect, it } from "vitest";
import { detectarTipo } from "./tipo-archivo.js";

const bytes = (...partes: (string | number[])[]) =>
  Buffer.concat(
    partes.map((p) => (typeof p === "string" ? Buffer.from(p, "latin1") : Buffer.from(p))),
  );

describe("detectarTipo", () => {
  it("reconoce un PDF por su firma", () => {
    expect(detectarTipo(bytes("%PDF-1.7\n%âãÏÓ\n"))).toBe("application/pdf");
  });

  it("reconoce PNG, JPEG y WebP", () => {
    expect(detectarTipo(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]))).toBe(
      "image/png",
    );
    expect(detectarTipo(bytes([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]))).toBe("image/jpeg");
    expect(detectarTipo(bytes("RIFF", [0x24, 0, 0, 0], "WEBPVP8 "))).toBe("image/webp");
  });

  it("rechaza un HTML aunque se llame .pdf: el nombre no participa", () => {
    expect(detectarTipo(bytes("<!doctype html><script>alert(1)</script>"))).toBeNull();
  });

  it("rechaza un RIFF que no es WebP (WAV, AVI)", () => {
    expect(detectarTipo(bytes("RIFF", [0x24, 0, 0, 0], "WAVEfmt "))).toBeNull();
  });

  it("rechaza un ZIP, que es lo que es un .xlsx o un .docx", () => {
    expect(detectarTipo(bytes([0x50, 0x4b, 0x03, 0x04, 0x14, 0]))).toBeNull();
  });

  it("no se rompe con archivos más cortos que la firma", () => {
    expect(detectarTipo(bytes("%PD"))).toBeNull();
    expect(detectarTipo(new Uint8Array())).toBeNull();
  });

  it("exige la firma al principio, no en cualquier lado", () => {
    expect(detectarTipo(bytes("basura %PDF-1.4"))).toBeNull();
  });
});
