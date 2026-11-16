# DESIGN.md · Professional Training Hub

Fuente de verdad: el kit de marca «Professional Training Hub» (Design System en Claude). Este archivo resume lo que usa el sitio.

## Color

| Token | Claro | Oscuro | Uso |
| --- | --- | --- | --- |
| `--amarillo` | #eac23b | #eac23b | Bloques, botón de WhatsApp, subrayados. Nunca texto sobre claro |
| `--negro` | #1d231f | #1d231f | Bandas oscuras, portadas |
| `--on-amarillo` | #1d231f | #1d231f | Texto sobre amarillo |
| `--on-negro` | #f4f3ee | #f4f3ee | Texto sobre negro |
| `--surface` | #ffffff | #151a16 | Fondo de página |
| `--surface-alt` | #f4f3ee | #1f2621 | Secciones alternas, tarjetas |
| `--crema` | #fbf4da | #2b2817 | Bandas destacadas, testimonios |
| `--ink` | #1d231f | #f2f1eb | Texto principal |
| `--ink-muted` | #5c625d | #a3a9a2 | Texto secundario |
| `--ocre` | #7a5e00 | #eac23b | Antetítulos y enlaces destacados |
| `--line` | #e3e3dc | #2f3631 | Bordes |
| `--focus` | #1d231f | #eac23b | Anillo de foco 2px, separación 2px |

## Tipografía

- Archivo 400/500/700/800 para títulos y texto. Títulos en tipo oración, 800, interlineado ajustado.
- Archivo Narrow 600/700 para antetítulos en MAYÚSCULAS (+0.12em), botones y frases destacadas.
- Fuentes alojadas en el propio sitio (`/assets/fonts/`), `font-display: swap`.

## Forma

- Tomado de la web anterior: encabezado y portadas en negro, tarjetas con esquinas de 10px, botones de 6px, números de pasos y avatares circulares. Fotos de cursos alojadas en `/assets/img/`.
- Sin sombras ni degradados. Bordes de 1px en `--line`.
- Recurso gráfico: el marco de dos esquinas (superior izquierda e inferior derecha), una vez por sección como máximo.
- Escala de espacio de 4px: 4, 8, 16, 24, 40, 64, 96.

## Componentes

Botón primario (`--ink` / `--surface`), secundario (borde 2px), acento (`--amarillo`, WhatsApp). Tarjeta de programa. Banda negra y banda crema. Acordeón de preguntas. Formulario con etiquetas visibles.
