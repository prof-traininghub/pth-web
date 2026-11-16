# Sitio web de Professional Training Hub

Sitio estático para proftraininghub.com.ar, alojado en Netlify.

## Estructura

- `build.py`: genera todas las páginas. Los textos están dentro de este archivo.
- `src/`: estilos, script, fuentes e imágenes.
- `dist/`: el sitio listo para publicar (lo que sube a Netlify).
- `borradores/`: páginas de Preparación CAE e Inglés para el vino, guardadas y sin publicar.
- `netlify.toml`: configuración de Netlify (carpeta a publicar, encabezados, redirección de www).
- `DESIGN.md`: colores, tipografías y componentes del kit de marca.

## Regenerar el sitio

```
python3 build.py            # genera dist/
python3 build.py --preview  # genera preview/ para revisar sin servidor
```

## Publicar

El repositorio (público, para que el plan gratis de Netlify publique cambios de más de un colaborador) está conectado a Netlify: cada cambio que se sube a la rama `main` se publica solo. Netlify corre `python3 build.py` y publica `dist/` (ver `netlify.toml`).

- Formularios: detección activada; las consultas de los tres formularios (`consulta-rapida`, `contacto`, `empresas`) llegan por mail a prof.traininghub@gmail.com. Tienen reCAPTCHA de Netlify.
- Analytics: GA4, ID `G-L41KL5314T` (cuenta de Google de PTH). Solo se incluye en `dist/`, no en la vista previa.

## Google

- Search Console: propiedad `https://proftraininghub.com.ar/` (cuenta de Google de PTH), verificada con Google Analytics. Sitemap enviado: `sitemap.xml`. No borrar el código de Analytics: si se borra, se pierde la verificación.
- Analytics: GA4 `G-L41KL5314T`, misma cuenta.
