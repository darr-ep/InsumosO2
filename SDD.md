# Software Design Document — O2 Insumos PWA

**Proyecto:** PWA interna de gestión de rentas — O2 Insumos
**Versión:** 1.5 (borrador para revisión)
**Fecha:** 2026-08-26
**Autor:** Software Architect / Business Analyst (asistido por IA)
**Estado:** Listo para pasar a implementación, salvo hallazgos que surjan al detallar tasks

> Nota de idioma: este documento usa español para la narrativa de negocio (es el idioma en que opera el negocio y sus usuarios) y **inglés para nombres de colecciones, campos, componentes y código** (convención técnica estándar, consistente con los nombres que el propio negocio definió en el brief original: `customer_id`, `rental_items`, `started_at`, etc.).

> **Cambios en la versión 1.1:** se incorporaron los hallazgos del prototipo de impresión Bluetooth (`test-impresora`, hardware real ya validado) y se aplicó una pasada de simplificación tras auditar sobreingeniería (eliminación de `audit_log`, `rental_extras`→`jsonb`, sin `payment_type='other'`, umbral fijo por env var, sin TanStack Query, sin draft en `localStorage`, formulario único en vez de wizard, modales en vez de rutas). Numeración del anexo corregida a **Anexo A**.
>
> **Cambios en la versión 1.2:** se cerraron 5 de las 8 decisiones del Anexo A (login con selector de usuarios, folio global, `payment_type='adjustment'`+`note` para corrección de pagos, falla de foto permite continuar, sin devolución parcial).
>
> **Cambios en la versión 1.3:** cambio de backend — **Supabase → PocketBase**, decidido tras un POC técnico que validó la arquitectura. Motivo: el negocio ya opera infraestructura propia (self-hosted) en su VPS para otros proyectos, y Supabase Cloud no era viable a su escala de múltiples proyectos ($25/mes por proyecto pasado el límite gratuito) ni Supabase self-hosted lo era en términos de RAM (~1.6–1.8GB por stack completo, medido en su VPS real). PocketBase resuelve Auth+DB+Storage en un solo binario, con una huella de recursos muchísimo menor. Este cambio es de **infraestructura e implementación técnica**, no de producto: ningún flujo, pantalla, regla de negocio o decisión del Anexo A se reabrió. Se agregó diseño explícito para dos puntos que el cambio de plataforma obligaba a resolver de nuevo: `status`/`returned_at`/`returned_by`/`folio` resueltos **server-side** (nunca confiando en lo que mande el cliente — antes lo garantizaba RLS+secuencia de Postgres, ahora lo garantizan hooks de PocketBase), y el mecanismo de token para archivos protegidos (antes signed URL de Supabase Storage, ahora file token de PocketBase).
>
> **Cambios en la versión 1.4:** se incorporó una dirección de diseño UI/UX completa (sección 16), centrada en que la app se sienta como "una libreta de control convertida en herramienta digital simple", no como un SaaS/ERP. Esto **revisa dos decisiones de navegación de versiones anteriores**, marcado explícitamente: (1) la búsqueda deja de estar solo inline en el Dashboard y pasa a ser una pestaña propia ("Buscar"), dentro de una navegación fija de 3 pestañas (Dashboard / Nueva renta / Buscar) — más fácil de descubrir para una usuaria no técnica que un campo de búsqueda que hay que notar; (2) Detalle de renta y Ficha de cliente pasan de pantalla/ruta propia a vista contextual (`Sheet`), porque la propia dirección de diseño pide explícitamente no crear rutas solo porque es técnicamente posible. Ninguna regla de negocio cambió — solo cómo se navega hacia la misma información.
>
> **Cambios en la versión 1.5:** se cerraron los últimos datos operativos que faltaban antes de iniciar desarrollo (sección 27, 28, 29): dominio (`insumoso2.com`), nombre del negocio, teléfono, logo real (guardado en `public/logo.png`), y destino de backups (Backblaze B2, ya en uso en otro proyecto del negocio). Se documenta explícitamente que `insumoso2.com` tiene **otra app corriendo hoy** que debe reemplazarse — marcado como acción de despliegue que requiere un plan de corte deliberado, no un simple "usar este dominio".

---

## 1. Resumen ejecutivo

O2 Insumos es un negocio familiar que renta concentradores de oxígeno y tanques. Hoy el control de rentas vive repartido entre papel, fotos de notas y WhatsApp, lo cual ya causó una pérdida real de dinero (una renta de $2,800/mes pasó ~6 meses sin detectarse y se resolvió cobrando solo $5,000 en total).

Este documento define el diseño de una **PWA interna, mobile-first**, que digitaliza exactamente el flujo que el negocio ya usa — registrar renta, cobrar, devolver, buscar — sin agregar procesos nuevos. No es un ERP, no es un POS, no gestiona inventario ni ubicación física de equipos. Su única función es que cualquier persona autorizada pueda, en segundos, saber **qué está rentado, a quién, desde cuándo, y cuánto se ha cobrado**.

El stack es React + TypeScript + Vite + **PocketBase**, desplegado como PWA instalable sobre el VPS existente del negocio, junto a la infraestructura self-hosted que ya operan.

---

## 2. Problema de negocio

| Síntoma actual | Causa raíz |
|---|---|
| Se pierden registros en WhatsApp | No hay una fuente de verdad única; el registro vive en un chat que se satura y se desordena |
| No se sabe qué rentas siguen activas | No existe un estado explícito (activa/devuelta) consultable |
| No se sabe quién tiene un equipo | La información está en fotos sueltas, no indexada |
| Se tarda en localizar una renta | Buscar = revisar fotos manualmente, una por una |
| Se re-escribe información ya existente | No hay registro de clientes reutilizable |
| Rentas duran meses sin detectarse | No hay ninguna vista que agrupe "lo que sigue afuera" |
| Caso real: 6 meses sin cobrar correctamente | Consecuencia directa de todo lo anterior — pérdida estimada de varios miles de pesos |

El problema no es de volumen de equipos ni de complejidad operativa. Es un problema de **visibilidad y trazabilidad** sobre un proceso que ya funciona a nivel humano pero no está registrado de forma consultable.

---

## 3. Objetivos

**Principal** — Al abrir la app, cualquier usuario debe poder ver en segundos:
- Rentas activas, con cliente y fecha de inicio.
- Buscar una renta por folio, nombre o teléfono.
- Registrar una renta nueva.
- Registrar un pago.
- Registrar una devolución.

**Secundario** — Eliminar la dependencia de:
- Fotografiar cada nota.
- Usar WhatsApp como sistema de registro.
- Buscar fotos manualmente.
- Volver a escribir datos de un cliente que ya existe.

---

## 4. No objetivos

Explícitamente fuera de alcance (ver también sección 34):

POS, inventario, control de equipos individuales/modelos, ubicación física de equipos, mantenimiento, QR, chatbot, IA, automatización de WhatsApp, notificaciones push, estadísticas/gráficas avanzadas, calendario complejo, facturación fiscal, múltiples sucursales, proveedores, compras, portal de cliente, roles complejos, microservicios, apps nativas (React Native/iOS/Android nativo), realtime.

**Principio rector:** *"¿Qué problema frecuente y observable del negocio resuelve esto?"* Si una funcionalidad no tiene respuesta clara a esa pregunta, no entra al MVP.

---

## 5. Usuarios

Usuarios internos únicamente, autenticados contra la colección `users` de PocketBase (login por selección de usuario + contraseña, ver sección 14). Sin autorregistro público.

| Usuario | Contexto de uso típico |
|---|---|
| Dueño | Revisión general, alta de rentas, supervisión de rentas antiguas |
| Abuela (tienda) | Atención en mostrador: nueva renta, cobro, devolución, búsqueda |
| Padre (repartidor, Android) | Registro de renta/devolución fuera de la tienda, desde el celular |
| Tío (ocasional, iPhone) | Mismo flujo que abuela/padre, sin impresión Bluetooth disponible (ver sección 23.2) |
| Tía / primo (ocasional) | Mismo flujo, uso esporádico |
| Administrador técnico | Soporte, alta de usuarios, configuración de los celulares/impresoras, mantenimiento de la app y de PocketBase |

MVP: **un solo rol operativo** — todo usuario autenticado puede consultar y operar todas las rentas. No hay permisos diferenciados por persona (ver sección 14 y riesgo en sección 32).

---

## 6. Casos de uso

1. Iniciar sesión (selección de usuario + contraseña).
2. Ver dashboard con rentas activas y rentas que requieren revisión.
3. Buscar una renta (folio / nombre / teléfono).
4. Registrar una renta nueva (cliente nuevo o existente).
5. Registrar un pago sobre una renta activa.
6. Devolver una renta (cierre).
7. Consultar la ficha de un cliente, incluyendo su credencial.
8. Generar y compartir/imprimir un comprobante.

Cada uno tiene criterios de aceptación Gherkin en la sección 31.

---

## 7. Flujos de negocio

### 7.1 Flujo: Nueva renta

```
Nueva renta (pantalla única, con secciones)
  → Buscar/crear cliente
      → (si es nuevo) nombre, teléfono, foto de credencial
  → Seleccionar productos (concentrador / tanque) + cantidades
  → Capturar renta inicial y depósito
  → (opcional) agregar "Otros" (concepto libre + precio, solo para el comprobante)
  → Confirmar
      → Crear rental (folio consecutivo generado server-side, ver 11.1)
      → Registrar pago inicial (si aplica)
      → Registrar depósito
  → Modal de comprobante
  → Compartir / imprimir (opcional, no bloqueante)
  → Renta queda ACTIVE
```

### 7.2 Flujo: Registrar pago

```
Abrir renta activa (vía búsqueda o dashboard)
  → Ver "Último pago: $X" (referencia informativa)
  → Modal "Registrar pago" → monto sugerido = último pago (editable)
  → Confirmar → payment creado, created_by = usuario actual (server-side, ver 19)
  → (opcional) comprobante de pago
```

### 7.3 Flujo: Devolución

```
Abrir renta activa
  → Modal "Devolver"
  → Mostrar: cliente, productos, fecha de inicio, tiempo transcurrido,
             monto sugerido, depósito, depósito a devolver
  → Usuario captura monto realmente cobrado y depósito devuelto (ambos editables)
  → Confirmar
      → Llama al endpoint server-side de devolución (ver 19.1):
        status = RETURNED, returned_at = ahora, returned_by = usuario actual
      → (opcional) registrar pago final si hay saldo cobrado en ese momento
  → Modal de recibo de devolución
  → Renta permanece en historial permanentemente
```

### 7.4 Flujo: Búsqueda

```
Pestaña "Buscar" (una de las 3 pestañas fijas de navegación, ver sección 16.5)
  → un único campo de búsqueda
  → coincide contra: folio (exacto/parcial), nombre de cliente (contiene), teléfono (contiene)
  → resultados: lista simple debajo del campo
  → tap → abre Detalle de renta como vista contextual (Sheet)
```

---

## 8. Arquitectura

Arquitectura simple de dos piezas, sin backend custom construido a mano:

```
┌─────────────────────────────────────────────┐
│  PWA (React + TS, Vite)                      │
│  - UI (screens, components)                  │
│  - domain/ (reglas de negocio puras)         │
│  - data/ (PocketBase SDK, queries)           │
│  - printing/ (ReceiptPrinter abstraction)    │
└───────────────┬───────────────────────────────┘
                │ HTTPS (PocketBase JS SDK)
┌───────────────▼───────────────────────────────┐
│  PocketBase (proceso único)                   │
│  - Auth (colección users)                     │
│  - SQLite embebido (customers, rentals, ...)  │
│  - Files (credencial protegida)               │
│  - API Rules (autorización por colección)     │
│  - pb_hooks/ (folio, devolución, validación   │
│    server-side — ver secciones 11.1, 19.1)    │
└─────────────────────────────────────────────┘
                │
   VPS existente (nginx-proxy-manager, HTTPS)
   sirve el build estático de la PWA y
   hace reverse proxy al proceso de PocketBase
```

Sigue sin haber backend intermedio escrito a mano (Node/Express, etc.): el frontend habla directo con PocketBase, protegido por API Rules — el mismo principio que ya tenía este SDD con Supabase+RLS, solo que la pieza de backend ahora es PocketBase en vez de Supabase, y corre como un único proceso liviano en vez de un stack de contenedores. La única lógica que vive fuera del cliente son los `pb_hooks/` puntuales descritos en las secciones 11.1 y 19.1 — necesarios porque ciertas garantías (folio único, quién puede cerrar una renta) no pueden depender de lo que el navegador decida mandar.

---

## 9. Stack tecnológico y justificación

| Capa | Tecnología | Por qué |
|---|---|---|
| UI | React + TypeScript + Vite | Estándar, rápido de iterar, buen soporte PWA vía plugin |
| Ruteo | React Router | Navegación simple entre pantallas, sin necesidad de framework full-stack |
| Estilos | Tailwind + shadcn/ui | Componentes accesibles y táctiles listos, sin diseñar UI kit desde cero |
| Iconos | Lucide React | Ligero, consistente con shadcn |
| Formularios | React Hook Form + Zod | Validación tipada en cliente (los hooks de PocketBase validan lo mismo server-side, ver sección 20) |
| Server state | **No se usa TanStack Query en MVP** | Dominio pequeño (5 colecciones, pocas pantallas): pedir datos directo al SDK de PocketBase es más simple. Se reevalúa solo si aparece un problema real de fetching duplicado |
| PWA | vite-plugin-pwa | Instalabilidad + funcionamiento offline básico (shell), sin reinventar service worker |
| Backend | **PocketBase** (Auth + SQLite + Files + API Rules) | Un solo binario/proceso, sin stack de contenedores; evita mantener backend propio construido a mano; validado con un POC técnico contra la infraestructura real del negocio |
| Hosting | VPS existente (ya corre `nginx-proxy-manager` y otros servicios self-hosted) | No se agrega infraestructura nueva de fondo, solo un proceso más, mucho más liviano que un stack Supabase completo |

**Decisión explícita (sin cambios respecto a v1.2):** no se usa un backend custom (Node/Express, etc.). Toda la lógica de negocio que no puede vivir en API Rules/validación de esquema de PocketBase vive en `pb_hooks/` (puntual, ver secciones 11.1 y 19.1) o en el cliente. Esto sigue siendo proporcional al tamaño del problema.

---

## 10. Estructura del proyecto

```
o2-insumos-pwa/
├── src/
│   ├── app/                  # Rutas, layout raíz, providers
│   ├── screens/               # las 3 rutas reales, ver sección 16.5
│   │   ├── login/
│   │   ├── dashboard/
│   │   ├── rental-new/       # pantalla única con secciones
│   │   └── search/
│   ├── components/
│   │   ├── ui/                # shadcn-based (Card, Button, Dialog, Sheet, etc.)
│   │   ├── sheets/            # vistas contextuales, ver sección 16.6
│   │   │   ├── RentalDetailSheet.tsx
│   │   │   └── CustomerDetailSheet.tsx
│   │   └── modals/
│   │       ├── PaymentDialog.tsx
│   │       ├── ReturnDialog.tsx
│   │       └── ReceiptDialog.tsx
│   ├── domain/
│   │   ├── rentals/          # reglas: sugerencia de pago, estados
│   │   ├── payments/
│   │   └── customers/
│   ├── data/
│   │   ├── pocketbaseClient.ts
│   │   ├── rentals.repo.ts
│   │   ├── payments.repo.ts
│   │   └── customers.repo.ts
│   ├── printing/
│   │   ├── ReceiptPrinter.ts        # interfaz
│   │   ├── ShareFallbackPrinter.ts  # implementación por navegador
│   │   ├── WebBluetoothPrinter.ts   # adaptador confirmado (ver sección 23)
│   │   ├── escpos.ts                # builder ESC/POS + chunking + codepage
│   │   └── imageEscpos.ts           # logo vía GS v 0 + dithering + auto-recorte
│   ├── lib/                  # utils, zod schemas
│   └── main.tsx
├── pb_migrations/             # esquema de colecciones versionado (folio, esquema de rentals, etc.)
├── pb_hooks/                  # lógica server-side puntual
│   ├── rentals_folio.pb.js    # genera folio consecutivo al crear (ver 11.1)
│   ├── rentals_return.pb.js   # endpoint de devolución (ver 19.1)
│   └── payments_validate.pb.js # note obligatoria si payment_type = adjustment (ver 20)
├── public/
└── vite.config.ts
```

---

## 11. Modelo de datos

PocketBase da automáticamente a **toda** colección un `id` (string, generado por PocketBase) y los campos de sistema `created` / `updated` (timestamps automáticos). Por eso el modelo ya no declara `created_at`/`updated_at` a mano — se usan los de sistema. Además, `started_at` de una renta se simplificó para reusar directamente el `created` del registro: una renta empieza exactamente cuando se registra, así que mantener un campo aparte hubiera sido un duplicado sin propósito.

```
customers (colección)
  name                text, requerido
  phone               text, requerido
  credential_photo    file, requerido al crear, PROTEGIDO (ver sección 15)
  # created / updated: automáticos

rentals (colección)
  folio                 text, único — formato "R-000001", generado server-side (ver 11.1)
  customer_id           relation → customers, requerido
  status                select: ACTIVE | RETURNED, default ACTIVE — solo modificable server-side (ver 19.1)
  returned_at           date, nullable — solo modificable server-side (ver 19.1)
  initial_rent_amount   number, requerido, ≥ 0
  deposit_amount        number, default 0, ≥ 0
  deposit_returned_amount number, nullable — se llena al devolver
  extras                json, default [] — "Otros", ver 11.2
  created_by            relation → users — llenado server-side, nunca por el cliente
  updated_by            relation → users — llenado server-side
  returned_by           relation → users, nullable — llenado server-side (ver 19.1)
  # created: es el "started_at" de la renta (ver arriba). updated: automático.

rental_items (colección)
  rental_id     relation → rentals, requerido, cascade delete
  item_type     select: concentrator | tank, requerido
  quantity      number, default 1, ≥ 1

payments (colección)
  rental_id     relation → rentals, requerido, cascade delete
  amount        number, requerido — negativo solo si payment_type = adjustment
  payment_type  select: rent | deposit | adjustment, requerido
  note          text, nullable — requerido si payment_type = adjustment (validado en hook, ver 20)
  created_by    relation → users — llenado server-side
  # created: es el "paid_at" del pago, mismo razonamiento que started_at en rentals.

users (colección de auth nativa de PocketBase)
  name          text — nombre mostrado en el selector de login (ver sección 14)
  phone         text — usado como username de PocketBase, ver sección 14
  # email, password, tokens, etc.: manejados nativamente por PocketBase
```

**Aclaración importante (sin cambios respecto a v1.2):** `initial_rent_amount` y `deposit_amount` son dos campos distintos dentro del **mismo registro** de `rentals` — no se combinan en uno solo, y **no se repiten por producto rentado**. Una renta con 2 concentradores y 1 tanque (dos registros en `rental_items`) sigue teniendo un solo monto de renta y un solo depósito para toda la renta.

### 11.1 Folio consecutivo — generación server-side

El folio (`R-000001`, `R-000002`, ...) se genera en un **hook `onRecordBeforeCreateRequest` de la colección `rentals`** (`pb_hooks/rentals_folio.pb.js`), nunca en el cliente:

1. Al llegar una solicitud de creación de renta, el hook ignora cualquier `folio` que el cliente haya mandado (la API Rule de `create` además bloquea explícitamente `@request.data.folio:isset = false`, para que ni siquiera sea posible enviarlo).
2. Dentro de la misma transacción de escritura, el hook calcula `MAX(folio numérico) + 1` y arma el string con padding a 6 dígitos (`R-000042`).
3. La colección tiene un **índice único** sobre `folio` como red de seguridad: si por cualquier motivo dos creaciones llegaran a colisionar, la segunda falla con un error claro en vez de guardar un folio duplicado silenciosamente.

**Por qué este patrón es seguro en PocketBase/SQLite y no hacía falta una secuencia como en Postgres:** SQLite (el motor embebido de PocketBase) serializa las transacciones de escritura — solo una escritura se compromete a la vez, incluso en modo WAL. Un patrón "leer el máximo e insertar" dentro de la misma transacción de escritura, que en Postgres sí necesitaba una secuencia dedicada para evitar condiciones de carrera (dos transacciones concurrentes podían leer el mismo máximo antes de que cualquiera confirmara), en SQLite queda protegido por el propio motor. **Esto debe confirmarse durante la implementación** contra la versión de PocketBase instalada y el resultado real del POC — el índice único sobre `folio` queda como red de seguridad de todos modos, sin importar el resultado de esa verificación.

### 11.2 `payment_type` y `extras`

`payment_type` tiene tres valores: `rent` (pago de renta periódico), `deposit` (depósito) y `adjustment` (corrección de un pago capturado con monto erróneo, ver Anexo A.4). El depósito se guarda como un `payment` con `payment_type = 'deposit'` además de reflejarse en `rentals.deposit_amount`, para mantener trazabilidad de *cuándo* se cobró, no solo *cuánto*. No existe un valor `other`: los conceptos de "Otros" nunca se registran como pago real, solo como parte de `rentals.extras` — el negocio nunca pidió cobrarlos como pago aparte.

Un `adjustment` nunca reemplaza ni edita el pago original — se agrega como un registro nuevo, con `amount` positivo (si se cobró de menos) o negativo (si se cobró de más) y `note` obligatoria explicando el porqué. El pago original queda intacto en el historial; el monto real cobrado es la suma de todos los pagos de esa renta, incluidos los ajustes.

`extras` es un campo `json` dentro del propio registro de la renta, ej.:

```json
[{ "description": "2 cubrebocas KF94", "price": 50 }]
```

Se guarda como campo, no como colección aparte, porque ese dato nunca se consulta de forma independiente ni se relaciona con nada más — se lee una sola vez, al generar el comprobante.

### 11.3 "Otros" — por qué no es inventario

`rentals.extras` existe únicamente para que el concepto aparezca impreso en el comprobante. No tiene `sku`, no descuenta stock, no es referenciable después de creada la renta. Es, deliberadamente, texto + precio, nada más.

---

## 12. Relaciones

```
customers 1───* rentals            (rentals.customer_id, relation)
rentals   1───* rental_items       (rental_items.rental_id, relation, cascade delete)
rentals   1───* payments           (payments.rental_id, relation, cascade delete)
users     ──< created_by / updated_by / returned_by en rentals,
               created_by en payments >   (todos relation → users)
```

`rentals.extras` no es una relación — vive como campo `json` dentro del propio registro de `rentals` (sección 11.2). No hay relación con colecciones de inventario/equipos porque no existen (por diseño). No existe colección de auditoría separada (ver sección 26).

---

## 13. API Rules (equivalente a RLS en PocketBase)

Regla general: **acceso solo para usuarios autenticados del negocio; sin acceso anónimo; sin roles diferenciados.** PocketBase evalúa una regla de filtro por operación (`List/Search`, `View`, `Create`, `Update`, `Delete`) y por colección — conceptualmente igual a las políticas RLS de v1.2, con sintaxis propia de PocketBase.

```
# Patrón único para customers, rentals, rental_items, payments:

List/Search:  @request.auth.id != ""
View:         @request.auth.id != ""
Create:       @request.auth.id != ""
Update:       @request.auth.id != ""
Delete:       (regla vacía) — nadie puede borrar vía API pública,
              solo el administrador técnico desde el panel admin de PocketBase.
              Equivalente a "no hay policy de delete" en v1.2.
```

**Reglas adicionales específicas de `rentals`** (implementan el requisito de que `status`/`returned_at`/`returned_by`/`folio` nunca se confíen del cliente — ver secciones 11.1 y 19.1):

```
Create:  @request.auth.id != "" &&
         @request.data.folio:isset = false &&
         @request.data.status:isset = false &&
         @request.data.returned_at:isset = false &&
         @request.data.returned_by:isset = false &&
         @request.data.created_by:isset = false &&
         @request.data.updated_by:isset = false

Update:  @request.auth.id != "" &&
         @request.data.status:isset = false &&
         @request.data.returned_at:isset = false &&
         @request.data.returned_by:isset = false &&
         @request.data.folio:isset = false
```

El modificador `:isset` en las reglas de PocketBase permite rechazar una solicitud que incluya ese campo en el body, sin importar el valor — así, esos campos **solo** pueden cambiar a través de los hooks server-side (`pb_hooks/rentals_folio.pb.js`, `pb_hooks/rentals_return.pb.js`), que escriben con acceso interno y no pasan por esta regla. **Confirmar sintaxis exacta de `:isset` contra la versión de PocketBase usada en el POC antes de implementar.**

`created_by`/`updated_by` en `rentals` y `created_by` en `payments` también se bloquean en el body por el mismo motivo (sección 26) — los llena el hook con `@request.auth.id`, nunca el cliente.

---

## 14. Autenticación

- **Colección `users` nativa de PocketBase** (auth collection), sin autenticación propia construida a mano.
- Login: **selección de usuario + contraseña** (decidido en Anexo A.1, sin cambios de UX). Como son solo 6 usuarios fijos, conocidos y gestionados manualmente por el administrador técnico, la pantalla de login no pide escribir el teléfono — muestra una lista con los 6 nombres (dueño, abuela, padre, tío, tía, primo), el usuario toca el suyo e ingresa su contraseña.
- **Simplificación habilitada por PocketBase (no es una decisión de negocio nueva, es un detalle de implementación):** a diferencia de Supabase Auth, PocketBase permite autenticar directamente contra un campo `username` — así que el `phone` del usuario se usa tal cual como identidad de login (`pb.collection('users').authWithPassword(phone, password)`), sin necesidad del workaround de "email interno sintético" que sí hacía falta con Supabase. La UI no cambia: sigue siendo un selector de nombres, nunca se teclea el teléfono.
- El mapeo nombre → registro de usuario vive en la propia colección `users` (campo `name`), consultado para armar el selector — no hace falta una constante hardcodeada aparte como en v1.2, la fuente de verdad es PocketBase mismo.
- Alta de usuarios: **manual, por el administrador técnico**, desde el panel admin de PocketBase (superusuario). No hay pantalla de auto-registro en la PWA.
- Sesión persistente (PWA instalada, no se pide login constantemente) vía el `authStore` del SDK de PocketBase; logout manual disponible.
- Todo usuario autenticado tiene los mismos permisos operativos (sección 5).

---

## 15. Manejo de credenciales (foto de identificación del cliente)

- El campo `customers.credential_photo` es de tipo `file`, marcado como **protegido** en el esquema de la colección.
- Un archivo protegido en PocketBase **no** es accesible solo por estar autenticado y tener permiso de `View` sobre el registro — además requiere un **file token** de corta duración:
  1. El cliente (ya autenticado) pide un token vía `pb.files.getToken()`.
  2. Ese token se agrega como query param a la URL del archivo: `/api/files/customers/{id}/{filename}?token=...`.
  3. Sin un token válido y vigente, esa URL devuelve 403 aunque el usuario esté autenticado y tenga permiso sobre el registro del cliente.
- Mismo principio que el signed URL de Supabase Storage en v1.2 (acceso bajo demanda, de corta duración, nunca una URL permanente) — cambia el mecanismo, no el comportamiento para el usuario. **Confirmar la duración exacta del token contra la configuración de la instancia de PocketBase** (es configurable server-side; no asumir un número fijo sin verificarlo).
- **No aparece en listados** (dashboard, búsqueda, ticket) — solo se pide el token y se arma la URL cuando el usuario entra explícitamente a la ficha del cliente.
- Propósito documentado: identificación del cliente en caso de no devolución del equipo.

**Decidido (sin cambios respecto a v1.2):**
- **Retención:** se conserva mientras el cliente tenga historial de rentas (sin borrado automático por tiempo). Se revisa esta política más adelante si el volumen de datos lo justifica.
- **Quién puede verla:** cualquier usuario autenticado, mismo modelo que el resto de la app — no se agrega un rol especial solo para esto en el MVP.

---

## 16. Diseño de interfaz (UX/UI)

### 16.1 Principio central

La app debe sentirse como **"una libreta de control de rentas convertida en herramienta digital simple"**. No debe sentirse como ERP, POS, CRM, sistema hospitalario, dashboard empresarial ni producto SaaS complejo. Cada pantalla se diseña primero preguntando "¿esto ayuda a responder qué está rentado, a quién y desde cuándo?" — no "¿esto se ve profesional?".

### 16.2 Usuaria principal

La usuaria crítica es una persona mayor que hoy trabaja con papel y WhatsApp, no con software. Consecuencias directas para el diseño: texto claramente legible, botones grandes, zonas táctiles generosas, jerarquía visual obvia, pocos elementos simultáneos por pantalla, lenguaje cotidiano (ver 16.14), evitar iconos ambiguos sin texto, evitar menús escondidos para acciones importantes ("Registrar pago"/"Devolver" nunca van dentro de un `DropdownMenu`), evitar formularios largos, evitar animaciones decorativas, evitar mostrar información que no ayude a decidir algo. No asumir que conoce conceptos técnicos.

### 16.3 Regla de los 10 segundos

Al abrir el Dashboard, la usuaria debe poder responder en ~10 segundos: ¿qué tengo rentado?, ¿a quién?, ¿desde cuándo?, ¿hay alguna renta que debería revisar? Si responder eso requiere navegar varias pantallas, el diseño está fallando — este es el criterio con el que se evalúa cualquier cambio al Dashboard.

### 16.4 Jerarquía visual y color

Las rentas activas son el elemento principal del Dashboard. Las rentas antiguas (sección "requiere revisión", Anexo A.3) destacan visualmente pero sin volver la interfaz alarmista — nunca solo un punto rojo. El estado se comunica primero con **texto**, el color es refuerzo, no la única señal:

```
Preferido:   "42 días activa" · "Último pago: $2,800" · "Revisar renta"
Evitar:      🔴  (sin texto que lo explique)
```

Paleta sobria y profesional, pocos colores, sin estética "médica" excesiva. Contraste suficiente (ver 16.12); ninguna información depende únicamente del color.

### 16.5 Navegación (chrome principal)

Navegación fija y mínima, **3 destinos**: **Dashboard / Nueva renta / Buscar**. Esto revisa la decisión de v1.1 de meter la búsqueda inline en el Dashboard (ver nota de cambios de v1.4 al inicio del documento) — con solo 3 pestañas totales, tener "Buscar" como su propio destino sigue siendo "navegación extremadamente pequeña", y es más fácil de descubrir para una usuaria no técnica que un campo que hay que notar.

**Detalle de renta** y **Ficha de cliente** no son rutas nuevas — se abren como vista contextual (`Sheet` de shadcn) encima de donde estaba el usuario, sin navegar a otro lugar. Ver flujo completo en sección 18.

### 16.6 Pantallas y vistas contextuales

Pantallas reales (con su propia ruta, alcanzables desde las 3 pestañas):

1. **Login** — selección de usuario (lista de 6 nombres) + contraseña.
2. **Dashboard** — botón "Nueva renta", contador de rentas activas, lista de rentas activas, sección "requiere revisión" (Anexo A.3). Sin buscador propio (vive en la pestaña Buscar).
3. **Nueva renta** — pantalla única con secciones (ver 16.7), no wizard.
4. **Buscar** — un campo de búsqueda + lista de resultados, nada más.

Vistas contextuales (`Sheet`, se abren encima de la pantalla actual, no son rutas):

- **Detalle de renta** — abierta desde Dashboard o Buscar (ver 16.10).
- **Ficha de cliente** — abierta desde Detalle de renta o desde el buscador de cliente en Nueva renta.

Modales (`Dialog`, acciones puntuales sobre una vista contextual o pantalla):

- **Registrar pago** — sobre Detalle de renta.
- **Devolver** — sobre Detalle de renta.
- **Comprobante** — sobre Nueva renta (al confirmar) y sobre el modal de Devolver (al confirmar).

### 16.7 Nueva renta — prioridad de campos

Pantalla única, en este orden, sin wizard multi-página: **Cliente → Qué se renta → Cantidad → Renta → Depósito → Otros → Confirmar.**

### 16.8 Devolución

Acción evidente desde Detalle de renta (botón grande, no escondida). Requiere confirmación antes de cerrar la renta. Después de confirmar: mostrar claramente que la renta terminó, mostrar el pago/liquidación si corresponde, y permitir imprimir el comprobante — sin bloquear si la impresión falla (sección 21).

### 16.9 Búsqueda

Rápida, sobre folio, nombre o teléfono — sin obligar a la usuaria a recordar exactamente cómo se registró el cliente (ver sección 7.4 y CU3).

### 16.10 Detalle de renta — prioridad de información

Debe leerse como un comprobante/control de renta, no como una ficha técnica. Orden de aparición: **folio, cliente, teléfono, qué tiene rentado, renta, depósito, fecha de inicio, último pago, total pagado, estado.** Las acciones "Registrar pago" y "Devolver" siempre visibles, nunca dentro de un menú.

### 16.11 Ticket físico

Conserva la simplicidad del papel actual — no meter todo lo que hay en la base de datos. Contenido exacto ya definido en sección 22: negocio, teléfono, folio, fecha, productos, renta, depósito, total, información de contacto. Nada más.

### 16.12 Accesibilidad

WCAG en lo razonable: contraste suficiente, tamaño de texto legible, áreas táctiles ≥44×44px (ver 16.13/sección 17), estados visibles (no solo hover), mensajes de error claros en español cotidiano, información nunca solo por color, focus states visibles para navegación por teclado/lector de pantalla.

### 16.13 Estados de interfaz a diseñar explícitamente

No basta con el happy path. Cada pantalla/vista relevante necesita su versión de: **loading, vacío, error, éxito, sin resultados, renta antigua, credencial pendiente, impresora no conectada, impresión exitosa, impresión fallida.** Los últimos cuatro ya tienen su comportamiento de negocio definido en las secciones 15 (credencial pendiente, Anexo A.5), 21 (errores) y 23 (impresión) — esta lista es el checklist de que cada uno tiene también su representación visual antes de dar una pantalla por terminada.

### 16.14 Microcopy

Español natural y cotidiano, nunca lenguaje técnico. "Registrar pago" (no "Crear transacción"), "Devolver renta" (no "Finalizar contrato"), "Renta" (no "Rental transaction").

### 16.15 Principio contra sobreingeniería visual

No agregar gráficas, métricas, estadísticas, widgets, badges innecesarios, filtros complejos, dashboards analíticos, animaciones ni configuraciones porque "se ven bien" — solo si el SDD o una necesidad real del negocio lo justifica (mismo principio rector de la sección 4, aplicado a UI). Si una interfaz puede simplificarse sin perder información necesaria, se prefiere la versión simple.

### 16.16 Criterio de éxito

El diseño no se mide por cuántos componentes usa. Se mide por: **¿la abuela puede abrir la app y saber qué rentas siguen pendientes, sin haber recibido capacitación formal?** Si la respuesta es sí, el diseño cumple su objetivo.

---

## 17. Componentes UI

Base: shadcn/ui + Tailwind, sin agregar una librería de componentes adicional salvo necesidad real. Todo táctil (mínimo 44×44px de área de toque). Primitivas de shadcn priorizadas: `Card`, `Button`, `Input`, `Select`, `Dialog`, `Sheet`, `Badge`, `Table`, `Alert`, `DropdownMenu`, `Toast`/`Sonner` — se prefiere componer estas antes que construir algo visualmente complejo desde cero.

**Reglas de uso (derivadas de la sección 16):**
- `DropdownMenu` solo para acciones secundarias/poco frecuentes — nunca para "Registrar pago" o "Devolver", que deben ser botones siempre visibles.
- `Table` solo donde realmente ayude (ej. historial de pagos dentro de Detalle de renta); la lista de rentas del Dashboard usa `Card`, no tabla, por legibilidad en móvil.
- `Toast`/`Sonner` para confirmaciones breves (pago registrado, comprobante compartido); nunca para errores que requieran que la usuaria decida algo (esos van en `Alert` o en el propio modal).

Componentes propios de la app, todos construidos sobre las primitivas de arriba:

- `SearchBar` (pantalla Buscar, sección 16.9)
- `RentalCard` (folio, cliente, estado, tiempo transcurrido)
- `RentalStatusBadge` (ACTIVE / RETURNED — siempre acompañado de texto, sección 16.4)
- `RentalDetailSheet` (`Sheet`, sección 16.10)
- `CustomerDetailSheet` (`Sheet`, ficha de cliente)
- `CustomerPicker` (buscar existente / crear nuevo)
- `CustomerForm` (nombre, teléfono, captura de foto)
- `ItemQuantityPicker` (concentrador/tanque + cantidad)
- `PaymentSuggestionField` (muestra "Último pago: $X", input editable prellenado)
- `ExtrasList` (descripción + precio, agregar/quitar filas)
- `PaymentDialog`, `ReturnDialog`, `ReceiptDialog` (modales sobre `Dialog`/`AlertDialog`)
- `PrintShareBar` (imprimir / compartir, desacoplado, nunca bloqueante)

---

## 18. Flujos de navegación

```
Login → Dashboard (pestaña 1 de 3)

Dashboard → tap rental card → Sheet Detalle de renta → cerrar → Dashboard
Buscar (pestaña 3 de 3) → tap resultado → Sheet Detalle de renta → cerrar → Buscar

Dashboard/Buscar → pestaña "Nueva renta" → confirmar → modal Comprobante → cerrar → Dashboard

Sheet Detalle de renta → modal Registrar pago → cerrar → Sheet Detalle de renta
Sheet Detalle de renta → modal Devolver → confirmar → modal Comprobante de devolución → cerrar → Dashboard
Sheet Detalle de renta → Sheet Ficha de cliente
```

Solo 3 rutas reales (Dashboard, Nueva renta, Buscar), navegables desde la barra de pestañas fija (sección 16.5). Todo lo demás (Detalle de renta, Ficha de cliente, Registrar pago, Devolver, Comprobante) es una vista contextual (`Sheet`) o un modal (`Dialog`) sobre una de esas 3 rutas — nunca una ruta nueva, siguiendo el principio de la sección 16.6 de no crear pantallas solo porque es técnicamente posible.

---

## 19. Estados

**Renta (`rentals.status`):**

```
        crear renta
            │
            ▼
        ┌────────┐   devolver   ┌───────────┐
        │ ACTIVE │ ───────────▶ │ RETURNED  │
        └────────┘               └───────────┘
                                  (estado terminal, histórico permanente)
```

No hay estados de ubicación física, ni "vencida", ni "en reparación" — fuera de alcance (ver sección 34).

**Pago:** no tiene estado propio; es un registro inmutable (create-only, sin edición ni borrado desde la UI — corrección de errores documentada en Anexo A.4 como `payment_type = adjustment`).

### 19.1 `status`, `returned_at`, `returned_by` — resueltos server-side, no por el frontend

Ni la creación ni la devolución de una renta confían en que el cliente mande el valor correcto de estos campos — las API Rules de la sección 13 bloquean explícitamente que el body de una solicitud los incluya. En su lugar:

- **Al crear:** el hook `pb_hooks/rentals_folio.pb.js` (mismo hook que genera el folio, sección 11.1) fuerza `status = "ACTIVE"` sin importar lo que traiga la solicitud.
- **Al devolver:** se expone un **endpoint custom** (`pb_hooks/rentals_return.pb.js`, registrado como ruta propia, no como un PATCH genérico a la colección): `POST /api/rentals/{id}/return` con body `{ amount_collected, deposit_returned, note? }`. Ese endpoint, corriendo con acceso interno (no sujeto a las API Rules de arriba), hace en una sola operación:
  1. Verifica que la renta esté `ACTIVE` (si ya está `RETURNED`, rechaza).
  2. Setea `status = "RETURNED"`, `returned_at = ahora`, `returned_by = @request.auth.id`.
  3. Si corresponde, crea el `payment` final.
- El cliente (React) nunca hace `pb.collection('rentals').update(id, { status: 'RETURNED' })` directamente — siempre pasa por este endpoint. Esto es lo que reemplaza la garantía que antes daba RLS + una transacción explícita en Postgres.

---

## 20. Validaciones

Dos capas, igual que en v1.2 pero con la pieza de servidor reimplementada en PocketBase:

**Cliente (Zod, feedback inmediato):**

| Campo | Regla |
|---|---|
| `customer.name` | requerido, mínimo 2 caracteres |
| `customer.phone` | requerido, formato numérico, 10 dígitos (México) |
| `customer.credential_photo` | requerido solo al crear cliente nuevo; imagen, máx. tamaño razonable (ej. 8MB) |
| `rental.initial_rent_amount` | requerido, numérico, ≥ 0 |
| `rental.deposit_amount` | numérico, ≥ 0, default 0 |
| `rental_items` | al menos un producto seleccionado, `quantity` ≥ 1 |
| `payment.amount` | requerido, numérico, > 0 (negativo permitido solo si `payment_type = 'adjustment'`) |
| `payment.note` | requerido si `payment_type = 'adjustment'`; explica la corrección |
| cada elemento de `rental.extras[]` | `description` requerido, `price` numérico ≥ 0 |

**Servidor (última línea de defensa, nunca confiar solo en el cliente):** el esquema de cada colección de PocketBase ya obliga los tipos, `requerido` y valores de los campos `select`. Lo que el esquema de PocketBase **no** puede expresar por sí solo (reglas condicionales entre campos) se valida en `pb_hooks/`:

- `pb_hooks/payments_validate.pb.js`: rechaza la creación de un `payment` con `payment_type = 'adjustment'` si `note` viene vacío.
- Las reglas de la sección 13 (`:isset = false`) actúan como validación server-side de que ciertos campos no vengan del cliente en absoluto.

Ninguna validación impone reglas de negocio rígidas sobre precios (ej. no se valida que el pago sea igual al último pago) — el sistema **sugiere, no impone**, consistente con el requerimiento explícito del negocio.

---

## 21. Manejo de errores

Principio no negociable: **nunca perder una renta por falla de impresión, y nunca mostrar "guardado" si la base de datos falló.**

| Escenario | Comportamiento |
|---|---|
| Falla de red al guardar renta | Se muestra error explícito, no se marca como guardada, se permite reintentar sin perder lo capturado en el formulario |
| Renta guardada, impresión falla | Mensaje: *"La renta se guardó correctamente, pero no se pudo imprimir el comprobante."* + modal con opciones: reintentar / compartir |
| Falla al subir foto de credencial | Se permite continuar y crear la renta igual; el cliente queda marcado "credencial pendiente" (Anexo A.5) |
| Sesión expirada | Redirige a login; se pierde el formulario en curso (aceptado — no se implementa guardado de borrador en MVP) |
| Folio duplicado (carrera) | Prevenido por el hook server-side (sección 11.1); el índice único sobre `folio` actúa como red de seguridad si algo falla — el usuario ve un error claro y puede reintentar, nunca se guarda un folio repetido |
| Intento de setear `status`/`returned_at`/`folio` directamente desde el cliente | Rechazado por las API Rules (sección 13) antes de llegar a cualquier lógica de negocio |

**Decisión (sin cambios respecto a v1.1):** se descartó guardar un borrador del formulario en `localStorage` si la sesión expira a medio llenar — el caso de mayor fricción real (foto de credencial) no cabe ahí sin convertir a base64, costoso para un problema no reportado como frecuente.

---

## 22. Generación de comprobantes

Contenido (renta):
- Nombre del negocio + logo (si existe) + teléfono
- Folio, fecha
- Cliente (nombre, teléfono si el negocio lo desea)
- Productos rentados y cantidades
- Renta inicial, depósito, "Otros" (si aplica, desde `rentals.extras`), total
- Información de contacto del negocio para dudas

Contenido (devolución): folio, cliente, fecha de inicio y de devolución, tiempo rentado, monto cobrado, depósito devuelto.

Formato: HTML simple renderizado dentro de un **modal** (`ReceiptDialog`), no una pantalla/ruta separada, con opciones de compartir/imprimir. Diseño intencionalmente austero: es un comprobante de referencia, no una factura fiscal (fuera de alcance, sección 4).

---

## 23. Arquitectura de impresión

Sin cambios respecto a v1.2 — esta pieza es puramente frontend (Web Bluetooth API del navegador) y no depende del backend elegido.

**Regla de oro:** la renta se guarda primero, siempre. Imprimir es un paso posterior, best-effort, nunca bloqueante.

### 23.1 Hallazgos confirmados contra el hardware real

Validado en un prototipo descartable (repo `test-impresora`):

- La **WW-POS58U es BLE/GATT** — compatible con Web Bluetooth. Servicio `000018f0-0000-1000-8000-00805f9b34fb`, characteristic de escritura `00002af1-0000-1000-8000-00805f9b34fb`.
- Protocolo **ESC/POS estándar**: `ESC @` (init), texto, `ESC d n` (feed), `GS V 0` (corte).
- **Codepage `ESC t 16` (WPC1252)**, texto en **Latin-1** (no UTF-8) para que ñ/tildes impriman bien.
- **Imágenes** vía `GS v 0` + dithering Floyd-Steinberg; recortar márgenes blancos del logo antes de escalar (afecta tiempo de impresión).
- **Chunking obligatorio**: ~20 bytes por escritura, ~20ms de pausa entre cada una.
- Requiere HTTPS — ya cubierto.

### 23.2 Confirmado: iPhone no puede imprimir por Bluetooth, con ningún navegador

Apple obliga a todos los navegadores en iOS/iPadOS a usar el motor de Safari, que no implementa Web Bluetooth en ninguna plataforma de Apple. Para el tío (o cualquier usuario con iPhone), "Compartir" es el único camino — la UI no debe insinuar que puede conectar una impresora.

### 23.3 Decisión de UX confirmada con el negocio

- Un solo botón encadena buscar → conectar → imprimir. Si falla, cae al modal de comprobante con Compartir/Reintentar.
- Los 3 celulares del negocio son dedicados y fijos, configurados por el administrador técnico (incluyendo flags experimentales de Chrome para reconexión automática sin picker nativo cada vez).
- El permiso de Android "Dispositivos cercanos"/"Ubicación" se otorga una sola vez durante esa configuración inicial.

### 23.4 Interfaz e implementaciones

```ts
interface ReceiptPrinter {
  isAvailable(): Promise<boolean>;
  connect(): Promise<void>;
  print(receipt: ReceiptData): Promise<void>;
  disconnect(): Promise<void>;
}
```

1. **`ShareFallbackPrinter`** — comprobante como HTML/imagen vía `navigator.share`. Único camino para iPhone.
2. **`WebBluetoothPrinter`** — adaptador confirmado para la WW-POS58U, reutilizando `escpos.ts`/`imageEscpos.ts` del prototipo `test-impresora`.

### 23.5 Pendiente de validar (no resuelto todavía)

- Comportamiento de la impresora ocupada/con batería baja.
- Ancho máximo real del cabezal.

---

## 24. PWA

- `vite-plugin-pwa` con manifest instalable (nombre, ícono, `display: standalone`).
- Service worker con **cache de shell de la app** (assets estáticos).
- **No se implementa modo offline de datos** — crear/consultar rentas requiere red.
- Instalable en Android e iPhone (Add to Home Screen); funciona igual en desktop como fallback.

---

## 25. Seguridad

- Colección `users` de PocketBase + API Rules en todas las colecciones (sección 13).
- Campo de archivo protegido para credenciales (sección 15).
- Ninguna clave de superusuario/admin de PocketBase se expone en el frontend — el panel admin es una herramienta separada, nunca usada desde la PWA.
- Contraseñas gestionadas exclusivamente por PocketBase (hash nativo, nunca almacenadas por la app).
- Variables de entorno (`VITE_POCKETBASE_URL`) fuera de control de versiones donde aplique (URL no es secreta, pero se mantiene la práctica).
- HTTPS obligatorio (ya disponible en el VPS vía `nginx-proxy-manager`, y requerido también para Web Bluetooth — sección 23.1).
- Validación Zod en cliente + esquema de colección + hooks en servidor como defensa real (sección 20).
- Sin acceso anónimo a ninguna colección ni a los archivos de credenciales.
- **Rate limiting habilitado como requisito de producción:** PocketBase no trae rate limiting granular por endpoint incorporado — se configura en la capa de reverse proxy (`nginx-proxy-manager`, que ya corre en el VPS) con zonas `limit_req` sobre las rutas de autenticación y de la API en general, para mitigar fuerza bruta sobre el login y abuso de la API pública. Esto se documenta aquí como requisito explícito de producción, a configurar antes de exponer la app fuera de la red del negocio.

---

## 26. Auditoría

MVP: `created_by`, `updated_by` y `returned_by` (relation → `users`) en `rentals`, y `created_by` en `payments`. Con esos campos se cubre el 100% de lo pedido (quién creó una renta, quién la modificó, quién registró un pago, quién realizó una devolución) sin necesidad de una colección de auditoría genérica aparte.

A diferencia de v1.2 (donde estos campos los garantizaba RLS + `auth.uid()` de Postgres), ahora los llenan los hooks server-side (`pb_hooks/rentals_folio.pb.js` al crear, `pb_hooks/rentals_return.pb.js` al devolver) usando `@request.auth.id` — nunca se toman del body que manda el cliente (bloqueado explícitamente en las API Rules, sección 13). Se sigue descartando una colección de auditoría genérica tipo `audit_log`: nadie la iba a consultar desde la UI, y el mismo resultado se logra con estos campos.

---

## 27. Backups

Reemplaza por completo lo que en v1.2 era "confirmar plan de Supabase" (Anexo A.6) — ya no aplica, PocketBase corre en infraestructura propia.

- **Backup:** PocketBase incluye un mecanismo nativo de backup (zip de `pb_data/`, que contiene la base SQLite y los archivos subidos, incluida la credencial protegida) disparable por API/panel admin y programable.
- **Destino decidido: Backblaze B2.** Ya lo usan en otro proyecto del negocio (proceso probado, no es infraestructura nueva). PocketBase se configura para subir los backups automáticamente a ese bucket S3-compatible — guardar el backup en el mismo disco que falla si el VPS falla no protege de nada, y dado el antecedente real de pérdida económica del negocio por falta de control, esto no es opcional.
- **Frecuencia:** diaria como mínimo, dado que es el mismo negocio que ya perdió dinero por falta de visibilidad — no se recomienda depender de una frecuencia menor.
- **Restore / Disaster Recovery:**
  1. Detener el proceso de PocketBase.
  2. Restaurar el `pb_data/` completo (SQLite + archivos) desde el backup más reciente disponible fuera del VPS.
  3. Reiniciar PocketBase y verificar que el login y una consulta básica (ej. dashboard) funcionen antes de dar por cerrado el restore.
  4. **Hacer al menos un simulacro de restore antes de lanzar a producción** — un backup nunca probado no es un backup confiable, y es exactamente el tipo de "control que faltaba" que originó el caso real de pérdida de $5,000 del negocio.

---

## 28. Deployment

```
Dominio: insumoso2.com          → PWA (frontend estático)
Dominio: api.insumoso2.com      → PocketBase (propuesto, confirmar antes de aprovisionar)

Frontend: Build (Vite) → artefactos estáticos → VPS existente
Backend:  PocketBase (binario único / proceso systemd) → mismo VPS
Ambos detrás de nginx-proxy-manager (ya corre en el VPS), HTTPS
```

- El frontend se sirve como estático, igual que en v1.2.
- PocketBase corre como un proceso propio (systemd, o un contenedor liviano si se prefiere mantener el mismo patrón que los otros proyectos del VPS) — sin el stack multi-contenedor que sí requería Supabase self-hosted (Kong, Studio, Realtime, Edge Functions no existen en PocketBase; todo es un solo proceso).
- `nginx-proxy-manager`, que ya corre en el VPS para otros proyectos, hace de reverse proxy tanto para el frontend estático como para la API de PocketBase — no se agrega un segundo gateway.
- Deploy manual o script simple — CI/CD automatizado es opcional y no bloqueante para MVP.

**Acción de despliegue que requiere cuidado, no un simple "usar este dominio":** `insumoso2.com` tiene **otra aplicación corriendo hoy** y hay que reemplazarla. Antes de hacer el corte:
1. Confirmar qué es esa app y si hay algo que respaldar antes de quitarla (contenido, configuración, certificados).
2. Definir la ventana de corte (cuándo se apaga la app vieja y se prende la nueva, para minimizar tiempo sin servicio).
3. Cambiar la configuración de `nginx-proxy-manager` para apuntar el dominio a la nueva PWA, y crear el registro/entrada para `api.insumoso2.com` apuntando a PocketBase.
4. Verificar HTTPS (certificado) para ambos antes de considerar el corte terminado.

Esto se ejecuta manualmente y con el usuario presente — no es algo para automatizar a ciegas en una sesión.

---

## 29. Variables de entorno

```
VITE_POCKETBASE_URL=https://api.insumoso2.com   # subdominio propuesto, confirmar al aprovisionar
VITE_BUSINESS_NAME=Insumos O2
VITE_BUSINESS_PHONE=771 131 3535
VITE_BUSINESS_LOGO_URL=/logo.png                # archivo ya guardado en public/logo.png
VITE_STALE_RENTAL_DAYS=30        # umbral para "requiere revisión" en el dashboard, ver Anexo A.3
```

PocketBase no usa un concepto de "anon key" pública como Supabase — toda autorización pasa por las API Rules (sección 13) y el token de sesión del usuario autenticado. No hay clave de superusuario/admin en el frontend bajo ninguna circunstancia.

---

## 30. Testing

Proporcional al riesgo real, no exhaustivo:

- **Unit tests** sobre `domain/` puro: cálculo de sugerencia de pago, reglas de estado de renta.
- **Integration tests** ligeros contra una instancia local de PocketBase (misma que se usa en desarrollo), validando que las API Rules efectivamente bloquean acceso no autenticado y que los campos protegidos (`status`, `folio`, etc.) no se puedan setear desde el cliente.
- **Tests de los hooks** (`pb_hooks/`): folio consecutivo bajo creación concurrente (según lo que confirme la sección 11.1), endpoint de devolución, validación de `note` obligatoria en ajustes.
- **Manual/E2E crítico** (no automatizado en MVP): flujo completo nueva renta → pago → devolución, probado en Android real y iPhone real antes de lanzar.
- No se invierte en cobertura exhaustiva de UI en MVP.

---

## 31. Criterios de aceptación (Gherkin)

### CU1 — Iniciar sesión

```gherkin
Feature: Inicio de sesión

  Scenario: Login exitoso seleccionando el usuario y con contraseña válida
    Given la pantalla de login muestra los 6 usuarios del negocio
    When el usuario toca su nombre e ingresa su contraseña correcta
    Then accede al dashboard

  Scenario: Login con contraseña incorrecta
    Given el usuario selecciona su nombre en la lista
    When ingresa una contraseña incorrecta
    Then ve un mensaje de error claro
    And permanece en la pantalla de login
```

### CU2 — Ver dashboard

```gherkin
Feature: Dashboard

  Scenario: Ver rentas activas al abrir la app
    Given hay 5 rentas con status ACTIVE
    When el usuario abre el dashboard
    Then ve el número "5" como cantidad de rentas activas
    And ve una lista con esas 5 rentas, incluyendo cliente y fecha de inicio

  Scenario: Ver rentas que requieren revisión
    Given una renta ACTIVE creada hace más de 30 días
    When el usuario abre el dashboard
    Then esa renta aparece en la sección "requieren revisión"
```

### CU3 — Buscar una renta

```gherkin
Feature: Búsqueda global

  Scenario: Buscar por folio
    Given existe una renta con folio "R-000184"
    When el usuario abre la pestaña "Buscar" y escribe "184"
    Then ve esa renta en la lista de resultados

  Scenario: Buscar por nombre de cliente
    Given existe un cliente "Juan Pérez" con una renta activa
    When el usuario escribe "juan" en el buscador
    Then ve la renta de "Juan Pérez" en los resultados

  Scenario: Buscar por teléfono
    Given existe un cliente con teléfono "5511112222"
    When el usuario escribe "5511112222" en el buscador
    Then ve las rentas de ese cliente en los resultados

  Scenario: Búsqueda sin resultados
    Given no existe ninguna renta ni cliente que coincida con "xyz123"
    When el usuario busca "xyz123"
    Then ve un mensaje de "sin resultados"
```

### CU4 — Registrar una renta nueva

```gherkin
Feature: Nueva renta

  Scenario: Crear renta con cliente nuevo
    Given el usuario está en la pantalla "Nueva renta"
    And no encuentra al cliente en la búsqueda
    When captura nombre, teléfono y foto de credencial del cliente
    And selecciona 1 concentrador
    And captura renta inicial de $2800 y depósito de $1000
    And confirma
    Then se crea un customer nuevo
    And se crea una rental con status ACTIVE y folio consecutivo único generado server-side
    And se crea un rental_item de tipo concentrator con quantity 1
    And se crea un payment de tipo deposit por $1000
    And se abre el modal de comprobante, disponible para compartir o imprimir

  Scenario: Crear renta con cliente existente
    Given el usuario busca "Juan Pérez" y lo encuentra
    When lo selecciona y completa productos y montos en la misma pantalla
    And confirma
    Then se crea la rental asociada al customer_id existente
    And no se solicitan nuevamente nombre, teléfono ni foto de credencial

  Scenario: Agregar "Otros" sin crear inventario
    Given el usuario está en la pantalla de nueva renta
    When agrega "2 cubrebocas KF94" con precio $50
    And confirma la renta
    Then el concepto queda guardado en rental.extras
    And aparece en el comprobante
    And no se crea ningún registro de inventario o producto persistente

  Scenario: Falla de guardado no genera renta parcial
    Given el usuario confirma una nueva renta
    When la operación de base de datos falla por conexión
    Then no se muestra la renta como guardada
    And el usuario puede reintentar sin volver a capturar todo el formulario

  Scenario: El cliente no puede forzar su propio folio ni status
    Given el usuario confirma una nueva renta
    When el request incluye explícitamente folio="R-999999" y status="RETURNED"
    Then la API Rule de creación rechaza la solicitud
    And ninguna renta se crea con esos valores
```

### CU5 — Registrar un pago

```gherkin
Feature: Registrar pago

  Scenario: Sugerencia basada en el último pago
    Given una renta activa cuyo último pago registrado fue de $3000
    When el usuario abre el modal "Registrar pago"
    Then ve "Último pago: $3000" como referencia
    And el campo de monto viene prellenado con $3000

  Scenario: El usuario puede cobrar un monto distinto al sugerido
    Given el campo de monto sugerido muestra $3000
    When el usuario lo cambia a $3500 y confirma
    Then se registra un payment por $3500
    And el "Último pago" mostrado después es $3500

  Scenario: Registrar el primer pago sin historial previo
    Given una renta activa sin pagos registrados aún
    When el usuario abre el modal "Registrar pago"
    Then se usa initial_rent_amount como sugerencia (ver Anexo A.7)

  Scenario: Corregir un pago capturado con monto erróneo
    Given un pago de $3000 registrado por error (debía ser $2800)
    When el usuario registra un pago de ajuste por -$200 con nota "se cobró de más por error"
    Then se crea un nuevo payment con payment_type adjustment, amount -200 y la nota
    And el pago original de $3000 no se modifica ni se borra
    And el total cobrado real de la renta queda en $2800

  Scenario: Ajuste sin nota es rechazado
    Given el usuario intenta registrar un payment con payment_type adjustment
    When no incluye ninguna nota
    Then el hook de validación server-side rechaza la creación del pago
```

### CU6 — Devolver una renta

```gherkin
Feature: Devolución

  Scenario: Devolución con montos por defecto
    Given una renta activa con depósito de $1000
    When el usuario abre el modal "Devolver"
    Then ve cliente, productos, fecha de inicio, tiempo transcurrido y depósito
    And ve un monto sugerido y un depósito a devolver, ambos editables

  Scenario: Confirmar devolución cambia el estado vía el endpoint server-side
    Given el usuario está en el modal de devolución de una renta ACTIVE
    When ajusta el monto cobrado y el depósito devuelto, y confirma
    Then la app llama a POST /api/rentals/{id}/return
    And rental.status cambia a RETURNED
    And rental.returned_at y rental.returned_by se registran con la fecha/hora y usuario actual
    And se abre el modal de recibo de devolución
    And la renta permanece visible en el historial permanentemente

  Scenario: El monto sugerido no es obligatorio
    Given el monto sugerido para devolución es $3000
    When el usuario lo cambia a $5000 (acuerdo especial con el cliente)
    Then el sistema permite guardar $5000 sin bloquear ni pedir justificación

  Scenario: No se puede devolver dos veces la misma renta
    Given una renta ya está RETURNED
    When se intenta llamar de nuevo a POST /api/rentals/{id}/return
    Then el endpoint rechaza la solicitud
```

### CU7 — Consultar ficha de cliente y credencial

```gherkin
Feature: Ficha de cliente

  Scenario: Ver historial de rentas de un cliente
    Given un cliente con 3 rentas previas y 1 activa
    When el usuario abre su ficha
    Then ve las 4 rentas listadas con su estado

  Scenario: Ver la foto de credencial bajo demanda
    Given un usuario autenticado abre la ficha de un cliente
    When presiona "Ver credencial"
    Then la app pide un file token vía pb.files.getToken()
    And se arma la URL del archivo con ese token y se muestra la imagen
    And la foto no aparece en ningún listado general

  Scenario: Un usuario no autenticado no puede acceder a la credencial
    Given una solicitud sin sesión válida ni token de archivo
    When intenta acceder a la URL del archivo protegido
    Then PocketBase responde 403
```

### CU8 — Generar y compartir/imprimir comprobante

```gherkin
Feature: Comprobante

  Scenario: Imprimir con impresora Bluetooth ya emparejada (celular dedicado)
    Given la renta ya fue guardada exitosamente
    And el celular es uno de los 3 celulares dedicados y configurados por el administrador
    When el usuario presiona "Imprimir"
    Then la app reconecta automáticamente con la impresora sin mostrar el picker nativo
    And el comprobante se imprime vía el adaptador Bluetooth
    And no se afecta el registro ya guardado de la renta

  Scenario: Imprimir sin impresora disponible
    Given la renta ya fue guardada exitosamente
    And no hay impresora Bluetooth conectada ni disponible
    When el usuario presiona "Imprimir"
    Then el sistema ofrece el fallback de compartir/imprimir por navegador
    And la renta sigue mostrándose como guardada correctamente

  Scenario: Falla de impresión no afecta el registro de la renta
    Given la renta ya fue guardada exitosamente
    When la impresión falla por cualquier motivo
    Then se muestra "La renta se guardó correctamente, pero no se pudo imprimir el comprobante."
    And el usuario puede reintentar o compartir el comprobante

  Scenario: Usuario con iPhone no ve la opción de impresión Bluetooth
    Given el usuario abre la app desde un iPhone (ej. el tío)
    When llega al modal de comprobante
    Then solo ve la opción de compartir/imprimir por navegador
    And no se le ofrece ni se le sugiere conectar una impresora Bluetooth
```

---

## 32. Riesgos técnicos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Patrón de folio (MAX+1 en hook) depende de las garantías de escritura serializada de SQLite — sin confirmar contra la versión real de PocketBase | Folio duplicado en un caso extremo de concurrencia | Índice único sobre `folio` como red de seguridad (sección 11.1); confirmar en implementación |
| Sintaxis exacta de `:isset` y comportamiento de hooks server-side sin confirmar contra la versión de PocketBase del POC | Reglas de la sección 13 podrían no comportarse exactamente como se describe | Validar con tests de integración (sección 30) antes de dar por cerrada esta pieza |
| Toda la base vive en un único archivo SQLite | Corrupción de disco o falla del VPS = pérdida total si no hay backup vigente fuera del VPS | Backup diario fuera del VPS + simulacro de restore obligatorio antes de producción (sección 27) |
| Rate limiting no es nativo de PocketBase | Sin la configuración en `nginx-proxy-manager`, la API queda expuesta a fuerza bruta sobre login | Configurar `limit_req` antes de exponer la app fuera de la red del negocio (sección 25) |
| `insumoso2.com` tiene otra app corriendo hoy que hay que reemplazar | Corte mal planeado puede tumbar algo que seguía en uso, o dejar el dominio sin servicio | Plan de corte explícito antes de tocar `nginx-proxy-manager` (sección 28), ejecutado manualmente con el usuario presente |
| Impresora ocupada o con batería baja al momento de conectar — sin probar | Falla de impresión no reportada correctamente al usuario | Fallback de compartir siempre disponible; probar en Fase 5 |
| Reconexión automática depende de flags experimentales de Chrome | Un día podría dejar de reconectar solo y volver a requerir el picker nativo | El flujo de picker nativo se mantiene como respaldo en el código |
| iPhone/iPad no soporta Web Bluetooth en ningún navegador (limitación de plataforma confirmada) | El tío depende 100% del flujo de compartir | UI detecta iOS y no ofrece impresión Bluetooth (ver CU8) |
| API Rules mal configuradas permiten acceso cruzado o anónimo | Exposición de datos de clientes (incluida credencial) | Testing explícito de reglas antes de lanzar (sección 30) |
| PWA en Android/iOS con comportamientos de instalación distintos | Fricción de adopción por usuarios no técnicos | Probar instalación real en ambos dispositivos antes de considerar el MVP listo |

---

## 33. Riesgos de negocio

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Todos los usuarios tienen los mismos permisos (sin roles) | Un error o mal uso de cualquier familiar afecta datos de toda la operación | Aceptado explícitamente para MVP por el negocio; monitorear si se vuelve un problema real antes de agregar roles |
| Sugerencias de cobro pueden institucionalizarse como regla sin querer | Empleados podrían tratar la sugerencia como obligatoria, perdiendo la flexibilidad que resolvió el caso real ($5,000) | UI debe comunicar visualmente que es "sugerido", nunca bloquear ni forzar el valor |
| Dependencia de que el negocio realmente use la app en vez de volver a WhatsApp | La app no resuelve nada si no se adopta en el día a día | Fuera del alcance técnico; recomendar capacitación breve a abuela y padre antes de lanzar |
| Backups y disponibilidad ahora dependen 100% de infraestructura propia (autohospedada), no de un proveedor gestionado | Si el negocio deja de mantener el VPS al día, el riesgo lo asumen ellos, no un tercero | Ya asumido conscientemente (tienen proceso de backups para otros 2 proyectos); aplicar el mismo estándar aquí (sección 27) |

*(La fila de retención de credenciales de v1.2 se quitó de esta tabla — quedó decidida en sección 15 y ya no es un riesgo abierto; era una inconsistencia arrastrada de versiones anteriores que referenciaba una decisión pendiente que ya se había cerrado.)*

---

## 34. Funcionalidades explícitamente fuera del MVP

POS · inventario · ventas persistentes · mantenimiento · QR · modelos individuales de equipo · ubicación física de equipos · chatbot · IA · automatización de WhatsApp · notificaciones push · estadísticas/gráficas avanzadas · calendario complejo · facturación fiscal · múltiples sucursales · proveedores · compras · portal de cliente público · roles complejos · microservicios · apps nativas · colección de auditoría genérica · TanStack Query · guardado de borrador de formulario · realtime · Supabase · Node/Express como backend.

Cada una de estas fue evaluada contra la pregunta rectora (sección 4) y ninguna tiene una respuesta clara sobre qué problema *frecuente y observado* del negocio resuelve hoy.

---

## 35. Plan de implementación por fases

**Fase 0 — Fundación**
Setup del proyecto (Vite + React + TS + Tailwind + shadcn). Instalar/configurar PocketBase en el VPS junto a la infraestructura existente, detrás de `nginx-proxy-manager`. Esquema inicial de colecciones (`pb_migrations/`), API Rules base, variables de entorno, deploy mínimo (hello world PWA instalable).

**Fase 1 — Clientes y rentas (núcleo)**
Colecciones completas (`customers`, `rentals` con `extras` json, `rental_items`). Hook de folio consecutivo (sección 11.1). Pantalla única de nueva renta. Comprobante básico en modal (fallback de compartir/imprimir, sin Bluetooth todavía).

**Fase 2 — Pagos y dashboard**
Modal de registrar pago con sugerencia basada en el último pago. Hook de validación de `note` en ajustes. Dashboard con rentas activas y pestaña "Buscar" independiente (sección 16.5). Sección "requiere revisión" (umbral fijo por variable de entorno, ver Anexo A.3).

**Fase 3 — Devolución y ficha de cliente**
Endpoint server-side de devolución (`pb_hooks/rentals_return.pb.js`, sección 19.1). Ficha de cliente con historial y credencial vía file token (sección 15).

**Fase 4 — Auditoría, hardening y pulido**
Verificación de `created_by`/`updated_by`/`returned_by` en todos los flujos. Revisión completa de API Rules, incluidas las reglas `:isset` sobre `rentals`. Configuración de rate limiting en `nginx-proxy-manager`. Backup automático + simulacro de restore (sección 27). Pruebas reales en Android e iPhone.

**Fase 5 — Impresión Bluetooth**
Integración del adaptador `WebBluetoothPrinter`, reutilizando el código validado en `test-impresora`. Independiente del backend — no bloquea ningún flujo, la app funciona completa con el fallback de compartir mientras tanto.

---

## Anexo A — Decisiones pendientes que requieren confirmación del dueño

**A.1 — Mecanismo de login por teléfono.**
**Decidido:** selector de los 6 usuarios del negocio + contraseña (sección 14). Con PocketBase, el `phone` se usa directo como `username` de la colección `users` — más simple que el workaround de email sintético que requería Supabase.

**A.2 — Reinicio de folio.**
**Decidido:** folio global, nunca se reinicia. Formato `R-000001`, generado server-side (sección 11.1).

**A.3 — Umbral de "renta antigua que requiere revisión".**
**Decidido:** variable de entorno fija (`VITE_STALE_RENTAL_DAYS`), default 30 días.

**A.4 — Corrección de pagos con monto capturado por error.**
**Decidido:** "pago de ajuste" (`payment_type = 'adjustment'` + `note` obligatoria, validada también server-side). El pago original nunca se edita ni se borra.

**A.5 — Qué pasa si falla la subida de la foto de credencial al crear cliente.**
**Decidido:** se permite continuar y crear la renta igual; el cliente queda marcado "credencial pendiente".

**A.6 — Plan de Supabase y política de backups.**
**Resuelto por el cambio de arquitectura:** ya no aplica "plan de Supabase" — PocketBase corre en infraestructura propia. Destino de backup **decidido: Backblaze B2** (ya en uso en otro proyecto del negocio). Ver sección 27 para la estrategia completa de backup/restore, que queda como requisito de producción a implementar (no una decisión de negocio pendiente).

**A.7 — Sugerencia de pago cuando no hay pagos previos.**
**Decidido:** se usa `initial_rent_amount` como sugerencia del primer pago.

**A.8 — Devolución parcial (ej. cliente regresa el concentrador pero conserva el tanque).**
**Decidido:** no se implementa en el MVP — la devolución siempre cierra la renta completa.
