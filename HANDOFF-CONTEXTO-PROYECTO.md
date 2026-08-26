# Handoff: O2 Insumos — contexto completo para continuar la decisión de arquitectura

Resumen para retomar el proyecto con otro asistente (GPT), que revisará `SDD.md` (v1.2, mismo repo) junto con este documento. Objetivo de este handoff: que quien lo lea no tenga que re-derivar nada de lo ya conversado — qué se decidió, por qué, qué se descartó, y cuál es la única decisión de arquitectura que sigue realmente abierta.

## 1. Negocio (resumen)

O2 Insumos, negocio familiar mexicano, renta concentradores de oxígeno y tanques. Hoy el control es papel + fotos + WhatsApp. Caso real que motiva todo el proyecto: una renta de $2,800/mes pasó ~6 meses sin detectarse; se resolvió cobrando solo $5,000 en total. Objetivo: PWA interna mínima para saber qué está rentado, a quién, desde cuándo, cobrar y devolver — explícitamente NO un ERP/POS/inventario, sin roles complejos.

## 2. Estado del SDD

`SDD.md`, versión 1.2, 35 secciones + Anexo A. Prácticamente cerrado — la única pieza que sigue en discusión real es dónde vive la base de datos/auth/storage (sección 6 de este documento). Todo lo demás (modelo de datos, pantallas, flujos, RLS, printing) ya está resuelto y documentado con su razonamiento dentro del propio SDD.

## 3. Decisiones ya tomadas (no reabrir sin una razón nueva)

- **Login:** selector de los 6 usuarios fijos del negocio + contraseña (no se escribe teléfono). Por dentro sigue siendo mapeo `phone → email interno` en Supabase Auth, hardcodeado en código (`loginUsers.ts`), no en tabla — son 6 personas fijas administradas a mano.
- **Folio:** consecutivo, global, nunca se reinicia (secuencia de Postgres, evita condiciones de carrera).
- **Pagos:** `payment_type` = `rent` | `deposit` | `adjustment`. Un pago mal capturado se corrige con un registro nuevo (ajuste positivo o negativo + nota obligatoria) — el original nunca se edita ni se borra, el total real es la suma de todos los pagos.
- **Falla al subir foto de credencial:** se permite continuar y crear la renta igual; el cliente queda marcado "credencial pendiente".
- **Devolución parcial** (ej. regresar el concentrador y quedarse con el tanque): NO en el MVP. La devolución siempre cierra toda la renta.
- **Credencial del cliente:** se conserva mientras el cliente tenga historial de rentas (sin borrado automático por tiempo); visible a cualquier usuario autenticado, sin rol especial.
- **"Nueva renta":** pantalla única con secciones (cliente → productos → montos → otros → confirmar), no wizard multi-paso.
- **Búsqueda / Devolución / Comprobante:** modales sobre Dashboard / Detalle de renta, no rutas/pantallas propias.

**Simplificaciones aplicadas tras auditar sobreingeniería** (todas aprobadas explícitamente):
- Sin tabla `audit_log` genérica — `created_by`/`updated_by`/`returned_by` en `rentals` alcanzan.
- "Otros" es columna `extras jsonb` dentro de `rentals`, no tabla propia (nunca se consulta independiente).
- Sin `payment_type = 'other'`.
- Umbral de "renta antigua" (dashboard) fijo por variable de entorno (`VITE_STALE_RENTAL_DAYS`, default 30), no tabla de configuración.
- Sin TanStack Query en el MVP (dominio muy chico).
- Sin guardado de borrador de formulario en `localStorage` (la foto de credencial, un File, no cabe ahí sin convertir a base64 — costo real para un problema no reportado).

## 4. Impresión térmica — confirmado contra hardware real

Prototipo aparte (`test-impresora`, ver `HANDOFF-IMPRESION-BLUETOOTH.md` en ese repo) ya validó, contra la impresora física WW-POS58U:

- Es **BLE/GATT** (no Bluetooth clásico) — compatible con Web Bluetooth. Servicio y characteristic de escritura confirmados.
- Protocolo **ESC/POS estándar**. Codepage **WPC1252**, texto en **Latin-1** (no UTF-8) para que ñ/acentos impriman bien.
- Imágenes (logo) vía `GS v 0` + dithering Floyd-Steinberg, con el gotcha de recortar márgenes blancos antes de escalar (afecta tiempo de impresión).
- **iPhone/iPad NO soporta Web Bluetooth en ningún navegador** (limitación de Apple, no del hardware) — el tío del negocio usa iPhone y depende 100% del fallback de compartir/imprimir por navegador.
- Los 3 celulares del negocio son dedicados y fijos, configurados a mano por el dueño (admin técnico) — esto habilita reconexión automática vía flags experimentales de Chrome, sin repetir el picker nativo cada vez.
- Pendiente de validar (no bloqueante): comportamiento con impresora ocupada/batería baja, ancho máximo real del cabezal.

## 5. La decisión abierta: dónde vive la base de datos / auth / storage

**Contexto que cambió el rumbo:** el SDD originalmente asumía Supabase Cloud (gestionado) por simplicidad operativa. Pero el negocio **ya tiene infraestructura propia funcionando**: 2 proyectos Supabase self-hosted corriendo en su VPS (207.244.237.206, 8GB RAM), con proceso de backups ya resuelto — y llegaron a self-hosted precisamente porque Supabase Cloud cobra ~$25/mes por proyecto pasado el límite de 2 proyectos gratis, y el plan es tener más de 2 proyectos (O2 Insumos es uno de varios, no el único).

**Datos reales del VPS (verificados por SSH — `free -h` + `docker stats`, no estimados):**
- RAM total 7.8GB, ya usados 5.2GB (67%), quedan **~2.6GB disponibles**.
- 2 stacks Supabase self-hosted completos corriendo (11 contenedores cada uno: db, auth, rest, storage, pooler, meta, realtime, edge-functions, imgproxy, kong, studio).
- Costo real medido por stack completo: **~1.6–1.8GB de RAM**, no los ~500MB que se asumía inicialmente. El grueso **no es Postgres** (el contenedor `db` solo pesa 114–133MB) — es Kong (510–533MB, y curiosamente 27–29% CPU en reposo, anómalo, revisar en algún momento sin bloquear esto), Studio (206–229MB), Realtime (187–207MB) y Edge Functions (24–189MB): servicios que O2 Insumos no va a usar.
- Con solo ~2.6GB libres, un tercer stack **sin recortar** dejaría el VPS muy justo, y no escala si van a sumar más proyectos chicos como este.

**Tres opciones evaluadas, sin decidir todavía entre ellas:**

1. **Supabase Cloud (hosted)** — cero infraestructura propia, backups automáticos, pero ~$25/mes pasado el 2do proyecto gratis. Descartado en la práctica: es justo el costo que originó el self-hosting actual.
2. **Supabase self-hosted, recortado** — mismo modelo que ya tiene todo el SDD (Postgres + Auth + Storage + RLS, cero cambios al diseño de datos), quitando del `docker-compose` lo que O2 Insumos no usa: Kong, Studio, Realtime, Edge Functions. Estimado resultante: ~350–400MB por proyecto. Kong se puede reemplazar usando el `nginx-proxy-manager` que ya corre en el VPS para otras apps (ya hace de proxy, no haría falta un segundo gateway). Cambio de infraestructura únicamente, no de diseño.
3. **PocketBase** (o backend ligero equivalente) — un solo binario, Auth + SQLite + Storage + panel admin integrados, decenas de MB en vez de cientos. Su modelo de permisos (una regla simple por colección) encaja bien con la decisión ya tomada de "un solo rol, todos pueden todo, sin roles complejos" — más simple que escribir políticas RLS en SQL para este caso puntual. Contra: es un cambio real de arquitectura, obligaría a reescribir las secciones 8, 9, 11 (RLS → reglas de PocketBase), 13, 14, 15, 25, 28 y 29 del SDD.

**Lo que se le pide a quien continúe (GPT):** con este resumen + `SDD.md` + los números reales del VPS de arriba, terminar de decidir entre estas 3 opciones (o proponer otra si hay algo mejor que no se consideró), y revisar el SDD completo señalando qué le falta y qué le sobra antes de pasar a la fase de implementación.
