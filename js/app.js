/* =========================================================
   CUADERNO — planificador de tareas
   Capa de datos separada del render para poder cambiar
   localStorage por una API real más adelante sin tocar la UI.
   ========================================================= */

const STORAGE_KEY = "cuaderno.tasks.v1";

const Store = {
  async list() {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  },
  async save(tasks) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    return tasks;
  },
  async create(task) {
    const tasks = await this.list();
    task.id = crypto.randomUUID();
    task.done = false;
    task.createdAt = new Date().toISOString();
    tasks.push(task);
    await this.save(tasks);
    return task;
  },
  async update(id, patch) {
    const tasks = await this.list();
    const idx = tasks.findIndex(t => t.id === id);
    if (idx === -1) return null;
    tasks[idx] = { ...tasks[idx], ...patch };
    await this.save(tasks);
    return tasks[idx];
  },
  async remove(id) {
    const tasks = await this.list();
    await this.save(tasks.filter(t => t.id !== id));
  },
};

/* --------------------- estado UI --------------------- */
let currentView = "today";
let allTasks = [];

const todayISO = () => new Date().toISOString().slice(0, 10);

/* --------------------- referencias --------------------- */
const el = {
  headDate: document.getElementById("headDate"),
  headSubtitle: document.getElementById("headSubtitle"),
  taskList: document.getElementById("taskList"),
  emptyState: document.getElementById("emptyState"),
  viewTabs: document.getElementById("viewTabs"),
  ringFill: document.getElementById("ringFill"),
  progressPercent: document.getElementById("progressPercent"),

  btnAddTask: document.getElementById("btnAddTask"),
  panel: document.getElementById("taskPanel"),
  overlay: document.getElementById("panelOverlay"),
  panelClose: document.getElementById("panelClose"),
  panelTitle: document.getElementById("panelTitle"),
  form: document.getElementById("taskForm"),

  taskId: document.getElementById("taskId"),
  taskText: document.getElementById("taskText"),
  taskDate: document.getElementById("taskDate"),
  taskTime: document.getElementById("taskTime"),
  taskNotes: document.getElementById("taskNotes"),
  priorityPicker: document.getElementById("priorityPicker"),
  btnDeleteTask: document.getElementById("btnDeleteTask"),

  countToday: document.getElementById("countToday"),
  countUpcoming: document.getElementById("countUpcoming"),
  countAll: document.getElementById("countAll"),
  countDone: document.getElementById("countDone"),
};

let selectedPriority = "medium";

/* --------------------- fecha en cabecera --------------------- */
function renderHeaderDate() {
  const now = new Date();
  const formatted = now.toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  el.headDate.textContent = formatted.charAt(0).toUpperCase() + formatted.slice(1);

  const hour = now.getHours();
  el.headSubtitle.textContent =
    hour < 12 ? "Buenos días" : hour < 19 ? "Buenas tardes" : "Buenas noches";
}

/* --------------------- filtrado por vista --------------------- */
function filterTasks(tasks) {
  const today = todayISO();
  switch (currentView) {
    case "today":
      return tasks.filter(t => t.date === today && !t.done);
    case "upcoming":
      return tasks.filter(t => t.date > today && !t.done);
    case "done":
      return tasks.filter(t => t.done);
    case "all":
    default:
      return tasks.filter(t => !t.done);
  }
}

function updateCounts(tasks) {
  const today = todayISO();
  el.countToday.textContent = tasks.filter(t => t.date === today && !t.done).length;
  el.countUpcoming.textContent = tasks.filter(t => t.date > today && !t.done).length;
  el.countAll.textContent = tasks.filter(t => !t.done).length;
  el.countDone.textContent = tasks.filter(t => t.done).length;

  const todays = tasks.filter(t => t.date === today);
  const doneToday = todays.filter(t => t.done).length;
  const pct = todays.length ? Math.round((doneToday / todays.length) * 100) : 0;
  const circumference = 169.6;
  el.ringFill.style.strokeDashoffset = circumference - (circumference * pct) / 100;
  el.progressPercent.textContent = `${pct}%`;
}

/* --------------------- render de la lista --------------------- */
function formatTime(t) {
  if (!t) return "";
  const [h, m] = t.split(":");
  return `${h}:${m}`;
}

function renderList() {
  const visible = filterTasks(allTasks).sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return (a.time || "99:99").localeCompare(b.time || "99:99");
  });

  el.taskList.innerHTML = "";

  if (visible.length === 0) {
    el.emptyState.classList.remove("d-none");
    updateCounts(allTasks);
    return;
  }
  el.emptyState.classList.add("d-none");

  for (const task of visible) {
    const row = document.createElement("div");
    row.className = `task-row${task.done ? " is-done" : ""}`;
    row.dataset.id = task.id;

    row.innerHTML = `
      <button class="task-check" aria-label="Marcar como hecha"></button>
      <div class="task-main">
        <div class="task-text">${escapeHtml(task.text)}</div>
        ${task.notes ? `<div class="task-notes">${escapeHtml(task.notes)}</div>` : ""}
      </div>
      <div class="task-meta">
        <span class="priority-flag ${task.priority}"></span>
        ${task.time ? `<span>${formatTime(task.time)}</span>` : ""}
      </div>
      <span class="task-arrow">›</span>
    `;

    row.querySelector(".task-check").addEventListener("click", (e) => {
      e.stopPropagation();
      toggleDone(task.id);
    });
    row.addEventListener("click", () => openPanel(task));

    el.taskList.appendChild(row);
  }

  updateCounts(allTasks);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

async function toggleDone(id) {
  const task = allTasks.find(t => t.id === id);
  await Store.update(id, { done: !task.done });
  await refresh();
}

/* --------------------- panel lateral --------------------- */
function openPanel(task = null) {
  el.form.reset();
  selectedPriority = task?.priority || "medium";
  setPriorityUI(selectedPriority);

  if (task) {
    el.panelTitle.textContent = "Editar tarea";
    el.taskId.value = task.id;
    el.taskText.value = task.text;
    el.taskDate.value = task.date;
    el.taskTime.value = task.time || "";
    el.taskNotes.value = task.notes || "";
    el.btnDeleteTask.classList.remove("d-none");
  } else {
    el.panelTitle.textContent = "Nueva tarea";
    el.taskId.value = "";
    el.taskDate.value = todayISO();
    el.btnDeleteTask.classList.add("d-none");
  }

  el.panel.classList.add("is-open");
  el.overlay.classList.add("is-open");
  setTimeout(() => el.taskText.focus(), 200);
}

function closePanel() {
  el.panel.classList.remove("is-open");
  el.overlay.classList.remove("is-open");
}

function setPriorityUI(priority) {
  selectedPriority = priority;
  el.priorityPicker.querySelectorAll(".priority-dot").forEach(dot => {
    dot.classList.toggle("is-selected", dot.dataset.priority === priority);
  });
}

el.priorityPicker.addEventListener("click", (e) => {
  const dot = e.target.closest(".priority-dot");
  if (!dot) return;
  setPriorityUI(dot.dataset.priority);
});

el.btnAddTask.addEventListener("click", () => openPanel());
el.panelClose.addEventListener("click", closePanel);
el.overlay.addEventListener("click", closePanel);

/* --------------------- guardar / eliminar --------------------- */
el.form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const payload = {
    text: el.taskText.value.trim(),
    date: el.taskDate.value,
    time: el.taskTime.value,
    notes: el.taskNotes.value.trim(),
    priority: selectedPriority,
  };

  if (!payload.text) return;

  const id = el.taskId.value;
  if (id) {
    await Store.update(id, payload);
    closePanel();
    await refresh();
  } else {
    await Store.create(payload);
    closePanel();
    await refresh();
    Swal.fire({
      toast: true,
      position: "bottom-end",
      timer: 1800,
      showConfirmButton: false,
      icon: "success",
      title: "Tarea añadida",
      background: "#20242B",
      color: "#EDEAE1",
    });
  }
});

el.btnDeleteTask.addEventListener("click", async () => {
  const id = el.taskId.value;
  const result = await Swal.fire({
    title: "¿Eliminar esta tarea?",
    text: "No podrás deshacer esta acción.",
    showCancelButton: true,
    confirmButtonText: "Eliminar",
    cancelButtonText: "Cancelar",
    reverseButtons: true,
    customClass: {
      popup: "cuaderno-popup",
      title: "cuaderno-title",
      confirmButton: "cuaderno-confirm",
      cancelButton: "cuaderno-cancel",
    },
    buttonsStyling: false,
  });

  if (result.isConfirmed) {
    await Store.remove(id);
    closePanel();
    await refresh();
  }
});

/* --------------------- cambio de vista --------------------- */
el.viewTabs.addEventListener("click", (e) => {
  const btn = e.target.closest(".spine-tab");
  if (!btn) return;
  currentView = btn.dataset.view;
  el.viewTabs.querySelectorAll(".spine-tab").forEach(t => t.classList.remove("is-active"));
  btn.classList.add("is-active");
  renderList();
});

/* --------------------- ciclo de refresco --------------------- */
async function refresh() {
  allTasks = await Store.list();
  renderList();
}

async function init() {
  renderHeaderDate();
  await refresh();

  // datos de ejemplo la primera vez que se abre la app
  if (allTasks.length === 0) {
    await Store.create({
      text: "Definir alcance del planificador",
      date: todayISO(),
      time: "10:00",
      notes: "Frontend primero, backend después",
      priority: "high",
    });
    await Store.create({
      text: "Revisar diseño con el equipo",
      date: todayISO(),
      time: "16:00",
      notes: "",
      priority: "medium",
    });
    await refresh();
  }
}

init();