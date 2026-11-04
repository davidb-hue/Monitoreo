// Función serverless de Vercel: toda la API Express corre aquí.
// Vercel trata los archivos de /api como funciones; reexporta la app de apps/server.
export { default } from '../apps/server/src/index.js'
