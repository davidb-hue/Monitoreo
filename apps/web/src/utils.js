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
