// Carga .env si existe (desarrollo local). En producción las variables
// vienen del entorno del contenedor. Debe importarse antes que cualquier
// módulo que lea process.env (ej: db/client.ts).
try {
  process.loadEnvFile();
} catch {
  // sin .env: seguimos con el entorno del proceso
}
