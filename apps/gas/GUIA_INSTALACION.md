# Guía de instalación – Pizarra de Monitoreo (Google)

Tiempo estimado: 30 minutos. Hazlo con la **cuenta Gmail compartida** (será la dueña de todo).

## 1. Crear la hoja
1. Entra a <https://sheets.google.com> con la cuenta compartida y crea una hoja en blanco.
2. Ponle nombre: `Pizarra de Monitoreo – Lactolac`.
3. **No compartas esta hoja con nadie.** Solo la cuenta dueña debe poder abrirla.

## 2. Pegar los archivos
1. En la hoja: **Extensiones > Apps Script**.
2. Ajustes del proyecto (engranaje) > activa **«Mostrar el archivo de manifiesto appsscript.json en el editor»**.
3. Archivo `Codigo.gs`: borra lo que hay y pega el contenido de `Codigo.gs`.
4. Archivo `appsscript.json`: pega el contenido del `appsscript.json` entregado (fija la zona horaria America/El_Salvador).
5. Crea un archivo HTML (**+ > HTML**) con nombre exacto `Index` y pega el contenido de `Index.html`.
6. Guarda (Ctrl+S).

## 3. Ejecutar `instalar` (una sola vez)
1. En el editor elige la función `instalar` y pulsa **Ejecutar**.
2. Acepta los permisos (Google avisará «app no verificada»: **Avanzado > Ir a … (no seguro)**; es tu propio script).
3. Al terminar, la hoja tendrá `Registros`, `Historial` y `Configuración`, protegidas, y dos disparadores de auditoría.
4. Si sale «Ya está instalado», no repitas: ya se hizo.

## 4. Nombres y PIN
1. Abre la pestaña **Configuración**. Edita la columna A con los nombres reales (Oscar + 5 operadores). Rol: `Coordinador` u `Operador`. Activo: `Sí`/`No`.
2. En la columna C escribe el **PIN nuevo** de cada persona: 4 a 6 números (se rechazan `1234`, `0000`, etc.).
3. **Importante:** cambiar el nombre de alguien después invalida su PIN (el nombre forma parte de la huella). Reasigna el PIN si lo cambias.

## 5. Proteger los PIN
1. Recarga la hoja. Aparece el menú **Pizarra**.
2. **Pizarra > Proteger PINs escritos** (la primera vez pide permisos). Convierte los PIN en huella SHA-256 con sal y **borra** el texto de la columna C.
3. Verifica: columna C vacía, columna D con códigos largos. Cada operador debe conocer solo su PIN.

## 6. Implementar como aplicación web
1. En Apps Script: **Implementar > Nueva implementación > Aplicación web**.
2. Ejecutar como: **Yo**.
3. Quién tiene acceso: **Cualquier usuario** (pide iniciar sesión en Google; es la opción que funciona con la cuenta compartida). No elijas «anónimo».
4. **Implementar** y copia la URL. También la verás en **Pizarra > Ver enlace**.
5. Cuando edites el código en el futuro: **Implementar > Administrar implementaciones > editar > Nueva versión** (la URL se mantiene).

## 7. Compartir el enlace
- Comparte **solo la URL de la pizarra** con los operadores, nunca la hoja.
- Los operadores abren el enlace con la sesión de la cuenta compartida, eligen su nombre y escriben su PIN.
- Si un operador queda bloqueado (5 PIN erróneos, 15 min): **Pizarra > Desbloquear operadores**.

## 7b. Exportación y resumen semanal (coordinador)
- En la pizarra, Oscar ve el botón **Exportar / Resumen**: elige fechas y descarga **Historial CSV**, **Historial PDF** (hasta 3 000 registros) o **Resumen PDF**. Cada descarga queda en el historial como `EXPORTAR`.
- Resumen por correo: en la hoja, **Pizarra > Activar resumen semanal por correo**, escribe el/los correos. Se envía cada **viernes a las 13:00** (el reporte se entrega a las 14:00) con el PDF adjunto, de lunes a viernes. Pide un permiso extra de envío de correo la primera vez.
- Tras actualizar el código con estas funciones, crea una **nueva versión** de la implementación (paso 6.5).

## 8. Pruebas antes de usarla (15 min)
- [ ] Exportar CSV y PDF de la semana; abrir el CSV en Excel (acentos correctos).
- [ ] Entrar como operador con PIN correcto e incorrecto (5 veces → bloqueo).
- [ ] Crear tarjeta con título `=1+1`: debe verse literal, no como `2`.
- [ ] Mover tarjeta sin comentario → debe exigirlo; «Confirmar lectura» → no lo exige.
- [ ] Abrir la misma tarjeta en dos navegadores y moverla desde ambos → el segundo recibe el aviso de cambio concurrente.
- [ ] Como operador, intentar crear «Instrucción nueva» → no aparece en la lista.
- [ ] Anular como Oscar → desaparece del tablero pero sigue en `Historial`.
- [ ] Editar una celda de `Registros` a mano (como dueño) → aparece `EDICIÓN MANUAL` en `Historial`.
- [ ] «Cambiar de operador» → pide PIN y no muestra datos del anterior.
- [ ] Comprobar que las horas coinciden con la hora de El Salvador.

## Notas operativas
- **Respalda la sal:** si se pierden las propiedades del script (Ajustes del proyecto > Propiedades del script), todos los PIN dejan de funcionar y hay que reasignarlos.
- La columna «Cuenta Google» del historial sirve de poco con cuenta compartida; la trazabilidad real es el campo **Operador**.
- Registros crece sin límite. Revisa el rendimiento al pasar de unas 5 000 tarjetas y archiva (copiando a otro libro) lo antiguo.
- La sesión dura 6 h como máximo; cada relevo debe usar «Cambiar de operador».
- El historial no se borra desde la interfaz, pero el **dueño de la hoja sí puede editarla**: protégela con verificación en dos pasos y no uses esa sesión para otra cosa.
