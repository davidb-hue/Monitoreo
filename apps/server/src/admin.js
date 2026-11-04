// Administración por consola (equivale al menú "Pizarra" de la hoja de Google).
// Uso:  npm run admin -w apps/server -- <comando> [args]
import crypto from 'node:crypto'
import { pool } from './db.js'
import { CFG, huella, pinValido, log } from './logic.js'

const [, , cmd, ...a] = process.argv
const ADMIN = 'Admin (consola)'
const uno = async (n) => (await pool.query('SELECT * FROM operadores WHERE nombre=$1', [n])).rows[0]
const uso = () => console.log(`Comandos:
  seed                         crea Oscar (Coordinador) y Operador 1..5 sin PIN (si no existen)
  agregar "<nombre>" <Coordinador|Operador>
  pin "<nombre>" <PIN>         asigna o cambia el PIN (4 a 6 números)
  baja "<nombre>" | alta "<nombre>"
  desbloquear                  quita los bloqueos por intentos fallidos
  listar`)

try {
  switch (cmd) {
    case 'seed': {
      for (const [n, r] of [['Oscar', CFG.ROL_COORD], ...[1, 2, 3, 4, 5].map((i) => [`Operador ${i}`, 'Operador'])]) {
        await pool.query('INSERT INTO operadores(nombre,rol) VALUES ($1,$2) ON CONFLICT (nombre) DO NOTHING', [n, r])
      }
      await log({ operador: ADMIN, accion: 'CONFIGURACIÓN', detalle: 'Operadores iniciales verificados.' })
      console.log('Listo. Asigna los PIN con: pin "<nombre>" <PIN>'); break
    }
    case 'agregar': {
      const [nombre, rol = 'Operador'] = a
      if (!nombre || !['Coordinador', 'Operador'].includes(rol)) throw new Error('Uso: agregar "<nombre>" <Coordinador|Operador>')
      await pool.query('INSERT INTO operadores(nombre,rol) VALUES ($1,$2)', [nombre.trim(), rol])
      await log({ operador: ADMIN, accion: 'CONFIGURACIÓN', detalle: `Operador agregado: ${nombre} (${rol})` })
      console.log('Agregado.'); break
    }
    case 'pin': {
      const [nombre, pin] = a
      const op = await uno(nombre)
      if (!op) throw new Error('Operador no encontrado.')
      if (!pinValido(String(pin))) throw new Error('PIN rechazado: 4 a 6 números, sin repetir un solo dígito ni secuencias como 1234.')
      const sal = crypto.randomBytes(16).toString('hex')
      await pool.query('UPDATE operadores SET sal=$1, huella=$2, intentos=0, bloqueado_hasta=NULL WHERE id=$3', [sal, huella(sal, op.nombre, String(pin)), op.id])
      await pool.query('DELETE FROM sesiones WHERE nombre=$1', [op.nombre])
      await log({ operador: ADMIN, accion: 'CONFIGURACIÓN', detalle: `PIN asignado o cambiado para: ${op.nombre}` }) // el PIN nunca se registra
      console.log('PIN guardado (solo se conserva su huella SHA-256 con sal).'); break
    }
    case 'baja':
    case 'alta': {
      const op = await uno(a[0])
      if (!op) throw new Error('Operador no encontrado.')
      await pool.query('UPDATE operadores SET activo=$1 WHERE id=$2', [cmd === 'alta', op.id])
      if (cmd === 'baja') await pool.query('DELETE FROM sesiones WHERE nombre=$1', [op.nombre])
      await log({ operador: ADMIN, accion: 'CONFIGURACIÓN', detalle: `${op.nombre}: ${cmd}` })
      console.log('Hecho.'); break
    }
    case 'desbloquear': {
      const n = (await pool.query('UPDATE operadores SET intentos=0, bloqueado_hasta=NULL WHERE intentos>0')).rowCount
      await log({ operador: ADMIN, accion: 'CONFIGURACIÓN', detalle: `Bloqueos de acceso eliminados (${n}).` })
      console.log(`Bloqueos eliminados: ${n}`); break
    }
    case 'listar':
      console.table((await pool.query("SELECT nombre, rol, activo, huella <> '' AS tiene_pin, intentos FROM operadores ORDER BY id")).rows); break
    default: uso()
  }
} catch (e) {
  console.error('Error:', e.code === '23505' ? 'Ya existe un operador con ese nombre.' : e.message)
  process.exitCode = 1
} finally {
  await pool.end()
}
