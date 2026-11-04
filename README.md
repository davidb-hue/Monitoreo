# Monitoreo – Pizarra de Monitoreo (Lactolac)

Pizarra virtual para el equipo de monitoreo (CCTV y GPS): seguimientos, avisos, instrucciones y cambios de actividad, con trazabilidad completa. Español · zona horaria America/El_Salvador.

## Estructura (monorepo con npm workspaces)

| Carpeta | Qué es |
|---|---|
| `apps/web` | Frontend **Vue 3 + Vite** (Composition API, `<script setup>`). Tiene modo demostración, modo API (Express) y modo Google. |
| `apps/server` | Backend **Express** + **PostgreSQL (Neon)**. Sirve la API `/api/*` y el frontend compilado. Script de base de datos en `db/neon.sql`. |
| `apps/gas` | Versión original en **Google Apps Script + Google Sheets** (revisada) con su guía de instalación. |

## Arranque rápido

Requisitos: Node 20 o superior y una base de datos en [Neon](https://neon.tech).

```bash
npm install
```

### 1. Base de datos (una sola vez)
1. En Neon crea un proyecto. En **SQL Editor** pega **todo** `apps/server/db/neon.sql` y ejecútalo.
2. Copia la cadena de conexión (Dashboard > Connect).
3. `cp apps/server/.env.example apps/server/.env` y completa `DATABASE_URL` y `PEPPER` (secreto largo y aleatorio; guárdalo: si se pierde hay que reasignar todos los PIN).

### 2. Operadores y PIN
```bash
npm run admin -- listar
npm run admin -- pin "Oscar" 4821
npm run admin -- pin "Operador 1" 7305
```
Para cambiar nombres: `npm run admin -- agregar "Nombre" Operador` y `baja "Operador 1"`. Los PIN se guardan como huella SHA-256 con sal; no se pueden leer después. Se rechazan PIN débiles (`1234`, `0000`…).
Otros comandos: `desbloquear`, `alta`, `seed`.

### 3. Ejecutar
```bash
npm run build      # compila el frontend en modo API
npm run start      # http://localhost:3000  (Express sirve la web y la API)
```
Desarrollo con recarga: en dos terminales `npm run dev:server` y `npm run dev:web` (Vite proxea `/api` al servidor).
Solo ver el diseño con datos de ejemplo (sin base de datos): `npm run demo` (PIN `1234`).

## Reglas que cumple
- **Trazabilidad:** toda creación, cambio de estado, comentario, lectura, anulación, inicio/cierre de sesión, PIN fallido y exportación queda en `historial` con operador, fecha y hora.
- **Historial de solo agregar, a nivel de base de datos:** triggers rechazan UPDATE, DELETE y TRUNCATE sobre `historial`, y DELETE sobre `tarjetas`. Las tarjetas solo se **anulan** (solo el coordinador) y no se reactivan.
- **Persistencia central:** nada vive en el navegador (solo el token de sesión en `sessionStorage`).
- **Cuenta compartida:** identidad por operador + PIN; bloqueo 15 min tras 5 intentos fallidos; sesiones de 6 h; rol y estado se revalidan en cada llamada.
- **Operadores sin acceso a la base de datos:** solo conocen el enlace de la pizarra. La cadena de conexión vive únicamente en el servidor. Recomendado: crear el usuario `pizarra_app` con permisos mínimos (bloque comentado al final de `neon.sql`).
- **Concurrencia:** transacciones con bloqueo de fila; si otro operador cambió la tarjeta, se avisa en vez de pisar el cambio; el doble clic no duplica tarjetas.
- Exportación del historial (CSV/PDF por rango de fechas) y resumen PDF para el reporte del viernes, solo coordinador.

## Despliegue en Vercel (un solo proyecto)
La raíz ya trae `vercel.json` y la función `api/index.js`: Vercel compila la web Vue y la sirve junto con la API Express en la misma URL (`/api/*` → función; el resto → la web).

1. En Vercel: **Add New > Project**, importa `davidb-hue/Monitoreo`. Deja *Root Directory* en la raíz (`./`); no cambies el build (lo fija `vercel.json`).
2. En **Settings > Environment Variables** agrega:
   - `DATABASE_URL` = la cadena **pooled** de Neon (la que termina en `-pooler...`).
   - `PEPPER` = el mismo secreto de tu `.env` local (si usas otro, los PIN no coincidirán).
3. **Deploy.** Vercel te da la URL; esa es la que compartes con los operadores.

Notas:
- Los PIN se asignan con `npm run admin` apuntando a la misma base (desde tu equipo), no desde Vercel.
- La exportación a PDF usa `pdfkit`; `vercel.json` ya incluye sus fuentes. Si un PDF fallara en producción, usa CSV y avísame.
- Alternativa sin serverless: un servidor Node (Railway, Render, una VM) con `npm run build && npm run start`.

## Límites a tener en cuenta
- Quien tenga la cadena de conexión del dueño de Neon puede alterar la base (los triggers protegen contra el uso normal y contra el usuario `pizarra_app`, no contra un superusuario que los elimine). Protege esa cuenta con 2FA.
- Cambiar el nombre de un operador invalida su PIN (el nombre forma parte de la huella): reasigna el PIN.
- Este código no se ha ejecutado todavía: probar con la lista de la guía antes de usarlo en operación.
