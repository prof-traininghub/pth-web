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
| Avisos | Notificaciones manuales: fecha y hora (vacía = en los próximos 5 minutos), Para («Todos», un curso, «Curso · Nivel», un nivel o mails), título, mensaje y link opcional. «Estado» lo completa el sistema. |
| Suscripciones | La completa el portal: un dispositivo por fila con sus preferencias. No hace falta tocarla. |
| Docentes | Un nombre por fila. Es la lista del desplegable «Docente» del formulario. |
| Devoluciones | La llena el formulario de las docentes (Devolución para el alumno · PTH). |
| Opiniones | La llena el portal cuando un alumno envía su opinión. |
| Config | Cuentas para transferir («Cuenta 1 · Titular / Entidad / Alias / CVU / WhatsApp», ídem Cuenta 2); WhatsApp de Caro y Marian; mensaje opcional para el inicio. El CVU va con formato de texto para que no se pierdan dígitos. |

## Cambios en el script

Editar `portal/apps-script/Codigo.gs`, pegarlo en el proyecto de Apps Script «Portal del alumno PTH» (script.google.com, cuenta de PTH) y publicar una **nueva versión** de la implementación existente (así no cambia la dirección).

## Avisos al celular

- Se mandan con Firebase Cloud Messaging (proyecto `portal-alumno-pth`, cuenta de PTH). El proyecto de Apps Script está vinculado a ese proyecto de Google Cloud (n.º 906483008838) y su manifiesto está en `apps-script/appsscript.json`. La configuración pública de la app web está en `PORTAL_FIREBASE` de `build.py`.
- El activador `enviarAvisos` corre cada 5 minutos: avisos manuales de la pestaña Avisos, «tu clase empieza en N minutos» (entre 5 y 14 minutos antes) y cuota vencida pendiente (a las 10, y cada 7 días mientras siga pendiente).
- En iPhone solo llegan si el alumno agregó el portal a la pantalla de inicio desde Safari.

## Velocidad

- El portal guarda una sesión propia de 30 días (firmada por el script) y los últimos datos en el dispositivo: abre al instante y actualiza en segundo plano.
- El script guarda en caché los datos de cada alumno 10 minutos; cualquier cambio en la planilla o una devolución nueva la invalida.

## Alumnos con más de un curso

- Recomendado: una fila por curso con el mismo mail (cada curso con su día, horario, Meet, Classroom, nivel y módulo).
- También funciona «General English + Business English» en una misma fila: mismo horario; nivel y módulo se separan igual con «+» («Intermedio (B1) + Avanzado (B2)», «3 + 1»).
- El portal muestra la próxima clase de cualquiera de sus cursos, una tarjeta por curso en Inicio y pestañas por curso en Programa y material.
