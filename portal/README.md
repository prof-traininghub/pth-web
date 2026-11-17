# Portal del alumno

Se publica en `https://proftraininghub.com.ar/alumnos/`. Pantallas en `src/alumnos/`, lógica de datos en `portal/apps-script/Codigo.gs`.

## Cómo funciona

1. El alumno entra con su cuenta de Google (botón de Google, ID de cliente en `PORTAL_CLIENT_ID` de `build.py`).
2. El portal manda ese ingreso al Apps Script publicado (`PORTAL_API` de `build.py`).
3. El script comprueba el ingreso con Google, busca el mail en la pestaña **Alumnos** de la planilla «Portal del alumno PTH» (Drive de PTH) y devuelve solo los datos de ese alumno.

No hay contraseñas ni claves secretas en este repositorio: el ID de cliente y la dirección del script son públicos por diseño.

## La planilla

| Pestaña | Qué se carga |
|---|---|
| Alumnos | Una fila por alumno: mail de Google, curso, nivel, módulo actual, día y horario, links de Meet y Classroom. «Activo: No» le quita el acceso. |
| Cuotas | Una fila por cuota: mail, mes, monto, vencimiento, estado (Pendiente/Pagado), fecha y medio de pago. |
| Programas | Una fila por módulo de cada curso y nivel: temas, bibliografía (una línea por material, `Texto \| link`), tareas, práctica, examen. |
| Niveles | Una fila por curso y nivel con el total de módulos. Es la base de la barra «Avance del nivel»; si falta, se usa la cantidad de módulos cargados en Programas. |
| Docentes | Un nombre por fila. Es la lista del desplegable «Docente» del formulario. |
| Devoluciones | La llena el formulario de las docentes (Devolución para el alumno · PTH). |
| Opiniones | La llena el portal cuando un alumno envía su opinión. |
| Config | Cuentas para transferir («Cuenta 1 · Titular / Entidad / Alias / CVU / WhatsApp», ídem Cuenta 2); WhatsApp de Caro y Marian; mensaje opcional para el inicio. El CVU va con formato de texto para que no se pierdan dígitos. |

## Cambios en el script

Editar `portal/apps-script/Codigo.gs`, pegarlo en el proyecto de Apps Script «Portal del alumno PTH» (script.google.com, cuenta de PTH) y publicar una **nueva versión** de la implementación existente (así no cambia la dirección).
