# Plan de trabajo de Memesbooru

## 1. Objetivo del proyecto

Memesbooru sera una plataforma de catalogo y descubrimiento de memes, principalmente en espanol. Su modelo de uso tomara los aspectos funcionales interesantes de los sitios booru, especialmente:

- Repositorio centralizado de imagenes y contenido multimedia.
- Busqueda potente mediante tags.
- Publicaciones individuales con metadata, tags, votos y favoritos.
- Navegacion por publicaciones recientes, populares y relacionadas.
- Cuentas de usuario y publicaciones asociadas a sus autores.
- Comentarios y participacion de la comunidad.
- Sistema de ranking y confianza para usuarios.
- Moderacion manual y trazable.

La referencia de producto es el motor de busqueda y la experiencia de catalogo de Rule34, no su contenido ni su identidad visual. Memesbooru sera una plataforma propia, orientada a memes, con una interfaz, reglas, marca y sistema de moderacion independientes.

El objetivo tecnico principal es ofrecer una experiencia rapida aun considerando una escala de referencia de:

- 100.000 usuarios.
- 37.000 tags.
- 1.500.000 publicaciones.
- Aproximadamente 15.000.000 relaciones entre publicaciones y tags si cada publicacion tiene diez tags en promedio.

La prioridad principal es la velocidad de lectura y entrega de contenido. La facilidad de desarrollo no debe justificar decisiones que perjudiquen el rendimiento.

## 2. Decisiones confirmadas

### Producto

- El registro sera abierto.
- El unico metodo de inicio de sesion sera Google.
- Memesbooru construira manualmente el puente de autenticacion con Google.
- No se usaran SDKs ni dependencias externas de autenticacion.
- Cada identidad de Google podra tener una sola cuenta de Memesbooru.
- La identidad primaria sera el identificador estable de Google (`sub`), no el email.
- No habra email de verificacion.
- No habra recuperacion de cuenta por email.
- Se podra anadir 2FA posteriormente.
- El 2FA previsto sera TOTP con codigos de recuperacion.
- Toda publicacion estara asociada a una cuenta.
- No se permitira contenido sexual ni gore.
- Se permitiran imagenes, GIFs y videos.
- No se permitiran archivos de audio independientes como MP3, WAV, FLAC, M4A u otros equivalentes.
- El audio que forme parte de un video se conservara.
- Los videos solo seran visibles para usuarios con rango `trusted`.
- Todos los usuarios podran comentar.
- Los favoritos seran independientes de los votos.
- Los votos tendran una puntuacion numerica.
- El score de las publicaciones se recalculara por intervalos.
- Los duplicados no se eliminaran.
- Un duplicado redirigira al post canonico donde existia originalmente.
- La moderacion inicial sera manual.
- Podran existir automatizaciones posteriores, pero no forman parte de la primera definicion del sistema.
- No existe ningun dominio definido actualmente.
- No se debe asumir ni configurar un dominio durante la fundacion del proyecto.

### Tags

- El idioma principal sera espanol.
- Se permitiran nombres propios, franquicias y tags en ingles cuando sea necesario.
- La forma normalizada no usara caracteres especiales.
- No se usaran `ñ`, `á`, `é`, `í`, `ó`, `ú` ni `ü` en la forma normalizada.
- Los tags se almacenaran en minusculas.
- Los espacios se representaran mediante `_`.
- Habra aliases y tags canonicos.
- Los tags tendran categorias, estado e historial de cambios.

### Multimedia

- Los originales se conservaran.
- Las variantes de baja y media calidad se generaran durante el procesamiento.
- El frontend siempre priorizara una variante de baja o media calidad.
- El original solo se entregara cuando el usuario presione `Ver original` o acceda explicitamente a la API correspondiente.
- La entrega final de imagenes y videos se realizara desde R2.
- Images se utilizara para generar variantes de imagen.
- Stream se utilizara para el procesamiento de videos y la generacion de sus variantes, verificando antes de implementarlo la API, binding, disponibilidad y requisitos de cuenta vigentes.
- La disponibilidad publica de una publicacion comenzara despues de que exista su variante de baja calidad.

## 3. Regla de verificacion de Cloudflare

La informacion de Cloudflare y Wrangler cambia con frecuencia. No se debe asumir que una API, binding, limite, comando, nombre de propiedad, plan o comportamiento es valido solo porque haya sido conocido anteriormente.

Para cada decision de Cloudflare se aplicara esta regla:

1. Consultar primero la documentacion oficial vigente.
2. Registrar la fecha y la URL de la documentacion utilizada.
3. Separar hechos documentados, decisiones del proyecto, inferencias y puntos desconocidos.
4. Si Cloudflare no documenta un comportamiento, marcarlo como `no confirmado`.
5. No convertir una inferencia en una garantia.
6. Validar comportamientos no documentados mediante un benchmark controlado o soporte oficial antes de basar la arquitectura en ellos.

### Informacion actualmente verificada

La documentacion oficial consultada confirma lo siguiente:

- Cloudflare recomienda `wrangler.jsonc` para proyectos nuevos.
- `wrangler.toml` aun aparece soportado en la documentacion, pero este proyecto utilizara `wrangler.jsonc`.
- Wrangler se recomienda instalado localmente dentro del proyecto.
- `wrangler types` genera los tipos del runtime y los bindings a partir de la configuracion real.
- D1 permite migraciones SQL versionadas.
- D1 procesa las consultas de cada base de forma single-threaded.
- D1 dispone de read replication para distribuir lecturas y reducir latencia geografica.
- La read replication requiere D1 Sessions API para mantener consistencia secuencial.
- Las escrituras de D1 continuan pasando por la instancia primaria.
- `D1Database.batch()` reduce round trips, pero sus statements se ejecutan secuencialmente y no de forma concurrente.
- Cloudflare documenta que Workers manejan operaciones asincronas y multiples requests mientras esperan I/O.
- Cloudflare no documenta una garantia de que dos bases D1 independientes se ejecuten en paralelo ni de que separarlas mejore siempre la latencia.
- R2 permite leer y escribir objetos desde Workers mediante bindings.
- Images puede transformar bytes provenientes de R2 y guardar el resultado posteriormente en R2.
- Stream puede recibir, procesar, codificar y entregar videos.
- Las transformaciones de video pueden producir variantes y frames que posteriormente se guarden en R2, sujeto a validar la disponibilidad actual del binding y del plan.
- Queues soporta procesamiento asincrono, batching, reintentos, retrasos y Dead Letter Queues.
- Rate Limiting permite limitar operaciones desde el Worker, pero es eventualmente consistente y no debe utilizarse como sistema contable.

## 4. Arquitectura general

Se utilizara un unico Worker para la entrega del producto:

```text
Single Worker (Hono)
├── Frontend vanilla TypeScript
├── API REST (Hono)
├── Autenticacion
├── Catalogo
├── Busqueda
├── Comentarios
├── Votos y favoritos
├── Moderacion
├── Procesamiento de Queue
├── R2
├── D1
├── Images
├── Stream/Media Transformations
└── Rate Limiting
```

El Worker no se dividira en varios Workers solo para separar responsabilidades. La separacion sera logica dentro del mismo repositorio y del mismo Worker.

### Framework HTTP

Se utilizara **Hono** como framework HTTP del Worker:

- Hono es el framework recomendado para Cloudflare Workers (runtime agnostico, zero-dependency, optimizado para Workers).
- Se utilizara para enrutado, middleware, validacion y tipado de `Bindings`/`Variables`.
- Hono no sustituye la arquitectura Repository-Service: los handlers de Hono delegaran inmediatamente a Controllers -> Services -> Repositories.
- No se utilizara `itty-router` ni enrutado manual con `fetch` switch.

### Base de datos

La decision actual es:

```text
Una unica base D1 primaria
+ tablas especializadas
+ indices compuestos
+ proyecciones de lectura
+ read replication cuando el trafico lo justifique
```

No se utilizaran varias D1 independientes como arquitectura inicial.

La razon es que separar bases no tiene una garantia documentada de paralelismo entre ellas y obligaria a coordinar mediante Queue datos que naturalmente se relacionan:

```text
posts -> tags -> media -> autor -> score -> comentarios -> favoritos
```

Una D1 permite joins, transacciones y consistencia local. La velocidad se obtendra reduciendo filas leidas, evitando joins innecesarios, usando proyecciones y distribuyendo las lecturas mediante read replication.

Separar una parte a otra D1 solo sera una decision posterior basada en metricas reales de saturacion. No se hara por intuicion.

### Almacenamiento

```text
D1  -> metadata, relaciones, usuarios e interacciones
R2  -> originales, previews y variantes
Queue -> trabajos asincronos y recalculos
Cache -> respuestas publicas y objetos inmutables
```

Nunca se almacenaran imagenes, videos ni otros binarios grandes en D1.

## 5. Arquitectura de codigo

El backend seguira una estructura Repository-Service sobre Hono:

```text
Hono (fetch handler + middleware + routing)
    -> Controller (Hono handler)
        -> Service
            -> Repository
                -> Cloudflare Binding (D1/R2/Queue/etc.)
```

Hono proveera:
- Definicion de rutas tipadas (`app.get('/api/posts', ...)`).
- Middleware de autenticacion, CSRF, rate limiting y logging.
- Tipado de `Env` (bindings) via `Hono<{ Bindings: Env }>`.
- Validacion de payloads (preferentemente `zod` + `@hono/zod-validator`).

Los handlers de Hono deben permanecer delgados y delegar toda la logica a Services.

### Controllers

Responsabilidades:

- Recibir requests.
- Resolver metodo y ruta.
- Validar autenticacion basica.
- Validar payloads.
- Llamar al servicio correspondiente.
- Convertir resultados en respuestas HTTP.
- No contener reglas de negocio complejas.

### Services

Responsabilidades:

- Aplicar reglas de negocio.
- Coordinar varios repositories.
- Validar permisos.
- Controlar estados de publicaciones.
- Aplicar ranking y restricciones.
- Crear jobs de Queue.

### Repositories

Responsabilidades:

- Ejecutar SQL preparado.
- Acceder a D1, R2 u otros bindings.
- Mapear resultados a tipos de dominio.
- No decidir permisos ni reglas de producto.

### Domain

Contendra:

- Entidades.
- Tipos.
- Estados.
- Errores de dominio.
- Reglas puras que no dependan de Cloudflare.

El dominio no debe conocer `env`, R2, D1 ni APIs especificas del proveedor.

## 6. Estructura inicial del repositorio

```text
memesbooru/
├── public/
├── src/
│   ├── client/
│   │   ├── app/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── services/
│   │   ├── state/
│   │   └── styles/
│   ├── server/
│   │   ├── controllers/
│   │   ├── domain/
│   │   ├── infrastructure/
│   │   │   ├── d1/
│   │   │   ├── r2/
│   │   │   ├── queues/
│   │   │   ├── images/
│   │   │   └── rate-limits/
│   │   ├── repositories/
│   │   ├── services/
│   │   └── entrypoint.ts
│   └── shared/
│       ├── contracts/
│       ├── errors/
│       └── validation/
├── migrations/
├── tests/
│   ├── client/
│   ├── server/
│   └── integration/
├── scripts/
├── vite.config.ts
├── tsconfig.json
├── wrangler.jsonc
├── package.json
└── worker-configuration.d.ts
```

## 7. Frontend

El frontend sera completamente vanilla:

- TypeScript.
- HTML semantico.
- CSS propio.
- Vite como herramienta de build y desarrollo.
- Sin React.
- Sin Vue.
- Sin Angular.
- Sin Svelte.
- Sin framework de UI.
- Routing propio con `history.pushState`.
- Componentes basados en funciones y templates.
- Estado pequeno y explicito.
- Carga incremental solo donde sea necesario.

Vite no sera considerado un framework de frontend. Se utilizara para compilar assets, ofrecer HMR y permitir la integracion oficial con Workers.

### Pantallas principales

- Inicio con buscador de tags.
- Grid de publicaciones.
- Resultados filtrados.
- Publicacion individual.
- Subida de contenido.
- Perfil de usuario.
- Favoritos.
- Comentarios.
- Panel de moderacion.
- Configuracion de cuenta y 2FA.

### Experiencia booru

La UI tendra:

- Buscador principal de tags.
- Tags visibles y seleccionables.
- Grid denso de thumbnails.
- Orden reciente, popular y otras opciones definidas posteriormente.
- Filtros por tipo de contenido.
- Navegacion anterior y siguiente dentro de resultados.
- Publicaciones relacionadas.
- Votos numericos.
- Favoritos independientes.
- Comentarios.
- Accion explicita `Ver original`.
- Indicadores de procesamiento y disponibilidad.

La apariencia sera propia de Memesbooru. Se tomaran patrones funcionales del modelo booru, no branding, assets ni identidad visual de Rule34.

### Responsive y accesibilidad

- Grid adaptado a desktop, tablet y movil.
- Busqueda usable con teclado.
- Filtros accesibles en pantallas pequenas.
- Botones con areas tactiles adecuadas.
- HTML semantico.
- Estados visibles de carga, error y vacio.
- Texto alternativo generado a partir de metadata cuando sea posible.
- No depender unicamente del color para comunicar estados.

## 8. Modelo de datos D1

### Usuarios e identidad

```text
users
- id INTEGER PRIMARY KEY
- username TEXT NOT NULL UNIQUE
- display_name TEXT
- avatar_url TEXT
- rank TEXT NOT NULL
- status TEXT NOT NULL
- trust_score INTEGER NOT NULL DEFAULT 0
- created_at INTEGER NOT NULL
- last_login_at INTEGER
- last_activity_at INTEGER
```

```text
google_identities
- user_id INTEGER PRIMARY KEY
- google_subject TEXT NOT NULL UNIQUE
- created_at INTEGER NOT NULL
- last_login_at INTEGER
```

La unicidad de cuenta se basara en `google_subject`.

### Sesiones

```text
sessions
- id INTEGER PRIMARY KEY
- user_id INTEGER NOT NULL
- token_hash BLOB NOT NULL UNIQUE
- created_at INTEGER NOT NULL
- expires_at INTEGER NOT NULL
- last_seen_at INTEGER NOT NULL
- revoked_at INTEGER
```

Las cookies seran `HttpOnly`, `Secure` y con `SameSite` adecuado.

### Publicaciones

```text
posts
- id INTEGER PRIMARY KEY
- public_id TEXT NOT NULL UNIQUE
- author_id INTEGER NOT NULL
- canonical_post_id INTEGER
- media_type TEXT NOT NULL
- status TEXT NOT NULL
- title TEXT
- description TEXT
- score REAL NOT NULL DEFAULT 0
- rating_count INTEGER NOT NULL DEFAULT 0
- favorite_count INTEGER NOT NULL DEFAULT 0
- comment_count INTEGER NOT NULL DEFAULT 0
- created_at INTEGER NOT NULL
- published_at INTEGER
- updated_at INTEGER NOT NULL
```

`id` sera una clave interna eficiente para joins. `public_id` sera el identificador opaco de URLs publicas.

Estados previstos:

```text
uploading
processing
available
duplicate
rejected
hidden
```

### Proyeccion de lectura

```text
post_listing
- post_id INTEGER PRIMARY KEY
- public_id TEXT NOT NULL UNIQUE
- media_type TEXT NOT NULL
- status TEXT NOT NULL
- low_variant_key TEXT NOT NULL
- medium_variant_key TEXT
- width INTEGER
- height INTEGER
- score REAL NOT NULL DEFAULT 0
- rating_count INTEGER NOT NULL DEFAULT 0
- favorite_count INTEGER NOT NULL DEFAULT 0
- comment_count INTEGER NOT NULL DEFAULT 0
- published_at INTEGER NOT NULL
```

`post_listing` sera una proyeccion materializada para el grid y las busquedas. No contendra textos largos, comentarios, votos individuales ni historial administrativo.

### Assets multimedia

```text
media_assets
- id INTEGER PRIMARY KEY
- post_id INTEGER NOT NULL
- media_type TEXT NOT NULL
- provider TEXT NOT NULL
- original_object_key TEXT NOT NULL UNIQUE
- mime_type TEXT NOT NULL
- byte_size INTEGER NOT NULL
- width INTEGER
- height INTEGER
- duration_ms INTEGER
- checksum BLOB NOT NULL
- processing_status TEXT NOT NULL
- created_at INTEGER NOT NULL
```

```text
media_variants
- id INTEGER PRIMARY KEY
- media_asset_id INTEGER NOT NULL
- variant_name TEXT NOT NULL
- object_key TEXT NOT NULL UNIQUE
- mime_type TEXT NOT NULL
- byte_size INTEGER NOT NULL
- width INTEGER
- height INTEGER
- quality_class TEXT NOT NULL
- visibility TEXT NOT NULL
- created_at INTEGER NOT NULL
```

No existira un tipo de publicacion `audio`.

### Tags

```text
tags
- id INTEGER PRIMARY KEY
- normalized_name TEXT NOT NULL UNIQUE
- display_name TEXT
- category TEXT NOT NULL
- usage_count INTEGER NOT NULL DEFAULT 0
- status TEXT NOT NULL
- created_by INTEGER
- created_at INTEGER NOT NULL
- updated_at INTEGER NOT NULL
```

```text
tag_aliases
- id INTEGER PRIMARY KEY
- alias_normalized TEXT NOT NULL UNIQUE
- tag_id INTEGER NOT NULL
- created_by INTEGER NOT NULL
- created_at INTEGER NOT NULL
```

### Relacion entre publicaciones y tags

```text
post_tags
- post_id INTEGER NOT NULL
- tag_id INTEGER NOT NULL
- added_by INTEGER NOT NULL
- created_at INTEGER NOT NULL
PRIMARY KEY (post_id, tag_id)
```

Indices:

```text
INDEX post_tags(tag_id, post_id)
INDEX post_tags(post_id, tag_id)
```

El indice `(tag_id, post_id)` funcionara como indice invertido para buscar publicaciones desde un tag.

### Votos numericos

```text
post_ratings
- post_id INTEGER NOT NULL
- user_id INTEGER NOT NULL
- value INTEGER NOT NULL
- created_at INTEGER NOT NULL
- updated_at INTEGER NOT NULL
PRIMARY KEY (post_id, user_id)
```

El rango numerico exacto del voto queda pendiente de definicion.

### Favoritos

```text
post_favorites
- post_id INTEGER NOT NULL
- user_id INTEGER NOT NULL
- created_at INTEGER NOT NULL
PRIMARY KEY (post_id, user_id)
```

### Comentarios

```text
comments
- id INTEGER PRIMARY KEY
- post_id INTEGER NOT NULL
- author_id INTEGER NOT NULL
- parent_id INTEGER
- body TEXT NOT NULL
- status TEXT NOT NULL
- created_at INTEGER NOT NULL
- updated_at INTEGER NOT NULL
- deleted_at INTEGER
```

Los comentarios tendran profundidad limitada, se cargaran por cursor y no se almacenara HTML arbitrario.

### Ranking

```text
user_activity
- user_id INTEGER PRIMARY KEY
- approved_posts INTEGER NOT NULL DEFAULT 0
- rejected_posts INTEGER NOT NULL DEFAULT 0
- comments_count INTEGER NOT NULL DEFAULT 0
- confirmed_reports INTEGER NOT NULL DEFAULT 0
- last_upload_at INTEGER
- last_comment_at INTEGER
- updated_at INTEGER NOT NULL
```

```text
user_rank_history
- id INTEGER PRIMARY KEY
- user_id INTEGER NOT NULL
- previous_rank TEXT
- new_rank TEXT NOT NULL
- reason TEXT NOT NULL
- created_by INTEGER
- created_at INTEGER NOT NULL
```

Rangos iniciales:

```text
new
normal
trusted
restricted
banned
```

### Moderacion

```text
reports
- id INTEGER PRIMARY KEY
- reporter_id INTEGER NOT NULL
- target_type TEXT NOT NULL
- target_id INTEGER NOT NULL
- reason TEXT NOT NULL
- status TEXT NOT NULL
- created_at INTEGER NOT NULL
- resolved_at INTEGER
```

```text
moderation_actions
- id INTEGER PRIMARY KEY
- target_type TEXT NOT NULL
- target_id INTEGER NOT NULL
- moderator_id INTEGER NOT NULL
- action TEXT NOT NULL
- reason TEXT
- created_at INTEGER NOT NULL
```

Se utilizara soft delete cuando la informacion sea necesaria para auditoria.

## 9. Optimizacion de D1

### Publicaciones

Indices principales:

```text
posts(status, published_at, id)
posts(status, score, id)
posts(author_id, created_at)
posts(canonical_post_id)
posts(media_type, status, published_at, id)
```

Reglas:

- No usar `SELECT *` en endpoints publicos.
- No cargar comentarios, votos ni datos administrativos en el grid.
- Mantener score y contadores materializados.
- Usar proyecciones de lectura.
- Usar `INTEGER PRIMARY KEY` para relaciones internas.
- Mantener `public_id` separado para URLs.
- Evitar columnas JSON para datos usados en filtros.

### Paginacion

No se utilizara `OFFSET` para paginas profundas.

Se usaran cursores basados en orden estable:

```text
score DESC, id DESC
published_at DESC, id DESC
```

Ejemplo conceptual:

```sql
WHERE status = 'available'
  AND (
    score < ?
    OR (score = ? AND id < ?)
  )
ORDER BY score DESC, id DESC
LIMIT ?
```

### Busqueda por tags

La busqueda debera:

1. Normalizar la entrada.
2. Resolver aliases y nombres canonicos.
3. Resolver tags a IDs.
4. Empezar por el tag menos utilizado.
5. Obtener candidatos desde `(tag_id, post_id)`.
6. Intersectar los candidatos.
7. Unir con `post_listing`.
8. Filtrar `available`.
9. Ordenar con cursor.
10. Devolver un payload pequeno.

No se almacenaran tags en JSON dentro de `posts`.

Para autocompletado se priorizara busqueda por prefijo:

```sql
WHERE normalized_name LIKE ? || '%'
ORDER BY usage_count DESC, normalized_name ASC
LIMIT 20
```

FTS5 solo se evaluara si la busqueda por prefijo resulta insuficiente. No se anadira por defecto porque incrementa almacenamiento y costo de escritura.

### Comentarios

Indice principal:

```text
comments(post_id, created_at, id)
```

Reglas:

- Cursor por `(created_at, id)`.
- Limite fijo por respuesta.
- No cargar todos los comentarios.
- No hacer joins de comentarios en el grid.
- Mantener `comment_count` en `posts` y `post_listing`.
- Actualizar el contador mediante Queue.
- Limitar profundidad de respuestas.
- Sanitizar y renderizar como texto o Markdown controlado.

### Votos, favoritos y contadores

No se actualizara `posts.score` con cada voto.

Flujo:

```text
post_ratings
  -> post_score_jobs
  -> Queue
  -> recalculo por intervalos
  -> posts.score
  -> post_listing.score
```

Las visitas y contadores de alta frecuencia no deben provocar un `UPDATE` por request. Se agruparan mediante eventos y Queue.

No se utilizara `ORDER BY RANDOM()` sobre millones de filas.

### Indices

Los indices se crearan solo para consultas frecuentes y se verificaran con:

```sql
EXPLAIN QUERY PLAN
```

Tambien se ejecutara `PRAGMA optimize` despues de cambios relevantes de indices, siguiendo la documentacion vigente de D1.

Un indice puede mejorar velocidad y reducir filas leidas, pero tambien aumenta escrituras y almacenamiento. Cada indice debe justificarse mediante una consulta real.

### Batch

`D1.batch()` se usara para reducir round trips cuando varias operaciones deban viajar juntas a D1. No se tratara como paralelismo: sus statements son secuenciales.

## 10. Autenticacion y seguridad

### Google

El Worker implementara manualmente el flujo OAuth 2.0/OpenID Connect:

```text
Usuario
  -> Google authorization endpoint
  -> callback del Worker
  -> validacion manual del flujo
  -> lectura del google_subject
  -> creacion o busqueda de usuario
  -> sesion propia de Memesbooru
```

No se utilizara el email para garantizar unicidad. El identificador estable sera `google_subject`.

### Sesiones

- Cookies `HttpOnly`.
- Cookies `Secure`.
- `SameSite` apropiado.
- Tokens aleatorios.
- Tokens almacenados como hashes.
- Revocacion de sesiones.
- Expiracion.
- Control de sesiones activas.
- Proteccion CSRF para operaciones mutables.

### 2FA

La segunda fase de autenticacion incluira:

- TOTP.
- Secreto protegido.
- Codigos de recuperacion de un solo uso.
- Activacion solicitando reautenticacion.
- Desactivacion solicitando autenticacion fuerte.
- Registro de eventos de seguridad.

## 11. Rate Limiting y ranking

Rate Limiting protegera:

- Inicio de sesion.
- Solicitudes OAuth.
- Subidas.
- Comentarios.
- Reportes.
- Votos.
- Favoritos.
- Busquedas costosas.

La regla de una subida por hora no dependera exclusivamente de Rate Limiting. Sera una regla persistente del negocio:

```text
new:
  una subida por 3600 segundos

normal:
  sin ese cooldown

trusted:
  puede ver videos
```

Se verificara `last_upload_at` en D1 y se actualizara de forma consistente.

El ranking se basara inicialmente en:

- Antiguedad.
- Actividad.
- Publicaciones aprobadas.
- Historial de moderacion.

Los umbrales exactos para cambiar de rango quedan pendientes. No se otorgara confianza unicamente por votos.

## 12. Flujo multimedia

### Imagenes

```text
Upload
  -> R2/quarantine
  -> Queue
  -> validacion
  -> checksum
  -> Images
  -> low/medium
  -> R2/variants
  -> media_variants
  -> post available
```

Images procesara los bytes y R2 almacenara los resultados.

### Videos

```text
Upload
  -> R2/quarantine
  -> Queue
  -> validacion
  -> checksum
  -> transformacion de video
  -> low/medium
  -> thumbnail/frame
  -> R2/variants
  -> post available
```

Los videos conservaran su audio interno. No se generaran publicaciones de audio ni variantes de audio independientes.

Los videos solo seran entregados a usuarios `trusted`.

La disponibilidad de Stream, Media Transformations, sus bindings, formatos, limites y requisitos de plan debe verificarse en la cuenta y documentacion vigente antes de implementarse. No se asumira ningun nombre de binding ni API.

### Rutas de objetos

Se usaran claves basadas en contenido:

```text
media/{checksum}/original.ext
media/{checksum}/low.avif
media/{checksum}/medium.avif
media/{checksum}/low.mp4
media/{checksum}/medium.mp4
```

Las variantes inmutables permiten cache prolongada y evitan regeneraciones.

## 13. Duplicados

El checksum detectara duplicados exactos.

La publicacion duplicada se conservara con:

```text
canonical_post_id = post original
```

El endpoint del duplicado podra:

- Responder con redireccion al post canonico.
- O devolver metadata del post canonico para que el frontend navegue hacia el.

La decision final entre redireccion HTTP y metadata de API se tomara al definir los contratos publicos.

## 14. Queue y trabajos idempotentes

```text
jobs
- id INTEGER PRIMARY KEY
- job_type TEXT NOT NULL
- entity_id INTEGER NOT NULL
- status TEXT NOT NULL
- attempts INTEGER NOT NULL DEFAULT 0
- available_at INTEGER NOT NULL
- locked_at INTEGER
- completed_at INTEGER
- created_at INTEGER NOT NULL
```

Tipos iniciales:

```text
process_media
recalculate_post_score
update_tag_usage
aggregate_counters
cleanup_expired_sessions
```

Los consumidores deben ser idempotentes porque un mensaje puede volver a entregarse. Una misma variante no debe duplicar objetos ni registros.

Si un trabajo falla repetidamente, se enviara a una Dead Letter Queue.

## 15. Cache y entrega

La cache se aplicara principalmente a:

- Variantes multimedia inmutables.
- Publicaciones individuales publicas.
- Primeras paginas de busquedas populares.
- Tags populares.
- Autocompletado frecuente.

No se cachearan de forma indiscriminada:

- Sesiones.
- Permisos.
- Moderacion reciente.
- Resultados privados.
- Operaciones mutables.

Las respuestas de API publicas tendran payloads pequenos y claves de cache construidas a partir de la consulta normalizada y el cursor.

## 16. Moderacion

### Estados de usuario

```text
active
restricted
banned
```

### Estados de publicacion

```text
uploading
processing
available
rejected
hidden
```

### Estados de comentario

```text
visible
hidden
pending_review
```

La moderacion incluira:

- Reportes.
- Ocultado reversible.
- Borrado logico.
- Rechazo con motivo.
- Historial de acciones.
- Restricciones manuales.
- Baneos manuales.
- Revision de duplicados.
- Administracion de aliases y tags.

## 17. Fases de implementacion

### Fase 0: Especificacion

- Consolidar reglas de contenido.
- Definir rango numerico de votos.
- Definir categorias de tags.
- Definir umbrales de ranking.
- Definir profundidad maxima de comentarios.
- Definir contratos de API.
- Definir politica de duplicados.
- Definir formatos multimedia aceptados.
- Verificar capacidades actuales de Images, Stream y Media Transformations en la cuenta.

### Fase 1: Fundacion

- Inicializar proyecto TypeScript.
- Instalar **Hono** (`hono`) como dependencia principal del Worker.
- Configurar Vite con `@hono/vite-dev-server` o `vite-plugin-cloudflare` segun documentacion vigente.
- Configurar `wrangler.jsonc`.
- Instalar Wrangler localmente.
- Configurar environments.
- Generar `worker-configuration.d.ts` con `wrangler types` y tipar `Hono<{ Bindings: Env }>`.
- Configurar type-checking.
- Configurar Vitest con la integracion oficial vigente (`@cloudflare/vitest-pool-workers`).
- Configurar CI.
- Crear la estructura Repository-Service sobre handlers de Hono.

### Fase 2: Base D1

- Crear migraciones SQL.
- Crear usuarios, identidad y sesiones.
- Crear publicaciones.
- Crear tags y aliases.
- Crear `post_tags` e indices.
- Crear `post_listing`.
- Crear multimedia.
- Crear comentarios, votos y favoritos.
- Crear moderacion y trabajos.
- Crear fixtures de datos a escala.

### Fase 3: Autenticacion

- Implementar puente manual con Google.
- Crear y recuperar cuentas por `google_subject`.
- Crear sesiones propias.
- Implementar logout y revocacion.
- Aplicar Rate Limiting.
- Anadir TOTP.

### Fase 4: Catalogo y busqueda

- Implementar endpoints de publicaciones.
- Implementar normalizacion de tags.
- Implementar aliases.
- Implementar busqueda exacta por tags.
- Implementar autocompletado.
- Implementar cursores.
- Implementar grid.
- Implementar pagina individual.
- Implementar duplicados.

### Fase 5: Multimedia

- Implementar R2 de cuarentena.
- Implementar validacion de MIME real.
- Implementar checksum.
- Implementar Queue.
- Integrar Images.
- Integrar procesamiento de videos validado en Cloudflare.
- Generar low y medium.
- Guardar variantes en R2.
- Exponer publicaciones cuando exista low.
- Restringir videos a `trusted`.

### Fase 6: Interaccion

- Implementar puntuacion numerica.
- Implementar favoritos.
- Implementar comentarios.
- Implementar soft delete.
- Implementar contadores materializados.
- Implementar recalculo periodico de score.

### Fase 7: Moderacion y ranking

- Implementar reportes.
- Implementar acciones manuales.
- Implementar historial de moderacion.
- Implementar ranking de usuarios.
- Aplicar limite de una subida por hora a cuentas nuevas.
- Aplicar permisos de usuarios `trusted`.

### Fase 8: Rendimiento

- Generar datos sinteticos con 1.500.000 posts.
- Generar 37.000 tags.
- Generar aproximadamente 15.000.000 relaciones `post_tags`.
- Medir grid reciente.
- Medir grid popular.
- Medir busqueda con uno, dos y varios tags.
- Medir tags muy populares.
- Medir comentarios en publicaciones populares.
- Medir votos concurrentes.
- Revisar `rows_read` y `rows_written`.
- Revisar `EXPLAIN QUERY PLAN`.
- Ejecutar `PRAGMA optimize`.
- Activar read replication cuando las metricas lo justifiquen.
- Medir latencia por region.

### Fase 9: Produccion

- Configurar secrets.
- Configurar observabilidad.
- Configurar backups y exportaciones.
- Configurar alertas.
- Ejecutar pruebas de carga.
- Ejecutar pruebas de recuperacion de Queue.
- Revisar costos actuales de Cloudflare.
- Desplegar sin asumir dominio.
- Incorporar dominio solamente cuando exista.

## 18. Verificacion obligatoria

Despues de cualquier cambio de configuracion Cloudflare:

```text
wrangler types
wrangler types --check
wrangler deploy --dry-run
```

Las pruebas incluiran:

- Type-checking.
- Tests unitarios de dominio.
- Tests de repositories.
- Tests de endpoints.
- Tests de autenticacion.
- Tests de permisos.
- Tests de tags y aliases.
- Tests de duplicados.
- Tests de paginacion.
- Tests de procesamiento multimedia.
- Tests de reintentos de Queue.
- Tests de idempotencia.
- Tests de Rate Limiting.
- Tests de comentarios y soft delete.
- Pruebas manuales responsive.
- Pruebas de carga con datos representativos.

## 19. Puntos pendientes

- Rango exacto de la puntuacion numerica.
- Formula exacta del score.
- Intervalo de recalculo del score.
- Umbral de antiguedad para cada rango.
- Definicion cuantitativa de actividad.
- Formatos exactos de imagen y video.
- Profundidad maxima de respuestas a comentarios.
- Longitud maxima de comentarios.
- Politica final de redireccion de duplicados.
- Binding y disponibilidad vigente de procesamiento de video.
- Planes y capacidades actuales de Images, Stream y Media Transformations.
- Dominio futuro.

## 20. Fuentes Cloudflare consultadas

Estas fuentes fueron consultadas para este plan y deben volver a verificarse antes de implementar cada componente:

- [Wrangler Configuration](https://developers.cloudflare.com/workers/wrangler/configuration/)
- [Wrangler Install and Update](https://developers.cloudflare.com/workers/wrangler/install-and-update/)
- [Workers TypeScript](https://developers.cloudflare.com/workers/languages/typescript/)
- [Cloudflare Vite Plugin](https://developers.cloudflare.com/workers/vite-plugin/)
- [D1 Limits](https://developers.cloudflare.com/d1/platform/limits/)
- [D1 Migrations](https://developers.cloudflare.com/d1/reference/migrations/)
- [D1 Worker API](https://developers.cloudflare.com/d1/worker-api/d1-database/)
- [D1 Read Replication](https://developers.cloudflare.com/d1/best-practices/read-replication/)
- [D1 Use Indexes](https://developers.cloudflare.com/d1/best-practices/use-indexes/)
- [R2 Workers API](https://developers.cloudflare.com/r2/api/workers/workers-api-usage/)
- [R2 Presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)
- [Cloudflare Images Transformations](https://developers.cloudflare.com/images/optimization/transformations/overview/)
- [Images Binding](https://developers.cloudflare.com/images/optimization/binding/)
- [Stream](https://developers.cloudflare.com/stream/)
- [Stream Video Uploads](https://developers.cloudflare.com/stream/uploading-videos/)
- [Workers Media Transformations](https://developers.cloudflare.com/stream/transform-videos/bindings/)
- [Queues](https://developers.cloudflare.com/queues/)
- [Rate Limiting API](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
- [Workers Vitest Integration](https://developers.cloudflare.com/workers/testing/vitest-integration/)
