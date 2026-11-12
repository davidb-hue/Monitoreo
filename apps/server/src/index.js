import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { existsSync } from 'node:fs'
import express from 'express'
import helmet from 'helmet'
import './db.js'
import * as L from './logic.js'

if (process.env.NODE_ENV === 'production' && !process.env.PEPPER) {
  console.error('Falta PEPPER en el entorno (secreto para los PIN). Abortando.')
  process.exit(1)
}

const app = express()
app.disable('x-powered-by')
app.set('trust proxy', 1)
app.use(helmet())
app.use(express.json({ limit: '100kb' }))

// Solo si el frontend vive en otro dominio (p. ej. otro proyecto de Vercel).
if (process.env.CORS_ORIGIN) {
  app.use('/api', (req, res, next) => {
    res.set({
      'Access-Control-Allow-Origin': process.env.CORS_ORIGIN,
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      Vary: 'Origin',
    })
    if (req.method === 'OPTIONS') return res.sendStatus(204)
    next()
  })
}

/** Envuelve un manejador: devuelve su resultado como JSON y manda los errores al manejador común. */
const ah = (fn) => (req, res, next) => Promise.resolve().then(() => fn(req)).then((r) => res.json(r)).catch(next)

const auth = async (req, _res, next) => {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || '')
  req.token = m ? m[1] : ''
  try { req.s = await L.sesion(req.token); next() } catch (e) { next(e) }
}

const api = express.Router()
api.get('/operadores', ah(() => L.listarOperadores()))
api.post('/sesion', ah((req) => L.iniciarSesion(req.body?.nombre, req.body?.pin)))
api.delete('/sesion', auth, ah((req) => L.cerrarSesion(req.token, req.s)))
api.get('/tablero', auth, ah((req) => L.tablero(req.s)))
api.get('/dashboard', auth, ah((req) => L.dashboard(req.s)))
api.post('/tarjetas', auth, ah((req) => L.crearTarjeta(req.s, req.body || {})))
api.post('/tarjetas/:id/acciones', auth, ah((req) =>
  L.actualizarTarjeta(req.s, req.params.id, req.body?.accion, req.body?.comentario, req.body?.estadoVisto)))
api.post('/tarjetas/:id/vencimiento', auth, ah((req) => L.fijarVencimiento(req.s, req.params.id, req.body || {}, req.body?.comentario)))
api.get('/tarjetas/:id/historial', auth, ah((req) => L.obtenerHistorial(req.s, req.params.id)))
api.get('/historial', auth, ah((req) => L.historialGlobal(req.s, req.query)))
api.get('/usuarios', auth, ah((req) => L.listarUsuarios(req.s)))
api.post('/usuarios', auth, ah((req) => L.crearUsuario(req.s, req.body || {})))
api.post('/usuarios/:nombre/editar', auth, ah((req) => L.actualizarUsuario(req.s, req.params.nombre, req.body || {})))
api.post('/usuarios/:nombre/pin', auth, ah((req) => L.asignarPinUsuario(req.s, req.params.nombre, req.body?.pin)))
api.post('/usuarios/:nombre/desbloquear', auth, ah((req) => L.desbloquearUsuario(req.s, req.params.nombre)))
api.get('/catalogo', auth, ah((req) => L.listarCatalogo(req.s)))
api.post('/catalogo', auth, ah((req) => L.crearCatalogo(req.s, req.body || {})))
api.post('/catalogo/:id', auth, ah((req) => L.actualizarCatalogo(req.s, req.params.id, req.body || {})))
api.get('/exportar/historial', auth, ah((req) => L.exportarHistorial(req.s, req.query.formato, req.query.desde, req.query.hasta)))
api.get('/exportar/resumen', auth, ah((req) => L.exportarResumen(req.s, req.query.desde, req.query.hasta)))
api.get('/exportar/reporte', auth, ah((req) => L.exportarReporte(req.s, req.query.tipo, req.query.formato, req.query.desde, req.query.hasta)))
api.use((_req, res) => res.status(404).json({ error: 'No encontrado.' }))
app.use('/api', api)

// Frontend Vue compilado (npm run build:rest en apps/web)
const dist = resolve(dirname(fileURLToPath(import.meta.url)), '../../web/dist')
if (existsSync(dist)) {
  app.use(express.static(dist))
  app.get('*', (_req, res) => res.sendFile(join(dist, 'index.html')))
} else {
  app.get('/', (_req, res) => res.type('text').send('API en marcha. Compila el frontend: npm run build:rest -w apps/web'))
}

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  const status = err.status || (err instanceof L.ErrorApp || err.type === 'entity.parse.failed' ? 400 : 500)
  if (status >= 500) console.error(err)
  res.status(status).json({ error: status >= 500 ? 'Error interno del servidor.' : err.message })
})

export default app // lo usa api/index.js cuando se despliega en Vercel

if (!process.env.VERCEL) {
  const port = Number(process.env.PORT) || 3000
  app.listen(port, () => console.log(`Pizarra de Monitoreo en http://localhost:${port}`))
}
