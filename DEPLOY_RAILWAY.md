# Despliegue Recomendado (Gratis + Seguro Basico)

Esta app puede desplegarse en Railway con HTTPS y datos persistentes usando volumen.

## Por que Railway para esta app

- La app usa Node.js + archivos JSON locales.
- Railway permite volumen persistente, incluyendo en plan Free/Trial (limite segun plan).
- URL publica con TLS (HTTPS).

## 1) Sube el codigo a GitHub

1. Crea un repositorio en GitHub.
2. Sube esta carpeta completa.

## 2) Crea proyecto en Railway

1. Entra a Railway y crea proyecto desde GitHub repo.
2. Selecciona el servicio web.
3. En Variables de entorno agrega:
   - `NODE_ENV=production`
   - `DATA_DIR=/data`
   - `ADMIN_USERNAME=admin`
   - `ADMIN_PASSWORD=<PASSWORD_SEGURA_Y_LARGA>`

## 3) Agrega volumen persistente

1. En el servicio, agrega un Volume.
2. Montalo en ruta: `/data`
3. Redeploy.

Con esto, `db.json` y backups se guardan de forma persistente.

## 4) Verifica

- Abre la URL publica de Railway.
- Inicia sesion como admin.
- Crea un paciente y una cita.
- Reinicia el servicio y confirma que los datos siguen alli.

## 5) Seguridad minima recomendada

- Activa 2FA en la cuenta del proveedor (Railway + GitHub).
- Limita quien tiene acceso al panel de Railway.
- Descarga respaldo CSV de bitacora y reportes cada semana.

## 6) Consideracion importante para clinica

Para uso real con datos clinicos/sensibles, lo ideal es pasar a un plan pagado estable y luego migrar de JSON a base de datos gestionada con controles de acceso y cifrado adicionales.

