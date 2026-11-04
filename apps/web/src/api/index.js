// Elige el backend:
//  - dentro de Google Apps Script  -> google.script.run
//  - build con --mode rest          -> API Express (apps/server)
//  - cualquier otro caso            -> demostración con datos de ejemplo
import * as demo from './demo.js'
import * as gas from './gas.js'
import * as rest from './rest.js'

const enGoogle = typeof window !== 'undefined' && !!(window.google && window.google.script && window.google.script.run)
const enRest = import.meta.env.VITE_API === 'rest'

export const esDemo = !enGoogle && !enRest
export const api = enGoogle ? gas : enRest ? rest : demo
