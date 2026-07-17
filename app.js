const STORAGE_KEYS = {
  state: "qlcv_state",
  session: "qlcv_session",
  databaseEndpoint: "qlcv_database_endpoint",
};
const FIREBASE_CONFIG = window.QLCV_FIREBASE_CONFIG || { enabled: false };

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
  taskLogs: [],
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
  workspaceTabs: document.querySelector("#workspaceTabs"),
  workspacePages: document.querySelectorAll("[data-page-panel]"),
  adminOnlyTabs: document.querySelectorAll(".admin-only"),
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
  adminLogList: document.querySelector("#adminLogList"),
  userStatsList: document.querySelector("#userStatsList"),
  reportFromInput: document.querySelector("#reportFromInput"),
  reportToInput: document.querySelector("#reportToInput"),
  reportUserFilter: document.querySelector("#reportUserFilter"),
  reportSummaryTable: document.querySelector("#reportSummaryTable"),
  reportTaskTable: document.querySelector("#reportTaskTable"),
};

let appState = cloneState(DEFAULT_STATE);
let currentUser = null;
let lastExitSyncAt = 0;
let firebaseBackend = null;
let activePage = "tasks";

initializeApp();

async function initializeApp() {
  bindEvents();
  setDefaultTaskDates();
  const importedEndpoint = importDatabaseEndpointFromUrl();
  firebaseBackend = await initializeFirebaseBackend();

  try {
    if (isFirebaseMode()) {
      const authUser = await waitForFirebaseAuthState();
      if (authUser) {
        currentUser = await getFirebaseUserProfile(authUser);
        appState = await loadState();
      } else {
        appState = loadLocalState();
      }
    } else {
      appState = await loadState();
      currentUser = getSessionUser();
    }

    if (importedEndpoint && !isFirebaseMode()) {
      showMessage(elements.loginMessage, "Đã nhận cấu hình database từ link thiết lập. Vui lòng đăng nhập.", "success");
    }
  } catch (error) {
    console.error("Không tải được dữ liệu ban đầu", error);
    appState = loadLocalState();
    showMessage(elements.loginMessage, "Không tải được database online, đang dùng dữ liệu local.", "error");
  }

  render();
}

function bindEvents() {
  elements.loginForm.addEventListener("submit", handleLogin);
  elements.logoutButton.addEventListener("click", handleLogout);
  elements.taskForm.addEventListener("submit", handleCreateTask);
  elements.taskList.addEventListener("submit", handleTaskUpdate);
  elements.taskList.addEventListener("click", handleTaskAction);
  elements.taskList.addEventListener("input", handleProgressPreview);
  elements.workspaceTabs.addEventListener("click", handleWorkspaceTabClick);
  elements.searchInput.addEventListener("input", renderTaskList);
  elements.statusFilter.addEventListener("change", renderTaskList);
  elements.reportFromInput.addEventListener("change", renderTimeReport);
  elements.reportToInput.addEventListener("change", renderTimeReport);
  elements.reportUserFilter.addEventListener("change", renderTimeReport);
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

async function initializeFirebaseBackend() {
  if (!isFirebaseConfigReady()) {
    return null;
  }

  try {
    const sdkVersion = FIREBASE_CONFIG.sdkVersion || "10.12.5";
    const [{ initializeApp }, authModule, firestoreModule] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${sdkVersion}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${sdkVersion}/firebase-auth.js`),
      import(`https://www.gstatic.com/firebasejs/${sdkVersion}/firebase-firestore.js`),
    ]);

    const app = initializeApp(FIREBASE_CONFIG.firebase);
    const auth = authModule.getAuth(app);
    const db = firestoreModule.getFirestore(app);

    return {
      app,
      auth,
      db,
      authModule,
      firestoreModule,
      mode: "firebase",
    };
  } catch (error) {
    console.error("Không khởi tạo được Firebase", error);
    showMessage(elements.loginMessage, "Không khởi tạo được Firebase, app đang dùng localStorage.", "error");
    return null;
  }
}

function isFirebaseConfigReady() {
  const config = FIREBASE_CONFIG.firebase || {};
  return Boolean(
    FIREBASE_CONFIG.enabled &&
      config.apiKey &&
      config.authDomain &&
      config.projectId &&
      config.appId,
  );
}

function isFirebaseMode() {
  return Boolean(firebaseBackend && firebaseBackend.mode === "firebase");
}

function waitForFirebaseAuthState() {
  if (!isFirebaseMode()) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const unsubscribe = firebaseBackend.authModule.onAuthStateChanged(firebaseBackend.auth, (user) => {
      unsubscribe();
      resolve(user);
    });
  });
}

async function signInFirebaseUser(username, password) {
  const email = getFirebaseEmailForUsername(username);
  const credential = await firebaseBackend.authModule.signInWithEmailAndPassword(
    firebaseBackend.auth,
    email,
    password,
  );
  return credential.user;
}

async function signOutFirebaseUser() {
  if (!isFirebaseMode()) {
    return;
  }

  await firebaseBackend.authModule.signOut(firebaseBackend.auth);
}

function getFirebaseEmailForUsername(username) {
  const normalizedUsername = username.trim().toLowerCase();
  const emailMap = FIREBASE_CONFIG.usernameEmails || {};
  return emailMap[normalizedUsername] || username;
}

async function getFirebaseUserProfile(authUser) {
  const { doc, getDoc } = firebaseBackend.firestoreModule;
  const snapshot = await getDoc(doc(firebaseBackend.db, "users", authUser.uid));

  if (!snapshot.exists()) {
    const error = new Error(`Thiếu hồ sơ Firestore users/${authUser.uid}`);
    error.code = "profile/not-found";
    error.uid = authUser.uid;
    throw error;
  }

  const data = snapshot.data();
  return {
    id: authUser.uid,
    username: data.username || authUser.email || authUser.uid,
    name: data.name || authUser.displayName || authUser.email || "Người dùng",
    role: data.role === "admin" ? "admin" : "user",
  };
}

async function handleLogin(event) {
  event.preventDefault();
  const username = elements.usernameInput.value.trim();
  const password = elements.passwordInput.value;

  try {
    let user;

    if (isFirebaseMode()) {
      const authUser = await signInFirebaseUser(username, password);
      user = await getFirebaseUserProfile(authUser);
      currentUser = user;
      appState = await loadState();
    } else {
      appState = await loadState();
      user = appState.users.find(
        (item) => item.username === username && item.password === password,
      );
    }

    if (!user) {
      showMessage(elements.loginMessage, getLoginErrorMessage(null, username), "error");
      return;
    }

    if (!isFirebaseMode()) {
      currentUser = user;
      localStorage.setItem(STORAGE_KEYS.session, user.id);
    }

    elements.loginForm.reset();
    showMessage(elements.loginMessage, "");
    render();
  } catch (error) {
    console.error("Đăng nhập thất bại", error);
    showMessage(elements.loginMessage, getLoginErrorMessage(error, username), "error");
  }
}

function getLoginErrorMessage(error, username) {
  const code = error && error.code;

  if (!isFirebaseMode() && username.includes("@")) {
    return "Firebase chưa được bật hoặc cấu hình chưa đủ. Kiểm tra firebase-config.js.";
  }

  if (code === "auth/invalid-credential" || code === "auth/user-not-found" || code === "auth/wrong-password") {
    return "Email hoặc mật khẩu Firebase không đúng. Kiểm tra user trong Firebase Authentication.";
  }

  if (code === "auth/invalid-email") {
    return "Email không hợp lệ. Kiểm tra lại username/email trong firebase-config.js.";
  }

  if (code === "auth/unauthorized-domain") {
    return "Domain website chưa được Firebase cho phép. Thêm domain trong Authentication > Settings > Authorized domains.";
  }

  if (code === "auth/too-many-requests") {
    return "Firebase tạm khóa đăng nhập do thử sai nhiều lần. Chờ một lúc rồi thử lại.";
  }

  if (code === "auth/network-request-failed") {
    return "Không kết nối được Firebase. Kiểm tra mạng hoặc cấu hình project.";
  }

  if (code === "profile/not-found") {
    return `Thiếu hồ sơ phân quyền Firestore. Tạo collection users, document ID là UID: ${error.uid}.`;
  }

  return isFirebaseMode()
    ? "Không đăng nhập được Firebase. Kiểm tra Authentication và Firestore user profile."
    : "Sai tên đăng nhập hoặc mật khẩu.";
}

async function handleLogout() {
  const previousText = elements.logoutButton.textContent;
  elements.logoutButton.disabled = true;
  elements.logoutButton.textContent = isFirebaseMode() ? "Đang đăng xuất" : "Đang đồng bộ";

  try {
    saveLocalState(normalizeState(appState));
    if (!isFirebaseMode()) {
      await persistState();
    }
  } catch (error) {
    console.error("Không đồng bộ được khi đăng xuất", error);
    alert(getSyncErrorMessage(error));
  } finally {
    if (isFirebaseMode()) {
      await signOutFirebaseUser();
    }
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
  const taskLog = createTaskLog("task-created", task, currentUser, {
    id: `${task.id}_task-created`,
    note: "Admin tạo và giao công việc mới.",
  });

  try {
    appState.tasks.unshift(task);
    addLocalTaskLog(taskLog);
    if (isFirebaseMode()) {
      saveLocalState(normalizeState(appState));
      await createFirebaseTask(task, taskLog);
    } else {
      await persistState();
    }
    elements.taskForm.reset();
    setDefaultTaskDates();
    showMessage(elements.taskMessage, "Đã tạo công việc mới.", "success");
    render();
  } catch (error) {
    console.error("Không tạo được công việc", error);
    showMessage(elements.taskMessage, "Không lưu được công việc. Vui lòng thử lại.", "error");
  }
}

function handleWorkspaceTabClick(event) {
  const button = event.target.closest("[data-page]");
  if (!button) {
    return;
  }

  if (button.dataset.page === "adminLogs" && !isAdmin()) {
    return;
  }

  activePage = button.dataset.page;
  renderWorkspacePages();
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
  const wasOverdue = getTaskStatus(task).key === "overdue";

  if (!note) {
    const message = form.querySelector(".form-message");
    showMessage(message, "Vui lòng nhập ghi chú cập nhật.", "error");
    return;
  }

  const now = new Date().toISOString();
  const update = {
    id: createId("update"),
    taskId,
    userId: currentUser.id,
    progress,
    note,
    createdAt: now,
  };

  task.progress = progress;
  task.updatedAt = now;
  task.completedAt = progress >= 100 ? task.completedAt || now : null;
  appState.updates.unshift(update);

  const taskLog = progress >= 100 && wasOverdue
    ? createTaskLog("overdue-task-completed", task, currentUser, {
      id: `${task.id}_overdue-task-completed`,
      completedAt: task.completedAt,
      note,
    })
    : null;
  addLocalTaskLog(taskLog);

  try {
    if (isFirebaseMode()) {
      saveLocalState(normalizeState(appState));
      await saveFirebaseTaskUpdate(task, update, taskLog);
    } else {
      await persistState();
    }
    render();
  } catch (error) {
    console.error("Không cập nhật được tiến độ", error);
    const message = form.querySelector(".form-message");
    showMessage(message, getSyncErrorMessage(error), "error");
  }
}

async function handleTaskAction(event) {
  const deleteButton = event.target.closest("[data-action='delete-task']");
  if (!deleteButton) {
    return;
  }

  await handleDeleteTask(deleteButton.dataset.taskId);
}

async function handleDeleteTask(taskId) {
  if (!isAdmin()) {
    return;
  }

  const task = appState.tasks.find((item) => item.id === taskId);
  if (!task) {
    return;
  }

  const confirmed = window.confirm(`Xoá công việc "${task.title}"? Hành động này sẽ được ghi log KPI.`);
  if (!confirmed) {
    return;
  }

  const taskLog = createTaskLog("task-deleted", task, currentUser, {
    id: `${task.id}_task-deleted_${Date.now()}`,
    deletedAt: new Date().toISOString(),
  });
  const previousTasks = [...appState.tasks];
  const previousTaskLogs = [...(appState.taskLogs || [])];

  try {
    appState.tasks = appState.tasks.filter((item) => item.id !== task.id);
    addLocalTaskLog(taskLog);

    if (isFirebaseMode()) {
      saveLocalState(normalizeState(appState));
      await deleteFirebaseTask(task, taskLog);
    } else {
      await persistState();
    }

    render();
  } catch (error) {
    appState.tasks = previousTasks;
    appState.taskLogs = previousTaskLogs;
    console.error("Không xoá được công việc", error);
    alert(getSyncErrorMessage(error));
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
    alert(getSyncErrorMessage(error));
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
  elements.settingsButton.classList.toggle("hidden", !isAdmin() || isFirebaseMode());

  if (!isLoggedIn) {
    return;
  }

  if (!isAdmin() && activePage === "adminLogs") {
    activePage = "tasks";
  }

  elements.roleLabel.textContent = currentUser.role === "admin" ? "Admin" : "User";
  elements.welcomeTitle.textContent = `Xin chào, ${currentUser.name}`;
  elements.adminPanel.classList.toggle("hidden", currentUser.role !== "admin");
  elements.taskScopeLabel.textContent = currentUser.role === "admin" ? "Tất cả công việc" : "Công việc của tôi";
  elements.adminOnlyTabs.forEach((tab) => tab.classList.toggle("hidden", !isAdmin()));

  renderWorkspacePages();
  renderAssigneeOptions();
  renderReportUserOptions();
  renderStats();
  renderTaskList();
  renderAdminLogs();
  renderUserStats();
  renderTimeReport();
}

function renderWorkspacePages() {
  elements.workspacePages.forEach((page) => {
    page.classList.toggle("hidden", page.dataset.pagePanel !== activePage);
  });

  elements.workspaceTabs.querySelectorAll("[data-page]").forEach((button) => {
    button.classList.toggle("active", button.dataset.page === activePage);
  });
}

function renderAssigneeOptions() {
  const users = appState.users.filter((user) => user.role === "user");
  elements.assigneeInput.innerHTML = users
    .map((user) => `<option value="${escapeHtml(user.id)}">${escapeHtml(user.name)} (${escapeHtml(user.username)})</option>`)
    .join("");
}

function renderReportUserOptions() {
  if (!elements.reportUserFilter) {
    return;
  }

  const users = appState.users.filter((user) => user.role === "user");
  const previousValue = elements.reportUserFilter.value;
  elements.reportUserFilter.innerHTML = [
    `<option value="all">Tất cả user</option>`,
    ...users.map((user) => `<option value="${escapeHtml(user.id)}">${escapeHtml(user.name)} (${escapeHtml(user.username)})</option>`),
  ].join("");

  if (previousValue && [...elements.reportUserFilter.options].some((option) => option.value === previousValue)) {
    elements.reportUserFilter.value = previousValue;
  }
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
  const canDelete = currentUser.role === "admin";

  return `
    <article class="task-card">
      ${canDelete ? renderTaskAdminActions(task) : ""}
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

function renderTaskAdminActions(task) {
  return `
    <div class="task-admin-actions">
      <button class="danger-button compact-button" type="button" data-action="delete-task" data-task-id="${escapeHtml(task.id)}">
        Xoá công việc
      </button>
    </div>
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

function renderAdminLogs() {
  if (!elements.adminLogList || !isAdmin()) {
    return;
  }

  const logs = (appState.taskLogs || [])
    .filter((log) => isAdminActionLog(log))
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

  if (!logs.length) {
    elements.adminLogList.innerHTML = `<p class="empty-state">Chưa có log hành động admin.</p>`;
    return;
  }

  elements.adminLogList.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Thời gian</th>
          <th>Admin</th>
          <th>Hành động</th>
          <th>Công việc</th>
          <th>Người phụ trách</th>
          <th>Hạn</th>
        </tr>
      </thead>
      <tbody>
        ${logs.map(renderAdminLogRow).join("")}
      </tbody>
    </table>
  `;
}

function renderAdminLogRow(log) {
  return `
    <tr>
      <td>${formatMaybeDateTime(log.createdAt)}</td>
      <td>${escapeHtml(log.actorName || "Admin")}</td>
      <td><span class="pill">${escapeHtml(getTaskLogLabel(log.action))}</span></td>
      <td>${escapeHtml(log.taskTitle || "Không rõ")}</td>
      <td>${escapeHtml(log.assigneeName || "Không rõ")}</td>
      <td>${formatMaybeDate(log.dueDate)}</td>
    </tr>
  `;
}

function renderUserStats() {
  if (!elements.userStatsList || !currentUser) {
    return;
  }

  const stats = buildUserStats();
  const visibleStats = isAdmin()
    ? stats
    : stats.filter((item) => item.user.id === currentUser.id);

  if (!visibleStats.length) {
    elements.userStatsList.innerHTML = `<p class="empty-state">Chưa có dữ liệu thống kê.</p>`;
    return;
  }

  elements.userStatsList.innerHTML = visibleStats.map(renderUserStatCard).join("");
}

function renderUserStatCard(stat) {
  return `
    <article class="user-stat-card">
      <div class="user-stat-header">
        <div>
          <h4>${escapeHtml(stat.user.name || stat.user.username || "Người dùng")}</h4>
          <p>${escapeHtml(stat.user.username || stat.user.id)}</p>
        </div>
        <div class="user-stat-metrics">
          <div><strong>${stat.totalTasks}</strong><span>Tổng việc</span></div>
          <div><strong>${stat.completedTasks}</strong><span>Hoàn thành</span></div>
          <div><strong>${stat.overdueTasks.length}</strong><span>Đã quá hạn</span></div>
        </div>
      </div>
      <div class="overdue-detail">
        <h5>Công việc đã quá hạn</h5>
        ${
          stat.overdueTasks.length
            ? renderOverdueTaskTable(stat.overdueTasks)
            : `<p class="empty-state">Không có công việc quá hạn.</p>`
        }
      </div>
    </article>
  `;
}

function renderOverdueTaskTable(tasks) {
  return `
    <div class="data-table-wrap compact-table">
      <table class="data-table">
        <thead>
          <tr>
            <th>Công việc</th>
            <th>Hạn</th>
            <th>Trạng thái</th>
            <th>Hoàn thành ngày</th>
          </tr>
        </thead>
        <tbody>
          ${tasks.map((task) => `
            <tr>
              <td>${escapeHtml(task.title || "Không rõ")}</td>
              <td>${formatMaybeDate(task.dueDate)}</td>
              <td>${escapeHtml(task.completedAt ? "Đã hoàn thành" : "Chưa hoàn thành")}</td>
              <td>${task.completedAt ? formatMaybeDateTime(task.completedAt) : "Chưa hoàn thành"}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderTimeReport() {
  if (!elements.reportSummaryTable || !elements.reportTaskTable || !currentUser) {
    return;
  }

  const rows = getTimeReportRows();
  const summaryRows = buildTimeReportSummary(rows);

  elements.reportSummaryTable.innerHTML = summaryRows.length
    ? renderTimeReportSummaryTable(summaryRows)
    : `<p class="empty-state">Chưa có dữ liệu trong khoảng thời gian đã chọn.</p>`;

  elements.reportTaskTable.innerHTML = rows.length
    ? renderTimeReportTaskTable(rows)
    : `<p class="empty-state">Không có đầu việc phù hợp.</p>`;
}

function renderTimeReportSummaryTable(rows) {
  return `
    <table class="data-table report-summary-table">
      <thead>
        <tr>
          <th>User</th>
          <th>Tổng đầu việc</th>
          <th>Hoàn thành</th>
          <th>Quá hạn</th>
          <th>Đang làm</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((row) => `
          <tr>
            <td>${escapeHtml(row.userName)}</td>
            <td>${row.total}</td>
            <td>${row.completed}</td>
            <td>${row.overdue}</td>
            <td>${row.active}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderTimeReportTaskTable(rows) {
  return `
    <table class="data-table report-task-table">
      <thead>
        <tr>
          <th>User</th>
          <th>Nội dung đầu việc</th>
          <th>Bắt đầu</th>
          <th>Hạn</th>
          <th>Tiến độ</th>
          <th>Trạng thái</th>
          <th>Hoàn thành ngày</th>
          <th>Ghi chú mới nhất</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((row) => `
          <tr>
            <td>${escapeHtml(row.userName)}</td>
            <td>
              <strong>${escapeHtml(row.title)}</strong>
              ${row.description ? `<p class="table-subtext">${escapeHtml(row.description)}</p>` : ""}
            </td>
            <td>${formatMaybeDate(row.startDate)}</td>
            <td>${formatMaybeDate(row.dueDate)}</td>
            <td>${row.progress}%</td>
            <td><span class="pill ${escapeHtml(row.statusKey)}">${escapeHtml(row.statusLabel)}</span></td>
            <td>${row.completedAt ? formatMaybeDateTime(row.completedAt) : "Chưa hoàn thành"}</td>
            <td>${escapeHtml(row.latestNote || "")}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
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

function buildUserStats() {
  const taskRecords = getTaskRecordsForStats();
  const users = appState.users.filter((user) => isAdmin() ? user.role === "user" : user.id === currentUser.id);

  return users.map((user) => {
    const userTasks = taskRecords.filter((task) => task.assigneeId === user.id);
    const completedTasks = userTasks.filter((task) => getTaskCompletionDate(task)).length;
    const overdueTasks = userTasks
      .filter((task) => isTaskEverOverdue(task))
      .map((task) => ({
        ...task,
        completedAt: getTaskCompletionDate(task),
      }))
      .sort((a, b) => new Date(a.dueDate || 0) - new Date(b.dueDate || 0));

    return {
      user,
      totalTasks: userTasks.length,
      completedTasks,
      overdueTasks,
    };
  });
}

function getTimeReportRows() {
  const fromDate = parseDateOnly(elements.reportFromInput.value);
  const toDate = parseDateOnly(elements.reportToInput.value);
  const selectedUserId = isAdmin() ? elements.reportUserFilter.value : currentUser.id;
  const taskRecords = getTaskRecordsForStats();

  return taskRecords
    .filter((task) => {
      if (selectedUserId && selectedUserId !== "all" && task.assigneeId !== selectedUserId) {
        return false;
      }

      if (!isAdmin() && task.assigneeId !== currentUser.id) {
        return false;
      }

      return isTaskInReportRange(task, fromDate, toDate);
    })
    .map(createTimeReportRow)
    .sort((a, b) => {
      const byUser = a.userName.localeCompare(b.userName, "vi");
      if (byUser !== 0) {
        return byUser;
      }

      return new Date(a.dueDate || "9999-12-31") - new Date(b.dueDate || "9999-12-31");
    });
}

function createTimeReportRow(task) {
  const user = findUser(task.assigneeId);
  const completedAt = getTaskCompletionDate(task);
  const status = getReportTaskStatus(task, completedAt);
  const latestUpdate = getLatestTaskUpdate(task.id);

  return {
    id: task.id,
    userId: task.assigneeId,
    userName: user?.name || user?.username || task.assigneeName || task.assigneeId || "Không rõ",
    title: task.title || "Không rõ",
    description: task.description || "",
    startDate: task.startDate || "",
    dueDate: task.dueDate || "",
    progress: Number(task.progress || 0),
    completedAt,
    statusKey: status.key,
    statusLabel: status.label,
    latestNote: latestUpdate?.note || "",
  };
}

function buildTimeReportSummary(rows) {
  const summaryByUser = new Map();

  rows.forEach((row) => {
    const current = summaryByUser.get(row.userId) || {
      userId: row.userId,
      userName: row.userName,
      total: 0,
      completed: 0,
      overdue: 0,
      active: 0,
    };

    current.total += 1;
    if (row.completedAt) {
      current.completed += 1;
    }
    if (row.statusKey === "overdue" || row.statusKey === "done-overdue") {
      current.overdue += 1;
    }
    if (!row.completedAt) {
      current.active += 1;
    }

    summaryByUser.set(row.userId, current);
  });

  return Array.from(summaryByUser.values()).sort((a, b) => a.userName.localeCompare(b.userName, "vi"));
}

function isTaskInReportRange(task, fromDate, toDate) {
  const dueDate = parseDateOnly(task.dueDate);
  if (!dueDate) {
    return false;
  }

  if (fromDate && endOfDay(dueDate) < fromDate) {
    return false;
  }

  if (toDate && dueDate > endOfDay(toDate)) {
    return false;
  }

  return true;
}

function getReportTaskStatus(task, completedAt) {
  if (completedAt) {
    return isTaskEverOverdue({ ...task, completedAt })
      ? { key: "done-overdue", label: "Hoàn thành quá hạn" }
      : { key: "done", label: "Hoàn thành" };
  }

  return getTaskStatus(task);
}

function getLatestTaskUpdate(taskId) {
  return (appState.updates || [])
    .filter((update) => update.taskId === taskId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
}

function getTaskRecordsForStats() {
  const tasksById = new Map();

  appState.tasks.forEach((task) => {
    tasksById.set(task.id, { ...task });
  });

  (appState.taskLogs || []).forEach((log) => {
    const snapshot = log.taskSnapshot && typeof log.taskSnapshot === "object" ? log.taskSnapshot : null;
    if (!snapshot || !log.taskId) {
      return;
    }

    const currentTask = tasksById.get(log.taskId) || {};
    tasksById.set(log.taskId, {
      ...snapshot,
      ...currentTask,
      id: log.taskId,
      title: currentTask.title || snapshot.title || log.taskTitle,
      assigneeId: currentTask.assigneeId || snapshot.assigneeId || log.assigneeId,
      dueDate: currentTask.dueDate || snapshot.dueDate || log.dueDate,
      completedAt: currentTask.completedAt || snapshot.completedAt || getTaskCompletionDateFromLogs(log.taskId),
    });
  });

  return Array.from(tasksById.values());
}

function isTaskEverOverdue(task) {
  const dueDate = parseDateOnly(task.dueDate);
  if (!dueDate) {
    return false;
  }

  const completionDate = getTaskCompletionDate(task);
  if (completionDate) {
    return new Date(completionDate) > endOfDay(dueDate);
  }

  const hasOverdueLog = (appState.taskLogs || []).some((log) => (
    log.taskId === task.id && (log.action === "task-overdue" || log.action === "overdue-task-completed")
  ));

  return hasOverdueLog || endOfDay(dueDate) < new Date();
}

function getTaskCompletionDate(task) {
  return task.completedAt || getTaskCompletionDateFromLogs(task.id) || getTaskCompletionDateFromUpdates(task.id);
}

function getTaskCompletionDateFromLogs(taskId) {
  const completionLog = (appState.taskLogs || [])
    .filter((log) => log.taskId === taskId && log.completedAt)
    .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt))[0];

  return completionLog?.completedAt || "";
}

function getTaskCompletionDateFromUpdates(taskId) {
  const completionUpdate = (appState.updates || [])
    .filter((update) => update.taskId === taskId && Number(update.progress || 0) >= 100)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))[0];

  return completionUpdate?.createdAt || "";
}

function isAdminActionLog(log) {
  return ["task-created", "task-deleted"].includes(log.action);
}

function getTaskLogLabel(action) {
  const labels = {
    "task-created": "Tạo công việc",
    "task-deleted": "Xoá công việc",
    "task-overdue": "Ghi nhận quá hạn",
    "overdue-task-completed": "Hoàn thành việc quá hạn",
  };

  return labels[action] || action || "Không rõ";
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
  if (isFirebaseMode() && firebaseBackend.auth.currentUser) {
    return loadFirebaseState();
  }

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

  if (isFirebaseMode() && firebaseBackend.auth.currentUser) {
    await saveFirebaseState(stateToSave);
    return;
  }

  const endpoint = getDatabaseEndpoint();
  if (!endpoint) {
    return;
  }

  await saveRemoteState(endpoint, stateToSave);
}

async function loadFirebaseState() {
  const { collection, getDocs, query, where } = firebaseBackend.firestoreModule;
  const isCurrentAdmin = isAdmin();
  const taskSource = isCurrentAdmin
    ? collection(firebaseBackend.db, "tasks")
    : query(collection(firebaseBackend.db, "tasks"), where("assigneeId", "==", currentUser.id));
  const updateSource = isCurrentAdmin
    ? collection(firebaseBackend.db, "updates")
    : query(collection(firebaseBackend.db, "updates"), where("userId", "==", currentUser.id));
  const taskLogSource = isCurrentAdmin
    ? collection(firebaseBackend.db, "taskLogs")
    : query(collection(firebaseBackend.db, "taskLogs"), where("assigneeId", "==", currentUser.id));
  const [usersSnapshot, tasksSnapshot, updatesSnapshot] = await Promise.all([
    getDocs(collection(firebaseBackend.db, "users")),
    getDocs(taskSource),
    getDocs(updateSource),
  ]);
  const taskLogsSnapshot = await getOptionalFirebaseDocs(taskLogSource, "Không tải được taskLogs KPI");

  return normalizeState({
    users: usersSnapshot.docs.map((snapshot) => ({
      id: snapshot.id,
      ...snapshot.data(),
    })),
    tasks: tasksSnapshot.docs.map((snapshot) => ({
      id: snapshot.id,
      ...snapshot.data(),
    })),
    updates: updatesSnapshot.docs.map((snapshot) => ({
      id: snapshot.id,
      ...snapshot.data(),
    })),
    taskLogs: taskLogsSnapshot.map((snapshot) => ({
      id: snapshot.id,
      ...snapshot.data(),
    })),
  });
}

async function getOptionalFirebaseDocs(source, message) {
  const { getDocs } = firebaseBackend.firestoreModule;

  try {
    const snapshot = await getDocs(source);
    return snapshot.docs;
  } catch (error) {
    console.warn(message, error);
    return [];
  }
}

async function saveFirebaseState(state) {
  const { doc, setDoc } = firebaseBackend.firestoreModule;
  const tasks = state.tasks.map((task) => (
    setDoc(doc(firebaseBackend.db, "tasks", task.id), sanitizeFirestoreRecord(task), { merge: true })
  ));
  const updates = state.updates.map((update) => (
    setDoc(doc(firebaseBackend.db, "updates", update.id), sanitizeFirestoreRecord(update), { merge: true })
  ));
  const taskLogs = (state.taskLogs || []).map((taskLog) => (
    setDoc(doc(firebaseBackend.db, "taskLogs", taskLog.id), sanitizeFirestoreRecord(taskLog), { merge: true })
  ));

  await Promise.all([...tasks, ...updates, ...taskLogs]);
}

async function createFirebaseTask(task, taskLog = null) {
  const { doc, setDoc, writeBatch } = firebaseBackend.firestoreModule;

  if (writeBatch && taskLog) {
    const batch = writeBatch(firebaseBackend.db);
    batch.set(doc(firebaseBackend.db, "tasks", task.id), sanitizeFirestoreRecord(task));
    batch.set(doc(firebaseBackend.db, "taskLogs", taskLog.id), sanitizeFirestoreRecord(taskLog), { merge: true });
    await batch.commit();
    return;
  }

  await setDoc(doc(firebaseBackend.db, "tasks", task.id), sanitizeFirestoreRecord(task));
  await saveFirebaseTaskLog(taskLog);
}

async function saveFirebaseTaskUpdate(task, update, taskLog = null) {
  const { doc, writeBatch } = firebaseBackend.firestoreModule;
  const batch = writeBatch(firebaseBackend.db);

  batch.update(doc(firebaseBackend.db, "tasks", task.id), {
    progress: task.progress,
    updatedAt: task.updatedAt,
    completedAt: task.completedAt,
  });
  batch.set(doc(firebaseBackend.db, "updates", update.id), sanitizeFirestoreRecord(update));

  if (taskLog) {
    batch.set(doc(firebaseBackend.db, "taskLogs", taskLog.id), sanitizeFirestoreRecord(taskLog), { merge: true });
  }

  await batch.commit();
}

async function deleteFirebaseTask(task, taskLog) {
  const { deleteDoc, doc, writeBatch } = firebaseBackend.firestoreModule;

  if (writeBatch) {
    const batch = writeBatch(firebaseBackend.db);
    batch.set(doc(firebaseBackend.db, "taskLogs", taskLog.id), sanitizeFirestoreRecord(taskLog));
    batch.delete(doc(firebaseBackend.db, "tasks", task.id));
    await batch.commit();
    return;
  }

  await saveFirebaseTaskLog(taskLog);
  await deleteDoc(doc(firebaseBackend.db, "tasks", task.id));
}

async function saveFirebaseTaskLog(taskLog) {
  if (!taskLog) {
    return;
  }

  const { doc, setDoc } = firebaseBackend.firestoreModule;
  await setDoc(doc(firebaseBackend.db, "taskLogs", taskLog.id), sanitizeFirestoreRecord(taskLog), { merge: true });
}

function sanitizeFirestoreRecord(record) {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  );
}

function syncStateBeforeExit() {
  const now = Date.now();
  if (now - lastExitSyncAt < 1000) {
    return;
  }
  lastExitSyncAt = now;

  const stateToSave = normalizeState(appState);
  saveLocalState(stateToSave);

  if (isFirebaseMode()) {
    return;
  }

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
    taskLogs: Array.isArray(safeState.taskLogs) ? safeState.taskLogs : [],
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

function createTaskLog(action, task, actor, extra = {}) {
  const assignee = findUser(task.assigneeId);
  const createdAt = extra.createdAt || new Date().toISOString();

  return {
    id: extra.id || `${task.id}_${action}`,
    action,
    taskId: task.id,
    taskTitle: task.title,
    taskDescription: task.description || "",
    assigneeId: task.assigneeId,
    assigneeName: assignee?.name || assignee?.username || task.assigneeId,
    actorId: actor?.id || "system",
    actorName: actor?.name || actor?.username || "Hệ thống",
    dueDate: task.dueDate,
    startDate: task.startDate,
    progress: Number(task.progress || 0),
    createdAt,
    eventDate: toDateInput(new Date(createdAt)),
    completedAt: extra.completedAt || null,
    deletedAt: extra.deletedAt || null,
    note: extra.note || "",
    taskSnapshot: sanitizeFirestoreRecord({ ...task }),
  };
}

function addLocalTaskLog(taskLog) {
  if (!taskLog) {
    return;
  }

  appState.taskLogs = appState.taskLogs || [];
  const existingIndex = appState.taskLogs.findIndex((item) => item.id === taskLog.id);
  if (existingIndex >= 0) {
    appState.taskLogs[existingIndex] = taskLog;
    return;
  }

  appState.taskLogs.unshift(taskLog);
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

function getSyncErrorMessage(error) {
  const code = error && error.code;

  if (code === "permission-denied" || code === "firestore/permission-denied") {
    return "Firebase từ chối quyền ghi dữ liệu. Kiểm tra Firestore Rules và hồ sơ users/{UID} có role đúng.";
  }

  if (code === "unavailable" || code === "firestore/unavailable" || code === "auth/network-request-failed") {
    return "Không kết nối được database online. Kiểm tra mạng Internet rồi thử lại.";
  }

  if (code === "not-found" || code === "firestore/not-found") {
    return "Không tìm thấy dữ liệu cần cập nhật trên Firebase. Bấm Đồng bộ rồi thử lại.";
  }

  return isFirebaseMode()
    ? "Không đồng bộ được Firebase. Dữ liệu vẫn đã lưu local trên trình duyệt này."
    : "Không đồng bộ được database online. Dữ liệu vẫn đã lưu local trên trình duyệt này.";
}

function formatDate(value) {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function formatMaybeDate(value) {
  if (!value) {
    return "Chưa có";
  }

  const date = value.includes("T") ? new Date(value) : new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return "Chưa có";
  }

  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
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

function formatMaybeDateTime(value) {
  if (!value) {
    return "Chưa có";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Chưa có";
  }

  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function parseDateOnly(value) {
  if (!value) {
    return null;
  }

  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
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
