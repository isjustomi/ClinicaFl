# DentalFlow SV

Aplicacion web para clinica dental con autenticacion, roles y modulos separados por listado y formularios de alta.

## Modulos principales

- `Mi Usuario`: perfil, dashboard inicial (KPI y proximas 5 citas), alertas y cambio de contrasena.
- `Expedientes`: listado de pacientes y pantalla aparte para agregar/editar.
- `Facturacion`: listado de facturas y pantalla aparte para agregar factura DTE.
- `Agenda`: calendario digital, listado por fecha y pantalla aparte para agendar citas.
- `Reportes`: resumen de pacientes, citas e ingresos.
- `Bitacora` (solo administrador): historial de acciones del sistema.
- `Usuarios` (solo administrador): listado y pantalla aparte para crear usuarios.

## Reglas implementadas

- Roles:
  - `admin`: acceso completo y gestion de cuentas.
  - `odontologo`: puede trabajar expedientes, facturacion, agenda y reportes, pero no cuentas.
- Permisos finos:
  - Solo `admin` puede eliminar facturas.
- Seguridad al eliminar expediente: verificacion por checkbox y texto `ELIMINAR`.
- Citas: se permiten varias en el mismo dia, pero no se permiten choques de horario.
- Citas con estado: `pendiente`, `confirmada`, `atendida`, `cancelada`.
- Auditoria de cambios para trazabilidad de operaciones.
- Respaldo automatico diario de base de datos en `data/backups`.
- Exportacion de reportes en `CSV` y `PDF`.
- Exportacion de bitacora en `CSV`.
- Busqueda global en barra superior para localizar pacientes, facturas y citas.

## Configuracion de administrador (seguro)

Define estas variables antes del primer inicio:

- `ADMIN_USERNAME=admin` (o el usuario que prefieras)
- `ADMIN_PASSWORD=una_password_segura`

Puedes usar el archivo `.env.example` como base para crear tu `.env`.

## Ejecutar

```bash
npm install
npm start
```

Abrir en navegador:

- http://localhost:3000

## Datos

Se guardan en:

- `data/db.json`
- o en la ruta definida por variable `DATA_DIR` (recomendado en hosting con volumen persistente).

## Despliegue

- Guia sugerida: [DEPLOY_RAILWAY.md](/C:/Users/imerj/Documents/Codex/2026-05-28/necesito-que-construyas-una-app-de/DEPLOY_RAILWAY.md:1)

## Nota de facturacion electronica El Salvador

La app deja lista la estructura DTE clinica (tipo, control, emisor, IVA 13%, estado). Para emision oficial ante MH falta integrar firma y envio con credenciales de Hacienda.
