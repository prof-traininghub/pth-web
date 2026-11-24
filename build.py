"""Genera el sitio estático de Professional Training Hub.

Uso:
  python3 build.py            -> dist/     (para Netlify, enlaces limpios)
  python3 build.py --preview  -> preview/  (vista previa con enlaces a index.html)

Las páginas guardadas para más adelante (CAE y vinos) se generan en borradores/
y no se publican.
"""
import json, os, shutil, sys, datetime
from urllib.parse import quote

PREVIEW = "--preview" in sys.argv
ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, "src")
OUT = os.path.join(ROOT, "preview" if PREVIEW else "dist")
DOMINIO = "https://proftraininghub.com.ar"
WA_NUM = "5491134953141"
WA_VISIBLE = "+54 9 11 3495-3141"  # Carolina
WA2_NUM = "5491153350085"  # Mariana
WA2_VISIBLE = "+54 9 11 5335-0085"
IG = "https://www.instagram.com/prof.traininghub/"
HOY = datetime.date.today().isoformat()

# ---------- utilidades ----------
class Pagina:
    def __init__(self, ruta, titulo, desc, h1_eyebrow, wa, cuerpo, migas=None, jsonld=None,
                 activo=None, noindex=False, borrador=False):
        self.ruta = ruta            # "" | "cursos/" | "cursos/business-english/" | "404.html"
        self.titulo, self.desc, self.wa = titulo, desc, wa
        self.cuerpo, self.migas, self.jsonld = cuerpo, migas or [], jsonld or []
        self.activo, self.noindex, self.borrador = activo, noindex, borrador

    @property
    def depth(self):
        return 0 if self.ruta in ("", "404.html") else self.ruta.rstrip("/").count("/") + 1


def rel(pagina, destino):
    """Enlace relativo desde `pagina` a `destino` (ruta de página o archivo)."""
    pre = "../" * pagina.depth
    if destino == "" or destino.endswith("/"):
        if PREVIEW:
            return pre + destino + "index.html"
        return (pre + destino) or "./"
    return pre + destino


# Portal del alumno (/alumnos/): se completan al configurar Google (ver portal/README.md)
PORTAL_CLIENT_ID = "906483008838-58edmj4eoipmajce5tr67l3bmk9bb2oi.apps.googleusercontent.com"
PORTAL_API = "https://script.google.com/macros/s/AKfycbxDjpS8oleWc38A0lcyJGz3q8BFD_IWyho9p6cVIW5BuSsiN4RDwdn74MrYqmbaloa6eQ/exec"
# Avisos al celular (Firebase Cloud Messaging, proyecto portal-alumno-pth). Son datos públicos de la app web.
PORTAL_FIREBASE = {
    "apiKey": "AIzaSyAHsllyFpBUZt4hlN-qEPcZ4hXaqfVHBQE",
    "projectId": "portal-alumno-pth",
    "messagingSenderId": "906483008838",
    "appId": "1:906483008838:web:4fff78ec54058dc1df9147",
    "vapidKey": "BMdNvO-UGTsDHNnOI81wTCRkMzZ62Dz6eplPfrFxl7A8fRajXiyYVSndLf_pU_mrA42yw2Im0blgPiqgGL8Yq3E",
}
GA_ID = "G-L41KL5314T"
GA_TAG = f'''<script async src="https://www.googletagmanager.com/gtag/js?id={GA_ID}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){{dataLayer.push(arguments);}}gtag('js',new Date());gtag('config','{GA_ID}');</script>'''


def wa_link(texto):
    return f"https://wa.me/{WA_NUM}?text={quote(texto)}"


WA_SVG = ('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.7 15l-1.3 5 5.1-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.3 2.2 2.2 0 0 0 .2-1.3c-.1-.1-.3-.2-.5-.3z"/></svg>')


def wa_link2(texto):
    return f"https://wa.me/{WA2_NUM}?text={quote(texto)}"


def btn_wa2(p, texto, clase="btn-acento", ubic="contenido"):
    return (f'<a class="btn {clase}" href="{wa_link2(p.wa)}" target="_blank" rel="noopener" '
            f'data-ubicacion="{ubic}">{WA_SVG}{texto}</a>')


def btn_wa(p, texto="Escribinos por WhatsApp", clase="btn-acento", ubic="contenido"):
    return (f'<a class="btn {clase}" href="{wa_link(p.wa)}" target="_blank" rel="noopener" '
            f'data-ubicacion="{ubic}">{WA_SVG}{texto}</a>')


def pend(texto):
    return f'<mark class="pendiente">[{texto}]</mark>'


MSG_GENERAL = "¡Hola! Me gustaría saber más sobre los cursos de PTH."

NAV = [("cursos/", "Cursos"), ("empresas/", "Empresas"), ("equipo/", "Equipo"),
       ("preguntas-frecuentes/", "Preguntas frecuentes"), ("contacto/", "Contacto")]
PROGRAMAS = [("cursos/ingles-general/", "General English"), ("cursos/business-english/", "Business English"),
             ("cursos/ingles-para-viajar/", "Wanderlust"), ("cursos/examenes-cambridge/", "Exámenes Cambridge")]


def cabecera(p):
    items = "".join(
        f'<li><a href="{rel(p, r)}"{" aria-current=\"page\"" if p.activo == r else ""}>{n}</a></li>'
        for r, n in NAV)
    movil = []
    for r, n in NAV:
        movil.append(f'<li><a href="{rel(p, r)}">{n}</a></li>')
        if r == "cursos/":
            movil += [f'<li class="sub"><a href="{rel(p, pr)}">{pn}</a></li>' for pr, pn in PROGRAMAS]
    return f'''<a class="skip" href="#contenido">Saltar al contenido</a>
<header class="top">
  <div class="wrap">
    <a class="logo" href="{rel(p, "")}" aria-label="Professional Training Hub, inicio">
      <img src="{rel(p, "assets/img/pth-logo-horizontal.svg")}" alt="Professional Training Hub" width="123" height="48">
    </a>
    <nav class="nav" aria-label="Principal"><ul>{items}</ul></nav>
    <a class="btn btn-acento top-cta" href="{wa_link(p.wa)}" target="_blank" rel="noopener" data-ubicacion="encabezado">{WA_SVG}Escribinos</a>
    <button class="menu-btn" type="button" aria-expanded="false" aria-controls="menu-movil"><span>Menú</span></button>
  </div>
  <nav class="mnav" id="menu-movil" aria-label="Menú móvil" hidden>
    <div class="wrap"><ul>{"".join(movil)}</ul>
    <a class="btn btn-acento" href="{wa_link(p.wa)}" target="_blank" rel="noopener" data-ubicacion="menu">{WA_SVG}Escribinos por WhatsApp</a></div>
  </nav>
</header>'''


def pie(p):
    progs = "".join(f'<li><a href="{rel(p, r)}">{n}</a></li>' for r, n in PROGRAMAS)
    pth = "".join(f'<li><a href="{rel(p, r)}">{n}</a></li>' for r, n in NAV[1:])
    return f'''<footer class="pie-sitio">
  <div class="wrap">
    <div class="pie-grid">
      <div>
        <img src="{rel(p, "assets/img/pth-logo-horizontal-blanco.svg")}" alt="Professional Training Hub" width="113" height="44" loading="lazy">
        <p class="frase-pie">Cada logro comienza con la decisión de intentarlo.</p>
        <p class="inst-pie">Miembro de SEA Idiomas y de su Secretaría de Mentoreo e Innovación</p>
      </div>
      <div><h2>Cursos</h2><ul>{progs}</ul></div>
      <div><h2>PTH</h2><ul>{pth}</ul></div>
      <div><h2>Contacto</h2><ul>
        <li><a href="{wa_link(p.wa)}" target="_blank" rel="noopener" data-ubicacion="pie">WhatsApp Caro<br><span class="nw">{WA_VISIBLE}</span></a></li>
        <li><a href="{wa_link2(p.wa)}" target="_blank" rel="noopener" data-ubicacion="pie-marian">WhatsApp Marian<br><span class="nw">{WA2_VISIBLE}</span></a></li>
        <li><a href="{IG}" target="_blank" rel="noopener">Instagram @prof.traininghub</a></li>
      </ul></div>
    </div>
    <div class="pie-legal"><span>© {datetime.date.today().year} Professional Training Hub</span><a href="{rel(p, "privacidad/")}">Política de privacidad</a></div>
  </div>
</footer>
<a class="wa" href="{wa_link(p.wa)}" target="_blank" rel="noopener" aria-label="Escribinos por WhatsApp" title="¿Consultas? Escribinos" data-ubicacion="flotante">{WA_SVG}</a>'''


def migas_html(p):
    if not p.migas:
        return ""
    partes = [f'<li><a href="{rel(p, "")}">Inicio</a></li>']
    for r, n in p.migas[:-1]:
        partes.append(f'<li><a href="{rel(p, r)}">{n}</a></li>')
    partes.append(f'<li aria-current="page">{p.migas[-1][1]}</li>')
    return f'<nav class="migas" aria-label="Ruta"><ol>{"".join(partes)}</ol></nav>'


def jsonld_migas(p):
    if not p.migas:
        return None
    items = [{"@type": "ListItem", "position": 1, "name": "Inicio", "item": DOMINIO + "/"}]
    for i, (r, n) in enumerate(p.migas, start=2):
        items.append({"@type": "ListItem", "position": i, "name": n, "item": f"{DOMINIO}/{r}"})
    return {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": items}


def documento(p):
    canon = f"{DOMINIO}/{p.ruta}" if p.ruta != "404.html" else DOMINIO + "/"
    datos = [d for d in p.jsonld + [jsonld_migas(p)] if d]
    ld = "".join(f'<script type="application/ld+json">{json.dumps(d, ensure_ascii=False)}</script>' for d in datos)
    robots = '<meta name="robots" content="noindex">' if (p.noindex or p.borrador) else ""
    titulo = p.titulo.replace("&", "&amp;")
    return f'''<!doctype html>
<html lang="es-AR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{titulo}</title>
<meta name="description" content="{p.desc}">
{robots}
<link rel="canonical" href="{canon}">
<meta property="og:type" content="website">
<meta property="og:locale" content="es_AR">
<meta property="og:site_name" content="Professional Training Hub">
<meta property="og:title" content="{titulo}">
<meta property="og:description" content="{p.desc}">
<meta property="og:url" content="{canon}">
<meta property="og:image" content="{DOMINIO}/assets/img/og-pth.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#1d231f">
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="{rel(p, "assets/img/pth-favicon.svg")}" type="image/svg+xml">
<link rel="icon" href="{rel(p, "assets/img/pth-favicon-96.png")}" sizes="96x96" type="image/png">
<link rel="icon" href="{rel(p, "assets/img/pth-favicon-192.png")}" sizes="192x192" type="image/png">
<link rel="apple-touch-icon" href="{rel(p, "assets/img/pth-apple-touch-180.png")}">
<link rel="manifest" href="{rel(p, "site.webmanifest")}">
<meta name="theme-color" content="#ffffff">
<link rel="preload" href="{rel(p, "assets/fonts/archivo-latin-800-normal.woff2")}" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="{rel(p, "assets/fonts/archivo-latin-400-normal.woff2")}" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="{rel(p, "assets/css/site.css")}">
{GA_TAG if not PREVIEW else ""}
{ld}
</head>
<body>
{cabecera(p)}
<main id="contenido">
{p.cuerpo(p)}
</main>
{pie(p)}
<script src="{rel(p, "assets/js/site.js")}" defer></script>
</body>
</html>
'''


# ---------- bloques reutilizables ----------
def cierre(p, titulo="Escribinos y armamos un plan a tu medida.", ubic="cierre"):
    return f'''<section class="section negro" aria-labelledby="cierre-t">
  <div class="wrap cierre stack">
    <p class="eyebrow">Empezá cuando quieras</p>
    <h2 id="cierre-t" class="frase">{titulo}</h2>
    <p class="lead">Sin costo de inscripción. Te respondemos por WhatsApp.</p>
    <div class="btns">{btn_wa(p, "Consultá sin cargo", ubic=ubic)}</div>
  </div>
</section>'''


def ficha_programa(niveles):
    return f'''<aside class="ficha" aria-label="Datos del programa"><dl>
  <div><dt>Modalidad</dt><dd>Online y en vivo, por Google Meet</dd></div>
  <div><dt>Frecuencia</dt><dd>Un encuentro semanal de una hora</dd></div>
  <div><dt>Formato</dt><dd>Individual o en grupos reducidos</dd></div>
  <div><dt>Niveles</dt><dd>{niveles}</dd></div>
  <div><dt>Material</dt><dd>Incluido, en Google Classroom</dd></div>
  <div><dt>Inscripción</dt><dd>Sin costo</dd></div>
</dl></aside>'''


def hero_programa(p, eyebrow, h1, lead, niveles, botones):
    return f'''<section class="hero negro">
  <div class="wrap">
    {migas_html(p)}
    <div class="hero-grid">
      <div class="hero-text">
        <p class="eyebrow">{eyebrow}</p>
        <h1>{h1}</h1>
        <p class="lead">{lead}</p>
        <div class="btns">{botones}</div>
      </div>
      {ficha_programa(niveles)}
    </div>
  </div>
</section>'''


def testimonio(cita, nombre, rol):
    ini = "".join(w[0] for w in nombre.replace(".", "").split()[:2]).upper()
    if len(ini) == 1:
        ini = nombre[:2].upper()
    return (f'<li><figure class="quote"><blockquote>«{cita}»</blockquote><figcaption><span class="ini" aria-hidden="true">{ini}</span>'
            f'<span><b>{nombre}</b><br>{rol}</span></figcaption></figure></li>')


def curso_ld(nombre, desc, ruta):
    return {"@context": "https://schema.org", "@type": "Course", "name": nombre, "description": desc,
            "url": f"{DOMINIO}/{ruta}", "inLanguage": "en",
            "provider": {"@type": "EducationalOrganization", "name": "Professional Training Hub", "url": DOMINIO + "/"},
            "hasCourseInstance": {"@type": "CourseInstance", "courseMode": "online", "courseWorkload": "PT1H por semana"}}


WEBSITE_LD = {"@context": "https://schema.org", "@type": "WebSite", "name": "Professional Training Hub",
              "alternateName": ["PTH", "Prof Training Hub"], "url": DOMINIO + "/"}
ORG_LD = {"@context": "https://schema.org", "@type": "EducationalOrganization", "name": "Professional Training Hub",
          "alternateName": "PTH", "url": DOMINIO + "/", "logo": DOMINIO + "/assets/img/pth-app-512.png",
          "description": "Academia online de inglés para adultos: clases en vivo, individuales o en grupos reducidos.",
          "sameAs": [IG], "areaServed": "AR",
          "contactPoint": [{"@type": "ContactPoint", "contactType": "Consultas", "telephone": "+54-9-11-3495-3141",
                            "availableLanguage": ["es", "en"]},
                           {"@type": "ContactPoint", "contactType": "Consultas", "telephone": "+54-9-11-5335-0085",
                            "availableLanguage": ["es", "en"]}],
          "founder": [{"@type": "Person", "name": "Mariana Bianchi"}, {"@type": "Person", "name": "Carolina Capello"}]}


# ---------- páginas ----------
ICONOS = {
    "objetivo": '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/></svg>',
    "vivo": '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10.5l5-3v9l-5-3"/></svg>',
    "feedback": '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z"/><path d="M8.5 10.5l2.2 2.2 4.8-4.7"/></svg>',
    "docente": '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4.5 4.2-7 8-7s7 2.5 8 7"/></svg>',
    "red": '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/></svg>',
    "idea": '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/></svg>',
}


def card_ico(ico, titulo, texto):
    return f'<li class="card"><div class="card-top"><span class="ico">{ICONOS[ico]}</span><h3>{titulo}</h3></div><p>{texto}</p></li>'


def c_inicio(p):
    faq_home = "".join(f"<details><summary>{q}</summary><p>{a}</p></details>" for q, a in FAQ[:5] if a)
    return f'''<section class="hero negro hero-centro">
  <div class="wrap">
    <p class="etiqueta">Academia online de inglés</p>
    <h1>Aprendé inglés con <span class="hl">propósito real</span></h1>
    <p class="lead">Clases de inglés en vivo, individuales o en grupos reducidos, para usar el idioma en tu trabajo, en tus viajes y en tu día a día.</p>
    <div class="btns"><a class="btn btn-acento" href="#cursos">Ver cursos</a>{btn_wa(p, "Consultá gratis", clase="btn-sec", ubic="portada")}</div>
  </div>
</section>

<section class="section" aria-labelledby="por-t">
  <div class="wrap">
    <div class="section-head"><p class="bienvenida">¡Bienvenido/a a la Experiencia PTH!</p><h2 id="por-t">Una experiencia diferente desde el primer día</h2></div>
    <ul class="cards-4">
      {card_ico("objetivo", "Enfoque por objetivo", "Cada programa está pensado para un propósito concreto: trabajo, estudio o viaje.")}
      {card_ico("vivo", "Clases en vivo", "Un encuentro semanal de una hora por Google Meet, en el horario que acordemos.")}
      {card_ico("feedback", "Feedback en cada clase", "Al final de cada encuentro repasamos pronunciación, gramática y vocabulario.")}
      {card_ico("docente", "Docentes especializadas", "Profesoras con experiencia en contextos corporativos, académicos y de viaje.")}
    </ul>
  </div>
</section>

<section class="negro stats" aria-label="PTH en números">
  <div class="wrap">
    <div><strong>+50</strong><span>alumnos</span><small>y creciendo cada mes</small></div>
    <div><strong>+15</strong><span>años de experiencia</span><small>en la enseñanza del inglés</small></div>
    <div><strong class="globo" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/></svg></strong><span>Presencia internacional</span><small>Argentina y países de Europa</small></div>
  </div>
</section>

<section class="section alt" aria-labelledby="unicos-t">
  <div class="wrap">
    <div class="section-head centro"><p class="eyebrow">Beneficios</p><h2 id="unicos-t">Lo que nos hace únicos</h2>
      <p class="lead">Creemos que aprender inglés tiene que ser accesible, auténtico y con comunidad real.</p></div>
    <ul class="unicos">
      <li><h3>Sin costo de inscripción</h3><p>Empezás sin barreras y sin compromiso.</p></li>
      <li><h3>Material auténtico</h3><p>Artículos, podcasts, reels y charlas TED: el inglés que vas a encontrar afuera.</p></li>
      <li><h3>Encuentros de comunidad gratuitos</h3><p>Practicás con otros alumnos y profes en un clima sin presión.</p></li>
      <li><h3>Encuentros de conversación con hablantes nativos</h3><p>Practicás inglés real en una charla con nativos.</p></li>
    </ul>
  </div>
</section>

<section class="section" id="cursos" aria-labelledby="prog-t">
  <div class="wrap">
    <div class="section-head"><p class="eyebrow">Nuestros cursos</p><h2 id="prog-t">Encontrá el curso ideal para vos</h2></div>
    <div class="grid-4">
      {card_curso(p, "cursos/ingles-general/", "curso-general.webp", "Personas conversando en una clase de inglés", "General", "General English", "Inglés cotidiano, desde las bases hasta conversar con fluidez.", "Personas con o sin experiencia en el idioma.", "Todos los niveles")}
      {card_curso(p, "cursos/business-english/", "curso-business.webp", "Dos profesionales trabajando con una notebook", "Profesional", "Business English", "Reuniones, presentaciones, entrevistas y negociaciones en inglés.", "Ejecutivos, gerentes, directores y cualquier persona del mundo corporativo.", "8 módulos")}
      {card_curso(p, "cursos/ingles-para-viajar/", "curso-wanderlust.webp", "Viajera con mochila en un aeropuerto", "Viajes", "Wanderlust", "El inglés que necesitás para moverte por el mundo.", "Agentes de viaje y personas vinculadas al mundo del turismo.", "Todos los niveles")}
      {card_curso(p, "cursos/examenes-cambridge/", "curso-cambridge.webp", "Profesora acompañando a un grupo de estudiantes que preparan un examen", "Exámenes", "Exámenes Cambridge", "Preparación para los exámenes internacionales de Cambridge English.", "Quienes van a rendir un examen internacional de Cambridge.", "Según el examen")}
    </div>
    <div class="negro banda marco" style="margin-top: var(--s5)">
      <div class="stack"><p class="eyebrow">Empresas</p><h2>¿Tu empresa necesita inglés?</h2><p class="lead">Armamos programas a medida para equipos, online y en vivo.</p></div>
      <div><a class="btn btn-acento" href="{rel(p, "empresas/")}">Conocé la propuesta para empresas</a></div>
    </div>
  </div>
</section>

<section class="section alt" aria-labelledby="empezar-t">
  <div class="wrap">
    <div class="section-head centro"><p class="eyebrow">Proceso</p><h2 id="empezar-t">Empezar es muy simple</h2></div>
    <ol class="pasos centro">
      <li><h3>Escribinos</h3><p>Por WhatsApp o desde el formulario.</p></li>
      <li><h3>Contanos tu objetivo</h3><p>Te recomendamos el programa que mejor te sirve.</p></li>
      <li><h3>Acordamos el horario</h3><p>Sin costo de inscripción.</p></li>
      <li><h3>¡Empezás!</h3><p>En los primeros encuentros ajustamos el nivel a tu medida.</p></li>
    </ol>
  </div>
</section>

<section class="section" aria-labelledby="test-t">
  <div class="wrap">
    <div class="section-head"><p class="eyebrow">Testimonios</p><h2 id="test-t">Lo que dicen nuestros alumnos</h2></div>
    <ul class="quotes cuatro">
      {testimonio("Gracias a Business English pude presentar proyectos ante clientes internacionales. Un antes y un después.", "Junior", "Analista")}
      {testimonio("Wanderlust me dio las herramientas exactas para mi viaje por Europa.", "Laura", "Agente de viajes")}
      {testimonio("Empecé desde cero con General English y en 6 meses ya podía mantener conversaciones fluidas.", "Camila", "Manager de bar")}
      {testimonio("Como docente, necesitaba perfeccionar mi inglés técnico. PTH tiene exactamente el nivel que buscaba.", "Ana L.", "Profesora de secundaria")}
    </ul>
  </div>
</section>

<section class="section alt" aria-labelledby="dir-t">
  <div class="wrap">
    <div class="section-head centro"><p class="eyebrow">Dirección</p><h2 id="dir-t">El equipo detrás de PTH</h2>
      <p class="lead">Nuestra academia está dirigida por profesionales con sólida formación académica y años de experiencia en la enseñanza del inglés.</p></div>
    <div class="dir-foto">
      <img src="{rel(p, "assets/img/directoras.webp")}" alt="Carolina Capello y Mariana Bianchi, directoras de PTH" width="1000" height="1000" loading="lazy">
      <div class="dir-nombres">
        <div><h3>Carolina Capello</h3><p>Traductora pública nacional<br>Profesora de inglés</p></div>
        <div><h3>Mariana Bianchi</h3><p>Profesora de inglés<br>Licenciada en Educación</p></div>
        <p class="dir-link"><a class="enlace" href="{rel(p, "equipo/")}">Conocé a todo el equipo</a></p>
      </div>
    </div>
  </div>
</section>

<section class="section" aria-labelledby="inst-t">
  <div class="wrap">
    <div class="section-head centro"><p class="eyebrow">Institucional</p><h2 id="inst-t">Respaldados por instituciones de referencia</h2></div>
    <ul class="inst">
      {card_ico("red", "Miembros de SEA Idiomas", "Integramos la red de la Asociación de Centros de Idiomas, que reúne estándares de calidad en la enseñanza.")}
      {card_ico("idea", "Secretaría de Mentoreo e Innovación", "Somos parte de la Secretaría de Mentoreo e Innovación de SEA, que impulsa el aprendizaje con visión de futuro.")}
    </ul>
    <p class="cert"><b>Certificación:</b> Se emiten certificados avalados por SEA para respaldar el nivel de inglés del alumno/a.</p>
  </div>
</section>

<section class="section alt" aria-labelledby="faq-t">
  <div class="wrap" style="max-width:52rem">
    <div class="section-head centro" style="margin-inline:auto"><p class="eyebrow">Preguntas frecuentes</p><h2 id="faq-t">Todo lo que necesitás saber antes de empezar</h2></div>
    <div class="faq">{faq_home}</div>
    <p class="centro" style="margin-top:var(--s4)"><a class="enlace" href="{rel(p, "preguntas-frecuentes/")}">Ver todas las preguntas</a></p>
  </div>
</section>

<section class="section" aria-labelledby="cta-t">
  <div class="wrap">
    <div class="cta-amarillo">
      <h2 id="cta-t">¿Listo para dar el siguiente paso?</h2>
      <p>Dejá tu email y te ayudamos a elegir el curso ideal. Consulta sin cargo, sin inscripción.</p>
      <form class="form-rapido" name="consulta-rapida" method="POST" action="{rel(p, "gracias/")}" data-netlify="true" netlify-honeypot="bot-field">
        <input type="hidden" name="form-name" value="consulta-rapida">
        <p class="oculto"><label>No completar: <input name="bot-field" tabindex="-1" autocomplete="off"></label></p>
        <label class="oculto" for="r-email">Tu email</label>
        <input id="r-email" name="email" type="email" required autocomplete="email" placeholder="Tu email">
        <button class="btn btn-primario" type="submit">Quiero empezar</button>
      </form>
      <p class="alt-wa">¿Preferís WhatsApp? Escribile a <a href="{wa_link(p.wa)}" target="_blank" rel="noopener" data-ubicacion="cta">Caro</a> o a <a href="{wa_link2(p.wa)}" target="_blank" rel="noopener" data-ubicacion="cta-marian">Marian</a></p>
    </div>
  </div>
</section>'''


def card_curso(p, ruta, img, alt, eyebrow, titulo, texto, para, pie_txt):
    if img:
        media = f'<img src="{rel(p, "assets/img/" + img)}" alt="{alt}" width="640" height="400" loading="lazy">'
    else:
        media = ('<div class="prog-visual marco" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 3h14v13H5z"/>'
                 '<path d="M8 7h8M8 10h8M8 13h4"/><circle cx="16" cy="17" r="3"/><path d="M14.5 19.5 14 23l2-1 2 1-.5-3.5"/></svg>'
                 '<span>CAMBRIDGE ENGLISH</span></div>')
    return f'''<article class="prog con-foto">
  {media}
  <div class="prog-cuerpo"><p class="eyebrow">{eyebrow}</p><h3>{titulo}</h3><p>{texto}</p>
    <div class="para"><p class="mini">Para quién</p><p>{para}</p></div>
    <div class="pie"><span>{pie_txt}</span><a class="enlace" href="{rel(p, ruta)}">Ver programa<span class="oculto"> {titulo}</span></a></div></div>
</article>'''


def c_cursos(p):
    filas = [("cursos/ingles-general/", "General English", "Personas con o sin experiencia en el idioma.", "Principiante a avanzado"),
             ("cursos/business-english/", "Business English", "Ejecutivos, gerentes, directores y cualquier persona del mundo corporativo.", "Principiante a avanzado"),
             ("cursos/ingles-para-viajar/", "Wanderlust", "Agentes de viaje y personas vinculadas al mundo del turismo.", "Principiante a avanzado"),
             ("cursos/examenes-cambridge/", "Exámenes Cambridge", "Quienes van a rendir un examen internacional de Cambridge.", "Según el examen")]
    trs = "".join(f'<tr><td><a class="enlace" href="{rel(p, r)}">{n}</a></td><td>{q}</td><td>{nv}</td></tr>' for r, n, q, nv in filas)
    return f'''<section class="hero negro">
  <div class="wrap">
    {migas_html(p)}
    <div class="hero-text" style="max-width:46rem">
      <p class="eyebrow">Cursos</p>
      <h1>Elegí tu programa</h1>
      <p class="lead">Todos los programas son en vivo, con un encuentro semanal de una hora, material auténtico y feedback en cada clase. Lo que cambia es el objetivo.</p>
    </div>
  </div>
</section>
<section class="section alt" style="padding-top:var(--s5)" aria-label="Programas">
  <div class="wrap">
    <div class="tabla-wrap"><table>
      <thead><tr><th scope="col">Programa</th><th scope="col">Para quién</th><th scope="col">Niveles</th></tr></thead>
      <tbody>{trs}</tbody>
    </table></div>
    <div class="banda negro marco" style="margin-top:var(--s5)">
      <div class="stack"><h2>¿No sabés cuál elegir?</h2><p class="lead">Contanos qué querés lograr y te recomendamos el programa indicado.</p></div>
      <div>{btn_wa(p)}</div>
    </div>
  </div>
</section>'''


def c_general(p):
    return hero_programa(p, "General", "General English: inglés para tu día a día",
        "Aprendé a conversar en inglés desde las bases hasta la fluidez, a través de temas reales y con una profe que sigue tu progreso de cerca.",
        "Principiante a avanzado", btn_wa(p, "Consultá sin cargo", ubic="portada") + f'<a class="btn btn-sec" href="#cursada">Cómo es la cursada</a>') + f'''
<section class="section alt" aria-labelledby="quien-t">
  <div class="wrap cols">
    <div class="stack"><p class="eyebrow">Para quién es</p><h2 id="quien-t">Para personas con o sin experiencia en el idioma</h2>
      <ul class="lista"><li>Quienes empiezan de cero.</li><li>Quienes ya tienen una base y quieren retomar o seguir avanzando.</li><li>Quienes entienden pero todavía no se animan a hablar.</li></ul></div>
    <div class="stack"><p class="eyebrow">Qué vas a lograr</p><h2>Conversaciones de todo tipo, con seguridad</h2>
      <p class="muted">Trabajamos por temas, con el vocabulario y la gramática de cada nivel del Marco Común Europeo de Referencia, siempre aplicados a situaciones reales.</p></div>
  </div>
</section>
<section class="section" aria-labelledby="niveles-t">
  <div class="wrap">
    <div class="section-head"><p class="eyebrow">Niveles</p><h2 id="niveles-t">Qué trabajás en cada nivel</h2></div>
    <div class="tabla-wrap"><table>
      <thead><tr><th scope="col">Nivel</th><th scope="col">Qué trabajás</th></tr></thead>
      <tbody>
        <tr><td>Principiante (A1)</td><td>Saludos y presentaciones, datos personales, números, fechas y horarios, la familia, el trabajo, la ropa. Verbo <i lang="en">to be</i> y presente simple.</td></tr>
        <tr><td>Básico (A2)</td><td>Viajes y direcciones, compras y restaurantes, salud, el clima, tiempo libre. Pasado simple, futuro y comparativos.</td></tr>
        <tr><td>Intermedio (B1)</td><td>Viajes, vacaciones, trabajo, estudios, salud, tiempo libre, medio ambiente, compras y relaciones personales. Pasado simple, continuo y perfecto, <i lang="en">used to</i>, presente perfecto, futuro, verbos modales, primer y segundo condicional, voz pasiva, estilo indirecto, comparativos, oraciones de relativo y conectores.</td></tr>
        <tr><td>Avanzado (B2)</td><td>Trabajo, medio ambiente, salud, tecnología, medios de comunicación, viajes y relaciones. Dominio de todos los tiempos verbales, voz pasiva y estructuras impersonales, condicionales mixtos, modales de deducción, estilo indirecto con verbos de reporte, inversión, <i lang="en">phrasal verbs</i>, <i lang="en">collocations</i>, formación de palabras y conectores del discurso.</td></tr>
      </tbody>
    </table></div>
  </div>
</section>
<section class="section crema" id="cursada" aria-labelledby="cursada-t">
  <div class="wrap cols">
    <div class="stack"><p class="eyebrow">La cursada</p><h2 id="cursada-t">Cómo es la cursada</h2>
      <ul class="lista">
        <li>Un encuentro semanal de una hora, en vivo por Google Meet.</li>
        <li>Los primeros minutos charlamos de tu semana, en inglés.</li>
        <li>Cada clase tiene una estructura clara: activación, actividad principal y cierre aplicado.</li>
        <li>Al final, feedback de pronunciación, gramática y vocabulario.</li>
        <li>Material y actividades extra en Google Classroom, sin libros para comprar.</li>
      </ul></div>
    <ul class="quotes" style="list-style:none;grid-template-columns:1fr;align-content:center">
      {testimonio("Empecé desde cero con General English y en 6 meses ya podía mantener conversaciones fluidas.", "Camila", "Manager de bar")}
    </ul>
  </div>
</section>
{cierre(p, "Contanos tu nivel y tus horarios, y te armamos un plan.")}'''


def c_business(p):
    modulos = [("1. Jobs", "Profesiones, competencias técnicas y blandas, entrevistas y procesos de selección"),
               ("2. Meetings", "Participar, opinar y moderar reuniones"),
               ("3. Work-life balance", "Presiones laborales y equilibrio entre trabajo y vida personal"),
               ("4. Management &amp; Leadership", "Nuevos modelos de liderazgo y gestión de equipos"),
               ("5. Sustainability", "Empresas, ambiente y responsabilidad"),
               ("6. Marketing &amp; Ads", "Publicidad, marcas y cómo nos influyen"),
               ("7. Negotiations", "Argumentar, ceder y cerrar acuerdos"),
               ("8. Entrepreneurship", "Emprender, presentar ideas y proyectos")]
    trs = "".join(f'<tr><td lang="en">{m}</td><td>{d}</td></tr>' for m, d in modulos)
    return hero_programa(p, "Profesional", "Business English: reuniones, entrevistas y negociaciones en inglés",
        "Un programa de ocho módulos para desenvolverte con seguridad en el trabajo, con temas actuales del mundo laboral y situaciones que vas a vivir de verdad.",
        "Principiante a avanzado", btn_wa(p, "Consultá sin cargo", ubic="portada") + f'<a class="btn btn-sec" href="{rel(p, "empresas/")}">Propuesta para empresas</a>') + f'''
<section class="section alt" aria-labelledby="quien-t">
  <div class="wrap cols">
    <div class="stack"><p class="eyebrow">Para quién es</p><h2 id="quien-t">Para el mundo corporativo</h2></div>
    <ul class="lista">
      <li>Ejecutivos, gerentes y directores.</li>
      <li>Profesionales que trabajan con clientes, proveedores o equipos del exterior.</li>
      <li>Cualquier persona del mundo corporativo que necesite el inglés en su trabajo.</li>
      <li>Quienes se preparan para una entrevista laboral en inglés.</li>
    </ul>
  </div>
</section>
<section class="section" aria-labelledby="mod-t">
  <div class="wrap">
    <div class="section-head"><p class="eyebrow">El programa</p><h2 id="mod-t">Los ocho módulos</h2>
      <p class="lead">Cada módulo cierra con una evaluación basada en una situación real.</p></div>
    <div class="tabla-wrap"><table>
      <thead><tr><th scope="col">Módulo</th><th scope="col">Qué practicás</th></tr></thead>
      <tbody>{trs}</tbody>
    </table></div>
    <p class="muted" style="margin-top:var(--s4);max-width:46rem">A lo largo del programa también trabajamos presentaciones, debates, correos y documentos formales, y el uso de la inteligencia artificial en el trabajo.</p>
  </div>
</section>
<section class="section crema" aria-labelledby="bien-t">
  <div class="wrap cols">
    <div class="stack"><p class="eyebrow">Inglés y bienestar</p><h2 id="bien-t">Rendir sin quemarse</h2>
      <p class="muted">Sumamos técnicas como Pomodoro y mindfulness para que puedas sostener el ritmo laboral sin llegar al burnout. Las practicamos en inglés, claro.</p></div>
    <ul class="quotes" style="list-style:none;grid-template-columns:1fr">
      {testimonio("Gracias a Business English pude presentar proyectos ante clientes internacionales. Un antes y un después.", "Junior", "Analista")}
    </ul>
  </div>
</section>
<section class="section negro" aria-labelledby="emp-t">
  <div class="wrap cierre stack">
    <p class="eyebrow">Empezá</p>
    <h2 id="emp-t" class="frase">Cursalo de forma individual o sumá a tu equipo.</h2>
    <div class="btns">{btn_wa(p, "Escribinos por WhatsApp", ubic="cierre")}<a class="btn btn-sec" href="{rel(p, "empresas/")}">Soy una empresa</a></div>
  </div>
</section>'''


def c_wanderlust(p):
    filas = [("En el aeropuerto", "Check-in, equipaje, controles, conexiones"),
             ("Alojamiento", "Reservas, consultas y pedidos en el hotel"),
             ("En la ciudad", "Pedir indicaciones, transporte, compras, restaurantes"),
             ("Documentación", "Qué piden distintos países y cómo hablar en migraciones"),
             ("Si algo sale mal", "Valijas perdidas, documentos robados, reclamos")]
    trs = "".join(f"<tr><td>{a}</td><td>{b}</td></tr>" for a, b in filas)
    return hero_programa(p, "Viajes", "Wanderlust: inglés para viajar",
        "<i lang=\"en\">Wanderlust</i> son las ganas enormes de conocer el mundo. Este programa te da el inglés para hacerlo con confianza, desde el check-in hasta el reclamo por una valija perdida.",
        "Principiante a avanzado", btn_wa(p, "Consultá sin cargo", ubic="portada") + '<a class="btn btn-sec" href="#practicar">Qué vas a practicar</a>') + f'''
<section class="section alt" aria-labelledby="quien-t">
  <div class="wrap cols">
    <div class="stack"><p class="eyebrow">Para quién es</p><h2 id="quien-t">Para el mundo del turismo</h2></div>
    <ul class="lista">
      <li>Agentes de viaje.</li>
      <li>Personas que trabajan en hotelería, transporte o atención al turista.</li>
      <li>Cualquier persona vinculada al mundo del turismo.</li>
      <li>Y también quienes viajan y quieren arreglarse solos.</li>
    </ul>
  </div>
</section>
<section class="section" id="practicar" aria-labelledby="prac-t">
  <div class="wrap">
    <div class="section-head"><p class="eyebrow">El programa</p><h2 id="prac-t">Qué vas a practicar</h2>
      <p class="lead">Con situaciones simuladas, para que practiques antes de viajar. También conocemos un poco de cada destino: cultura, costumbres y datos útiles.</p></div>
    <div class="tabla-wrap"><table>
      <thead><tr><th scope="col">Situación</th><th scope="col">Ejemplos</th></tr></thead>
      <tbody>{trs}</tbody>
    </table></div>
  </div>
</section>
<section class="section crema" aria-label="Testimonio">
  <div class="wrap">
    <ul class="quotes" style="list-style:none;grid-template-columns:1fr;max-width:44rem">
      {testimonio("Wanderlust me dio las herramientas exactas para mi viaje por Europa. ¡Recomendado al 100 %!", "Laura", "Agente de viajes")}
    </ul>
  </div>
</section>
{cierre(p, "Contanos a dónde vas y cuándo.")}'''


def c_empresas(p):
    return f'''<section class="hero negro">
  <div class="wrap">
    {migas_html(p)}
    <div class="hero-grid">
      <div class="hero-text">
        <p class="eyebrow">Empresas</p>
        <h1>Inglés para tu equipo, a medida de tu empresa</h1>
        <p class="lead">Capacitamos a tu equipo para que trabaje en inglés con clientes, proveedores y colegas del exterior. Online, en vivo y con programas armados según lo que tu empresa necesita.</p>
        <div class="btns"><a class="btn btn-primario" href="#propuesta">Pedí una propuesta</a>{btn_wa(p, "Escribinos por WhatsApp", ubic="portada")}</div>
      </div>
      <div class="panel marco"><div class="clase">
        <p class="eyebrow">Qué resolvemos</p>
        <h2>Para equipos que hoy esquivan el inglés</h2>
        <ol>
          <li><b>Reuniones</b><span>Equipos que no se animan a participar en llamadas en inglés.</span></li>
          <li><b>Presentaciones</b><span>Personas que deben presentar resultados o proyectos.</span></li>
          <li><b>Negociación</b><span>Áreas que negocian con clientes o proveedores del exterior.</span></li>
          <li><b>Escritura</b><span>Correos e informes que hoy se escriben con traductor.</span></li>
        </ol>
      </div></div>
    </div>
  </div>
</section>
<section class="section alt" aria-labelledby="como-t">
  <div class="wrap">
    <div class="section-head"><p class="eyebrow">Cómo trabajamos</p><h2 id="como-t">De un diagnóstico a un programa a medida</h2></div>
    <ol class="pasos">
      <li><h3>Diagnóstico</h3><p>Conocemos al equipo, sus tareas y el nivel de cada persona.</p></li>
      <li><h3>Programa a medida</h3><p>Partimos de los ocho módulos de <a class="enlace" href="{rel(p, "cursos/business-english/")}">Business English</a> y los adaptamos a tu industria.</p></li>
      <li><h3>Clases en vivo</h3><p>Por Google Meet, en grupos reducidos o individuales, en horarios que no interrumpen el trabajo.</p></li>
      <li><h3>Seguimiento</h3><p>Evaluación al cierre de cada módulo, feedback en cada clase e informes de avance para la empresa.</p></li>
    </ol>
  </div>
</section>
<section class="section" aria-labelledby="por-t">
  <div class="wrap cols">
    <div class="stack"><p class="eyebrow">Por qué PTH</p><h2 id="por-t">Un equipo docente, no una plataforma</h2></div>
    <ul class="items">
      <li><h3>Docentes especializadas en adultos</h3><p>Con experiencia en contextos corporativos.</p></li>
      <li><h3>Material auténtico y actual</h3><p>El inglés que se usa hoy en el trabajo.</p></li>
      <li><h3>Coordinación académica</h3><p>Supervisa la calidad de cada clase.</p></li>
      <li><h3>Certificación</h3><p>Se emiten certificados avalados por SEA para respaldar el nivel de inglés de cada participante.</p></li>
    </ul>
  </div>
</section>
<section class="section crema" id="propuesta" aria-labelledby="prop-t">
  <div class="wrap cols">
    <div class="stack"><p class="eyebrow">Propuesta</p><h2 id="prop-t">Pedí una propuesta para tu equipo</h2>
      <p class="lead">Te respondemos a la brevedad.</p>
      <p class="muted solo-desk">¿Preferís hablar? {btn_wa(p, "Escribinos por WhatsApp", clase="btn-sec", ubic="formulario")}</p></div>
    {form_empresas(p)}
    <p class="muted solo-movil">¿Preferís hablar? {btn_wa(p, "Escribinos por WhatsApp", clase="btn-sec", ubic="formulario")}</p>
  </div>
</section>'''


def form_empresas(p):
    return f'''<form class="form" name="empresas" method="POST" action="{rel(p, "gracias/")}" data-netlify="true" data-netlify-recaptcha="true" netlify-honeypot="bot-field">
  <input type="hidden" name="form-name" value="empresas">
  <p class="oculto"><label>No completar: <input name="bot-field" tabindex="-1" autocomplete="off"></label></p>
  <div class="campo"><label for="e-empresa">Empresa</label><input id="e-empresa" name="empresa" required autocomplete="organization"></div>
  <div class="dos-campos">
    <div class="campo"><label for="e-nombre">Nombre</label><input id="e-nombre" name="nombre" required autocomplete="name"></div>
    <div class="campo"><label for="e-cargo">Cargo</label><input id="e-cargo" name="cargo" autocomplete="organization-title"></div>
  </div>
  <div class="dos-campos">
    <div class="campo"><label for="e-email">Email</label><input id="e-email" name="email" type="email" required autocomplete="email"></div>
    <div class="campo"><label for="e-tel">Teléfono</label><input id="e-tel" name="telefono" type="tel" autocomplete="tel"></div>
  </div>
  <div class="dos-campos">
    <div class="campo"><label for="e-cant">Cantidad de personas</label><input id="e-cant" name="personas" type="number" min="1" inputmode="numeric"></div>
    <div class="campo"><label for="e-nivel">Nivel aproximado</label><select id="e-nivel" name="nivel"><option value="">Elegí una opción</option><option>Principiante</option><option>Intermedio</option><option>Avanzado</option><option>Mixto</option><option>No sé</option></select></div>
  </div>
  <div class="campo"><label for="e-obj">Objetivo principal</label><textarea id="e-obj" name="objetivo" required placeholder="Por ejemplo: que el equipo comercial pueda presentar en inglés"></textarea></div>
  <div class="captcha" data-netlify-recaptcha="true"></div>
  <button class="btn btn-primario" type="submit">Pedir propuesta</button>
  <p class="legal">Usamos tus datos solo para responder tu consulta. <a href="{rel(p, "privacidad/")}">Política de privacidad</a></p>
</form>'''


def c_equipo(p):
    return f'''<section class="hero negro">
  <div class="wrap">
    {migas_html(p)}
    <div class="hero-text" style="max-width:46rem">
      <p class="eyebrow">Equipo</p>
      <h1>Quiénes enseñan en PTH</h1>
      <p class="lead">Somos un equipo de docentes de inglés especializadas en la enseñanza para adultos. Nos importa que cada alumno se sienta acompañado y vea su progreso clase a clase.</p>
    </div>
  </div>
</section>
<section class="section alt" aria-labelledby="dir-t">
  <div class="wrap">
    <div class="section-head"><p class="eyebrow">Dirección</p><h2 id="dir-t">Las directoras</h2>
      <p class="lead">Definen los programas, coordinan al equipo docente y supervisan la calidad de cada clase.</p></div>
    <div class="dir-foto">
      <img src="{rel(p, "assets/img/directoras.webp")}" alt="Carolina Capello y Mariana Bianchi, directoras de PTH" width="1000" height="1000" loading="lazy">
      <div class="dir-nombres">
        <div><h3>Carolina Capello</h3><p class="rol">Directora y coordinadora académica</p><p>Traductora pública nacional y profesora de inglés.</p></div>
        <div><h3>Mariana Bianchi</h3><p class="rol">Directora y coordinadora académica</p><p>Profesora de inglés y licenciada en Educación con orientación en lenguas extranjeras.</p></div>
      </div>
    </div>
  </div>
</section>
<section class="section" aria-labelledby="doc-t">
  <div class="wrap">
    <div class="section-head"><p class="eyebrow">Equipo docente</p><h2 id="doc-t">Docentes</h2></div>
    <ul class="staff">
      <li>Antonella López</li>
      <li>Carolina Capello</li>
      <li>Julieta Bocalandro</li>
      <li>Mariana Bianchi</li>
      <li>Martina Farinola</li>
      <li>Román Pernicone</li>
      <li>Romina De Rose</li>
    </ul>
    <p class="muted" style="margin-top:var(--s4)">Además, organizamos encuentros de conversación con hablantes nativos.</p>
  </div>
</section>
{cierre(p, "Sumate a una clase.")}'''


FAQ = [
    ("¿Cuánto cuesta?", "Depende del programa y de si la clase es individual o grupal. Escribinos por WhatsApp y te pasamos el valor y los horarios disponibles. No cobramos inscripción."),
    ("¿Hay costo de inscripción?", "No. Empezás sin costo de inscripción y sin compromiso."),
    ("¿Cuántas clases hay por semana?", "Un encuentro semanal de una hora, en el horario que acordemos. Está pensado para que puedas sostenerlo sin que interfiera con tu rutina."),
    ("¿Las clases son individuales o grupales?", "Las dos opciones: individuales o en grupos reducidos."),
    ("¿Qué plataforma usan?", "Google Meet para las clases en vivo y Google Classroom para el material y las actividades. Solo necesitás una cuenta de Google."),
    ("¿Tengo que comprar libros?", "No. Todo el material lo prepara PTH y está incluido."),
    ("¿Cómo sé en qué nivel empezar?", "No te preocupes por eso. En las primeras clases hacemos actividades que nos permiten ubicarte en el nivel indicado."),
    ("¿Cómo se paga?", "Por transferencia, por adelantado y por el mes completo, entre el 1 y el 10 de cada mes. Después de esa fecha se aplica un recargo del 15 %."),
    ("¿Puedo reprogramar una clase?", "Sí, una por mes, avisando con al menos 24 horas de anticipación y según la disponibilidad de la profe. Las clases que caen en feriado se coordinan con la docente."),
    ("¿Qué necesito para cursar?", "Una conexión a internet estable, auriculares y micrófono."),
    ("¿Entregan certificado?", "Sí. Se emiten certificados avalados por SEA para respaldar el nivel de inglés del alumno/a."),
    ("¿Tienen propuestas para empresas?", "Sí. Armamos programas a medida para equipos, online y en vivo."),
]


def c_faq(p):
    items = []
    for q, a in FAQ:
        resp = a if a else pend("Completar con el documento de SEA: qué nivel certifica, si tiene costo y qué validez tiene")
        if q.startswith("¿Tienen propuestas"):
            resp += f' <a class="enlace" href="{rel(p, "empresas/")}">Inglés para empresas</a>'
        items.append(f"<details><summary>{q}</summary><p>{resp}</p></details>")
    return f'''<section class="hero negro">
  <div class="wrap">
    {migas_html(p)}
    <div class="hero-text" style="max-width:46rem">
      <p class="eyebrow">Preguntas frecuentes</p>
      <h1>Todo lo que necesitás saber antes de empezar</h1>
    </div>
  </div>
</section>
<section class="section" style="padding-top:0" aria-label="Preguntas">
  <div class="wrap"><div class="faq" style="max-width:52rem">{"".join(items)}</div></div>
</section>
{cierre(p, "¿Te quedó alguna duda? Escribinos.")}'''


def faq_ld():
    ents = [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in FAQ if a]
    return {"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": ents}


def c_contacto(p):
    return f'''<section class="hero negro">
  <div class="wrap">
    {migas_html(p)}
    <div class="hero-grid" style="align-items:start">
      <div class="hero-text">
        <p class="eyebrow">Contacto</p>
        <h1>Escribinos y armamos un plan</h1>
        <p class="lead">Contanos qué querés lograr con el inglés y te recomendamos el programa y el horario que mejor te quedan.</p>
        <div class="stack">
          <h2 style="font-size:1.3rem">La forma más rápida</h2>
          <div class="btns">{btn_wa(p, "Escribile a Caro", ubic="contacto-caro")}{btn_wa2(p, "Escribile a Marian", ubic="contacto-marian")}</div>
          <p class="muted">Caro: <span class="nw">{WA_VISIBLE}</span> · Marian: <span class="nw">{WA2_VISIBLE}</span></p>
          <p><b>Instagram:</b> <a href="{IG}" target="_blank" rel="noopener">@prof.traininghub</a></p>
        </div>
      </div>
      <form class="form" name="contacto" method="POST" action="{rel(p, "gracias/")}" data-netlify="true" data-netlify-recaptcha="true" netlify-honeypot="bot-field" aria-labelledby="form-t">
        <h2 id="form-t" style="font-size:1.3rem">O dejanos tu consulta</h2>
        <input type="hidden" name="form-name" value="contacto">
        <p class="oculto"><label>No completar: <input name="bot-field" tabindex="-1" autocomplete="off"></label></p>
        <div class="campo"><label for="c-nombre">Nombre</label><input id="c-nombre" name="nombre" required autocomplete="name"></div>
        <div class="dos-campos">
          <div class="campo"><label for="c-email">Email</label><input id="c-email" name="email" type="email" required autocomplete="email"></div>
          <div class="campo"><label for="c-wa">WhatsApp <span class="ayuda">(opcional)</span></label><input id="c-wa" name="whatsapp" type="tel" autocomplete="tel"></div>
        </div>
        <div class="campo"><label for="c-prog">Programa que te interesa</label>
          <select id="c-prog" name="programa"><option value="">Elegí una opción</option><option>General English</option><option>Business English</option><option>Wanderlust</option><option>Exámenes Cambridge</option><option>Para mi empresa</option><option>No sé todavía</option></select></div>
        <div class="campo"><label for="c-msg">Mensaje</label><textarea id="c-msg" name="mensaje" required></textarea></div>
        <div class="captcha" data-netlify-recaptcha="true"></div>
        <button class="btn btn-primario" type="submit">Enviar consulta</button>
        <p class="legal">Usamos tus datos solo para responder tu consulta. <a href="{rel(p, "privacidad/")}">Política de privacidad</a></p>
      </form>
    </div>
  </div>
</section>'''


MAIL = "prof.traininghub@gmail.com"
MAIL_LINK = f'<a href="mailto:{MAIL}">{MAIL}</a>'


def fecha_es():
    import datetime
    d = datetime.date.today()
    meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
    return f"{d.day} de {meses[d.month - 1]} de {d.year}"


def c_privacidad(p):
    secciones = [
        ("Quién es responsable de tus datos", f"Professional Training Hub, a cargo de Mariana Bianchi y Carolina Capello. Contacto: {MAIL_LINK}."),
        ("Qué datos recolectamos", "Los que completás en los formularios: nombre, email, teléfono, empresa y el mensaje que nos escribís. También datos de navegación anónimos a través de Google Analytics."),
        ("Portal del alumno", "Si sos alumno o alumna, podés ingresar al portal con tu cuenta de Google. Google solo nos comparte tu nombre, tu email y tu foto de perfil, y los usamos para identificarte y mostrarte tu cursada, tu material, el estado de tu abono y las devoluciones de tus docentes. Esos datos, junto con las opiniones que nos dejes, se guardan en una planilla de Google de la cuenta de PTH, a la que solo acceden las directoras. No guardamos contraseñas ni accedemos a ningún otro dato de tu cuenta de Google. Si activás los avisos, guardamos un identificador de tu dispositivo (no tu número) para mandarte las notificaciones que elegiste; podés desactivarlos cuando quieras desde la sección Avisos del portal."),
        ("Para qué los usamos", "Solo para responder tus consultas, enviarte la información que pediste y coordinar tus clases. No los vendemos ni los cedemos a terceros para publicidad."),
        ("Dónde se guardan", "El sitio y los formularios funcionan en Netlify, los datos del portal del alumno en Google (Hojas de cálculo y Apps Script), y las estadísticas de visitas en Google Analytics. Estos servicios procesan los datos por cuenta nuestra."),
        ("Cuánto tiempo los conservamos", "Mientras sean necesarios para atender tu consulta o mientras seas alumno o alumna de PTH."),
        ("Tus derechos", f"Podés pedir acceder a tus datos, corregirlos o borrarlos escribiendo a {MAIL_LINK}. El acceso es gratuito en intervalos no menores a seis meses, salvo que acredites un interés legítimo."),
        ("Organismo de control", "La Agencia de Acceso a la Información Pública, como órgano de control de la Ley 25.326, atiende las denuncias y reclamos de quienes resulten afectados en sus derechos por incumplimiento de las normas sobre protección de datos personales."),
    ]
    cuerpo = "".join(f"<h2 style=\"font-size:1.25rem;margin-top:var(--s5)\">{t}</h2><p class=\"muted\" style=\"margin-top:8px\">{x}</p>" for t, x in secciones)
    return f'''<section class="section">
  <div class="wrap" style="max-width:52rem">
    {migas_html(p)}
    <p class="eyebrow">Legal</p>
    <h1 style="margin-top:var(--s3)">Política de privacidad</h1>
    {cuerpo}
    <p class="legal" style="margin-top:var(--s5)">Última actualización: 17 de noviembre de 2026</p>
  </div>
</section>'''


def c_gracias(p):
    return f'''<section class="hero negro">
  <div class="wrap" style="max-width:46rem">
    <div class="hero-text">
      <p class="eyebrow">Consulta enviada</p>
      <h1>¡Gracias! Recibimos tu consulta</h1>
      <p class="lead">Te escribimos pronto. Si es urgente, escribinos por WhatsApp.</p>
      <div class="btns">{btn_wa(p, ubic="gracias")}<a class="btn btn-sec" href="{rel(p, "")}">Volver al inicio</a></div>
    </div>
  </div>
</section>'''


def c_404(p):
    return f'''<section class="hero negro">
  <div class="wrap" style="max-width:46rem">
    <div class="hero-text">
      <p class="eyebrow">Error 404</p>
      <h1>Esta página no existe</h1>
      <p class="lead">Puede que el enlace esté mal escrito o que la página se haya movido.</p>
      <div class="btns"><a class="btn btn-primario" href="{rel(p, "")}">Ir al inicio</a><a class="btn btn-sec" href="{rel(p, "cursos/")}">Ver cursos</a></div>
    </div>
  </div>
</section>'''


# ---------- borradores (no se publican) ----------
def c_cambridge(p):
    filas = [("Reading", "Comprensión de textos y estrategias para cada tipo de consigna"),
             ("Use of English", "Gramática y vocabulario en contexto"),
             ("Writing", "Ensayos, cartas, informes y reseñas, con corrección detallada"),
             ("Listening", "Comprensión de audios auténticos de distintos acentos"),
             ("Speaking", "Simulación del examen oral, con devolución sobre fluidez y pronunciación")]
    trs = "".join(f'<tr><td lang="en">{a}</td><td>{b}</td></tr>' for a, b in filas)
    return hero_programa(p, "Exámenes", "Preparación de exámenes internacionales Cambridge",
        "Llegá al examen sabiendo qué te van a pedir en cada parte, con práctica sobre modelos reales y feedback en cada clase.",
        "Según el examen", btn_wa(p, "Consultá sin cargo", ubic="portada") + '<a class="btn btn-sec" href="#preparacion">Cómo nos preparamos</a>') + f'''
<section class="section alt" aria-labelledby="quien-t">
  <div class="wrap cols">
    <div class="stack"><p class="eyebrow">Para quién es</p><h2 id="quien-t">Para quienes van a rendir un examen Cambridge</h2></div>
    <ul class="lista">
      <li>Quienes necesitan certificar su nivel de inglés con un examen internacional, como FCE, CAE y CPE.</li>
      <li>Quienes ya se inscribieron y quieren llegar con confianza a la fecha.</li>
      <li>Quienes todavía no saben qué examen les corresponde: te ayudamos a elegirlo según tu nivel.</li>
    </ul>
  </div>
</section>
<section class="section" id="preparacion" aria-labelledby="cae-t"><div class="wrap">
  <div class="section-head"><p class="eyebrow">El programa</p><h2 id="cae-t">Cómo nos preparamos</h2><p class="lead">Trabajamos cada parte del examen, con modelos reales y técnicas para cada consigna. Las partes varían según el examen que vayas a rendir.</p></div>
  <div class="tabla-wrap"><table><thead><tr><th scope="col">Parte</th><th scope="col">Qué practicamos</th></tr></thead><tbody>{trs}</tbody></table></div>
</div></section>
{cierre(p, "Contanos cuándo querés rendir y te armamos un plan.")}'''


def c_vino(p):
    return hero_programa(p, "Vinos", "Inglés para el mundo del vino",
        "Describí un vino, guiá una degustación y atendé visitantes de todo el mundo con el vocabulario preciso y la confianza para usarlo.",
        pend("Niveles"), btn_wa(p, "Consultá sin cargo")) + f'''
<section class="section" aria-labelledby="vino-t"><div class="wrap cols">
  <div class="stack"><h2 id="vino-t">Para quién es</h2><ul class="lista"><li>Sommeliers y estudiantes de sommelier.</li><li>Equipos de bodegas y vinotecas.</li><li>Guías y personal de turismo del vino.</li></ul></div>
  <div class="stack"><h2>Qué vas a practicar</h2><ul class="lista"><li>Vocabulario de cata: aromas, sabores, cuerpo y final.</li><li>Presentar una bodega, sus vinos y su terruño.</li><li>Guiar una degustación y responder preguntas.</li><li>Recomendar maridajes y atender en salón o vinoteca.</li></ul>
  <p>{pend("Confirmar temas, niveles y modalidad")}</p></div>
</div></section>
{cierre(p, "Contanos a qué te dedicás en el mundo del vino.")}'''


# ---------- sitio ----------
def paginas():
    gen_desc = "Curso de inglés online para adultos, desde cero hasta la fluidez. Clases en vivo, material auténtico y feedback en cada encuentro. Consultá sin cargo."
    bus_desc = "Inglés para reuniones, presentaciones, entrevistas y negociaciones. Ocho módulos sobre el mundo laboral, en vivo y online. Individual o para empresas."
    wan_desc = "Wanderlust: clases de inglés en vivo para viajar con confianza. Aeropuertos, hoteles, compras y qué hacer si algo sale mal. Todos los niveles."
    return [
        Pagina("", "Professional Training Hub | Clases de inglés online en vivo",
               "Professional Training Hub (PTH), academia online de inglés: General English, Business English, Wanderlust y exámenes Cambridge. Clases en vivo, individuales o en grupos reducidos.",
               None, MSG_GENERAL, c_inicio, jsonld=[ORG_LD, WEBSITE_LD]),
        Pagina("cursos/", "Cursos de inglés online en vivo | PTH",
               "Programas de inglés online en vivo: inglés general, de negocios, para viajar y preparación de exámenes Cambridge. Individuales o en grupos reducidos.",
               None, MSG_GENERAL, c_cursos, migas=[("cursos/", "Cursos")], activo="cursos/"),
        Pagina("cursos/ingles-general/", "Curso de inglés general online en vivo | PTH", gen_desc, None,
               "¡Hola! Me interesa General English.", c_general,
               migas=[("cursos/", "Cursos"), ("cursos/ingles-general/", "General English")], activo="cursos/",
               jsonld=[curso_ld("General English", gen_desc, "cursos/ingles-general/")]),
        Pagina("cursos/business-english/", "Business English online: inglés de negocios | PTH", bus_desc, None,
               "¡Hola! Me interesa Business English.", c_business,
               migas=[("cursos/", "Cursos"), ("cursos/business-english/", "Business English")], activo="cursos/",
               jsonld=[curso_ld("Business English", bus_desc, "cursos/business-english/")]),
        Pagina("cursos/ingles-para-viajar/", "Inglés para viajar: clases online en vivo | PTH", wan_desc, None,
               "¡Hola! Me interesa Wanderlust, el curso de inglés para viajar.", c_wanderlust,
               migas=[("cursos/", "Cursos"), ("cursos/ingles-para-viajar/", "Wanderlust")], activo="cursos/",
               jsonld=[curso_ld("Wanderlust: inglés para viajar", wan_desc, "cursos/ingles-para-viajar/")]),
        Pagina("cursos/examenes-cambridge/", "Preparación de exámenes Cambridge online | PTH", "Preparación para los exámenes internacionales de Cambridge English, como FCE, CAE y CPE. Clases en vivo, modelos reales y feedback en cada clase.", None,
               "¡Hola! Me interesa la preparación de exámenes Cambridge.", c_cambridge,
               migas=[("cursos/", "Cursos"), ("cursos/examenes-cambridge/", "Exámenes Cambridge")], activo="cursos/",
               jsonld=[curso_ld("Preparación de exámenes internacionales Cambridge", "Preparación para los exámenes internacionales de Cambridge English, como FCE, CAE y CPE. Clases en vivo, modelos reales y feedback en cada clase.", "cursos/examenes-cambridge/")]),
        Pagina("empresas/", "Inglés para empresas: clases in company online | PTH",
               "Capacitación en inglés para equipos, online y en vivo: programas a medida para reuniones, presentaciones y negociaciones. Pedí una propuesta.",
               None, "¡Hola! Quiero una propuesta de inglés para mi empresa.", c_empresas,
               migas=[("empresas/", "Empresas")], activo="empresas/"),
        Pagina("equipo/", "Equipo docente: profesoras de inglés | PTH",
               "Conocé a quienes enseñan en PTH: directoras y docentes de inglés especializadas en adultos, con formación académica y experiencia profesional.",
               None, MSG_GENERAL, c_equipo, migas=[("equipo/", "Equipo")], activo="equipo/"),
        Pagina("preguntas-frecuentes/", "Preguntas frecuentes sobre las clases | PTH",
               "Cuánto duran las clases, cómo se paga, qué plataforma usamos, cómo reprogramar y más. Todo lo que necesitás saber antes de empezar en PTH.",
               None, MSG_GENERAL, c_faq, migas=[("preguntas-frecuentes/", "Preguntas frecuentes")],
               activo="preguntas-frecuentes/", jsonld=[faq_ld()]),
        Pagina("contacto/", "Contacto: consultá sin cargo | PTH",
               "Escribinos por WhatsApp o dejanos tu consulta y te ayudamos a elegir el curso de inglés ideal para vos. Sin costo de inscripción.",
               None, MSG_GENERAL, c_contacto, migas=[("contacto/", "Contacto")], activo="contacto/"),
        Pagina("privacidad/", "Política de privacidad | PTH",
               "Cómo usa Professional Training Hub los datos que dejás en el sitio y cómo podés acceder a ellos, corregirlos o pedir que se borren.",
               None, MSG_GENERAL, c_privacidad, migas=[("privacidad/", "Política de privacidad")]),
        Pagina("gracias/", "Gracias por tu consulta | PTH", "Recibimos tu consulta.", None, MSG_GENERAL, c_gracias, noindex=True),
        Pagina("404.html", "Página no encontrada | PTH", "La página que buscás no existe.", None, MSG_GENERAL, c_404, noindex=True),
    ]


def borradores():
    return [
        Pagina("cursos/ingles-para-el-vino/", "Inglés para el mundo del vino y sommeliers | PTH",
               "Inglés para sommeliers, bodegas y turismo del vino: describir vinos, guiar degustaciones y atender visitantes. Clases online en vivo.",
               None, "¡Hola! Me interesa el curso de inglés para el vino.", c_vino,
               migas=[("cursos/", "Cursos"), ("cursos/ingles-para-el-vino/", "Inglés para el vino")], activo="cursos/", borrador=True),
    ]


def portal():
    """Copia el portal del alumno a /alumnos/ y le pone la configuración."""
    destino = os.path.join(OUT, "alumnos")
    shutil.copytree(os.path.join(SRC, "alumnos"), destino)
    ruta = os.path.join(destino, "index.html")
    with open(ruta, encoding="utf-8") as fh:
        html = fh.read()
    html = (html.replace("{{CLIENT_ID}}", PORTAL_CLIENT_ID or "{{CLIENT_ID}}")
                .replace("{{SCRIPT_URL}}", PORTAL_API)
                .replace("{{FIREBASE}}", json.dumps(PORTAL_FIREBASE))
                .replace("{{GA_TAG}}", "" if PREVIEW else GA_TAG))
    with open(ruta, "w", encoding="utf-8") as fh:
        fh.write(html)


def panel():
    """Copia el panel de dirección de PTH a /panel/ y le pone la configuración."""
    destino = os.path.join(OUT, "panel")
    shutil.copytree(os.path.join(SRC, "panel"), destino)
    ruta = os.path.join(destino, "index.html")
    with open(ruta, encoding="utf-8") as fh:
        html = fh.read()
    html = html.replace("{{CLIENT_ID}}", PORTAL_CLIENT_ID).replace("{{SCRIPT_URL}}", PORTAL_API)
    with open(ruta, "w", encoding="utf-8") as fh:
        fh.write(html)


def escribir(base, p):
    destino = os.path.join(base, p.ruta if p.ruta.endswith(".html") else p.ruta + "index.html")
    os.makedirs(os.path.dirname(destino), exist_ok=True)
    with open(destino, "w", encoding="utf-8") as fh:
        fh.write(documento(p))


def main():
    shutil.rmtree(OUT, ignore_errors=True)
    os.makedirs(OUT)
    for sub in ("css", "js", "fonts", "img"):
        shutil.copytree(os.path.join(SRC, sub), os.path.join(OUT, "assets", sub))
    shutil.copy(os.path.join(SRC, "favicon.ico"), os.path.join(OUT, "favicon.ico"))
    with open(os.path.join(OUT, "site.webmanifest"), "w", encoding="utf-8") as fh:
        json.dump({
            "name": "Professional Training Hub", "short_name": "PTH", "lang": "es-AR",
            "start_url": "/", "display": "browser", "background_color": "#ffffff", "theme_color": "#ffffff",
            "icons": [
                {"src": "/assets/img/pth-app-192.png", "sizes": "192x192", "type": "image/png"},
                {"src": "/assets/img/pth-app-512.png", "sizes": "512x512", "type": "image/png"},
                {"src": "/assets/img/pth-app-512-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"},
            ],
        }, fh, ensure_ascii=False, indent=2)
    ps = paginas()
    for p in ps:
        escribir(OUT, p)
    portal()
    panel()
    if PREVIEW:
        for p in borradores():
            escribir(OUT, p)
    else:
        urls = "".join(f"<url><loc>{DOMINIO}/{p.ruta}</loc><lastmod>{HOY}</lastmod></url>"
                       for p in ps if not p.noindex)
        with open(os.path.join(OUT, "sitemap.xml"), "w") as fh:
            fh.write(f'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{urls}</urlset>\n')
        with open(os.path.join(OUT, "robots.txt"), "w") as fh:
            fh.write(f"User-agent: *\nAllow: /\n\nSitemap: {DOMINIO}/sitemap.xml\n")
        # Para subir arrastrando la carpeta a Netlify (sin build, netlify.toml no se lee)
        with open(os.path.join(OUT, "_redirects"), "w") as fh:
            fh.write("https://www.proftraininghub.com.ar/* https://proftraininghub.com.ar/:splat 301!\n")
        with open(os.path.join(OUT, "_headers"), "w") as fh:
            fh.write("/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  X-Frame-Options: SAMEORIGIN\n"
                     "/assets/*\n  Cache-Control: public, max-age=86400\n"
                     "/alumnos/*\n  X-Robots-Tag: noindex, nofollow\n  Cache-Control: no-cache\n"
                     "/panel/*\n  X-Robots-Tag: noindex, nofollow\n  Cache-Control: no-cache\n"
                     "/*.webmanifest\n  Content-Type: application/manifest+json\n")
        # borradores: fuera de dist, no se publican
        bdir = os.path.join(ROOT, "borradores")
        shutil.rmtree(bdir, ignore_errors=True)
        for p in borradores():
            escribir(bdir, p)
    print(f"{len(ps)} páginas en {OUT}")


if __name__ == "__main__":
    main()
