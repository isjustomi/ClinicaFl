const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const PDFDocument = require("pdfkit");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, "data");
const DB_PATH = path.join(DATA_DIR, "db.json");
const BACKUP_DIR = path.join(DATA_DIR, "backups");

const IVA_RATE = 0.13;
const REQUIRED_DELETE_TEXT = "ELIMINAR";
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const TOKEN_TTL_MS = 1000 * 60 * 60 * 12;
const BACKUP_CHECK_INTERVAL_MS = 1000 * 60 * 30;
const APPOINTMENT_STATUSES = ["pendiente", "confirmada", "atendida", "cancelada"];

const sessions = new Map();

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function hashPassword(password) {
  return crypto.createHash("sha256").update(String(password)).digest("hex");
}

function normalizeDb(rawDb) {
  const db = rawDb || {};
  if (!Array.isArray(db.users)) db.users = [];
  if (!Array.isArray(db.patients)) db.patients = [];
  if (!Array.isArray(db.invoices)) db.invoices = [];
  if (!Array.isArray(db.appointments)) db.appointments = [];
  if (!Array.isArray(db.auditLogs)) db.auditLogs = [];
  return db;
}

function ensureDataDirectories() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function buildBackupFilePath(date = new Date()) {
  return path.join(BACKUP_DIR, `db-${date.toISOString().slice(0, 10)}.json`);
}

function createDailyBackupIfNeeded() {
  ensureDataDirectories();
  if (!fs.existsSync(DB_PATH)) return;
  const backupPath = buildBackupFilePath();
  if (!fs.existsSync(backupPath)) {
    fs.copyFileSync(DB_PATH, backupPath);
  }
}

function ensureDb() {
  ensureDataDirectories();
  let db = normalizeDb({
    users: [],
    patients: [],
    invoices: [],
    appointments: [],
    auditLogs: []
  });

  if (fs.existsSync(DB_PATH)) {
    const raw = fs.readFileSync(DB_PATH, "utf8");
    const normalized = raw.replace(/^\uFEFF/, "").trim();
    if (normalized.length > 0) db = normalizeDb(JSON.parse(normalized));
  }

  if (!db.users.some((user) => user.username === ADMIN_USERNAME)) {
    if (!ADMIN_PASSWORD || ADMIN_PASSWORD.length < 8) {
      throw new Error(
        "Falta configurar ADMIN_PASSWORD (minimo 8 caracteres) para crear el usuario administrador inicial."
      );
    }
    const now = new Date().toISOString();
    db.users.push({
      id: crypto.randomUUID(),
      fullName: "Administrador General",
      username: ADMIN_USERNAME,
      passwordHash: hashPassword(ADMIN_PASSWORD),
      role: "admin",
      isActive: true,
      createdAt: now,
      updatedAt: now
    });
  }

  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
  createDailyBackupIfNeeded();
}

function readDb() {
  ensureDb();
  const raw = fs.readFileSync(DB_PATH, "utf8");
  const normalized = raw.replace(/^\uFEFF/, "");
  return normalizeDb(JSON.parse(normalized));
}

function writeDb(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(normalizeDb(db), null, 2));
  createDailyBackupIfNeeded();
}

function addAuditLog(db, payload) {
  const log = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    actorUsername: payload.actorUsername || "sistema",
    actorRole: payload.actorRole || "sistema",
    action: payload.action,
    entityType: payload.entityType,
    entityId: payload.entityId || null,
    description: payload.description || "",
    metadata: payload.metadata || {}
  };

  db.auditLogs.push(log);
  if (db.auditLogs.length > 5000) db.auditLogs = db.auditLogs.slice(-5000);
  return log;
}

function toPublicUser(user) {
  return {
    id: user.id,
    fullName: user.fullName,
    username: user.username,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

function cleanExpiredSessions() {
  const now = Date.now();
  for (const [token, session] of sessions.entries()) {
    if (session.expiresAt <= now) sessions.delete(token);
  }
}

function createSession(userId) {
  cleanExpiredSessions();
  const token = crypto.randomUUID();
  sessions.set(token, { userId, expiresAt: Date.now() + TOKEN_TTL_MS });
  return token;
}

function authMiddleware(req, res, next) {
  cleanExpiredSessions();
  const auth = req.headers.authorization || "";
  const [scheme, token] = auth.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ message: "No autorizado." });
  }

  const session = sessions.get(token);
  if (!session) {
    return res.status(401).json({ message: "Sesion invalida o expirada." });
  }

  const db = readDb();
  const user = db.users.find((item) => item.id === session.userId && item.isActive);
  if (!user) {
    sessions.delete(token);
    return res.status(401).json({ message: "Usuario inactivo o inexistente." });
  }

  req.db = db;
  req.user = user;
  req.token = token;
  next();
}

function requireRole(role) {
  return (req, res, next) => {
    if (req.user.role !== role) {
      return res.status(403).json({ message: "No tienes permisos para esta accion." });
    }
    next();
  };
}

function toMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function generateControlNumber(sequence) {
  const padded = String(sequence).padStart(8, "0");
  return `DTE-01-SV-${new Date().getFullYear()}-${padded}`;
}

function validatePatient(body) {
  const required = ["fullName", "dui", "phone"];
  for (const key of required) {
    if (!String(body[key] || "").trim()) return `El campo ${key} es obligatorio.`;
  }
  return null;
}

function validateInvoice(body) {
  const required = ["patientId", "paymentMethod", "serviceDescription"];
  for (const key of required) {
    if (!String(body[key] || "").trim()) return `El campo ${key} es obligatorio.`;
  }

  const quantity = Number(body.quantity);
  const unitPrice = Number(body.unitPrice);
  if (!Number.isFinite(quantity) || quantity <= 0) return "La cantidad debe ser mayor a 0.";
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) return "El precio unitario debe ser mayor a 0.";
  return null;
}

function timeToMinutes(time) {
  const [h, m] = String(time || "").split(":").map(Number);
  if (!Number.isInteger(h) || !Number.isInteger(m)) return null;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

function validateAppointment(body) {
  const required = ["date", "startTime", "endTime", "title"];
  for (const key of required) {
    if (!String(body[key] || "").trim()) return `El campo ${key} es obligatorio.`;
  }

  const hasPatientId = String(body.patientId || "").trim().length > 0;
  const hasPatientName = String(body.patientName || "").trim().length > 0;
  if (!hasPatientId && !hasPatientName) {
    return "Debes seleccionar un paciente registrado o escribir el nombre del paciente.";
  }

  const start = timeToMinutes(body.startTime);
  const end = timeToMinutes(body.endTime);
  if (start === null || end === null) return "Formato de hora invalido.";
  if (end <= start) return "La hora de fin debe ser mayor que la hora de inicio.";

  const reminderMinutes = Number(body.reminderMinutes || 0);
  if (!Number.isFinite(reminderMinutes) || reminderMinutes < 0) {
    return "recordatorio debe ser un numero positivo o cero.";
  }

  if (body.status && !APPOINTMENT_STATUSES.includes(String(body.status).trim().toLowerCase())) {
    return "Estado de cita invalido.";
  }

  return null;
}

function hasAppointmentConflict(appointments, candidate, ignoreId = null) {
  const cStart = timeToMinutes(candidate.startTime);
  const cEnd = timeToMinutes(candidate.endTime);

  return appointments.some((item) => {
    if (ignoreId && item.id === ignoreId) return false;
    if (item.date !== candidate.date) return false;
    const aStart = timeToMinutes(item.startTime);
    const aEnd = timeToMinutes(item.endTime);
    if (aStart === null || aEnd === null) return false;
    return cStart < aEnd && cEnd > aStart;
  });
}

function buildSummaryReport(db) {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const thisMonth = today.slice(0, 7);

  const totalPatients = db.patients.length;
  const totalInvoices = db.invoices.length;
  const totalAppointments = db.appointments.length;

  let totalRevenue = 0;
  let monthlyRevenue = 0;
  const paymentMethodTotals = {};
  for (const invoice of db.invoices) {
    const amount = Number(invoice.total || 0);
    totalRevenue += amount;
    const issuedMonth = String(invoice.issuedAt || "").slice(0, 7);
    if (issuedMonth === thisMonth) monthlyRevenue += amount;
    const key = invoice.paymentMethod || "Sin especificar";
    paymentMethodTotals[key] = toMoney((paymentMethodTotals[key] || 0) + amount);
  }

  const appointmentsToday = db.appointments.filter((item) => item.date === today).length;
  const upcomingAppointments = db.appointments.filter((item) => item.date >= today).length;

  const byOdontologo = {};
  for (const item of db.invoices) {
    const user = item.createdBy || "sin-usuario";
    byOdontologo[user] = toMoney((byOdontologo[user] || 0) + Number(item.total || 0));
  }

  const appointmentStatusTotals = {};
  for (const item of db.appointments) {
    const key = item.status || "pendiente";
    appointmentStatusTotals[key] = (appointmentStatusTotals[key] || 0) + 1;
  }

  return {
    generatedAt: new Date().toISOString(),
    totalPatients,
    totalInvoices,
    totalAppointments,
    appointmentsToday,
    upcomingAppointments,
    totalRevenue: toMoney(totalRevenue),
    monthlyRevenue: toMoney(monthlyRevenue),
    paymentMethodTotals,
    byOdontologo,
    appointmentStatusTotals
  };
}

function csvEscape(value) {
  const raw = String(value ?? "");
  if (raw.includes(",") || raw.includes("\n") || raw.includes("\"")) {
    return `"${raw.replace(/"/g, "\"\"")}"`;
  }
  return raw;
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, date: new Date().toISOString() });
});

app.post("/api/auth/login", (req, res) => {
  const username = String(req.body.username || "").trim().toLowerCase();
  const password = String(req.body.password || "");

  if (!username || !password) {
    return res.status(400).json({ message: "Usuario y contrasena requeridos." });
  }

  const db = readDb();
  const user = db.users.find((item) => item.username.toLowerCase() === username);
  if (!user || !user.isActive || user.passwordHash !== hashPassword(password)) {
    return res.status(401).json({ message: "Credenciales invalidas." });
  }

  const token = createSession(user.id);
  res.json({ token, user: toPublicUser(user) });
});

app.post("/api/auth/logout", authMiddleware, (req, res) => {
  sessions.delete(req.token);
  res.json({ message: "Sesion cerrada." });
});

app.get("/api/auth/me", authMiddleware, (req, res) => {
  res.json(toPublicUser(req.user));
});

app.put("/api/auth/me/password", authMiddleware, (req, res) => {
  const currentPassword = String(req.body.currentPassword || "");
  const newPassword = String(req.body.newPassword || "");

  if (newPassword.length < 6) {
    return res.status(400).json({ message: "La nueva contrasena debe tener al menos 6 caracteres." });
  }
  if (hashPassword(currentPassword) !== req.user.passwordHash) {
    return res.status(400).json({ message: "Contrasena actual incorrecta." });
  }

  const userIndex = req.db.users.findIndex((item) => item.id === req.user.id);
  req.db.users[userIndex].passwordHash = hashPassword(newPassword);
  req.db.users[userIndex].updatedAt = new Date().toISOString();
  addAuditLog(req.db, {
    actorUsername: req.user.username,
    actorRole: req.user.role,
    action: "UPDATE_PASSWORD",
    entityType: "USER",
    entityId: req.user.id,
    description: "Cambio de contrasena propia"
  });

  writeDb(req.db);
  res.json({ message: "Contrasena actualizada correctamente." });
});

app.get("/api/users", authMiddleware, requireRole("admin"), (req, res) => {
  const users = req.db.users.map(toPublicUser).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json(users);
});

app.post("/api/users", authMiddleware, requireRole("admin"), (req, res) => {
  const fullName = String(req.body.fullName || "").trim();
  const username = String(req.body.username || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const role = req.body.role === "admin" ? "admin" : "odontologo";

  if (!fullName || !username || !password) {
    return res.status(400).json({ message: "Nombre, usuario y contrasena son obligatorios." });
  }
  if (password.length < 6) {
    return res.status(400).json({ message: "La contrasena debe tener al menos 6 caracteres." });
  }
  if (req.db.users.some((item) => item.username.toLowerCase() === username)) {
    return res.status(400).json({ message: "Ese nombre de usuario ya existe." });
  }

  const now = new Date().toISOString();
  const user = {
    id: crypto.randomUUID(),
    fullName,
    username,
    passwordHash: hashPassword(password),
    role,
    isActive: true,
    createdAt: now,
    updatedAt: now
  };

  req.db.users.push(user);
  addAuditLog(req.db, {
    actorUsername: req.user.username,
    actorRole: req.user.role,
    action: "CREATE",
    entityType: "USER",
    entityId: user.id,
    description: `Usuario ${username} creado`,
    metadata: { role }
  });

  writeDb(req.db);
  res.status(201).json(toPublicUser(user));
});

app.put("/api/users/:id", authMiddleware, requireRole("admin"), (req, res) => {
  const user = req.db.users.find((item) => item.id === req.params.id);
  if (!user) return res.status(404).json({ message: "Usuario no encontrado." });

  const requestedRole = req.body.role === "admin" ? "admin" : "odontologo";
  const requestedIsActive = typeof req.body.isActive === "boolean" ? req.body.isActive : user.isActive;

  if (req.user.id === req.params.id && req.user.role === "admin" && requestedRole !== "admin") {
    return res.status(400).json({ message: "No puedes quitarte tu propio rol de administrador." });
  }
  if (req.user.id === req.params.id && requestedIsActive === false) {
    return res.status(400).json({ message: "No puedes desactivar tu propia cuenta." });
  }
  if (user.username === ADMIN_USERNAME && req.body.isActive === false) {
    return res.status(400).json({ message: "No puedes desactivar al administrador principal." });
  }

  user.fullName = String(req.body.fullName || user.fullName).trim();
  user.role = requestedRole;
  user.isActive = requestedIsActive;

  const newPassword = String(req.body.newPassword || "");
  if (newPassword) {
    if (newPassword.length < 6) {
      return res.status(400).json({ message: "La nueva contrasena debe tener al menos 6 caracteres." });
    }
    user.passwordHash = hashPassword(newPassword);
  }

  user.updatedAt = new Date().toISOString();
  addAuditLog(req.db, {
    actorUsername: req.user.username,
    actorRole: req.user.role,
    action: "UPDATE",
    entityType: "USER",
    entityId: user.id,
    description: `Usuario ${user.username} actualizado`,
    metadata: { role: user.role, isActive: user.isActive }
  });

  writeDb(req.db);
  res.json(toPublicUser(user));
});

app.delete("/api/users/:id", authMiddleware, requireRole("admin"), (req, res) => {
  if (req.user.id === req.params.id) {
    return res.status(400).json({ message: "No puedes eliminar tu propia cuenta." });
  }

  const index = req.db.users.findIndex((item) => item.id === req.params.id);
  if (index === -1) return res.status(404).json({ message: "Usuario no encontrado." });
  if (req.db.users[index].username === ADMIN_USERNAME) {
    return res.status(400).json({ message: "No puedes eliminar al administrador principal." });
  }

  const deleted = req.db.users[index];
  req.db.users.splice(index, 1);
  for (const [token, session] of sessions.entries()) {
    if (session.userId === req.params.id) sessions.delete(token);
  }

  addAuditLog(req.db, {
    actorUsername: req.user.username,
    actorRole: req.user.role,
    action: "DELETE",
    entityType: "USER",
    entityId: deleted.id,
    description: `Usuario ${deleted.username} eliminado`
  });

  writeDb(req.db);
  res.json({ message: "Usuario eliminado correctamente." });
});

app.get("/api/audit-logs", authMiddleware, requireRole("admin"), (req, res) => {
  const limit = Math.max(1, Math.min(500, Number(req.query.limit || 200)));
  const logs = [...req.db.auditLogs].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, limit);
  res.json(logs);
});

app.get("/api/audit-logs/export.csv", authMiddleware, requireRole("admin"), (req, res) => {
  const logs = [...req.db.auditLogs].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  const rows = [
    ["Fecha", "Usuario", "Rol", "Accion", "Entidad", "EntidadId", "Descripcion"]
  ];

  logs.forEach((log) => {
    rows.push([
      log.timestamp,
      log.actorUsername,
      log.actorRole,
      log.action,
      log.entityType,
      log.entityId || "",
      log.description || ""
    ]);
  });

  const csvText = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
  const filename = `bitacora-${new Date().toISOString().slice(0, 10)}.csv`;
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename=\"${filename}\"`);
  res.send(`\uFEFF${csvText}`);
});

app.get("/api/patients", authMiddleware, (req, res) => {
  const patients = [...req.db.patients].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json(patients);
});

app.post("/api/patients", authMiddleware, (req, res) => {
  const validationError = validatePatient(req.body);
  if (validationError) return res.status(400).json({ message: validationError });

  const now = new Date().toISOString();
  const patient = {
    id: crypto.randomUUID(),
    fullName: String(req.body.fullName).trim(),
    dui: String(req.body.dui).trim(),
    nit: String(req.body.nit || "").trim(),
    birthDate: String(req.body.birthDate || "").trim(),
    phone: String(req.body.phone).trim(),
    email: String(req.body.email || "").trim(),
    address: String(req.body.address || "").trim(),
    allergies: String(req.body.allergies || "").trim(),
    medicalHistory: String(req.body.medicalHistory || "").trim(),
    odontologicalNotes: String(req.body.odontologicalNotes || "").trim(),
    createdBy: req.user.username,
    createdAt: now,
    updatedAt: now
  };

  req.db.patients.push(patient);
  addAuditLog(req.db, {
    actorUsername: req.user.username,
    actorRole: req.user.role,
    action: "CREATE",
    entityType: "PATIENT",
    entityId: patient.id,
    description: `Expediente creado para ${patient.fullName}`
  });

  writeDb(req.db);
  res.status(201).json(patient);
});

app.put("/api/patients/:id", authMiddleware, (req, res) => {
  const validationError = validatePatient(req.body);
  if (validationError) return res.status(400).json({ message: validationError });

  const index = req.db.patients.findIndex((patient) => patient.id === req.params.id);
  if (index === -1) return res.status(404).json({ message: "Paciente no encontrado." });

  const existing = req.db.patients[index];
  req.db.patients[index] = {
    ...existing,
    fullName: String(req.body.fullName).trim(),
    dui: String(req.body.dui).trim(),
    nit: String(req.body.nit || "").trim(),
    birthDate: String(req.body.birthDate || "").trim(),
    phone: String(req.body.phone).trim(),
    email: String(req.body.email || "").trim(),
    address: String(req.body.address || "").trim(),
    allergies: String(req.body.allergies || "").trim(),
    medicalHistory: String(req.body.medicalHistory || "").trim(),
    odontologicalNotes: String(req.body.odontologicalNotes || "").trim(),
    updatedAt: new Date().toISOString()
  };

  addAuditLog(req.db, {
    actorUsername: req.user.username,
    actorRole: req.user.role,
    action: "UPDATE",
    entityType: "PATIENT",
    entityId: req.db.patients[index].id,
    description: `Expediente actualizado para ${req.db.patients[index].fullName}`
  });

  writeDb(req.db);
  res.json(req.db.patients[index]);
});

app.delete("/api/patients/:id", authMiddleware, (req, res) => {
  const verificationText = String(req.body.verificationText || "").trim().toUpperCase();
  if (verificationText !== REQUIRED_DELETE_TEXT) {
    return res.status(400).json({
      message: `Verificacion invalida. Debes escribir exactamente: ${REQUIRED_DELETE_TEXT}`
    });
  }

  const index = req.db.patients.findIndex((patient) => patient.id === req.params.id);
  if (index === -1) return res.status(404).json({ message: "Paciente no encontrado." });

  const removed = req.db.patients[index];
  const patientId = removed.id;
  req.db.patients.splice(index, 1);
  req.db.invoices = req.db.invoices.filter((invoice) => invoice.patientId !== patientId);
  req.db.appointments = req.db.appointments.filter((appt) => appt.patientId !== patientId);

  addAuditLog(req.db, {
    actorUsername: req.user.username,
    actorRole: req.user.role,
    action: "DELETE",
    entityType: "PATIENT",
    entityId: removed.id,
    description: `Expediente eliminado para ${removed.fullName}`
  });

  writeDb(req.db);
  res.json({ message: "Paciente y registros relacionados eliminados correctamente." });
});

app.get("/api/invoices", authMiddleware, (req, res) => {
  const invoices = [...req.db.invoices].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json(invoices);
});

app.post("/api/invoices", authMiddleware, (req, res) => {
  const validationError = validateInvoice(req.body);
  if (validationError) return res.status(400).json({ message: validationError });

  const patient = req.db.patients.find((item) => item.id === req.body.patientId);
  if (!patient) return res.status(404).json({ message: "El paciente seleccionado no existe." });

  const quantity = Number(req.body.quantity);
  const unitPrice = Number(req.body.unitPrice);
  const subtotal = toMoney(quantity * unitPrice);
  const iva = toMoney(subtotal * IVA_RATE);
  const total = toMoney(subtotal + iva);

  const invoice = {
    id: crypto.randomUUID(),
    dteType: String(req.body.dteType || "Factura").trim(),
    controlNumber: generateControlNumber(req.db.invoices.length + 1),
    generationCode: crypto.randomUUID().toUpperCase(),
    issuedAt: new Date().toISOString(),
    emitter: {
      businessName: String(req.body.businessName || "Clinica Dental SV").trim(),
      nit: String(req.body.businessNit || "").trim(),
      nrc: String(req.body.businessNrc || "").trim(),
      address: String(req.body.businessAddress || "").trim()
    },
    patientId: patient.id,
    patientName: patient.fullName,
    patientDui: patient.dui,
    serviceDescription: String(req.body.serviceDescription).trim(),
    paymentMethod: String(req.body.paymentMethod).trim(),
    quantity,
    unitPrice,
    subtotal,
    iva,
    total,
    status: "Pendiente de envio MH",
    notes: String(req.body.notes || "").trim(),
    createdBy: req.user.username,
    createdAt: new Date().toISOString()
  };

  req.db.invoices.push(invoice);
  addAuditLog(req.db, {
    actorUsername: req.user.username,
    actorRole: req.user.role,
    action: "CREATE",
    entityType: "INVOICE",
    entityId: invoice.id,
    description: `Factura ${invoice.controlNumber} creada`,
    metadata: { total: invoice.total }
  });

  writeDb(req.db);
  res.status(201).json(invoice);
});

app.delete("/api/invoices/:id", authMiddleware, requireRole("admin"), (req, res) => {
  const index = req.db.invoices.findIndex((invoice) => invoice.id === req.params.id);
  if (index === -1) return res.status(404).json({ message: "Factura no encontrada." });

  const removed = req.db.invoices[index];
  req.db.invoices.splice(index, 1);
  addAuditLog(req.db, {
    actorUsername: req.user.username,
    actorRole: req.user.role,
    action: "DELETE",
    entityType: "INVOICE",
    entityId: removed.id,
    description: `Factura ${removed.controlNumber} eliminada`
  });

  writeDb(req.db);
  res.json({ message: "Factura eliminada correctamente." });
});

app.get("/api/appointments", authMiddleware, (req, res) => {
  const appointments = [...req.db.appointments].sort((a, b) => {
    if (a.date === b.date) return a.startTime.localeCompare(b.startTime);
    return a.date.localeCompare(b.date);
  });
  res.json(appointments);
});

app.post("/api/appointments", authMiddleware, (req, res) => {
  const validationError = validateAppointment(req.body);
  if (validationError) return res.status(400).json({ message: validationError });

  const patientId = String(req.body.patientId || "").trim();
  let patientName = String(req.body.patientName || "").trim();
  if (patientId) {
    const patient = req.db.patients.find((item) => item.id === patientId);
    if (!patient) return res.status(404).json({ message: "Paciente no encontrado para la cita." });
    patientName = patient.fullName;
  }

  const candidate = {
    date: String(req.body.date).trim(),
    startTime: String(req.body.startTime).trim(),
    endTime: String(req.body.endTime).trim()
  };
  if (hasAppointmentConflict(req.db.appointments, candidate)) {
    return res.status(400).json({ message: "La cita choca con otro horario ya reservado." });
  }

  const status = APPOINTMENT_STATUSES.includes(String(req.body.status || "").trim().toLowerCase())
    ? String(req.body.status).trim().toLowerCase()
    : "pendiente";

  const appointment = {
    id: crypto.randomUUID(),
    date: candidate.date,
    startTime: candidate.startTime,
    endTime: candidate.endTime,
    patientId: patientId || null,
    patientName,
    title: String(req.body.title).trim(),
    status,
    reminderMinutes: Number(req.body.reminderMinutes || 0),
    reminderMessage: String(req.body.reminderMessage || "").trim(),
    notes: String(req.body.notes || "").trim(),
    createdBy: req.user.username,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  req.db.appointments.push(appointment);
  addAuditLog(req.db, {
    actorUsername: req.user.username,
    actorRole: req.user.role,
    action: "CREATE",
    entityType: "APPOINTMENT",
    entityId: appointment.id,
    description: `Cita creada para ${appointment.patientName}`,
    metadata: { date: appointment.date, time: `${appointment.startTime}-${appointment.endTime}` }
  });

  writeDb(req.db);
  res.status(201).json(appointment);
});

app.put("/api/appointments/:id", authMiddleware, (req, res) => {
  const validationError = validateAppointment(req.body);
  if (validationError) return res.status(400).json({ message: validationError });

  const index = req.db.appointments.findIndex((item) => item.id === req.params.id);
  if (index === -1) return res.status(404).json({ message: "Cita no encontrada." });

  const patientId = String(req.body.patientId || "").trim();
  let patientName = String(req.body.patientName || "").trim();
  if (patientId) {
    const patient = req.db.patients.find((item) => item.id === patientId);
    if (!patient) return res.status(404).json({ message: "Paciente no encontrado para la cita." });
    patientName = patient.fullName;
  }

  const candidate = {
    date: String(req.body.date).trim(),
    startTime: String(req.body.startTime).trim(),
    endTime: String(req.body.endTime).trim()
  };
  if (hasAppointmentConflict(req.db.appointments, candidate, req.params.id)) {
    return res.status(400).json({ message: "La cita choca con otro horario ya reservado." });
  }

  const status = APPOINTMENT_STATUSES.includes(String(req.body.status || "").trim().toLowerCase())
    ? String(req.body.status).trim().toLowerCase()
    : "pendiente";

  const existing = req.db.appointments[index];
  req.db.appointments[index] = {
    ...existing,
    date: candidate.date,
    startTime: candidate.startTime,
    endTime: candidate.endTime,
    patientId: patientId || null,
    patientName,
    title: String(req.body.title).trim(),
    status,
    reminderMinutes: Number(req.body.reminderMinutes || 0),
    reminderMessage: String(req.body.reminderMessage || "").trim(),
    notes: String(req.body.notes || "").trim(),
    updatedAt: new Date().toISOString()
  };

  addAuditLog(req.db, {
    actorUsername: req.user.username,
    actorRole: req.user.role,
    action: "UPDATE",
    entityType: "APPOINTMENT",
    entityId: req.db.appointments[index].id,
    description: `Cita actualizada para ${req.db.appointments[index].patientName}`,
    metadata: { status: req.db.appointments[index].status }
  });

  writeDb(req.db);
  res.json(req.db.appointments[index]);
});

app.delete("/api/appointments/:id", authMiddleware, (req, res) => {
  const index = req.db.appointments.findIndex((item) => item.id === req.params.id);
  if (index === -1) return res.status(404).json({ message: "Cita no encontrada." });

  const removed = req.db.appointments[index];
  req.db.appointments.splice(index, 1);
  addAuditLog(req.db, {
    actorUsername: req.user.username,
    actorRole: req.user.role,
    action: "DELETE",
    entityType: "APPOINTMENT",
    entityId: removed.id,
    description: `Cita eliminada para ${removed.patientName}`
  });

  writeDb(req.db);
  res.json({ message: "Cita eliminada correctamente." });
});

app.get("/api/reports/summary", authMiddleware, (req, res) => {
  res.json(buildSummaryReport(req.db));
});

app.get("/api/reports/export.csv", authMiddleware, (req, res) => {
  const report = buildSummaryReport(req.db);
  const rows = [
    ["Campo", "Valor"],
    ["FechaGeneracion", report.generatedAt],
    ["TotalPacientes", report.totalPatients],
    ["TotalFacturas", report.totalInvoices],
    ["TotalCitas", report.totalAppointments],
    ["CitasHoy", report.appointmentsToday],
    ["CitasProximas", report.upcomingAppointments],
    ["IngresosMes", report.monthlyRevenue],
    ["IngresosAcumulados", report.totalRevenue],
    [],
    ["FacturacionPorMetodo", "Monto"]
  ];

  Object.entries(report.paymentMethodTotals).forEach(([method, amount]) => rows.push([method, amount]));
  rows.push([]);
  rows.push(["FacturacionPorUsuario", "Monto"]);
  Object.entries(report.byOdontologo).forEach(([user, amount]) => rows.push([user, amount]));
  rows.push([]);
  rows.push(["EstadoCita", "Cantidad"]);
  Object.entries(report.appointmentStatusTotals).forEach(([status, count]) => rows.push([status, count]));

  const csvText = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
  const filename = `reporte-clinica-${new Date().toISOString().slice(0, 10)}.csv`;
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename=\"${filename}\"`);
  res.send(`\uFEFF${csvText}`);
});

app.get("/api/reports/export.pdf", authMiddleware, (req, res) => {
  const report = buildSummaryReport(req.db);
  const filename = `reporte-clinica-${new Date().toISOString().slice(0, 10)}.pdf`;

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename=\"${filename}\"`);

  const doc = new PDFDocument({ margin: 40 });
  doc.pipe(res);

  doc.fontSize(20).text("DentalFlow SV - Reporte General");
  doc.moveDown(0.5);
  doc.fontSize(10).fillColor("#444").text(`Generado: ${report.generatedAt}`);
  doc.fillColor("#000");
  doc.moveDown();

  doc.fontSize(13).text("Resumen", { underline: true });
  doc.moveDown(0.3);
  doc.fontSize(11).text(`Pacientes: ${report.totalPatients}`);
  doc.text(`Facturas: ${report.totalInvoices}`);
  doc.text(`Citas: ${report.totalAppointments}`);
  doc.text(`Citas hoy: ${report.appointmentsToday}`);
  doc.text(`Citas proximas: ${report.upcomingAppointments}`);
  doc.text(`Ingresos del mes: $${Number(report.monthlyRevenue).toFixed(2)}`);
  doc.text(`Ingresos acumulados: $${Number(report.totalRevenue).toFixed(2)}`);

  doc.moveDown();
  doc.fontSize(13).text("Facturacion por metodo", { underline: true });
  doc.moveDown(0.3);
  const pmEntries = Object.entries(report.paymentMethodTotals);
  if (pmEntries.length === 0) doc.fontSize(11).text("Sin datos");
  pmEntries.forEach(([method, amount]) => doc.fontSize(11).text(`${method}: $${Number(amount).toFixed(2)}`));

  doc.moveDown();
  doc.fontSize(13).text("Facturacion por usuario", { underline: true });
  doc.moveDown(0.3);
  const byUserEntries = Object.entries(report.byOdontologo);
  if (byUserEntries.length === 0) doc.fontSize(11).text("Sin datos");
  byUserEntries.forEach(([user, amount]) => doc.fontSize(11).text(`${user}: $${Number(amount).toFixed(2)}`));

  doc.moveDown();
  doc.fontSize(13).text("Citas por estado", { underline: true });
  doc.moveDown(0.3);
  const statusEntries = Object.entries(report.appointmentStatusTotals);
  if (statusEntries.length === 0) doc.fontSize(11).text("Sin datos");
  statusEntries.forEach(([status, count]) => doc.fontSize(11).text(`${status}: ${count}`));

  doc.end();
});

app.listen(PORT, () => {
  ensureDb();
  createDailyBackupIfNeeded();

  setInterval(() => {
    try {
      createDailyBackupIfNeeded();
    } catch (error) {
      console.error("Error al crear respaldo diario:", error.message);
    }
  }, BACKUP_CHECK_INTERVAL_MS).unref();

  console.log(`Servidor iniciado en http://localhost:${PORT}`);
  console.log(`Administrador inicial configurado por variables de entorno (usuario: ${ADMIN_USERNAME}).`);
});
