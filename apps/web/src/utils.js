export const TZ = 'America/El_Salvador'

export const msgErr = (e) => String((e && e.message) || e).replace(/^Error:\s*/, '')

export const slug = (s) =>
  String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-')

export function fFecha(iso, conHora = false) {
  if (!iso) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) { const p = iso.split('-'); return `${p[2]}/${p[1]}/${p[0]}` } // fecha sin hora: sin conversión de zona
  const d = new Date(iso)
  const base = { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' }
  return conHora
    ? d.toLocaleString('es-SV', { ...base, hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('es-SV', base)
}

export function hace(iso) {
  if (!iso) return ''
  const m = Math.round((Date.now() - new Date(iso)) / 60000)
  if (m < 1) return 'hace un momento'
  if (m < 60) return `hace ${m} min`
  const h = Math.round(m / 60)
  return h < 24 ? `hace ${h} h` : `hace ${Math.round(h / 24)} d`
}

export const hoyES = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ }) // yyyy-mm-dd
export const vencida = (t) => !!t.fecha && t.estado !== 'Cerrado' && t.fecha < hoyES()

export function lunesES() {
  const d = new Date(hoyES() + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return d.toISOString().slice(0, 10)
}

export const uuid = () =>
  window.crypto && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)

/** Duración legible a partir de milisegundos: "2 d 5 h", "3 h 10 min", "25 min". */
export function duracion(ms) {
  if (ms == null || ms < 0) return '—'
  const min = Math.floor(ms / 60000)
  if (min < 1) return 'menos de 1 min'
  if (min < 60) return min + ' min'
  const h = Math.floor(min / 60), m = min % 60
  if (h < 24) return h + ' h' + (m ? ' ' + m + ' min' : '')
  const d = Math.floor(h / 24), hr = h % 24
  return d + ' d' + (hr ? ' ' + hr + ' h' : '')
}

/** Tiempo que la tarjeta lleva (o estuvo) abierta, en ms. */
export function abiertaMs(t, ahora) {
  if (!t.creacion) return null
  const ini = new Date(t.creacion).getTime()
  const fin = (t.estado === 'Cerrado' && t.cerradoEn) ? new Date(t.cerradoEn).getTime() : (ahora || Date.now())
  return fin - ini
}

/** Marcador del tiempo máximo de gestión (punto 6). rojo = vencido y sin cerrar. */
export function slaInfo(t, ahora) {
  if (!t.vence) return null
  const now = ahora || Date.now()
  const lim = new Date(t.vence).getTime()
  const cerrada = t.estado === 'Cerrado' || t.estado === 'Anulado'
  if (cerrada) {
    const cerr = t.cerradoEn ? new Date(t.cerradoEn).getTime() : lim
    return { rojo: false, cerrada: true, texto: cerr > lim ? 'Cerrada fuera de tiempo' : 'Cerrada a tiempo' }
  }
  const resta = lim - now
  if (resta < 0) return { rojo: true, cerrada: false, texto: 'Vencido hace ' + duracion(-resta) }
  return { rojo: false, cerrada: false, texto: 'Cierra en ' + duracion(resta) }
}

/** Descarga un archivo recibido como {nombre, mime, base64}. */
export function descargar(r) {
  const bin = atob(r.base64)
  const u = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i)
  const url = URL.createObjectURL(new Blob([u], { type: r.mime }))
  const a = document.createElement('a')
  a.href = url; a.download = r.nombre
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
