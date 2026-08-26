# Handoff: O2 Insumos — de diseño a implementación

Para inicializar una sesión nueva. El SDD (`SDD.md`, v1.5, mismo repo) está considerado completo y listo para implementación. Este documento resume el estado final y dice cuál es la siguiente acción concreta — no repite lo que ya está en el SDD ni en los otros handoffs, solo apunta a ellos.

## 1. Qué es el proyecto

O2 Insumos, negocio familiar mexicano, renta concentradores de oxígeno y tanques. PWA interna mínima (React + TS + Vite + PocketBase) para reemplazar el control actual por papel/fotos/WhatsApp — sin ERP, sin POS, sin roles complejos. Motivación: una renta de $2,800/mes pasó ~6 meses sin detectarse; se resolvió cobrando solo $5,000 en total.

## 2. Estado del SDD

`SDD.md`, v1.5. Cubre negocio, casos de uso, arquitectura PocketBase (colecciones, API Rules, hooks server-side para folio/devolución), impresión Bluetooth confirmada, dirección de diseño UI/UX completa (sección 16), y ahora también los datos operativos finales (sección 5 de este documento). El Anexo A tiene todas sus decisiones cerradas.

## 3. Datos operativos cerrados en esta última pasada (v1.5)

- **Dominio:** `insumoso2.com` para la PWA. `api.insumoso2.com` **propuesto** para PocketBase (subdominio no confirmado formalmente, pero es la convención razonable — confirmar antes de aprovisionar DNS/proxy).
- **⚠️ `insumoso2.com` tiene otra aplicación corriendo hoy que hay que reemplazar.** El SDD (sección 28) documenta un plan de corte explícito: confirmar qué es esa app y si hay algo que respaldar, definir ventana de corte, reconfigurar `nginx-proxy-manager`, verificar HTTPS. **Esto se ejecuta manualmente con el usuario presente, nunca a ciegas en una sesión automatizada.**
- **Nombre del negocio:** Insumos O2. **Teléfono:** 771 131 3535.
- **Logo:** guardado en `public/logo.png` (raíz de este repo) — listo para usarse en el comprobante, favicon y manifest de la PWA en cuanto se haga el scaffold del proyecto Vite.
- **Backups:** destino decidido, **Backblaze B2** — ya en uso y probado en otro proyecto del negocio, no es infraestructura nueva a validar.

## 4. Próxima acción concreta

Invocar la skill **`sdd-tasks`** usando `SDD.md` (v1.5) como entrada — ya cumple el rol de propuesta + diseño aprobado, no hace falta repetir esas fases. El resultado debe ser un checklist de tasks accionable, ordenado por las 5 fases que el propio SDD ya define en su sección 35 (Fundación → Clientes y rentas → Pagos y dashboard → Devolución y ficha de cliente → Auditoría/hardening → Impresión Bluetooth).

Después de generado ese checklist, dar seguimiento fase por fase con **`sdd-continue`** / **`sdd-status`** en vez de improvisar el orden de implementación.

## 5. Otros documentos del proyecto (para contexto adicional si hace falta)

- `HANDOFF-CONTEXTO-PROYECTO.md` — por qué se eligió PocketBase sobre Supabase (Cloud y self-hosted), con números reales de RAM medidos en el VPS del negocio.
- `C:\Users\Darrp\Proyectos\Test-impresora\HANDOFF-IMPRESION-BLUETOOTH.md` — validación técnica de la impresora WW-POS58U contra hardware real (repo separado).

## 6. Pendientes no bloqueantes (no impiden empezar a programar, sí antes de producción real)

- Confirmar el subdominio exacto de PocketBase (`api.insumoso2.com` es propuesta, no decisión cerrada).
- Aprovisionar PocketBase (local para desarrollo; en el VPS cuando se acerque el despliegue real).
- Configurar el bucket/credenciales de Backblaze B2 dentro de PocketBase.
- Ejecutar el plan de corte de `insumoso2.com` — solo cuando la app esté lista para reemplazar a la que corre hoy, con el usuario presente.
