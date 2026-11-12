// Escritor XLSX mínimo, SIN dependencias, válido en Node y en el navegador.
// Genera un .xlsx real (ZIP con método STORE + CRC32, celdas de texto en línea),
// no un CSV renombrado. Abre en Excel, LibreOffice y Google Sheets.
const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const enc = new TextEncoder()

/* ---- base64 de bytes, portable (navegador: btoa; Node: Buffer) ---- */
function b64(bytes) {
  let bin = ''
  const paso = 0x8000
  for (let i = 0; i < bytes.length; i += paso) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + paso))
  if (typeof btoa !== 'undefined') return btoa(bin)
  return Buffer.from(bin, 'binary').toString('base64')
}

/* ---- CRC32 ---- */
const TABLA = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0 }
  return t
})()
function crc32(bytes) {
  let c = 0xFFFFFFFF
  for (let i = 0; i < bytes.length; i++) c = TABLA[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8)
  return (c ^ 0xFFFFFFFF) >>> 0
}

/* ---- XML ---- */
const esc = (v) => String(v == null ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')

function colRef(i) { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26) } return s }

function hojaXml(filas) {
  let x = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  x += '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'
  for (let r = 0; r < filas.length; r++) {
    const fila = filas[r] || []
    x += `<row r="${r + 1}">`
    for (let c = 0; c < fila.length; c++) {
      const ref = colRef(c) + (r + 1)
      const est = r === 0 ? ' s="1"' : ''
      const v = fila[c]
      if (typeof v === 'number' && isFinite(v)) { x += `<c r="${ref}"${est}><v>${v}</v></c>`; continue }
      const s = esc(v)
      if (s === '') { x += `<c r="${ref}"${est}/>`; continue }
      x += `<c r="${ref}"${est} t="inlineStr"><is><t xml:space="preserve">${s}</t></is></c>`
    }
    x += '</row>'
  }
  return x + '</sheetData></worksheet>'
}

const STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
  + '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
  + '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
  + '<borders count="1"><border/></borders>'
  + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
  + '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
  + '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>'
  + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'

const RELS_ROOT = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
  + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'

const nombreHoja = (s, i) => (String(s || ('Hoja ' + (i + 1))).replace(/[:\\/?*[\]]/g, ' ').trim().slice(0, 31) || ('Hoja ' + (i + 1)))

function contentTypes(n) {
  let x = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
    + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
  for (let i = 0; i < n; i++) x += `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
  return x + '</Types>'
}

function workbookXml(hojas) {
  let s = ''
  hojas.forEach((h, i) => { s += `<sheet name="${esc(nombreHoja(h.nombre, i))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>` })
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
    + 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' + s + '</sheets></workbook>'
}

function workbookRels(n) {
  let s = ''
  for (let i = 0; i < n; i++) s += `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
  s += `<Relationship Id="rId${n + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + s + '</Relationships>'
}

/* ---- ZIP (STORE, sin compresión) ---- */
const u16 = (n) => [n & 0xFF, (n >>> 8) & 0xFF]
const u32 = (n) => [n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF]

function zip(archivos) {
  const partes = []; let offset = 0
  const push = (arr) => { const u = arr instanceof Uint8Array ? arr : Uint8Array.from(arr); partes.push(u); offset += u.length }
  const entradas = archivos.map((f) => {
    const nom = enc.encode(f.name); const data = f.data; const crc = crc32(data); const local = offset
    push([].concat(u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(nom.length), u16(0)))
    push(nom); push(data)
    return { nom, crc, size: data.length, local }
  })
  const cdIni = offset
  entradas.forEach((e) => {
    push([].concat(u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0), u32(e.crc), u32(e.size), u32(e.size),
      u16(e.nom.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(e.local)))
    push(e.nom)
  })
  const cdSize = offset - cdIni
  push([].concat(u32(0x06054b50), u16(0), u16(0), u16(entradas.length), u16(entradas.length), u32(cdSize), u32(cdIni), u16(0)))
  let total = 0; partes.forEach((p) => { total += p.length })
  const out = new Uint8Array(total); let o = 0; partes.forEach((p) => { out.set(p, o); o += p.length })
  return out
}

/** Genera un .xlsx. hojas: [{ nombre, filas }], filas = array de filas, cada fila = array de celdas (texto o número). */
export function libro(nombreArchivo, hojas) {
  if (!hojas || !hojas.length) hojas = [{ nombre: 'Hoja 1', filas: [] }]
  const archivos = [
    { name: '[Content_Types].xml', data: enc.encode(contentTypes(hojas.length)) },
    { name: '_rels/.rels', data: enc.encode(RELS_ROOT) },
    { name: 'xl/workbook.xml', data: enc.encode(workbookXml(hojas)) },
    { name: 'xl/_rels/workbook.xml.rels', data: enc.encode(workbookRels(hojas.length)) },
    { name: 'xl/styles.xml', data: enc.encode(STYLES) },
  ]
  hojas.forEach((h, i) => archivos.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data: enc.encode(hojaXml(h.filas || [])) }))
  const nombre = /\.xlsx$/i.test(nombreArchivo) ? nombreArchivo : nombreArchivo + '.xlsx'
  return { nombre, mime: MIME_XLSX, base64: b64(zip(archivos)) }
}

/** CSV UTF-8 (con BOM) a partir de una tabla de filas. */
export function csvArchivo(nombreArchivo, filas) {
  const q = (v) => { let s = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"' }
  const txt = '﻿' + (filas || []).map((f) => (f || []).map(q).join(',')).join('\r\n')
  const nombre = /\.csv$/i.test(nombreArchivo) ? nombreArchivo : nombreArchivo + '.csv'
  return { nombre, mime: 'text/csv', base64: b64(enc.encode(txt)) }
}
