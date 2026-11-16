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

El repositorio está conectado a Netlify: cada cambio que se sube a la rama `main` se publica solo. Netlify corre `python3 build.py` y publica `dist/` (ver `netlify.toml`).

- Formularios: detección activada; las consultas de los tres formularios (`consulta-rapida`, `contacto`, `empresas`) llegan por mail a prof.traininghub@gmail.com. Tienen reCAPTCHA de Netlify.
- Analytics: GA4, ID `G-L41KL5314T` (cuenta de Google de PTH). Solo se incluye en `dist/`, no en la vista previa.

## Después de publicar

- Dar de alta el dominio en Google Search Console y enviar `https://proftraininghub.com.ar/sitemap.xml`.
- Crear la propiedad de Google Analytics 4 y pegar el fragmento en `build.py`, donde dice «Google Analytics 4». El script ya registra clics a WhatsApp y envíos de formularios.
- Reemplazar los textos resaltados entre corchetes cuando PTH envíe los datos.
