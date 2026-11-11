# Pizarra de Monitoreo — instalación local con Docker

Todo corre en tu equipo: una base de datos **PostgreSQL** (en lugar de Neon) y el
**servidor** que sirve la pizarra. No depende de internet ni de Vercel.

## 1. Requisito
Instala **Docker Desktop** (Windows/Mac) o Docker Engine (Linux) y ábrelo.

## 2. Configurar el secreto
En la carpeta del proyecto, copia el archivo de ejemplo y ponle un PEPPER.

En **PowerShell** (Windows):

```powershell
Copy-Item .env.example .env
```

Abre `.env` (con el Bloc de notas) y reemplaza el `PEPPER` por un texto largo y
secreto. Para generar uno, en **PowerShell**:

```powershell
$b=New-Object byte[] 48; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b)
```

(En Mac/Linux o Git Bash: `cp .env.example .env` y `openssl rand -base64 48`.)

> El PEPPER protege los PIN. Guárdalo: si lo cambias después, los PIN dejan de
> funcionar y hay que volver a asignarlos. Esta base local es independiente de la
> de Vercel, así que puede tener su propio PEPPER y sus propios PIN.

## 3. Levantar todo

```bash
docker compose up -d --build
```

La primera vez tarda un poco (compila el frontend y crea la base). Cuando termine,
abre **http://localhost:3000**.

## 4. Asignar los PIN
La base local arranca con los operadores de ejemplo (**Oscar** como Coordinador y
**Operador 1** … **Operador 5**), todos **sin PIN**. Asigna el de Oscar:

```bash
docker compose exec app node apps/server/src/admin.js pin "Oscar" 2468
```

Entra a http://localhost:3000 como **Oscar** con ese PIN. Desde la pestaña
**Usuarios** ya puedes crear/renombrar operadores y asignarles PIN desde la web.
(El PIN debe ser de 4 a 6 números, sin repetir un dígito ni secuencias como 1234.)

Ver los operadores por consola:

```bash
docker compose exec app node apps/server/src/admin.js listar
```

## 5. Que lo usen los demás operadores (red interna)
En el equipo que corre Docker, averigua su IP local (p. ej. `ipconfig` en Windows →
algo como `192.168.1.50`). Los demás, en la misma red, abren:

```
http://192.168.1.50:3000
```

Si no abre, permite el puerto **3000** en el Firewall de Windows para Docker.

## Comandos útiles

| Acción | Comando |
|---|---|
| Ver estado | `docker compose ps` |
| Ver registros (logs) | `docker compose logs -f app` |
| Detener | `docker compose stop` |
| Arrancar de nuevo | `docker compose start` |
| Apagar (conserva los datos) | `docker compose down` |
| Actualizar tras cambios de código | `docker compose up -d --build` |
| **Borrar TODO incl. datos** | `docker compose down -v` |

Los datos viven en el volumen `pgdata` y **se conservan** aunque apagues o
reinicies. Solo `down -v` los borra.

## Respaldos de la base

```bash
# Guardar un respaldo
docker compose exec db pg_dump -U pizarra pizarra > respaldo.sql

# Restaurar (con el stack levantado)
docker compose exec -T db psql -U pizarra pizarra < respaldo.sql
```

## Opción alternativa: app local pero usando la base de Neon
Si prefieres los **mismos datos** que la versión de Vercel, en `.env` pon el
`DATABASE_URL` de Neon y el **mismo PEPPER** de producción, y en `docker-compose.yml`
quita el servicio `db` y el `depends_on`. Así el contenedor `app` se conecta a Neon
en vez de a la base local.
