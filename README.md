# O2 Insumos — PWA de Gestión de Rentas

Aplicación web progresiva (PWA) interna para **Insumos O2**, diseñada para administrar la renta de concentradores de oxígeno y tanques. Reemplaza el control manual en papel y WhatsApp por un flujo rápido y trazable: saber qué equipo está rentado, a quién, desde cuándo, registrar cobros o ajustes, procesar devoluciones y emitir comprobantes en impresora térmica Bluetooth.

---

## Inicio rápido

1. **Configurar variables de entorno**
   ```bash
   cp .env.example .env
   ```

2. **Iniciar el backend local (PocketBase)**
   Ejecuta el binario desde la raíz del proyecto (aplica automáticamente `pb_migrations/` y carga `pb_hooks/`):
   ```powershell
   .\pocketbase.exe serve
   ```
   - API local: `http://127.0.0.1:8090`
   - Panel Admin: `http://127.0.0.1:8090/_/`

3. **Instalar dependencias y levantar el frontend**
   ```bash
   npm install
   npm run dev
   ```

4. **Verificar pruebas y tipado**
   ```bash
   npm run typecheck
   npm run test
   ```

---

## Stack y arquitectura

| Área | Decisión técnica |
|------|------------------|
| **Frontend / PWA** | React 19, TypeScript 5.9, Vite 8, Tailwind CSS v4, React Router v8, `vite-plugin-pwa` |
| **Formularios y UI** | React Hook Form + Zod v4, Radix UI (`Dialog`, `DropdownMenu`), Vaul (drawers/sheets móviles), Sonner (toasts), Lucide Icons |
| **Backend y Base de Datos** | PocketBase (`pocketbase` SDK v0.28) con SQLite integrado, reglas de acceso por colección y almacenamiento local de credenciales |
| **Lógica Server-Side** | Hooks en `pb_hooks/` para folios consecutivos atómicos, validación de pagos, formato de nombres, auditoría y cierre de devoluciones |
| **Impresión Térmica** | Web Bluetooth API (BLE/GATT) con protocolo ESC/POS (`WPC1252` / Latin-1 y dithering Floyd-Steinberg para logotipo en impresora WW-POS58U) + fallback de impresión/compartir nativo para iOS |
| **Testing** | Vitest 4 + React Testing Library + jsdom |
| **Infraestructura** | VPS con Nginx Proxy Manager y respaldos automatizados en Backblaze B2 |

---

## Scripts disponibles

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Inicia el servidor de desarrollo de Vite |
| `npm run build` | Compila TypeScript (`tsc -b`) y genera el bundle de producción en `dist/` |
| `npm run preview` | Sirve localmente el build de producción |
| `npm run test` | Ejecuta toda la suite de pruebas con Vitest (`vitest run`) |
| `npm run test:watch` | Ejecuta Vitest en modo observador interactivo |
| `npm run typecheck` | Valida el tipado estático sin emitir archivos (`tsc -b --noEmit`) |
| `npm run lint` | Ejecuta ESLint sobre el repositorio |

---

## Estructura del proyecto

```text
InsumosO2/
├── src/
│   ├── app/            # Ruteo, layout principal, sesión y caché de datos (DataCacheContext)
│   ├── components/     # Componentes UI, modales de pago/devolución, cámara y recorte de credencial
│   ├── printing/       # Motor ESC/POS vía Web Bluetooth (WebBluetoothPrinter) y fallback (ShareFallbackPrinter)
│   └── screens/        # Pantallas principales: dashboard, rental-new, clientes, login y profile
├── pb_migrations/      # Esquema declarativo de colecciones PocketBase y reglas de API
├── pb_hooks/           # Hooks transaccionales del servidor (folios, pagos, auditoría, devoluciones)
├── deploy/             # Guías operativas (Nginx rate-limiting, Backblaze B2, pruebas Bluetooth)
├── scripts/            # Scripts de respaldo (backup-databases.sh) y utilidades de mantenimiento
└── public/             # Activos estáticos, iconos PWA y logotipo para comprobantes
```

---

## Reglas de negocio clave

- **Acceso rápido por operador**: Selección directa de los usuarios fijos del negocio con contraseña en pantalla de login.
- **Folio consecutivo global**: Generado en el servidor (`pb_hooks/rentals_folio.pb.js`) sin reinicios ni condiciones de carrera.
- **Historial de pagos auditable**: Los pagos (`rent`, `deposit`, `adjustment`) permiten registrar ajustes con nota para mantener trazabilidad clara del saldo cobrado.
- **Captura resiliente de credencial**: Permite fotografiar y recortar la identificación del cliente desde el celular; si la carga falla o el cliente no la trae consigo, la renta puede crearse marcando la credencial como pendiente.
- **Devolución completa**: El cierre de una renta registra fecha de devolución, usuario que recibe el equipo y notas asociadas (`pb_hooks/rentals_return.pb.js`).
- **Impresión multiplataforma**: En dispositivos Android con Chrome se imprime directo por BLE en papel térmico de 58 mm; en iPhone/iPad (sin soporte Web Bluetooth) se utiliza automáticamente el diálogo nativo de compartir/imprimir.

---

## Checklist de despliegue y operación

- [ ] Variables de entorno de producción configuradas (`.env.production`).
- [ ] Migraciones de PocketBase aplicadas (`pb_migrations/`) y hooks cargados (`pb_hooks/`).
- [ ] Rate limiting configurado en el proxy inverso ([deploy/nginx-proxy-manager-rate-limiting.md](deploy/nginx-proxy-manager-rate-limiting.md)).
- [ ] Respaldos automáticos configurados hacia Backblaze B2 ([deploy/backblaze-b2-backups.md](deploy/backblaze-b2-backups.md)).
- [ ] Impresión térmica verificada en dispositivo móvil físico ([deploy/bluetooth-printing-real-device-test.md](deploy/bluetooth-printing-real-device-test.md)).

---

## Documentación adicional

- [SDD.md](SDD.md) — Documento de especificación y diseño del sistema (modelo de datos, flujos UI/UX, reglas de negocio y seguridad).
- [HANDOFF-CONTEXTO-PROYECTO.md](HANDOFF-CONTEXTO-PROYECTO.md) — Contexto del negocio, decisiones de arquitectura y hallazgos de impresión térmica.
- [HANDOFF-INICIO-DESARROLLO.md](HANDOFF-INICIO-DESARROLLO.md) — Resumen ejecutivo de transición de diseño a implementación y datos operativos.
- [pb_migrations/README.md](pb_migrations/README.md) — Notas sobre las migraciones de PocketBase.
