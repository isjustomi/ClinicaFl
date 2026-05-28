const state = {
  token: localStorage.getItem("dentalflow_token") || "",
  user: null,
  patients: [],
  invoices: [],
  users: [],
  auditLogs: [],
  appointments: [],
  reportDetailContext: null,
  patientToDelete: null,
  selectedDate: new Date().toISOString().slice(0, 10),
  calendarMonth: (() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  })()
};

const loginView = document.getElementById("login-view");
const appView = document.getElementById("app-view");
const loginForm = document.getElementById("login-form");
const logoutButton = document.getElementById("logout-btn");
const passwordForm = document.getElementById("password-form");
const navButtons = document.querySelectorAll(".nav-btn");
const viewTitle = document.getElementById("view-title");
const viewSubtitle = document.getElementById("view-subtitle");
const sessionUserTag = document.getElementById("session-user-tag");
const profileSummary = document.getElementById("profile-summary");
const openProfileButton = document.getElementById("open-profile-btn");
const globalSearchInput = document.getElementById("global-search");
const globalSearchResults = document.getElementById("global-search-results");
const dashboardKpis = document.getElementById("dashboard-kpis");
const alertsList = document.getElementById("alerts-list");
const dashboardUpcomingTable = document.getElementById("dashboard-upcoming-table");

const patientsTable = document.getElementById("patients-table");
const patientForm = document.getElementById("patient-form");
const patientFormTitle = document.getElementById("patient-form-title");

const invoicesTable = document.getElementById("invoices-table");
const invoiceForm = document.getElementById("invoice-form");
const patientSelect = document.getElementById("patientId");

const usersTable = document.getElementById("users-table");
const userForm = document.getElementById("user-form");
const adminUsersBtn = document.getElementById("admin-users-btn");
const adminAuditBtn = document.getElementById("admin-audit-btn");

const appointmentsTable = document.getElementById("appointments-table");
const appointmentForm = document.getElementById("appointment-form");
const appointmentFormTitle = document.getElementById("appointment-form-title");
const appointmentPatientSelect = document.getElementById("appointment-patientId");
const appointmentPatientName = document.getElementById("appointment-patientName");
const selectedDateLabel = document.getElementById("selected-date-label");
const calendarTitle = document.getElementById("calendar-title");
const calendarGrid = document.getElementById("calendar-grid");

const reportsCards = document.getElementById("reports-cards");
const reportPaymentMethods = document.getElementById("report-payment-methods");
const reportByUser = document.getElementById("report-by-user");
const reportAppointmentStatus = document.getElementById("report-appointment-status");
const reportDetailTitle = document.getElementById("report-detail-title");
const reportDetailTable = document.getElementById("report-detail-table");
const reportOpenModule = document.getElementById("report-open-module");
const reportCol1 = document.getElementById("report-col1");
const reportCol2 = document.getElementById("report-col2");
const reportCol3 = document.getElementById("report-col3");
const reportCol4 = document.getElementById("report-col4");
const auditTable = document.getElementById("audit-table");
const exportAuditCsvButton = document.getElementById("export-audit-csv");
const reportsAdvanced = document.getElementById("reports-advanced");
const toggleReportsAdvancedButton = document.getElementById("toggle-reports-advanced");

const deleteDialog = document.getElementById("delete-dialog");
const deleteCheck = document.getElementById("delete-check");
const deleteText = document.getElementById("delete-text");
const confirmDeleteButton = document.getElementById("confirm-delete");
const cancelDeleteButton = document.getElementById("cancel-delete");
const deleteForm = document.getElementById("delete-form");

const viewConfig = {
  profile: { title: "Mi Usuario", subtitle: "Gestiona tu sesion y seguridad." },
  "patients-list": { title: "Expedientes", subtitle: "Listado general de pacientes." },
  "patients-form": { title: "Nuevo Expediente", subtitle: "Completa los datos del paciente." },
  "billing-list": { title: "Facturacion", subtitle: "Listado de facturas emitidas." },
  "billing-form": { title: "Nueva Factura", subtitle: "Registra una factura DTE." },
  "users-list": { title: "Usuarios", subtitle: "Listado y administracion de cuentas." },
  "users-form": { title: "Nuevo Usuario", subtitle: "Crear cuenta para personal odontologico." },
  "appointments-list": { title: "Agenda", subtitle: "Citas y recordatorios con calendario." },
  "appointments-form": { title: "Agendar Cita", subtitle: "Crea o edita una cita sin cruce horario." },
  reports: { title: "Reportes", subtitle: "Indicadores clinicos y facturacion." },
  audit: { title: "Bitacora", subtitle: "Registro de acciones y cambios del sistema." }
};

function showToast(message, isError = false) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.style.background = isError ? "#8d1f2a" : "#10213e";
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2400);
}

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString("es-SV");
}

function money(value) {
  return Number(value || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function statusLabel(status) {
  const value = String(status || "pendiente").toLowerCase();
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function appointmentDateTime(dateStr, timeStr) {
  return new Date(`${dateStr}T${timeStr}:00`);
}

function buildHomeSummary() {
  const now = new Date();
  const thisMonth = now.toISOString().slice(0, 7);

  let monthlyRevenue = 0;
  state.invoices.forEach((invoice) => {
    const issuedMonth = String(invoice.issuedAt || "").slice(0, 7);
    if (issuedMonth === thisMonth) monthlyRevenue += Number(invoice.total || 0);
  });

  const todayKey = now.toISOString().slice(0, 10);
  const appointmentsToday = state.appointments.filter((item) => item.date === todayKey).length;
  const overdueAppointments = state.appointments.filter((item) => {
    const status = String(item.status || "pendiente");
    if (status === "atendida" || status === "cancelada") return false;
    return appointmentDateTime(item.date, item.endTime) < now;
  }).length;

  return {
    totalPatients: state.patients.length,
    totalInvoices: state.invoices.length,
    totalAppointments: state.appointments.length,
    monthlyRevenue,
    appointmentsToday,
    overdueAppointments
  };
}

async function downloadWithAuth(url, filename) {
  const headers = {};
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const response = await fetch(url, { headers });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "No se pudo exportar." }));
    throw new Error(error.message || "No se pudo exportar.");
  }

  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(blobUrl);
}

function setAuthState(isLoggedIn) {
  loginView.classList.toggle("hidden", isLoggedIn);
  appView.classList.toggle("hidden", !isLoggedIn);
}

function saveToken(token) {
  state.token = token;
  localStorage.setItem("dentalflow_token", token);
}

function clearToken() {
  state.token = "";
  localStorage.removeItem("dentalflow_token");
}

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json" };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;

  const response = await fetch(path, { headers, ...options });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Error inesperado" }));
    throw new Error(error.message || "Error inesperado");
  }

  if (response.status === 204) return null;
  return response.json();
}

function goView(viewName) {
  document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
  const target = document.getElementById(`view-${viewName}`);
  if (target) target.classList.add("active");

  navButtons.forEach((button) => button.classList.toggle("active", button.dataset.view === viewName));

  const cfg = viewConfig[viewName];
  if (cfg) {
    viewTitle.textContent = cfg.title;
    viewSubtitle.textContent = cfg.subtitle;
  }

  if (viewName === "reports") {
    loadReports().catch((error) => showToast(error.message, true));
  }

  if (viewName === "audit") {
    loadAuditLogs().catch((error) => showToast(error.message, true));
  }
}

function renderProfile() {
  if (!state.user) return;
  sessionUserTag.textContent = `${state.user.fullName} (${state.user.role})`;

  profileSummary.innerHTML = `
    <div class="summary-item"><span>Nombre</span><strong>${state.user.fullName}</strong></div>
    <div class="summary-item"><span>Usuario</span><strong>${state.user.username}</strong></div>
    <div class="summary-item"><span>Rol</span><strong>${state.user.role}</strong></div>
    <div class="summary-item"><span>Estado</span><strong>${state.user.isActive ? "Activo" : "Inactivo"}</strong></div>
    <div class="summary-item"><span>Creado</span><strong>${formatDate(state.user.createdAt)}</strong></div>
    <div class="summary-item"><span>Actualizado</span><strong>${formatDate(state.user.updatedAt)}</strong></div>
  `;
}

function renderHomeDashboard() {
  const summary = buildHomeSummary();
  dashboardKpis.innerHTML = `
    <div class="report-card"><span>Pacientes</span><strong>${summary.totalPatients}</strong></div>
    <div class="report-card"><span>Facturas</span><strong>${summary.totalInvoices}</strong></div>
    <div class="report-card"><span>Citas</span><strong>${summary.totalAppointments}</strong></div>
    <div class="report-card"><span>Citas hoy</span><strong>${summary.appointmentsToday}</strong></div>
    <div class="report-card"><span>Ingresos del mes</span><strong>${money(summary.monthlyRevenue)}</strong></div>
    <div class="report-card"><span>Citas atrasadas</span><strong>${summary.overdueAppointments}</strong></div>
  `;
}

function renderAlerts() {
  const now = new Date();
  const todayKey = now.toISOString().slice(0, 10);
  const todayCount = state.appointments.filter((item) => item.date === todayKey).length;
  const overdue = state.appointments.filter((item) => {
    const status = String(item.status || "pendiente");
    if (status === "atendida" || status === "cancelada") return false;
    return appointmentDateTime(item.date, item.endTime) < now;
  });

  alertsList.innerHTML = "";

  const rowToday = document.createElement("div");
  rowToday.className = "list-summary-item";
  rowToday.innerHTML = `<span>Citas para hoy</span><strong>${todayCount}</strong>`;
  alertsList.appendChild(rowToday);

  const rowOverdue = document.createElement("div");
  rowOverdue.className = "list-summary-item";
  rowOverdue.innerHTML = `<span>Citas atrasadas (pendiente/confirmada)</span><strong>${overdue.length}</strong>`;
  alertsList.appendChild(rowOverdue);

  if (overdue.length) {
    overdue.slice(0, 3).forEach((item) => {
      const row = document.createElement("div");
      row.className = "list-summary-item";
      row.innerHTML = `<span>${item.patientName} (${item.date} ${item.startTime})</span><strong>${statusLabel(item.status)}</strong>`;
      alertsList.appendChild(row);
    });
  }
}

function renderUpcomingAppointments() {
  const now = new Date();
  const upcoming = state.appointments
    .filter((item) => appointmentDateTime(item.date, item.endTime) >= now)
    .sort((a, b) => appointmentDateTime(a.date, a.startTime) - appointmentDateTime(b.date, b.startTime))
    .slice(0, 5);

  dashboardUpcomingTable.innerHTML = "";
  if (!upcoming.length) {
    dashboardUpcomingTable.innerHTML = "<tr><td colspan='4'>Sin citas proximas.</td></tr>";
    return;
  }

  upcoming.forEach((appt) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${appt.date}</td>
      <td>${appt.startTime} - ${appt.endTime}</td>
      <td>${appt.patientName}</td>
      <td>${appt.title}</td>
    `;
    dashboardUpcomingTable.appendChild(row);
  });
}

function renderPatientOptions() {
  patientSelect.innerHTML = "";
  appointmentPatientSelect.innerHTML = "";

  const defaultInvoiceOption = document.createElement("option");
  defaultInvoiceOption.value = "";
  defaultInvoiceOption.textContent = state.patients.length ? "Selecciona un paciente" : "No hay pacientes";
  patientSelect.appendChild(defaultInvoiceOption);

  const defaultAppointmentOption = document.createElement("option");
  defaultAppointmentOption.value = "";
  defaultAppointmentOption.textContent = "Sin seleccionar";
  appointmentPatientSelect.appendChild(defaultAppointmentOption);

  state.patients.forEach((patient) => {
    const option = document.createElement("option");
    option.value = patient.id;
    option.textContent = `${patient.fullName} (${patient.dui})`;
    patientSelect.appendChild(option.cloneNode(true));
    appointmentPatientSelect.appendChild(option);
  });
}

function renderPatients() {
  patientsTable.innerHTML = "";
  if (!state.patients.length) {
    patientsTable.innerHTML = "<tr><td colspan='5'>No hay pacientes registrados.</td></tr>";
    return;
  }

  state.patients.forEach((patient) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${patient.fullName}</td>
      <td>${patient.dui}</td>
      <td>${patient.phone}</td>
      <td>${formatDate(patient.updatedAt)}</td>
      <td>
        <button class="secondary" data-action="edit" data-id="${patient.id}">Editar</button>
        <button class="danger" data-action="delete" data-id="${patient.id}">Eliminar</button>
      </td>
    `;
    patientsTable.appendChild(row);
  });
}

function renderInvoices() {
  invoicesTable.innerHTML = "";
  if (!state.invoices.length) {
    invoicesTable.innerHTML = "<tr><td colspan='6'>No hay facturas emitidas.</td></tr>";
    return;
  }

  state.invoices.forEach((invoice) => {
    const row = document.createElement("tr");
    const deleteAction =
      state.user && state.user.role === "admin"
        ? `<button class="danger" data-action="delete-invoice" data-id="${invoice.id}">Eliminar</button>`
        : "<span class='muted'>Solo admin</span>";
    row.innerHTML = `
      <td>${invoice.controlNumber}</td>
      <td>${invoice.patientName}</td>
      <td>${invoice.serviceDescription}</td>
      <td>${money(invoice.total)}</td>
      <td>${invoice.status}</td>
      <td>${deleteAction}</td>
    `;
    invoicesTable.appendChild(row);
  });
}

function renderUsers() {
  usersTable.innerHTML = "";
  if (!state.users.length) {
    usersTable.innerHTML = "<tr><td colspan='5'>No hay usuarios registrados.</td></tr>";
    return;
  }

  state.users.forEach((user) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${user.fullName}</td>
      <td>${user.username}</td>
      <td>${user.role}</td>
      <td>${user.isActive ? "Activo" : "Inactivo"}</td>
      <td>
        <button class="secondary" data-action="toggle-role" data-id="${user.id}">${user.role === "admin" ? "Hacer Odontologo" : "Hacer Admin"}</button>
        <button class="secondary" data-action="toggle-active" data-id="${user.id}">${user.isActive ? "Desactivar" : "Activar"}</button>
        <button class="danger" data-action="delete-user" data-id="${user.id}">Eliminar</button>
      </td>
    `;
    usersTable.appendChild(row);
  });
}

function renderCalendar() {
  const year = state.calendarMonth.getFullYear();
  const month = state.calendarMonth.getMonth();
  calendarTitle.textContent = state.calendarMonth.toLocaleDateString("es-SV", { month: "long", year: "numeric" });

  const appointmentCountByDate = {};
  state.appointments.forEach((a) => {
    appointmentCountByDate[a.date] = (appointmentCountByDate[a.date] || 0) + 1;
  });

  const firstDay = new Date(year, month, 1);
  const startWeekDay = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysPrevMonth = new Date(year, month, 0).getDate();

  calendarGrid.innerHTML = "";
  ["L", "M", "M", "J", "V", "S", "D"].forEach((d) => {
    const header = document.createElement("div");
    header.className = "cal-cell outside";
    header.innerHTML = `<strong>${d}</strong>`;
    calendarGrid.appendChild(header);
  });

  for (let i = 0; i < startWeekDay; i += 1) {
    const day = daysPrevMonth - startWeekDay + i + 1;
    const cell = document.createElement("div");
    cell.className = "cal-cell outside";
    cell.innerHTML = `<strong>${day}</strong>`;
    calendarGrid.appendChild(cell);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const count = appointmentCountByDate[dateStr] || 0;

    const cell = document.createElement("div");
    cell.className = "cal-cell";
    if (dateStr === state.selectedDate) cell.classList.add("selected");

    cell.innerHTML = `<strong>${day}</strong><span class="cal-count">${count ? `${count} cita(s)` : "-"}</span>`;
    cell.addEventListener("click", () => {
      state.selectedDate = dateStr;
      renderCalendar();
      renderAppointments();
    });

    calendarGrid.appendChild(cell);
  }
}

function renderAppointments() {
  const list = state.appointments
    .filter((item) => item.date === state.selectedDate)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  selectedDateLabel.textContent = state.selectedDate;
  appointmentsTable.innerHTML = "";

  if (!list.length) {
    appointmentsTable.innerHTML = "<tr><td colspan='7'>No hay citas para la fecha seleccionada.</td></tr>";
    return;
  }

  list.forEach((appt) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${appt.date}</td>
      <td>${appt.startTime} - ${appt.endTime}</td>
      <td>${appt.patientName}</td>
      <td>${appt.title}</td>
      <td><span class="status-pill status-${appt.status || "pendiente"}">${statusLabel(appt.status)}</span></td>
      <td>${appt.reminderMinutes || 0} min</td>
      <td>
        <button class="secondary" data-action="edit-appointment" data-id="${appt.id}">Editar</button>
        <button class="danger" data-action="delete-appointment" data-id="${appt.id}">Eliminar</button>
      </td>
    `;
    appointmentsTable.appendChild(row);
  });
}

function renderReports(data) {
  reportsCards.innerHTML = `
    <div class="report-card"><span>Ingresos del mes</span><strong>${money(data.monthlyRevenue)}</strong></div>
    <div class="report-card"><span>Citas hoy</span><strong>${data.appointmentsToday}</strong></div>
  `;

  if (reportPaymentMethods) {
    reportPaymentMethods.innerHTML = "";
    Object.entries(data.paymentMethodTotals || {}).forEach(([key, value]) => {
      const row = document.createElement("div");
      row.className = "list-summary-item";
      row.innerHTML = `<span>${key}</span><strong>${money(value)}</strong>`;
      reportPaymentMethods.appendChild(row);
    });
  }

  reportByUser.innerHTML = "";
  Object.entries(data.byOdontologo || {}).forEach(([key, value]) => {
    const row = document.createElement("div");
    row.className = "list-summary-item clickable";
    row.dataset.reportKind = "user";
    row.dataset.reportKey = key;
    row.innerHTML = `<span>${key}</span><strong>${money(value)}</strong>`;
    reportByUser.appendChild(row);
  });

  if (!Object.keys(data.byOdontologo || {}).length) {
    reportByUser.innerHTML = "<div class='list-summary-item'><span>Sin datos</span><strong>$0.00</strong></div>";
  }

  if (reportPaymentMethods && !Object.keys(data.paymentMethodTotals || {}).length) {
    reportPaymentMethods.innerHTML = "<div class='list-summary-item'><span>Sin datos</span><strong>$0.00</strong></div>";
  }

  reportAppointmentStatus.innerHTML = "";
  Object.entries(data.appointmentStatusTotals || {}).forEach(([key, value]) => {
    const row = document.createElement("div");
    row.className = "list-summary-item clickable";
    row.dataset.reportKind = "status";
    row.dataset.reportKey = key;
    row.innerHTML = `<span>${statusLabel(key)}</span><strong>${value}</strong>`;
    reportAppointmentStatus.appendChild(row);
  });
  if (!Object.keys(data.appointmentStatusTotals || {}).length) {
    reportAppointmentStatus.innerHTML = "<div class='list-summary-item'><span>Sin datos</span><strong>0</strong></div>";
  }
}

function renderReportDetail(kind, key) {
  state.reportDetailContext = { kind, key };
  reportDetailTable.innerHTML = "";

  if (kind === "user") {
    reportDetailTitle.textContent = `Detalle de facturas de ${key}`;
    reportCol1.textContent = "No. Control";
    reportCol2.textContent = "Paciente";
    reportCol3.textContent = "Servicio";
    reportCol4.textContent = "Total";
    reportOpenModule.classList.remove("hidden");
    reportOpenModule.dataset.go = "billing-list";
    reportOpenModule.textContent = "Ir a Facturacion";

    const rows = state.invoices.filter((invoice) => invoice.createdBy === key);
    if (!rows.length) {
      reportDetailTable.innerHTML = "<tr><td colspan='4'>No hay facturas para este usuario.</td></tr>";
      return;
    }

    rows.forEach((invoice) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${invoice.controlNumber}</td>
        <td>${invoice.patientName}</td>
        <td>${invoice.serviceDescription}</td>
        <td>${money(invoice.total)}</td>
      `;
      reportDetailTable.appendChild(tr);
    });
    return;
  }

  if (kind === "status") {
    reportDetailTitle.textContent = `Detalle de citas en estado ${statusLabel(key)}`;
    reportCol1.textContent = "Fecha";
    reportCol2.textContent = "Hora";
    reportCol3.textContent = "Paciente";
    reportCol4.textContent = "Motivo";
    reportOpenModule.classList.remove("hidden");
    reportOpenModule.dataset.go = "appointments-list";
    reportOpenModule.textContent = "Ir a Agenda";

    const rows = state.appointments.filter((appt) => (appt.status || "pendiente") === key);
    if (!rows.length) {
      reportDetailTable.innerHTML = "<tr><td colspan='4'>No hay citas para este estado.</td></tr>";
      return;
    }

    rows.forEach((appt) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${appt.date}</td>
        <td>${appt.startTime} - ${appt.endTime}</td>
        <td>${appt.patientName}</td>
        <td>${appt.title}</td>
      `;
      reportDetailTable.appendChild(tr);
    });
    return;
  }

  reportDetailTitle.textContent = "Detalle Interactivo";
  reportOpenModule.classList.add("hidden");
  reportDetailTable.innerHTML = "<tr><td colspan='4'>Selecciona un usuario o estado para ver detalle.</td></tr>";
}

function renderAuditLogs() {
  auditTable.innerHTML = "";
  if (!state.auditLogs.length) {
    auditTable.innerHTML = "<tr><td colspan='5'>No hay eventos en bitacora.</td></tr>";
    return;
  }

  state.auditLogs.forEach((log) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${formatDate(log.timestamp)}</td>
      <td>${log.actorUsername} (${log.actorRole})</td>
      <td>${log.action}</td>
      <td>${log.entityType}</td>
      <td>${log.description || "-"}</td>
    `;
    auditTable.appendChild(row);
  });
}

function buildSearchItems(query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const items = [];

  state.patients.forEach((patient) => {
    const hay = `${patient.fullName} ${patient.dui} ${patient.phone}`.toLowerCase();
    if (hay.includes(q)) {
      items.push({
        type: "Paciente",
        title: patient.fullName,
        subtitle: `DUI ${patient.dui} | Tel ${patient.phone}`,
        go: "patients-list"
      });
    }
  });

  state.invoices.forEach((invoice) => {
    const hay = `${invoice.controlNumber} ${invoice.patientName} ${invoice.serviceDescription}`.toLowerCase();
    if (hay.includes(q)) {
      items.push({
        type: "Factura",
        title: invoice.controlNumber,
        subtitle: `${invoice.patientName} | ${invoice.serviceDescription}`,
        go: "billing-list"
      });
    }
  });

  state.appointments.forEach((appt) => {
    const hay = `${appt.patientName} ${appt.title} ${appt.date} ${appt.status || ""}`.toLowerCase();
    if (hay.includes(q)) {
      items.push({
        type: "Cita",
        title: `${appt.patientName} (${appt.date} ${appt.startTime})`,
        subtitle: `${appt.title} | ${statusLabel(appt.status)}`,
        go: "appointments-list",
        selectedDate: appt.date
      });
    }
  });

  return items.slice(0, 18);
}

function hideSearchResults() {
  globalSearchResults.classList.add("hidden");
  globalSearchResults.innerHTML = "";
}

function renderSearchResults(query) {
  const items = buildSearchItems(query);
  if (!items.length) {
    globalSearchResults.innerHTML = "<div class='search-item'><strong>Sin resultados</strong><small>Prueba con otro término</small></div>";
    globalSearchResults.classList.remove("hidden");
    return;
  }

  globalSearchResults.innerHTML = "";
  items.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "search-item";
    button.innerHTML = `<strong>${item.type}: ${item.title}</strong><small>${item.subtitle}</small>`;
    button.addEventListener("click", () => {
      if (item.selectedDate) state.selectedDate = item.selectedDate;
      goView(item.go);
      renderCalendar();
      renderAppointments();
      globalSearchInput.value = "";
      hideSearchResults();
    });
    globalSearchResults.appendChild(button);
  });

  globalSearchResults.classList.remove("hidden");
}

function resetPatientForm() {
  patientForm.reset();
  document.getElementById("patient-id").value = "";
  patientFormTitle.textContent = "Nuevo Expediente";
}

function fillPatientForm(patient) {
  document.getElementById("patient-id").value = patient.id;
  document.getElementById("fullName").value = patient.fullName;
  document.getElementById("dui").value = patient.dui;
  document.getElementById("nit").value = patient.nit || "";
  document.getElementById("birthDate").value = patient.birthDate || "";
  document.getElementById("phone").value = patient.phone;
  document.getElementById("email").value = patient.email || "";
  document.getElementById("address").value = patient.address || "";
  document.getElementById("allergies").value = patient.allergies || "";
  document.getElementById("medicalHistory").value = patient.medicalHistory || "";
  document.getElementById("odontologicalNotes").value = patient.odontologicalNotes || "";
  patientFormTitle.textContent = "Editar Expediente";
}

function resetAppointmentForm() {
  appointmentForm.reset();
  document.getElementById("appointment-id").value = "";
  document.getElementById("appointment-status").value = "pendiente";
  document.getElementById("appointment-reminderMinutes").value = 30;
  appointmentFormTitle.textContent = "Nueva Cita";
}

function fillAppointmentForm(appt) {
  document.getElementById("appointment-id").value = appt.id;
  document.getElementById("appointment-date").value = appt.date;
  document.getElementById("appointment-patientId").value = appt.patientId || "";
  document.getElementById("appointment-patientName").value = appt.patientName;
  document.getElementById("appointment-startTime").value = appt.startTime;
  document.getElementById("appointment-endTime").value = appt.endTime;
  document.getElementById("appointment-title").value = appt.title;
  document.getElementById("appointment-status").value = appt.status || "pendiente";
  document.getElementById("appointment-reminderMinutes").value = appt.reminderMinutes || 0;
  document.getElementById("appointment-reminderMessage").value = appt.reminderMessage || "";
  document.getElementById("appointment-notes").value = appt.notes || "";
  appointmentFormTitle.textContent = "Editar Cita";
}

function validateDelete() {
  const ready = deleteCheck.checked && deleteText.value.trim().toUpperCase() === "ELIMINAR";
  confirmDeleteButton.disabled = !ready;
}

async function loadDomainData() {
  const [patients, invoices, appointments] = await Promise.all([
    api("/api/patients"),
    api("/api/invoices"),
    api("/api/appointments")
  ]);

  state.patients = patients;
  state.invoices = invoices;
  state.appointments = appointments;

  renderPatientOptions();
  renderPatients();
  renderInvoices();
  renderCalendar();
  renderAppointments();
  renderHomeDashboard();
  renderAlerts();
  renderUpcomingAppointments();

  if (state.user.role === "admin") {
    state.users = await api("/api/users");
    renderUsers();
  }
}

async function loadReports() {
  const data = await api("/api/reports/summary");
  renderReports(data);
  if (state.reportDetailContext) {
    renderReportDetail(state.reportDetailContext.kind, state.reportDetailContext.key);
  } else {
    renderReportDetail("none", "");
  }
}

async function loadAuditLogs() {
  if (!state.user || state.user.role !== "admin") return;
  const logs = await api("/api/audit-logs?limit=250");
  state.auditLogs = logs;
  renderAuditLogs();
}

function configureRoleUi() {
  const isAdmin = state.user && state.user.role === "admin";
  adminUsersBtn.classList.toggle("hidden", !isAdmin);
  adminAuditBtn.classList.toggle("hidden", !isAdmin);
  document.getElementById("view-users-list").classList.toggle("hidden", !isAdmin);
  document.getElementById("view-users-form").classList.toggle("hidden", !isAdmin);
  document.getElementById("view-audit").classList.toggle("hidden", !isAdmin);

  if (!isAdmin && document.getElementById("view-audit").classList.contains("active")) {
    goView("profile");
  }
}

async function bootstrapSession() {
  if (!state.token) {
    setAuthState(false);
    return;
  }

  try {
    state.user = await api("/api/auth/me");
    configureRoleUi();
    renderProfile();
    await loadDomainData();
    setAuthState(true);
    goView("appointments-list");
  } catch (_error) {
    clearToken();
    state.user = null;
    setAuthState(false);
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const username = document.getElementById("login-username").value;
  const password = document.getElementById("login-password").value;

  try {
    const result = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password })
    });

    saveToken(result.token);
    state.user = result.user;
    configureRoleUi();
    renderProfile();
    await loadDomainData();
    setAuthState(true);
    goView("appointments-list");
    loginForm.reset();
    showToast(`Bienvenido, ${state.user.fullName}`);
  } catch (error) {
    showToast(error.message, true);
  }
});

logoutButton.addEventListener("click", async () => {
  try { await api("/api/auth/logout", { method: "POST" }); } catch (_error) {}
  clearToken();
  state.user = null;
  setAuthState(false);
  showToast("Sesion cerrada");
});

passwordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const currentPassword = document.getElementById("current-password").value;
  const newPassword = document.getElementById("new-password").value;

  try {
    await api("/api/auth/me/password", {
      method: "PUT",
      body: JSON.stringify({ currentPassword, newPassword })
    });
    passwordForm.reset();
    showToast("Contrasena actualizada");
  } catch (error) {
    showToast(error.message, true);
  }
});

navButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const targetView = button.dataset.view;
    if ((targetView.startsWith("users") || targetView === "audit") && (!state.user || state.user.role !== "admin")) return;
    goView(targetView);
  });
});

openProfileButton.addEventListener("click", () => {
  goView("profile");
});

document.querySelectorAll("[data-go-view]").forEach((button) => {
  button.addEventListener("click", () => {
    const targetView = button.getAttribute("data-go-view");
    if (targetView && viewConfig[targetView]) goView(targetView);
  });
});

document.getElementById("open-patient-form").addEventListener("click", () => {
  resetPatientForm();
  goView("patients-form");
});

document.getElementById("back-patients-list").addEventListener("click", () => {
  goView("patients-list");
});

patientForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const id = document.getElementById("patient-id").value;

  const payload = {
    fullName: document.getElementById("fullName").value,
    dui: document.getElementById("dui").value,
    nit: document.getElementById("nit").value,
    birthDate: document.getElementById("birthDate").value,
    phone: document.getElementById("phone").value,
    email: document.getElementById("email").value,
    address: document.getElementById("address").value,
    allergies: document.getElementById("allergies").value,
    medicalHistory: document.getElementById("medicalHistory").value,
    odontologicalNotes: document.getElementById("odontologicalNotes").value
  };

  try {
    if (id) {
      await api(`/api/patients/${id}`, { method: "PUT", body: JSON.stringify(payload) });
      showToast("Expediente actualizado");
    } else {
      await api("/api/patients", { method: "POST", body: JSON.stringify(payload) });
      showToast("Expediente creado");
    }

    resetPatientForm();
    await loadDomainData();
    goView("patients-list");
  } catch (error) {
    showToast(error.message, true);
  }
});

patientsTable.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;

  const action = button.dataset.action;
  const id = button.dataset.id;
  const patient = state.patients.find((item) => item.id === id);
  if (!patient) return;

  if (action === "edit") {
    fillPatientForm(patient);
    goView("patients-form");
  }

  if (action === "delete") {
    state.patientToDelete = id;
    deleteCheck.checked = false;
    deleteText.value = "";
    confirmDeleteButton.disabled = true;
    deleteDialog.showModal();
  }
});

deleteCheck.addEventListener("change", validateDelete);
deleteText.addEventListener("input", validateDelete);
cancelDeleteButton.addEventListener("click", () => deleteDialog.close());

deleteForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.patientToDelete) return;

  try {
    await api(`/api/patients/${state.patientToDelete}`, {
      method: "DELETE",
      body: JSON.stringify({ verificationText: deleteText.value })
    });
    state.patientToDelete = null;
    deleteDialog.close();
    await loadDomainData();
    showToast("Paciente eliminado");
  } catch (error) {
    showToast(error.message, true);
  }
});

document.getElementById("open-invoice-form").addEventListener("click", () => {
  invoiceForm.reset();
  document.getElementById("businessName").value = "Clinica Dental SV";
  goView("billing-form");
});

document.getElementById("back-billing-list").addEventListener("click", () => goView("billing-list"));

invoiceForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!patientSelect.value) {
    showToast("Selecciona un paciente", true);
    return;
  }

  const payload = {
    dteType: document.getElementById("dteType").value,
    patientId: patientSelect.value,
    paymentMethod: document.getElementById("paymentMethod").value,
    quantity: document.getElementById("quantity").value,
    unitPrice: document.getElementById("unitPrice").value,
    serviceDescription: document.getElementById("serviceDescription").value,
    businessName: document.getElementById("businessName").value,
    businessNit: document.getElementById("businessNit").value,
    businessNrc: document.getElementById("businessNrc").value,
    businessAddress: document.getElementById("businessAddress").value,
    notes: document.getElementById("notes").value
  };

  try {
    const invoice = await api("/api/invoices", { method: "POST", body: JSON.stringify(payload) });
    await loadDomainData();
    goView("billing-list");
    showToast(`Factura guardada: ${invoice.controlNumber}`);
  } catch (error) {
    showToast(error.message, true);
  }
});

invoicesTable.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action='delete-invoice']");
  if (!button) return;

  if (!window.confirm("Eliminar esta factura?")) return;

  try {
    await api(`/api/invoices/${button.dataset.id}`, { method: "DELETE" });
    await loadDomainData();
    showToast("Factura eliminada");
  } catch (error) {
    showToast(error.message, true);
  }
});

if (document.getElementById("open-user-form")) {
  document.getElementById("open-user-form").addEventListener("click", () => {
    userForm.reset();
    goView("users-form");
  });

  document.getElementById("back-users-list").addEventListener("click", () => goView("users-list"));
}

userForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = {
    fullName: document.getElementById("user-fullName").value,
    username: document.getElementById("user-username").value,
    password: document.getElementById("user-password").value,
    role: document.getElementById("user-role").value
  };

  try {
    await api("/api/users", { method: "POST", body: JSON.stringify(payload) });
    userForm.reset();
    state.users = await api("/api/users");
    renderUsers();
    goView("users-list");
    showToast("Usuario creado");
  } catch (error) {
    showToast(error.message, true);
  }
});

usersTable.addEventListener("click", async (event) => {
  const button = event.target.closest("button");
  if (!button) return;

  const action = button.dataset.action;
  const user = state.users.find((item) => item.id === button.dataset.id);
  if (!user) return;

  try {
    if (action === "toggle-role") {
      await api(`/api/users/${user.id}`, {
        method: "PUT",
        body: JSON.stringify({ fullName: user.fullName, role: user.role === "admin" ? "odontologo" : "admin", isActive: user.isActive })
      });
      showToast("Rol actualizado");
    }

    if (action === "toggle-active") {
      await api(`/api/users/${user.id}`, {
        method: "PUT",
        body: JSON.stringify({ fullName: user.fullName, role: user.role, isActive: !user.isActive })
      });
      showToast("Estado actualizado");
    }

    if (action === "delete-user") {
      if (!window.confirm(`Eliminar cuenta ${user.username}?`)) return;
      await api(`/api/users/${user.id}`, { method: "DELETE" });
      showToast("Usuario eliminado");
    }

    state.users = await api("/api/users");
    renderUsers();
  } catch (error) {
    showToast(error.message, true);
  }
});

document.getElementById("calendar-prev").addEventListener("click", () => {
  state.calendarMonth = new Date(state.calendarMonth.getFullYear(), state.calendarMonth.getMonth() - 1, 1);
  renderCalendar();
});

document.getElementById("calendar-next").addEventListener("click", () => {
  state.calendarMonth = new Date(state.calendarMonth.getFullYear(), state.calendarMonth.getMonth() + 1, 1);
  renderCalendar();
});

document.getElementById("open-appointment-form").addEventListener("click", () => {
  resetAppointmentForm();
  document.getElementById("appointment-date").value = state.selectedDate;
  goView("appointments-form");
});

document.getElementById("back-appointments-list").addEventListener("click", () => goView("appointments-list"));

appointmentPatientSelect.addEventListener("change", () => {
  const id = appointmentPatientSelect.value;
  if (!id) return;
  const patient = state.patients.find((item) => item.id === id);
  if (patient) appointmentPatientName.value = patient.fullName;
});

appointmentForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const id = document.getElementById("appointment-id").value;

  const payload = {
    date: document.getElementById("appointment-date").value,
    patientId: appointmentPatientSelect.value,
    patientName: appointmentPatientName.value,
    startTime: document.getElementById("appointment-startTime").value,
    endTime: document.getElementById("appointment-endTime").value,
    title: document.getElementById("appointment-title").value,
    status: document.getElementById("appointment-status").value,
    reminderMinutes: document.getElementById("appointment-reminderMinutes").value,
    reminderMessage: document.getElementById("appointment-reminderMessage").value,
    notes: document.getElementById("appointment-notes").value
  };

  try {
    if (id) {
      await api(`/api/appointments/${id}`, { method: "PUT", body: JSON.stringify(payload) });
      showToast("Cita actualizada");
    } else {
      await api("/api/appointments", { method: "POST", body: JSON.stringify(payload) });
      showToast("Cita guardada");
    }

    state.selectedDate = payload.date;
    state.calendarMonth = new Date(payload.date + "T00:00:00");
    state.calendarMonth = new Date(state.calendarMonth.getFullYear(), state.calendarMonth.getMonth(), 1);
    resetAppointmentForm();
    await loadDomainData();
    goView("appointments-list");
  } catch (error) {
    showToast(error.message, true);
  }
});

appointmentsTable.addEventListener("click", async (event) => {
  const button = event.target.closest("button");
  if (!button) return;

  const action = button.dataset.action;
  const appointment = state.appointments.find((item) => item.id === button.dataset.id);
  if (!appointment) return;

  if (action === "edit-appointment") {
    fillAppointmentForm(appointment);
    goView("appointments-form");
    return;
  }

  if (action === "delete-appointment") {
    if (!window.confirm("Eliminar esta cita?")) return;
    try {
      await api(`/api/appointments/${appointment.id}`, { method: "DELETE" });
      await loadDomainData();
      showToast("Cita eliminada");
    } catch (error) {
      showToast(error.message, true);
    }
  }
});

document.getElementById("refresh-reports").addEventListener("click", async () => {
  try {
    await loadReports();
    showToast("Reportes actualizados");
  } catch (error) {
    showToast(error.message, true);
  }
});

reportByUser.addEventListener("click", (event) => {
  const target = event.target.closest("[data-report-kind='user']");
  if (!target) return;
  renderReportDetail("user", target.dataset.reportKey || "");
});

reportAppointmentStatus.addEventListener("click", (event) => {
  const target = event.target.closest("[data-report-kind='status']");
  if (!target) return;
  renderReportDetail("status", target.dataset.reportKey || "");
});

reportOpenModule.addEventListener("click", () => {
  const go = reportOpenModule.dataset.go;
  if (go && viewConfig[go]) goView(go);
});

if (toggleReportsAdvancedButton) {
  toggleReportsAdvancedButton.addEventListener("click", () => {
    const isHidden = reportsAdvanced.classList.contains("hidden");
    reportsAdvanced.classList.toggle("hidden", !isHidden);
    toggleReportsAdvancedButton.textContent = isHidden ? "Ver menos" : "Ver mas";
  });
}

globalSearchInput.addEventListener("input", () => {
  const query = globalSearchInput.value.trim();
  if (!query) {
    hideSearchResults();
    return;
  }
  renderSearchResults(query);
});

globalSearchInput.addEventListener("focus", () => {
  const query = globalSearchInput.value.trim();
  if (query) renderSearchResults(query);
});

document.addEventListener("click", (event) => {
  if (!globalSearchResults.contains(event.target) && event.target !== globalSearchInput) {
    hideSearchResults();
  }
});

document.getElementById("export-report-csv").addEventListener("click", async () => {
  try {
    const date = new Date().toISOString().slice(0, 10);
    await downloadWithAuth("/api/reports/export.csv", `reporte-clinica-${date}.csv`);
    showToast("Reporte CSV descargado");
  } catch (error) {
    showToast(error.message, true);
  }
});

document.getElementById("export-report-pdf").addEventListener("click", async () => {
  try {
    const date = new Date().toISOString().slice(0, 10);
    await downloadWithAuth("/api/reports/export.pdf", `reporte-clinica-${date}.pdf`);
    showToast("Reporte PDF descargado");
  } catch (error) {
    showToast(error.message, true);
  }
});

document.getElementById("refresh-audit").addEventListener("click", async () => {
  try {
    await loadAuditLogs();
    showToast("Bitacora actualizada");
  } catch (error) {
    showToast(error.message, true);
  }
});

if (exportAuditCsvButton) {
  exportAuditCsvButton.addEventListener("click", async () => {
    try {
      const date = new Date().toISOString().slice(0, 10);
      await downloadWithAuth("/api/audit-logs/export.csv", `bitacora-${date}.csv`);
      showToast("Bitacora CSV descargada");
    } catch (error) {
      showToast(error.message, true);
    }
  });
}

bootstrapSession();
