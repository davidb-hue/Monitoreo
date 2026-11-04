-- =====================================================================
--  PIZARRA DE MONITOREO – Lactolac
--  Script único para Neon (PostgreSQL 15+). Pégalo completo en
--  Neon > SQL Editor y ejecútalo UNA vez. Es idempotente: si se repite,
--  no borra ni duplica nada.
--
--  Qué garantiza la base de datos (aunque alguien se conecte directo):
--   · El historial es de SOLO AGREGAR: no se puede modificar, borrar ni truncar.
--   · Las tarjetas NO se eliminan; solo se anulan, y una anulada no se reactiva.
--   · ID, número, creador y fecha de creación de una tarjeta no cambian.
--  Los PIN se guardan como huella SHA-256 con sal (la calcula el servidor).
-- =====================================================================

BEGIN;

-- ---------- Operadores ----------
CREATE TABLE IF NOT EXISTS operadores (
  id              int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre          text NOT NULL UNIQUE CHECK (length(btrim(nombre)) BETWEEN 1 AND 80),
  rol             text NOT NULL DEFAULT 'Operador' CHECK (rol IN ('Coordinador', 'Operador')),
  sal             text NOT NULL DEFAULT '',      -- sal aleatoria por operador
  huella          text NOT NULL DEFAULT '',      -- SHA-256(pepper|sal|nombre|pin); vacío = sin PIN
  activo          boolean NOT NULL DEFAULT true,
  intentos        int NOT NULL DEFAULT 0,        -- PIN fallidos seguidos
  bloqueado_hasta timestamptz                    -- bloqueo tras 5 intentos fallidos
);

-- ---------- Tarjetas (Registros) ----------
CREATE TABLE IF NOT EXISTS tarjetas (
  num         bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  id          text PRIMARY KEY,                  -- 'SM-0001' (lo asigna el trigger)
  creacion    timestamptz NOT NULL DEFAULT now(),
  creado_por  text NOT NULL,
  tipo        text NOT NULL,
  categoria   text NOT NULL,
  sitio       text NOT NULL,
  turno       text NOT NULL,
  titulo      text NOT NULL CHECK (length(btrim(titulo)) BETWEEN 1 AND 150),
  detalle     text NOT NULL CHECK (length(btrim(detalle)) BETWEEN 1 AND 5000),
  prioridad   text NOT NULL CHECK (prioridad IN ('Alta', 'Media', 'Baja')),
  responsable text NOT NULL DEFAULT '',
  fecha       date,                              -- fecha compromiso (opcional)
  estado      text NOT NULL DEFAULT 'Abierto' CHECK (estado IN ('Abierto', 'En seguimiento', 'Cerrado', 'Anulado')),
  ult_act     timestamptz NOT NULL DEFAULT now(),
  act_por     text NOT NULL,
  ult_com     text NOT NULL DEFAULT '',
  n_act       int NOT NULL DEFAULT 0,
  leido       text[] NOT NULL DEFAULT '{}',
  vence       timestamptz,                       -- tiempo máximo de gestión (opcional)
  cerrado_en  timestamptz                        -- momento de cierre (para el tiempo que estuvo abierta)
);
CREATE INDEX IF NOT EXISTS ix_tarjetas_estado ON tarjetas (estado, ult_act);
CREATE INDEX IF NOT EXISTS ix_tarjetas_creacion ON tarjetas (creacion);

-- ---------- Historial (solo agregar) ----------
CREATE TABLE IF NOT EXISTS historial (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fecha      timestamptz NOT NULL DEFAULT now(),
  operador   text NOT NULL,
  accion     text NOT NULL,
  tarjeta_id text NOT NULL DEFAULT '',
  detalle    text NOT NULL DEFAULT '',
  anterior   text NOT NULL DEFAULT '',
  nuevo      text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_hist_tarjeta ON historial (tarjeta_id);
CREATE INDEX IF NOT EXISTS ix_hist_fecha ON historial (fecha);

-- ---------- Sesiones y solicitudes (técnicas) ----------
CREATE TABLE IF NOT EXISTS sesiones (
  token_hash text PRIMARY KEY,                   -- se guarda el hash, nunca el token
  nombre     text NOT NULL,
  expira     timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS solicitudes (         -- evita tarjetas duplicadas por doble clic
  req_id     text PRIMARY KEY,
  tarjeta_id text,
  creado     timestamptz NOT NULL DEFAULT now()
);

-- ---------- Reglas de trazabilidad (triggers) ----------
CREATE OR REPLACE FUNCTION fn_tarjetas_id() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.id := 'SM-' || lpad(NEW.num::text, greatest(4, length(NEW.num::text)), '0');
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS tg_tarjetas_id ON tarjetas;
CREATE TRIGGER tg_tarjetas_id BEFORE INSERT ON tarjetas
  FOR EACH ROW EXECUTE FUNCTION fn_tarjetas_id();

CREATE OR REPLACE FUNCTION fn_tarjetas_inmutables() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.num IS DISTINCT FROM OLD.num
     OR NEW.creacion IS DISTINCT FROM OLD.creacion OR NEW.creado_por IS DISTINCT FROM OLD.creado_por THEN
    RAISE EXCEPTION 'ID, número, creador y fecha de creación de una tarjeta no se pueden cambiar';
  END IF;
  IF OLD.estado = 'Anulado' AND NEW.estado <> 'Anulado' THEN
    RAISE EXCEPTION 'Una tarjeta anulada no se puede reactivar';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS tg_tarjetas_inmutables ON tarjetas;
CREATE TRIGGER tg_tarjetas_inmutables BEFORE UPDATE ON tarjetas
  FOR EACH ROW EXECUTE FUNCTION fn_tarjetas_inmutables();

CREATE OR REPLACE FUNCTION fn_prohibido() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% no permitido en %: el historial es de solo agregar y las tarjetas solo se anulan', TG_OP, TG_TABLE_NAME;
END $$;

DROP TRIGGER IF EXISTS tg_historial_fila ON historial;
CREATE TRIGGER tg_historial_fila BEFORE UPDATE OR DELETE ON historial
  FOR EACH ROW EXECUTE FUNCTION fn_prohibido();
DROP TRIGGER IF EXISTS tg_historial_truncate ON historial;
CREATE TRIGGER tg_historial_truncate BEFORE TRUNCATE ON historial
  FOR EACH STATEMENT EXECUTE FUNCTION fn_prohibido();

DROP TRIGGER IF EXISTS tg_tarjetas_borrar ON tarjetas;
CREATE TRIGGER tg_tarjetas_borrar BEFORE DELETE ON tarjetas
  FOR EACH ROW EXECUTE FUNCTION fn_prohibido();
DROP TRIGGER IF EXISTS tg_tarjetas_truncate ON tarjetas;
CREATE TRIGGER tg_tarjetas_truncate BEFORE TRUNCATE ON tarjetas
  FOR EACH STATEMENT EXECUTE FUNCTION fn_prohibido();

-- ---------- Datos iniciales (sin PIN: se asignan con `npm run admin -- pin ...`) ----------
INSERT INTO operadores (nombre, rol) VALUES
  ('Oscar', 'Coordinador'),
  ('Operador 1', 'Operador'), ('Operador 2', 'Operador'), ('Operador 3', 'Operador'),
  ('Operador 4', 'Operador'), ('Operador 5', 'Operador')
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO historial (operador, accion, detalle)
SELECT 'Sistema', 'INSTALACIÓN', 'Base de datos creada (Neon).'
WHERE NOT EXISTS (SELECT 1 FROM historial WHERE accion = 'INSTALACIÓN');

COMMIT;

-- =====================================================================
--  RECOMENDADO: usuario de base de datos exclusivo para la aplicación.
--  Los operadores nunca reciben esta cadena de conexión; solo el servidor.
--  Descomenta, cambia la contraseña y ejecuta. Luego usa este usuario en
--  DATABASE_URL del servidor (deja el usuario dueño solo para ti).
-- =====================================================================
-- CREATE ROLE pizarra_app LOGIN PASSWORD 'CAMBIA-ESTA-CONTRASEÑA-LARGA';
-- GRANT USAGE ON SCHEMA public TO pizarra_app;
-- GRANT SELECT, INSERT          ON historial    TO pizarra_app;   -- sin UPDATE/DELETE
-- GRANT SELECT, INSERT, UPDATE  ON tarjetas     TO pizarra_app;   -- sin DELETE
-- GRANT SELECT, INSERT, UPDATE  ON operadores   TO pizarra_app;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON sesiones, solicitudes TO pizarra_app;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO pizarra_app;
