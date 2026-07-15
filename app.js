const STORAGE_KEYS = {
  state: "qlcv_state",
  session: "qlcv_session",
  databaseEndpoint: "qlcv_database_endpoint",
};

const DEFAULT_STATE = {
  users: [
    {
      id: "admin",
      username: "admin",
      password: "admin123",
      name: "Quản trị viên",
      role: "admin",
    },
    {
      id: "user-a",
      username: "usera",
      password: "user123",
      name: "User A",
      role: "user",
    },
    {
      id: "user-b",
      username: "userb",
      password: "user123",
      name: "User B",
      role: "user",
    },
  ],
  tasks: [
    {
      id: "task-demo-1",
      title: "Chuẩn bị báo cáo tiến độ tháng",
      description: "Tổng hợp các đầu việc đang chạy và ghi rõ vướng mắc cần xử lý.",
      assigneeId: "user-a",
      startDate: toDateInput(addDays(new Date(), -2)),
      dueDate: toDateInput(addDays(new Date(), 2)),
      progress: 45,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "task-demo-2",
      title: "Rà soát danh sách công việc quá hạn",
      description: "Kiểm tra các hạng mục có nguy cơ trễ và cập nhật ghi chú mới nhất.",
      assigneeId: "user-b",
      startDate: toDateInput(addDays(new Date(), -5)),
      dueDate: toDateInput(addDays(new Date(), -1)),
      progress: 60,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
  updates: [
    {
      id: "update-demo-1",
      taskId: "task-demo-1",
      userId: "user-a",
      progress: 45,
      note: "Đã thu thập dữ liệu từ các nhóm liên quan.",
      createdAt: new Date().toISOString(),
    },
    {
      id: "update-demo-2",
      taskId: "task-demo-2",
      userId: "user-b",
      progress: 60,
      note: "Cần admin xác nhận lại mốc thời gian hoàn thành.",
      createdAt: new Date().toISOString(),
    },
  ],
};

const elements = {
  loginView: document.querySelector("#loginView"),
  appView: document.querySelector("#appView"),
  sessionActions: document.querySelector("#sessionActions"),
  loginForm: document.querySelector("#loginForm"),
  loginMessage: document.querySelector("#loginMessage"),
  usernameInput: document.querySelector("#usernameInput"),
  passwordInput: document.querySelector("#passwordInput"),
  logoutButton: document.querySelector("#logoutButton"),
  syncButton: document.querySelector("#syncButton"),
  settingsButton: document.querySelector("#settingsButton"),
  settingsDialog: document.querySelector("#settingsDialog"),
  databasePasswordDialog: document.querySelector("#databasePasswordDialog"),
  databasePasswordInput: document.querySelector("#databasePasswordInput"),
  unlockDatabaseButton: document.querySelector("#unlockDatabaseButton"),
  databasePasswordMessage: document.querySelector("#databasePasswordMessage"),
  databaseEndpointInput: document.querySelector("#databaseEndpointInput"),
  saveSettingsButton: document.querySelector("#saveSettingsButton"),
  copySetupLinkButton: document.querySelector("#copySetupLinkButton"),
  clearSettingsButton: document.querySelector("#clearSettingsButton"),
  settingsMessage: document.querySelector("#settingsMessage"),
  roleLabel: document.querySelector("#roleLabel"),
  welcomeTitle: document.querySelector("#welcomeTitle"),
  statsGrid: document.querySelector("#statsGrid"),
  adminPanel: document.querySelector("#adminPanel"),
  taskForm: document.querySelector("#taskForm"),
  taskMessage: document.querySelector("#taskMessage"),
  taskTitleInput: document.querySelector("#taskTitleInput"),
  assigneeInput: document.querySelector("#assigneeInput"),
  startDateInput: document.querySelector("#startDateInput"),
  dueDateInput: document.querySelector("#dueDateInput"),
  descriptionInput: document.querySelector("#descriptionInput"),
  taskScopeLabel: document.querySelector("#taskScopeLabel"),
  searchInput: document.querySelector("#searchInput"),
  statusFilter: document.querySelector("#statusFilter"),
  taskList: document.querySelector("#taskList"),
};

let appState = cloneState(DEFAULT_STATE);
let currentUser = null;
let lastExitSyncAt = 0;

initializeApp();

async function initializeApp() {
  bindEvents();
  setDefaultTaskDates();
  const importedEndpoint = importDatabaseEndpointFromUrl();

  try {
    appState = await loadState();
    if (importedEndpoint) {
      showMessage(elements.loginMessage, "Đã nhận cấu hình database từ link thiết lập. Vui lòng đăng nhập.", "success");
    }
  } catch (error) {
    console.error("Không tải được dữ liệu ban đầu", error);
    appState = loadLocalState();
    showMessage(elements.loginMessage, "Không tải được database online, đang dùng dữ liệu local.", "error");
  }

  currentUser = getSessionUser();
  render();
}

function bindEvents() {
  elements.loginForm.addEventListener("submit", handleLogin);
  elements.logoutButton.addEventListener("click", handleLogout);
  elements.taskForm.addEventListener("submit", handleCreateTask);
  elements.taskList.addEventListener("submit", handleTaskUpdate);
  elements.taskList.addEventListener("input", handleProgressPreview);
  elements.searchInput.addEventListener("input", renderTaskList);
  elements.statusFilter.addEventListener("change", renderTaskList);
  elements.syncButton.addEventListener("click", handleManualSync);
  elements.settingsButton.addEventListener("click", requestDatabasePassword);
  elements.unlockDatabaseButton.addEventListener("click", unlockDatabaseSettings);
  elements.databasePasswordInput.addEventListener("keydown", handleDatabasePasswordKeydown);
  elements.databasePasswordDialog.addEventListener("close", resetDatabasePasswordDialog);
  elements.saveSettingsButton.addEventListener("click", saveSettings);
  elements.copySetupLinkButton.addEventListener("click", copySetupLink);
  elements.clearSettingsButton.addEventListener("click", clearSettings);
  window.addEventListener("pagehide", handlePageExit);
  window.addEventListener("beforeunload", handlePageExit);
}

async function handleLogin(event) {
  event.preventDefault();
  const username = elements.usernameInput.value.trim();
  const password = elements.passwordInput.value;

  try {
    appState = await loadState();
    const user = appState.users.find(
      (item) => item.username === username && item.password === password,
    );

    if (!user) {
      showMessage(elements.loginMessage, "Sai tên đăng nhập hoặc mật khẩu.", "error");
      return;
    }

    currentUser = user;
    localStorage.setItem(STORAGE_KEYS.session, user.id);
    elements.loginForm.reset();
    showMessage(elements.loginMessage, "");
    render();
  } catch (error) {
    console.error("Đăng nhập thất bại", error);
    showMessage(elements.loginMessage, "Không thể đăng nhập. Vui lòng thử lại.", "error");
  }
}

async function handleLogout() {
  const previousText = elements.logoutButton.textContent;
  elements.logoutButton.disabled = true;
  elements.logoutButton.textContent = "Đang đồng bộ";

  try {
    await persistState();
  } catch (error) {
    console.error("Không đồng bộ được khi đăng xuất", error);
    alert("Không đồng bộ được database online. Dữ liệu vẫn đã lưu local trên trình duyệt này.");
  } finally {
    currentUser = null;
    localStorage.removeItem(STORAGE_KEYS.session);
    elements.logoutButton.disabled = false;
    elements.logoutButton.textContent = previousText;
    render();
  }
}

function handlePageExit() {
  syncStateBeforeExit();
}

async function handleCreateTask(event) {
  event.preventDefault();
  if (!currentUser || currentUser.role !== "admin") {
    return;
  }

  const startDate = elements.startDateInput.value;
  const dueDate = elements.dueDateInput.value;

  if (new Date(startDate) > new Date(dueDate)) {
    showMessage(elements.taskMessage, "Ngày bắt đầu phải nhỏ hơn hoặc bằng hạn hoàn thành.", "error");
    return;
  }

  const now = new Date().toISOString();
  const task = {
    id: createId("task"),
    title: elements.taskTitleInput.value.trim(),
    description: elements.descriptionInput.value.trim(),
    assigneeId: elements.assigneeInput.value,
    startDate,
    dueDate,
    progress: 0,
    createdAt: now,
    updatedAt: now,
  };

  try {
    appState.tasks.unshift(task);
    await persistState();
    elements.taskForm.reset();
    setDefaultTaskDates();
    showMessage(elements.taskMessage, "Đã tạo công việc mới.", "success");
    render();
  } catch (error) {
    console.error("Không tạo được công việc", error);
    showMessage(elements.taskMessage, "Không lưu được công việc. Vui lòng thử lại.", "error");
  }
}

async function handleTaskUpdate(event) {
  event.preventDefault();
  const form = event.target.closest(".update-form");
  if (!form || !currentUser) {
    return;
  }

  const taskId = form.dataset.taskId;
  const task = appState.tasks.find((item) => item.id === taskId);
  if (!task || task.assigneeId !== currentUser.id) {
    return;
  }

  const progressInput = form.querySelector("[name='progress']");
  const noteInput = form.querySelector("[name='note']");
  const progress = clamp(Number(progressInput.value), 0, 100);
  const note = noteInput.value.trim();

  if (!note) {
    const message = form.querySelector(".form-message");
    showMessage(message, "Vui lòng nhập ghi chú cập nhật.", "error");
    return;
  }

  const now = new Date().toISOString();
  task.progress = progress;
  task.updatedAt = now;
  appState.updates.unshift({
    id: createId("update"),
    taskId,
    userId: currentUser.id,
    progress,
    note,
    createdAt: now,
  });

  try {
    await persistState();
    render();
  } catch (error) {
    console.error("Không cập nhật được tiến độ", error);
    const message = form.querySelector(".form-message");
    showMessage(message, "Không lưu được cập nhật. Vui lòng thử lại.", "error");
  }
}

function handleProgressPreview(event) {
  if (!event.target.matches("input[type='range'][name='progress']")) {
    return;
  }

  const form = event.target.closest(".update-form");
  const valueOutput = form.querySelector("[data-progress-output]");
  valueOutput.value = event.target.value;
}

async function handleManualSync() {
  elements.syncButton.disabled = true;
  elements.syncButton.textContent = "Đang đồng bộ";

  try {
    appState = await loadState();
    render();
  } catch (error) {
    console.error("Đồng bộ thất bại", error);
    alert("Không đồng bộ được dữ liệu. Kiểm tra URL database hoặc mạng.");
  } finally {
    elements.syncButton.disabled = false;
    elements.syncButton.textContent = "Đồng bộ";
  }
}

function requestDatabasePassword() {
  if (!isAdmin()) {
    return;
  }

  resetDatabasePasswordDialog();
  elements.databasePasswordDialog.showModal();
  elements.databasePasswordInput.focus();
}

async function unlockDatabaseSettings() {
  if (!isAdmin()) {
    resetDatabasePasswordDialog();
    return;
  }

  const endpoint = getDatabaseEndpoint();
  if (!endpoint) {
    elements.databasePasswordDialog.close();
    openSettings();
    showMessage(elements.settingsMessage, "Chưa có URL database. Hãy cấu hình lần đầu, sau đó mật khẩu sẽ được xác thực qua Apps Script.", "error");
    return;
  }

  const password = elements.databasePasswordInput.value;

  elements.unlockDatabaseButton.disabled = true;
  elements.unlockDatabaseButton.textContent = "Đang kiểm tra";

  try {
    const isValid = await verifyDatabaseSettingsPassword(endpoint, password);
    if (!isValid) {
      showMessage(elements.databasePasswordMessage, "Mật khẩu cấu hình không đúng.", "error");
      elements.databasePasswordInput.select();
      return;
    }

    elements.databasePasswordDialog.close();
    openSettings();
  } catch (error) {
    console.error("Không xác thực được mật khẩu cấu hình", error);
    showMessage(elements.databasePasswordMessage, "Không kiểm tra được mật khẩu. Kiểm tra URL Apps Script hoặc mạng.", "error");
  } finally {
    elements.unlockDatabaseButton.disabled = false;
    elements.unlockDatabaseButton.textContent = "Mở cấu hình";
  }
}

async function verifyDatabaseSettingsPassword(endpoint, password) {
  const payload = await requestRemoteJsonp(endpoint, {
    action: "verifySettingsPassword",
    password,
  });

  if (payload && payload.ok === false) {
    return false;
  }

  return Boolean(payload && payload.valid === true);
}

function handleDatabasePasswordKeydown(event) {
  if (event.key === "Enter") {
    event.preventDefault();
    unlockDatabaseSettings();
  }
}

function resetDatabasePasswordDialog() {
  elements.databasePasswordInput.value = "";
  elements.unlockDatabaseButton.disabled = false;
  elements.unlockDatabaseButton.textContent = "Mở cấu hình";
  showMessage(elements.databasePasswordMessage, "");
}

function openSettings() {
  if (!isAdmin()) {
    return;
  }

  elements.databaseEndpointInput.value = getDatabaseEndpoint();
  showMessage(elements.settingsMessage, "");
  elements.settingsDialog.showModal();
}

function saveSettings() {
  const endpoint = elements.databaseEndpointInput.value.trim();
  if (!endpoint) {
    clearSettings();
    return;
  }

  localStorage.setItem(STORAGE_KEYS.databaseEndpoint, endpoint);
  showMessage(elements.settingsMessage, "Đã lưu URL database. Bấm Đồng bộ để tải dữ liệu online.", "success");
}

async function copySetupLink() {
  const endpoint = elements.databaseEndpointInput.value.trim() || getDatabaseEndpoint();
  if (!endpoint) {
    showMessage(elements.settingsMessage, "Vui lòng lưu Web app URL trước khi tạo link thiết bị mới.", "error");
    return;
  }

  const setupLink = createSetupLink(endpoint);

  try {
    await copyTextToClipboard(setupLink);
    showMessage(elements.settingsMessage, "Đã sao chép link thiết lập. Mở link này trên thiết bị mới để tự cấu hình đồng bộ.", "success");
  } catch (error) {
    console.error("Không sao chép được link thiết lập", error);
    window.prompt("Sao chép link thiết lập này:", setupLink);
  }
}

function clearSettings() {
  localStorage.removeItem(STORAGE_KEYS.databaseEndpoint);
  elements.databaseEndpointInput.value = "";
  showMessage(elements.settingsMessage, "Đã chuyển về localStorage.", "success");
}

function render() {
  const isLoggedIn = Boolean(currentUser);
  elements.loginView.classList.toggle("hidden", isLoggedIn);
  elements.appView.classList.toggle("hidden", !isLoggedIn);
  elements.sessionActions.classList.toggle("hidden", !isLoggedIn);
  elements.settingsButton.classList.toggle("hidden", !isAdmin());

  if (!isLoggedIn) {
    return;
  }

  elements.roleLabel.textContent = currentUser.role === "admin" ? "Admin" : "User";
  elements.welcomeTitle.textContent = `Xin chào, ${currentUser.name}`;
  elements.adminPanel.classList.toggle("hidden", currentUser.role !== "admin");
  elements.taskScopeLabel.textContent = currentUser.role === "admin" ? "Tất cả công việc" : "Công việc của tôi";

  renderAssigneeOptions();
  renderStats();
  renderTaskList();
}

function renderAssigneeOptions() {
  const users = appState.users.filter((user) => user.role === "user");
  elements.assigneeInput.innerHTML = users
    .map((user) => `<option value="${escapeHtml(user.id)}">${escapeHtml(user.name)} (${escapeHtml(user.username)})</option>`)
    .join("");
}

function renderStats() {
  const visibleTasks = getVisibleTasks();
  const stats = visibleTasks.reduce(
    (accumulator, task) => {
      const status = getTaskStatus(task);
      accumulator.total += 1;
      accumulator[status.key] += 1;
      return accumulator;
    },
    { total: 0, overdue: 0, "due-soon": 0, active: 0, done: 0 },
  );

  elements.statsGrid.innerHTML = [
    { label: "Tổng việc", value: stats.total },
    { label: "Quá hạn", value: stats.overdue },
    { label: "Sắp hết hạn", value: stats["due-soon"] },
    { label: "Hoàn thành", value: stats.done },
  ]
    .map(
      (item) => `
        <div class="stat-item">
          <strong>${item.value}</strong>
          <span>${item.label}</span>
        </div>
      `,
    )
    .join("");
}

function renderTaskList() {
  if (!currentUser) {
    return;
  }

  const searchTerm = elements.searchInput.value.trim().toLowerCase();
  const statusFilter = elements.statusFilter.value;
  const tasks = getVisibleTasks()
    .filter((task) => {
      const status = getTaskStatus(task);
      const matchesStatus = statusFilter === "all" || status.key === statusFilter;
      const assignee = findUser(task.assigneeId);
      const searchableText = `${task.title} ${task.description} ${assignee?.name || ""}`.toLowerCase();
      return matchesStatus && searchableText.includes(searchTerm);
    })
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

  if (tasks.length === 0) {
    elements.taskList.innerHTML = `<p class="empty-state">Chưa có công việc phù hợp.</p>`;
    return;
  }

  elements.taskList.innerHTML = tasks.map(renderTaskCard).join("");
}

function renderTaskCard(task) {
  const assignee = findUser(task.assigneeId);
  const status = getTaskStatus(task);
  const taskUpdates = appState.updates
    .filter((update) => update.taskId === task.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const canUpdate = currentUser.role === "user" && task.assigneeId === currentUser.id;

  return `
    <article class="task-card">
      <div class="task-main">
        <div>
          <div class="task-title-row">
            <h4>${escapeHtml(task.title)}</h4>
            <span class="pill ${status.key}">${status.label}</span>
          </div>
          ${task.description ? `<p class="task-description">${escapeHtml(task.description)}</p>` : ""}
          <div class="task-meta">
            <span>Phụ trách: <strong>${escapeHtml(assignee?.name || "Chưa rõ")}</strong></span>
            <span>Bắt đầu: ${formatDate(task.startDate)}</span>
            <span>Hạn: ${formatDate(task.dueDate)}</span>
          </div>
        </div>

        <div class="progress-panel">
          <div class="progress-header">
            <span>Tiến độ</span>
            <span>${task.progress}%</span>
          </div>
          <div class="progress-track" aria-label="Tiến độ ${task.progress}%">
            <div class="progress-fill ${status.key}" style="width: ${task.progress}%"></div>
          </div>
          ${canUpdate ? renderUpdateForm(task) : ""}
        </div>
      </div>

      <div class="timeline">
        <div class="timeline-header">
          <h5>Timeline cập nhật</h5>
          <span class="pill">${taskUpdates.length} ghi chú</span>
        </div>
        <div class="timeline-list">
          ${
            taskUpdates.length
              ? taskUpdates.map(renderTimelineItem).join("")
              : `<p class="empty-state">Chưa có ghi chú tiến độ.</p>`
          }
        </div>
      </div>
    </article>
  `;
}

function renderUpdateForm(task) {
  return `
    <form class="update-form" data-task-id="${escapeHtml(task.id)}">
      <label>
        Cập nhật %
        <div class="range-row">
          <input name="progress" type="range" min="0" max="100" value="${task.progress}">
          <output data-progress-output>${task.progress}</output>
        </div>
      </label>
      <label>
        Ghi chú
        <textarea name="note" rows="2" maxlength="500" placeholder="Nhập nội dung đã làm hoặc vướng mắc" required></textarea>
      </label>
      <div class="task-actions">
        <button class="primary-button" type="submit">Lưu tiến độ</button>
        <p class="form-message" role="status"></p>
      </div>
    </form>
  `;
}

function renderTimelineItem(update) {
  const user = findUser(update.userId);
  return `
    <div class="timeline-item">
      <strong>${escapeHtml(user?.name || "Người dùng")} cập nhật ${update.progress}%</strong>
      <time datetime="${escapeHtml(update.createdAt)}">${formatDateTime(update.createdAt)}</time>
      <p>${escapeHtml(update.note)}</p>
    </div>
  `;
}

function getVisibleTasks() {
  if (!currentUser) {
    return [];
  }

  if (currentUser.role === "admin") {
    return appState.tasks;
  }

  return appState.tasks.filter((task) => task.assigneeId === currentUser.id);
}

function getTaskStatus(task) {
  if (task.progress >= 100) {
    return { key: "done", label: "Hoàn thành" };
  }

  const now = new Date();
  const dueDate = endOfDay(new Date(`${task.dueDate}T00:00:00`));
  const daysRemaining = (dueDate - now) / (1000 * 60 * 60 * 24);

  if (daysRemaining < 0) {
    return { key: "overdue", label: "Quá hạn" };
  }

  if (daysRemaining <= 2) {
    return { key: "due-soon", label: "Sắp hết hạn" };
  }

  return { key: "active", label: "Đang làm" };
}

async function loadState() {
  const endpoint = getDatabaseEndpoint();
  if (endpoint) {
    const remoteState = await loadRemoteState(endpoint);
    const normalizedState = normalizeState(remoteState);
    saveLocalState(normalizedState);
    return normalizedState;
  }

  return loadLocalState();
}

function loadLocalState() {
  const rawState = localStorage.getItem(STORAGE_KEYS.state);
  if (!rawState) {
    const defaultState = cloneState(DEFAULT_STATE);
    saveLocalState(defaultState);
    return defaultState;
  }

  try {
    return normalizeState(JSON.parse(rawState));
  } catch (error) {
    console.error("Dữ liệu localStorage không hợp lệ", error);
    return cloneState(DEFAULT_STATE);
  }
}

async function persistState() {
  const stateToSave = normalizeState(appState);
  saveLocalState(stateToSave);

  const endpoint = getDatabaseEndpoint();
  if (!endpoint) {
    return;
  }

  await saveRemoteState(endpoint, stateToSave);
}

function syncStateBeforeExit() {
  const now = Date.now();
  if (now - lastExitSyncAt < 1000) {
    return;
  }
  lastExitSyncAt = now;

  const stateToSave = normalizeState(appState);
  saveLocalState(stateToSave);

  const endpoint = getDatabaseEndpoint();
  if (!endpoint) {
    return;
  }

  const payload = JSON.stringify({
    action: "saveState",
    state: stateToSave,
  });

  if (navigator.sendBeacon) {
    const body = new Blob([payload], {
      type: "text/plain;charset=utf-8",
    });

    if (navigator.sendBeacon(endpoint, body)) {
      return;
    }
  }

  fetch(endpoint, {
    method: "POST",
    mode: "no-cors",
    keepalive: true,
    headers: {
      "Content-Type": "text/plain;charset=utf-8",
    },
    body: payload,
  }).catch((error) => {
    console.error("Không đồng bộ được khi đóng trình duyệt", error);
  });
}

function saveLocalState(state) {
  localStorage.setItem(STORAGE_KEYS.state, JSON.stringify(state));
}

function loadRemoteState(endpoint) {
  return requestRemoteJsonp(endpoint).then((payload) => payload.state || payload);
}

function requestRemoteJsonp(endpoint, params = {}) {
  return new Promise((resolve, reject) => {
    const callbackName = `qlcvJsonp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("Quá thời gian chờ database online phản hồi."));
    }, 12000);

    window[callbackName] = (payload) => {
      cleanup();
      if (payload && payload.ok === false) {
        reject(new Error(payload.error || "Database online trả về lỗi."));
        return;
      }
      resolve(payload);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("Không tải được database online."));
    };

    const url = new URL(endpoint);
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });
    url.searchParams.set("callback", callbackName);
    url.searchParams.set("ts", Date.now());
    script.src = url.toString();
    document.body.appendChild(script);

    function cleanup() {
      window.clearTimeout(timeoutId);
      delete window[callbackName];
      script.remove();
    }
  });
}

async function saveRemoteState(endpoint, state) {
  try {
    await fetch(endpoint, {
      method: "POST",
      mode: "no-cors",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify({
        action: "saveState",
        state,
      }),
    });
  } catch (error) {
    console.error("Không ghi được database online", error);
    throw error;
  }
}

function normalizeState(value) {
  const safeState = value && typeof value === "object" ? value : {};
  return {
    users: Array.isArray(safeState.users) && safeState.users.length ? safeState.users : cloneState(DEFAULT_STATE).users,
    tasks: Array.isArray(safeState.tasks) ? safeState.tasks : [],
    updates: Array.isArray(safeState.updates) ? safeState.updates : [],
  };
}

function getSessionUser() {
  const sessionUserId = localStorage.getItem(STORAGE_KEYS.session);
  if (!sessionUserId) {
    return null;
  }

  return appState.users.find((user) => user.id === sessionUserId) || null;
}

function getDatabaseEndpoint() {
  return localStorage.getItem(STORAGE_KEYS.databaseEndpoint) || "";
}

function importDatabaseEndpointFromUrl() {
  const currentUrl = new URL(window.location.href);
  const queryEndpoint = currentUrl.searchParams.get("db");
  const hashParams = new URLSearchParams(currentUrl.hash.replace(/^#/, ""));
  const hashEndpoint = hashParams.get("db");
  const endpoint = queryEndpoint || hashEndpoint;

  if (!endpoint) {
    return false;
  }

  localStorage.setItem(STORAGE_KEYS.databaseEndpoint, endpoint);

  currentUrl.searchParams.delete("db");
  hashParams.delete("db");
  const nextHash = hashParams.toString();
  currentUrl.hash = nextHash ? `#${nextHash}` : "";
  window.history.replaceState(null, document.title, currentUrl.toString());

  return true;
}

function createSetupLink(endpoint) {
  const setupUrl = new URL(window.location.href);
  setupUrl.searchParams.delete("db");
  setupUrl.hash = `db=${encodeURIComponent(endpoint)}`;
  return setupUrl.toString();
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();

  if (!copied) {
    throw new Error("Clipboard copy failed.");
  }
}

function isAdmin() {
  return Boolean(currentUser && currentUser.role === "admin");
}

function findUser(userId) {
  return appState.users.find((user) => user.id === userId);
}

function setDefaultTaskDates() {
  if (!elements.startDateInput || !elements.dueDateInput) {
    return;
  }

  elements.startDateInput.value = toDateInput(new Date());
  elements.dueDateInput.value = toDateInput(addDays(new Date(), 7));
}

function showMessage(element, text, type = "") {
  if (!element) {
    return;
  }

  element.textContent = text;
  element.classList.remove("error", "success");
  if (type) {
    element.classList.add(type);
  }
}

function formatDate(value) {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function toDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date, days) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function endOfDay(date) {
  const nextDate = new Date(date);
  nextDate.setHours(23, 59, 59, 999);
  return nextDate;
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function cloneState(state) {
  return JSON.parse(JSON.stringify(state));
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
