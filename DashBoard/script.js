// ==================== CONSTANTS ====================
const CONFIG = {
  GAS_URL: "https://script.google.com/macros/s/AKfycbwGCqdZvb9hlHfwJUFRlfpgBfkXtdBSKRVxxUZX2MzYw4M-kTud7w9aK7Ilm_d0PXAoyQ/exec",
  WS_URL: "wss://durable-chat-template.templates.workers.dev/parties/chat/FPTTrainWSS",
  RECONNECT_DELAY: 5000,
  FADE_DELAY: 10,
  BARRIER_COLORS: { OPEN: "#51b848", CLOSED: "#f37021" },
  BARRIER_STATES: { OPEN: 0, CLOSED: 1 },
  AUTO_STATES: { ON: "True", OFF: "False" },
  CHUNK_SIZE: 50
};

const SECTIONS = {
  "Thông Tin Tàu": "sectionHoSoTau",
  "Phân tích dữ liệu": "sectionPhanTich",
  "Bảng Điều Khiển": "sectionBangDieuKhien"
};

const SPEED_UNITS = {
  ms: (v) => v.toFixed(2) + " m/s",
  mh: (v) => (v * 3600).toFixed(2) + " m/h",
  kmh: (v) => (v / 1000 * 3600).toFixed(2) + " km/h",
  cms: (v) => (v * 100).toFixed(2) + " cm/s"
};

// ==================== STATE ====================
const STATE = {
  user: null,
  username: null,
  password: null,
  station: null,
  originalData: [],
  currentFilteredData: [],
  currentSort: { key: "", asc: true },
  ws: null,
  servoState: null,
  autoState: null,
  chartInstances: {
    avgSpeed: null,
    tripCount: null,
    speedPerDay: null
  },
  trainColorMap: {},
  currentChunk: 0,
  isLoadingMore: false,
  hasMoreData: true,
  displayedRowCount: 0
};

// ==================== AUTHENTICATION ====================
function initLoginUI() {
  const loginForm = document.getElementById("loginForm");
  const loginUsername = document.getElementById("loginUsername");
  const loginPassword = document.getElementById("loginPassword");
  const loginError = document.getElementById("loginError");
  const loginModal = document.getElementById("loginModal");

  // Check if already logged in
  const savedUsername = localStorage.getItem("trainUsername");
  const savedPassword = localStorage.getItem("trainPassword");
  
  if (savedUsername && savedPassword) {
    STATE.username = savedUsername;
    STATE.password = savedPassword;
    // Show "Logging in..." message
    loginModal.classList.remove("hidden");
    loginForm.style.display = "none";
    const loggingInMsg = document.createElement("div");
    loggingInMsg.id = "loggingInMessage";
    loggingInMsg.style.textAlign = "center";
    loggingInMsg.style.padding = "20px";
    loggingInMsg.innerHTML = "<p style='font-size: 18px; color: #333;'>Đang đăng nhập...</p><div class='spinner' style='margin-top: 20px;'></div>";
    loginModal.querySelector(".login-container").appendChild(loggingInMsg);
    verifyLoginAndInit();
    return;
  }

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = loginUsername.value;
    const password = loginPassword.value;
    
    loginError.textContent = "";
    
    try {
      const response = await fetch(`${CONFIG.GAS_URL}?action=login&username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`);
      const data = await response.json();
      
      if (data.status === "success") {
        STATE.username = username;
        STATE.password = password;
        STATE.station = data.user.station;
        localStorage.setItem("trainUsername", username);
        localStorage.setItem("trainPassword", password);
        loginModal.classList.add("hidden");
        await initAfterLogin();
      } else {
        loginError.textContent = "Tên đăng nhập hoặc mật khẩu không chính xác";
      }
    } catch (err) {
      loginError.textContent = "Lỗi kết nối. Vui lòng thử lại.";
      console.error("Login error:", err);
    }
  });
}

function verifyLoginAndInit() {
  const loginModal = document.getElementById("loginModal");
  const loginError = document.getElementById("loginError");
  const loginForm = document.getElementById("loginForm");
  
  fetch(`${CONFIG.GAS_URL}?action=login&username=${encodeURIComponent(STATE.username)}&password=${encodeURIComponent(STATE.password)}`)
    .then(res => res.json())
    .then(data => {
      if (data.status === "success") {
        STATE.station = data.user.station;
        loginModal.classList.add("hidden");
        const loggingInMsg = document.getElementById("loggingInMessage");
        if (loggingInMsg) loggingInMsg.remove();
        loginForm.style.display = "";
        initAfterLogin();
      } else {
        localStorage.removeItem("trainUsername");
        localStorage.removeItem("trainPassword");
        loginError.textContent = "Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.";
        loginForm.style.display = "";
        const loggingInMsg = document.getElementById("loggingInMessage");
        if (loggingInMsg) loggingInMsg.remove();
        loginModal.classList.remove("hidden");
      }
    })
    .catch(err => {
      console.error("Verification error:", err);
      loginError.textContent = "Lỗi kết nối. Vui lòng thử lại.";
      loginForm.style.display = "";
      const loggingInMsg = document.getElementById("loggingInMessage");
      if (loggingInMsg) loggingInMsg.remove();
    });
}

async function initAfterLogin() {
  console.log("🔐 initAfterLogin called");
  
  document.body.classList.add("sidebar-active");
  document.getElementById("sidebar").classList.add("active");
  document.getElementById("sidebarUsername").textContent = STATE.username;
  document.getElementById("sidebarStation").textContent = `Trạm: ${STATE.station}`;
  
  setupSidebarMenu();
  setupLogout();
  
  STATE.currentChunk = 0;
  STATE.displayedRowCount = 0;
  STATE.hasMoreData = true;
  
  console.log("📡 Calling fetchDataAndRender");
  await fetchDataAndRender();
  console.log("✅ fetchDataAndRender complete");
  console.log("🎬 Calling initNavigation");
  initNavigation();
  console.log("⚙️ Calling setupControls");
  setupControls();
  console.log("📡 Calling setupWebSocket");
  setupWebSocket();
  console.log("✅ initAfterLogin complete");
}

function setupSidebarMenu() {
  const sidebarLinks = document.querySelectorAll(".sidebar-menu a");
  const navButtons = document.querySelectorAll(".nav-bar button");
  
  sidebarLinks.forEach((link, index) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      sidebarLinks.forEach(l => l.classList.remove("active"));
      link.classList.add("active");
      navButtons[index].click();
    });
  });
}

function setupLogout() {
  document.getElementById("logoutBtn").addEventListener("click", () => {
    localStorage.removeItem("trainUsername");
    localStorage.removeItem("trainPassword");
    location.reload();
  });
}

function setupToggleSidebar() {
  const toggleBtn = document.getElementById("toggleSidebar");
  toggleBtn.addEventListener("click", () => {
    document.body.classList.toggle("sidebar-active");
    const sidebar = document.getElementById("sidebar");
    sidebar.classList.toggle("active");
  });
}

// ==================== NAVIGATION ====================
function initNavigation() {
  const navButtons = document.querySelectorAll(".nav-bar button");
  navButtons[0].classList.add("active-nav");

  navButtons.forEach(button => {
    button.addEventListener("click", () => switchSection(button, navButtons));
  });
}

function switchSection(button, navButtons) {
  Object.values(SECTIONS).forEach(id => {
    document.getElementById(id).style.display = "none";
  });

  const sectionId = SECTIONS[button.textContent.trim()];
  if (sectionId) {
    const section = document.getElementById(sectionId);
    section.style.opacity = 0;
    section.style.display = "block";
    setTimeout(() => section.style.opacity = 1, CONFIG.FADE_DELAY);
  }

  navButtons.forEach(btn => btn.classList.remove("active-nav"));
  button.classList.add("active-nav");
}

// ==================== DATA MANAGEMENT ====================
async function fetchDataAndRender() {
  console.log("📡 fetchDataAndRender called - chunk:", STATE.currentChunk);
  try {
    const url = `${CONFIG.GAS_URL}?action=fetch&username=${encodeURIComponent(STATE.username)}&password=${encodeURIComponent(STATE.password)}&chunk=${STATE.currentChunk}&chunkSize=${CONFIG.CHUNK_SIZE}`;
    console.log("📡 Fetching from:", url);
    const res = await fetch(url);
    const json = await res.json();
    console.log("📡 Response:", json);
    
    if (json.status === "success") {
      if (STATE.currentChunk === 0) {
        STATE.originalData = json.data || [];
      } else {
        STATE.originalData = STATE.originalData.concat(json.data || []);
      }
      
      STATE.hasMoreData = json.hasMoreData !== false;
      STATE.currentFilteredData = STATE.originalData;
      console.log("📊 Data loaded:", STATE.originalData.length, "items, hasMoreData:", STATE.hasMoreData);
      
      populateFilters();
      reapplyFiltersAndSort();
      
      if (STATE.currentChunk === 0) {
        console.log("📊 Rendering charts");
        renderCharts();
        // Setup scroll listener AFTER rendering completes
        console.log("⏰ Scheduling setupInfiniteScroll in 100ms");
        setTimeout(() => {
          console.log("⏰ 100ms timer fired, calling setupInfiniteScroll");
          setupInfiniteScroll();
        }, 100);
      }
    }
  } catch (err) {
    console.error("❌ Error fetching train data:", err);
  }
}

function setupInfiniteScroll() {
  if (window._scrollListenerSetup) return;
  window._scrollListenerSetup = true;
  
  console.log("🎯 Setting up scroll listener - attaching to window");
  
  // Test with a super simple listener first
  const testListener = () => {
    console.log("✅ SCROLL EVENT FIRED!");
  };
  
  window.addEventListener("scroll", testListener);
  
  setTimeout(() => {
    console.log("📊 Page info:");
    console.log("  scrollHeight:", document.documentElement.scrollHeight);
    console.log("  clientHeight:", document.documentElement.clientHeight);
    console.log("  Scrollable?:", document.documentElement.scrollHeight > window.innerHeight);
    console.log("  body height:", document.body.offsetHeight);
    
    // Remove test listener and add real one
    window.removeEventListener("scroll", testListener);
    window.addEventListener("scroll", handleScroll);
    console.log("Real scroll listener attached");
  }, 200);
}

function handleScroll() {
  const scrollPosition = window.innerHeight + window.scrollY;
  const pageHeight = document.documentElement.scrollHeight;
  const distanceFromBottom = pageHeight - scrollPosition;
  
  // Log every scroll event
  console.log(`📍 SCROLL: ${Math.round(distanceFromBottom)}px from bottom`);
  
  if (distanceFromBottom < 1000 && STATE.hasMoreData && !STATE.isLoadingMore) {
    console.log("🔄 LOAD MORE TRIGGERED");
    STATE.isLoadingMore = true;
    STATE.currentChunk++;
    const loadingIndicator = document.getElementById("loadingIndicator");
    if (loadingIndicator) loadingIndicator.classList.add("show");
    
    fetchDataAndRender().then(() => {
      STATE.isLoadingMore = false;
      const loadingIndicator = document.getElementById("loadingIndicator");
      if (loadingIndicator) loadingIndicator.classList.remove("show");
    }).catch(err => {
      STATE.isLoadingMore = false;
      console.error("❌ Error loading more data:", err);
    });
  }
}

function populateFilters() {
  const tenTauSelect = document.getElementById("filterTenTau");
  const tuyenSelect = document.getElementById("filterTuyen");
  const savedTenTau = tenTauSelect.value;
  const savedTuyen = tuyenSelect.value;

  const tenTauSet = new Set();
  const tuyenSet = new Set();

  STATE.originalData.forEach(item => {
    tenTauSet.add(item["Tên Tàu"]);
    tuyenSet.add(item["Tuyến"]);
  });

  tenTauSelect.innerHTML = `<option value="">Tất Cả Tên Tàu</option>`;
  tuyenSelect.innerHTML = `<option value="">Tất Cả Tuyến</option>`;

  [...tenTauSet].forEach(val => {
    tenTauSelect.innerHTML += `<option value="${val}">${val}</option>`;
  });
  [...tuyenSet].forEach(val => {
    tuyenSelect.innerHTML += `<option value="${val}">${val}</option>`;
  });

  tenTauSelect.value = savedTenTau;
  tuyenSelect.value = savedTuyen;
}

function reapplyFiltersAndSort() {
  console.log("🔄 reapplyFiltersAndSort called");
  filterAndSearch();
  if (STATE.currentSort.key) {
    sortBy(STATE.currentSort.key);
  }
  console.log("🔄 reapplyFiltersAndSort complete, data displayed");
}

// ==================== FILTERING & SEARCHING ====================
function filterAndSearch() {
  const searchValue = document.getElementById("searchInput").value.toLowerCase();
  const tenTauFilter = document.getElementById("filterTenTau").value;
  const tuyenFilter = document.getElementById("filterTuyen").value;
  const dateFromValue = document.getElementById("dateFrom").value;
  const dateToValue = document.getElementById("dateTo").value;
  const timeFromValue = document.getElementById("timeFrom").value;
  const timeToValue = document.getElementById("timeTo").value;

  const filtered = STATE.originalData.filter(item =>
    matchesSearch(item, searchValue) &&
    matchesFilter(item, tenTauFilter, tuyenFilter) &&
    matchesDateTime(item, dateFromValue, dateToValue, timeFromValue, timeToValue)
  );

  renderTable(filtered);
}

function matchesSearch(item, searchValue) {
  return Object.values(item).some(val => String(val).toLowerCase().includes(searchValue));
}

function matchesFilter(item, tenTauFilter, tuyenFilter) {
  const matchTenTau = !tenTauFilter || item["Tên Tàu"] === tenTauFilter;
  const matchTuyen = !tuyenFilter || item["Tuyến"] === tuyenFilter;
  return matchTenTau && matchTuyen;
}

function matchesDateTime(item, dateFromValue, dateToValue, timeFromValue, timeToValue) {
  if (!dateFromValue && !dateToValue && !timeFromValue && !timeToValue) return true;

  const date = new Date(item["Ngày Đến"]);
  const time = new Date(item["Giờ Đến"]);
  const combinedDateTime = new Date(date.getFullYear(), date.getMonth(), date.getDate(),
    time.getHours(), time.getMinutes(), time.getSeconds());

  if (dateFromValue && combinedDateTime < new Date(dateFromValue)) return false;
  if (dateToValue) {
    const dateTo = new Date(dateToValue);
    dateTo.setHours(23, 59, 59, 999);
    if (combinedDateTime > dateTo) return false;
  }

  if (timeFromValue) {
    const [h, m] = timeFromValue.split(":");
    if (combinedDateTime.getHours() < +h || 
        (combinedDateTime.getHours() === +h && combinedDateTime.getMinutes() < +m)) return false;
  }

  if (timeToValue) {
    const [h, m] = timeToValue.split(":");
    if (combinedDateTime.getHours() > +h || 
        (combinedDateTime.getHours() === +h && combinedDateTime.getMinutes() > +m)) return false;
  }

  return true;
}

function sortBy(key) {
  const asc = STATE.currentSort.key === key ? !STATE.currentSort.asc : true;
  STATE.currentSort = { key, asc };

  const sorted = [...STATE.currentFilteredData].sort((a, b) => {
    let valA = a[key];
    let valB = b[key];
    if (!isNaN(valA) && !isNaN(valB)) {
      valA = Number(valA);
      valB = Number(valB);
    }
    return asc ? (valA > valB ? 1 : -1) : (valA < valB ? 1 : -1);
  });

  renderTable(sorted);
}

// ==================== TABLE RENDERING ====================
function renderTable(data) {
  STATE.currentFilteredData = data;
  const tbody = document.querySelector("#trainTable tbody");
  tbody.innerHTML = "";
  const speedUnit = document.getElementById("speedUnit").value;

  data.forEach(row => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row["STT"]}</td>
      <td>${row["Tên Tàu"]}</td>
      <td>${row["Tuyến"]}</td>
      <td>${row["Trạm"]}</td>
      <td>${formatSpeed(row["Vận Tốc"], speedUnit)}</td>
      <td>${formatDate(row["Ngày Đến"])}</td>
      <td>${formatTime(row["Giờ Đến"])}</td>
      <td>${formatDate(row["Ngày Rời"])}</td>
      <td>${formatTime(row["Giờ Rời"])}</td>
      <td>${row["Trạng Thái"]}</td>
    `;
    tbody.appendChild(tr);
  });
}

function formatSpeed(speed, unit) {
  const formatter = SPEED_UNITS[unit] || SPEED_UNITS.kmh;
  return formatter(Number(speed));
}

function formatDate(dateStr) {
  const date = parseDateString(dateStr);
  return date ? date.toLocaleDateString("vi-VN") : "⚠ Invalid";
}

function formatTime(timeStr) {
  const time = parseTimeString(timeStr);
  return time || "⚠ Invalid";
}

// ==================== DATE/TIME PARSING ====================
function isValidDate(d) {
  return d instanceof Date && !isNaN(d);
}

function parseDateString(str) {
  let d = new Date(str);
  if (isValidDate(d)) return d;

  const parts = str.split("/");
  if (parts.length === 3) {
    d = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
    if (isValidDate(d)) return d;
  }
  return null;
}

function parseTimeString(excelTimeStr) {
  const parts = excelTimeStr.split(" ");
  for (const p of parts) {
    if (/^\d{2}:\d{2}:\d{2}$/.test(p)) return p;
  }
  return null;
}

// ==================== WEBSOCKET ====================
function setupWebSocket() {
  STATE.ws = new WebSocket(CONFIG.WS_URL);

  STATE.ws.onopen = () => {
    console.log("WebSocket connected.");
    sendJSON({ command: "barrier_state_request" });
    sendJSON({ command: "auto_state_request" });
  };

  STATE.ws.onmessage = handleWebSocketMessage;
  STATE.ws.onclose = () => {
    console.warn("WebSocket disconnected. Reconnecting in 5s...");
    setTimeout(setupWebSocket, CONFIG.RECONNECT_DELAY);
  };
  STATE.ws.onerror = (err) => {
    console.error("WebSocket error:", err);
    try { STATE.ws.close(); } catch (e) {}
  };
}

async function handleWebSocketMessage(event) {
  let text;
  try {
    text = typeof event.data === "string" ? event.data :
           event.data instanceof Blob && event.data.text ? await event.data.text() :
           String(event.data);
  } catch (e) {
    console.error("Error reading WS message:", e);
    return;
  }

  let parsed = null;
  try { parsed = JSON.parse(text); } catch (e) {}

  if (parsed?.command) {
    handleJSONCommand(parsed);
  } else {
    handleLegacyMessage(text);
  }
}

function handleJSONCommand(parsed) {
  switch (parsed.command) {
    case "barrier_state_response":
    case "barrier_state_update":
      STATE.servoState = parsed.state?.toUpperCase() === "OPEN" ? CONFIG.BARRIER_STATES.OPEN : CONFIG.BARRIER_STATES.CLOSED;
      updateServoUI();
      break;
    case "auto_state_response":
      STATE.autoState = parsed.state ? CONFIG.AUTO_STATES.ON : CONFIG.AUTO_STATES.OFF;
      updateautoUI();
      break;
    case "update_data":
      console.log("WS -> update_data: refreshing data");
      fetchDataAndRender();
      break;
    case "update_warning":
      console.log("WS -> update_warning:", parsed);
      if (parsed.distance !== undefined) document.getElementById('distance').value = parsed.distance;
      if (parsed.warning1 !== undefined) document.getElementById('delay1').value = parsed.warning1;
      if (parsed.warning2 !== undefined) document.getElementById('delay2').value = parsed.warning2;
      break;
    default:
      console.log("Unhandled WS JSON command:", parsed);
  }
}

function handleLegacyMessage(text) {
  console.log("WebSocket message received (text):", text);
  if (text === "update_data") {
    fetchDataAndRender();
  } else if (text.startsWith("servo is")) {
    const val = parseInt(text.split(" ")[2], 10);
    if (!isNaN(val)) {
      STATE.servoState = val;
      updateServoUI();
    }
  } else if (text.startsWith("auto is")) {
    const val = parseInt(text.split(" ")[2], 10);
    if (!isNaN(val)) {
      STATE.autoState = val;
      updateautoUI();
    }
  }
}

function sendJSON(obj) {
  if (STATE.ws && STATE.ws.readyState === WebSocket.OPEN) {
    try {
      STATE.ws.send(JSON.stringify(obj));
    } catch (e) {
      console.error("Failed to send JSON over WS:", e, obj);
    }
  } else {
    console.warn("WebSocket not open - cannot send:", obj);
  }
}

// ==================== UI UPDATES ====================
function updateServoUI() {
  const servoToggleButton = document.getElementById("servoToggle");
  const servoStateLabel = document.getElementById("servoStateLabel");

  if (STATE.servoState === CONFIG.BARRIER_STATES.OPEN) {
    servoToggleButton.textContent = "Hạ barrier";
    servoToggleButton.style.backgroundColor = CONFIG.BARRIER_COLORS.CLOSED;
    servoStateLabel.textContent = "Open";
    servoStateLabel.style.backgroundColor = CONFIG.BARRIER_COLORS.OPEN;
    document.getElementById("servoSatateLabelImg").src = "./Barrier Open.png";
  } else if (STATE.servoState === CONFIG.BARRIER_STATES.CLOSED) {
    servoToggleButton.textContent = "Nâng barrier";
    servoToggleButton.style.backgroundColor = CONFIG.BARRIER_COLORS.OPEN;
    servoStateLabel.textContent = "Close";
    servoStateLabel.style.backgroundColor = CONFIG.BARRIER_COLORS.CLOSED;
    document.getElementById("servoSatateLabelImg").src = "./Barrier Close (1).png";
  }
}

function updateautoUI() {
  const autoToggleButton = document.getElementById("autoToggle");
  const autoStateLabel = document.getElementById("autoStateLabel");

  if (STATE.autoState === CONFIG.AUTO_STATES.OFF) {
    autoToggleButton.textContent = "MANUAL";
    autoToggleButton.style.backgroundColor = CONFIG.BARRIER_COLORS.CLOSED;
    autoStateLabel.textContent = "AUTO";
    autoStateLabel.style.backgroundColor = CONFIG.BARRIER_COLORS.OPEN;
    document.getElementById("autoSatateLabelImg").src = "./Automation.png";
  } else if (STATE.autoState === CONFIG.AUTO_STATES.ON) {
    autoToggleButton.textContent = "AUTO";
    autoToggleButton.style.backgroundColor = CONFIG.BARRIER_COLORS.OPEN;
    autoStateLabel.textContent = "MANUAL";
    autoStateLabel.style.backgroundColor = CONFIG.BARRIER_COLORS.CLOSED;
    document.getElementById("autoSatateLabelImg").src = "./Automation.gif";
  }
}

// ==================== CONTROLS ====================
function setupControls() {
  // Servo/Barrier control
  document.getElementById("servoToggle").addEventListener("click", () => {
    if (STATE.ws?.readyState === WebSocket.OPEN && STATE.servoState !== null) {
      const command = STATE.servoState === CONFIG.BARRIER_STATES.OPEN ? "close_barrier" : "open_barrier";
      sendJSON({ command });
    }
  });

  // Auto system control
  document.getElementById("autoToggle").addEventListener("click", () => {
    if (STATE.ws?.readyState === WebSocket.OPEN && STATE.autoState !== null) {
      const nextStateBool = !(STATE.autoState === CONFIG.AUTO_STATES.ON);
      sendJSON({ command: "set_auto_state", state: nextStateBool });
    }
  });

  // Settings form
  const toggleBtn = document.querySelector('.toggle-form-btn');
  const form = document.getElementById('settingsForm');
  toggleBtn.addEventListener('click', () => form.classList.toggle('hidden'));

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const payload = { command: "update_warning" };
    const distance = Number(document.getElementById('distance').value || "NaN");
    const warning1 = Number(document.getElementById('delay1').value || "NaN");
    const warning2 = Number(document.getElementById('delay2').value || "NaN");

    if (!isNaN(distance)) payload.distance = distance;
    if (!isNaN(warning1)) payload.warning1 = warning1;
    if (!isNaN(warning2)) payload.warning2 = warning2;

    sendJSON(payload);
  });

  // Search and filter controls
  document.getElementById("searchInput").addEventListener("input", filterAndSearch);
  document.getElementById("filterTenTau").addEventListener("change", filterAndSearch);
  document.getElementById("filterTuyen").addEventListener("change", filterAndSearch);
  document.getElementById("speedUnit").addEventListener("change", () => {
    localStorage.setItem("speedUnit", document.getElementById("speedUnit").value);
    renderTable(STATE.currentFilteredData);
  });
  document.getElementById("dateFrom").addEventListener("change", filterAndSearch);
  document.getElementById("dateTo").addEventListener("change", filterAndSearch);
  document.getElementById("timeFrom").addEventListener("change", filterAndSearch);
  document.getElementById("timeTo").addEventListener("change", filterAndSearch);

  // Table sorting
  document.querySelectorAll("#trainTable th").forEach(th => {
    th.addEventListener("click", () => sortBy(th.dataset.key));
  });

  // Export controls
  document.getElementById("exportExcel").addEventListener("click", exportExcel);
  document.getElementById("exportPDF").addEventListener("click", exportPDF);
  document.getElementById("exportDOCX").addEventListener("click", () => {
    exportReportDOCX(
      STATE.currentFilteredData,
      document.getElementById("filterTuyen").value,
      document.getElementById("filterTenTau").value,
      document.getElementById("dateFrom").value,
      document.getElementById("dateTo").value,
      document.getElementById("timeFrom").value,
      document.getElementById("timeTo").value
    );
  });
}

function applySavedUnits() {
  const savedSpeedUnit = localStorage.getItem("speedUnit");
  if (savedSpeedUnit) document.getElementById("speedUnit").value = savedSpeedUnit;
}

// ==================== EXPORT ====================
function exportExcel() {
  const ws_data = [
    ["STT", "Tên Tàu", "Tuyến", "Trạm", "Vận Tốc", "Ngày Đến", "Giờ Đến", "Ngày Rời", "Giờ Rời", "Trạng Thái"],
    ...STATE.currentFilteredData.map(row => [
      row["STT"], row["Tên Tàu"], row["Tuyến"], row["Trạm"], row["Vận Tốc"],
      row["Ngày Đến"], row["Giờ Đến"], row["Ngày Rời"], row["Giờ Rời"], row["Trạng Thái"]
    ])
  ];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(ws_data);
  XLSX.utils.book_append_sheet(wb, ws, "Data");
  XLSX.writeFile(wb, "TrainData.xlsx");
}

async function exportPDF() {
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF('l', 'pt', 'a4');
  const table = document.querySelector("#trainTable");
  
  // Temporarily disable animations
  const style = document.createElement('style');
  style.textContent = `
    * {
      animation: none !important;
      transition: none !important;
    }
  `;
  document.head.appendChild(style);
  
  // Wait for any ongoing animations to complete (0.5s slideUp + buffer)
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  try {
    const canvas = await html2canvas(table, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      allowTaint: true,
      removeContainer: true
    });
    const imgData = canvas.toDataURL('image/png');
    const imgProps = pdf.getImageProperties(imgData);
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    pdf.save("TrainData.pdf");
  } finally {
    // Re-enable animations
    document.head.removeChild(style);
  }
}

async function exportReportDOCX(tableData, filterTuyenValue, filterTenTauValue, dateFromValue, dateToValue, timeFromValue, timeToValue) {
  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType } = docx;

  const now = new Date();
  const ngay = now.getDate();
  const thang = now.getMonth() + 1;
  const nam = now.getFullYear();

  const header1 = new Paragraph({
    children: [
      new TextRun({ text: "TRƯỜNG CAO ĐẲNG GIAO THÔNG VẬN TẢI", bold: true, size: 22 }),
      new TextRun({ text: "		CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM", bold: true, size: 22 })
    ],
    spacing: { after: 200 }
  });

  const header2 = new Paragraph({
    children: [
      new TextRun({ text: "	KHOA KỸ THUẬT ĐIỆN - ĐIỆN TỬ", bold: true, size: 20 }),
      new TextRun({ text: "						Độc lập - Tự do - Hạnh phúc", bold: true, size: 20 })
    ],
    spacing: { after: 200 }
  });

  const dateLine = new Paragraph({
    alignment: AlignmentType.RIGHT,
    children: [new TextRun({ text: `TP.HCM, ngày ${ngay} tháng ${thang} năm ${nam}`, italics: true, size: 20 })],
    spacing: { after: 200 }
  });

  const title = new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "BẢNG THÔNG TIN TÀU CHẠY", bold: true, color: "0000FF", size: 32 })],
    spacing: { after: 300 }
  });

  const infoFields = [
    { label: "Tuyến", value: filterTuyenValue },
    { label: "Tên tàu", value: filterTenTauValue },
    { label: "Từ ngày", value: dateFromValue },
    { label: "Đến ngày", value: dateToValue },
    { label: "Từ giờ", value: timeFromValue },
    { label: "Đến giờ", value: timeToValue }
  ];

  const infoParagraphs = infoFields.filter(f => f.value).map(f => new Paragraph({
    text: `${f.label}: ${f.value}`,
    spacing: { after: 100 },
    size: 20
  }));

  let table = null;
  if (tableData && tableData.length > 0) {
    const keys = Object.keys(tableData[0]);
    const colWidth = Math.floor(100 / keys.length);
    const headerRow = new TableRow({
      children: keys.map(k => new TableCell({
        children: [new Paragraph({ text: k, bold: true, alignment: AlignmentType.CENTER, size: 20 })],
        shading: { fill: "BDB76B" },
        width: { size: colWidth, type: WidthType.PERCENTAGE },
        margins: { top: 200, bottom: 200, left: 200, right: 200 }
      }))
    });

    const dataRows = tableData.map((rowObj, idx) => new TableRow({
      children: keys.map(k => {
        let val = rowObj[k];
        if (k.includes("Giờ")) val = new Date(val).toLocaleTimeString("vi-VN");
        if (k.includes("Ngày")) val = new Date(val).toLocaleDateString("vi-VN");
        return new TableCell({
          children: [new Paragraph({ text: String(val ?? ""), size: 20 })],
          shading: { fill: idx % 2 === 0 ? "FFFFFF" : "FFF4E6" },
          width: { size: colWidth, type: WidthType.PERCENTAGE },
          margins: { top: 200, bottom: 200, left: 200, right: 200 }
        });
      })
    }));

    table = new Table({
      rows: [headerRow, ...dataRows],
      width: { size: 100, type: WidthType.PERCENTAGE },
      alignment: AlignmentType.CENTER
    });
  }

  const subDateLine = new Paragraph({
    alignment: AlignmentType.RIGHT,
    children: [new TextRun({ text: `TP.HCM, ngày ${ngay} tháng ${thang} năm ${nam}`, italics: true, size: 20 })],
    spacing: { after: 200, before: 200 }
  });

  const signLine = new Paragraph({
    alignment: AlignmentType.RIGHT,
    children: [new TextRun({ text: `Trưởng Trạm		`, bold: true, size: 28 })],
    spacing: { after: 200 }
  });

  const subSignLine = new Paragraph({
    alignment: AlignmentType.RIGHT,
    children: [new TextRun({ text: `(Ký và ghi rõ họ tên)		`, italics: true, size: 20 })],
    spacing: { after: 200 }
  });

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: "Times New Roman" },
          paragraph: { spacing: { line: 276 } }
        }
      }
    },
    sections: [{
      properties: { page: { margin: { top: 720, bottom: 720, left: 720, right: 720 } } },
      children: [header1, header2, dateLine, title, ...infoParagraphs, ...(table ? [table] : []), subDateLine, signLine, subSignLine]
    }]
  });

  const blob = await Packer.toBlob(doc);
  const filename = `BaoCao_${(filterTenTauValue || 'Tau').replace(/\s+/g,'_')}.docx`;
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
}

// ==================== CHARTS ====================
function renderCharts() {
  destroyCharts();
  try {
    console.log("📊 Rendering avg speed chart...");
    renderAvgSpeedChart();
    console.log("✅ Avg speed chart rendered");
  } catch (e) {
    console.error("❌ Error in avg speed chart:", e);
  }
  try {
    console.log("📊 Rendering trip count chart...");
    renderTripCountChart();
    console.log("✅ Trip count chart rendered");
  } catch (e) {
    console.error("❌ Error in trip count chart:", e);
  }
  try {
    console.log("📊 Rendering speed per day chart...");
    renderSpeedPerDayChart();
    console.log("✅ Speed per day chart rendered");
  } catch (e) {
    console.error("❌ Error in speed per day chart:", e);
  }
}

function destroyCharts() {
  Object.values(STATE.chartInstances).forEach(chart => chart?.destroy());
}

function renderAvgSpeedChart() {
  const trainSpeeds = {};
  const trainCounts = {};

  STATE.originalData.forEach(item => {
    const train = item["Tên Tàu"];
    const speed = Number(item["Vận Tốc"]);
    if (!isNaN(speed) && isFinite(speed)) {
      trainSpeeds[train] = (trainSpeeds[train] || 0) + speed;
      trainCounts[train] = (trainCounts[train] || 0) + 1;
    }
  });

  const trainNames = Object.keys(trainSpeeds);
  if (trainNames.length === 0) {
    console.warn("No valid train speed data to render");
    return;
  }
  const avgSpeeds = trainNames.map(name => (trainSpeeds[name] / trainCounts[name]).toFixed(2));
  const validAvgSpeeds = avgSpeeds.filter(v => !isNaN(parseFloat(v)));
  const globalAvgSpeed = (validAvgSpeeds.length > 0 ? (validAvgSpeeds.reduce((sum, val) => sum + parseFloat(val), 0) / validAvgSpeeds.length) : 0).toFixed(2);

  const ctx = document.getElementById('avgSpeedChart').getContext('2d');
  STATE.chartInstances.avgSpeed = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: trainNames,
      datasets: [
        {
          label: 'Tốc Độ Trung Bình (km/h)',
          data: avgSpeeds,
          backgroundColor: trainNames.map(name => hashColor(name)),
          barThickness: 20
        },
        {
          label: 'Tốc độ TB tất cả tàu',
          type: 'line',
          data: Array(avgSpeeds.length).fill(globalAvgSpeed),
          borderColor: 'red',
          borderWidth: 2,
          fill: false,
          pointRadius: 0
        }
      ]
    },
    options: { responsive: true, scales: { y: { beginAtZero: true } } }
  });
}

function renderTripCountChart() {
  const trainCounts = {};
  STATE.originalData.forEach(item => {
    const train = item["Tên Tàu"];
    if (train) {
      trainCounts[train] = (trainCounts[train] || 0) + 1;
    }
  });

  if (Object.keys(trainCounts).length === 0) {
    console.warn("No valid train count data to render");
    return;
  }
  const tripCounts = Object.values(trainCounts);
  const globalTripAvg = (tripCounts.reduce((a, b) => a + b, 0) / tripCounts.length).toFixed(2);

  const ctx = document.getElementById('tripCountChart').getContext('2d');
  STATE.chartInstances.tripCount = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: Object.keys(trainCounts),
      datasets: [
        {
          label: 'Số Chuyến',
          data: Object.values(trainCounts),
          backgroundColor: Object.keys(trainCounts).map(name => hashColor(name)),
          barThickness: 20
        },
        {
          label: 'Số chuyến TB tất cả tàu',
          type: 'line',
          data: Array(Object.keys(trainCounts).length).fill(globalTripAvg),
          borderColor: 'red',
          borderWidth: 2,
          fill: false,
          pointRadius: 0
        }
      ]
    },
    options: { responsive: true, scales: { y: { beginAtZero: true } } }
  });
}

function renderSpeedPerDayChart() {
  const trainDateSpeedMap = {};
  STATE.originalData.forEach(item => {
    const train = item["Tên Tàu"];
    try {
      const dateValue = item["Ngày Đến"];
      if (!dateValue) return;  // Skip if no date
      const dateObj = new Date(dateValue);
      if (isNaN(dateObj.getTime())) return;  // Skip if invalid date
      const date = dateObj.toISOString().split("T")[0];
      const speed = Number(item["Vận Tốc"]);
      if (isNaN(speed)) return;  // Skip if invalid speed
      const key = `${train}_${date}`;
      if (!trainDateSpeedMap[key]) trainDateSpeedMap[key] = { sum: 0, count: 0 };
      trainDateSpeedMap[key].sum += speed;
      trainDateSpeedMap[key].count += 1;
    } catch (e) {
      console.warn("Skipping invalid record:", item, e);
    }
  });

  const trainDateGroups = {};
  Object.keys(trainDateSpeedMap).forEach(key => {
    const [train, date] = key.split("_");
    if (!trainDateGroups[train]) trainDateGroups[train] = {};
    trainDateGroups[train][date] = (trainDateSpeedMap[key].sum / trainDateSpeedMap[key].count).toFixed(2);
  });

  const allDates = [...new Set(Object.values(trainDateGroups).flatMap(Object.keys))].sort();

  const datasets = Object.keys(trainDateGroups).map(train => {
    if (!STATE.trainColorMap[train]) STATE.trainColorMap[train] = hashColor(train);
    return {
      label: train,
      data: allDates.map(date => trainDateGroups[train][date] || null),
      fill: false,
      borderColor: STATE.trainColorMap[train],
      tension: 0.1
    };
  });

  let totalSum = 0, totalCount = 0;
  Object.values(trainDateGroups).forEach(trainData => {
    Object.values(trainData).forEach(val => {
      if (val !== null && val !== undefined) {
        totalSum += parseFloat(val);
        totalCount++;
      }
    });
  });

  datasets.push({
    label: 'Tốc độ TB tất cả tàu mỗi ngày',
    data: Array(allDates.length).fill((totalSum / totalCount).toFixed(2)),
    borderColor: 'red',
    borderWidth: 2,
    fill: false,
    pointRadius: 0,
    borderDash: [5, 5]
  });

  const ctx = document.getElementById('speedPerDayChart').getContext('2d');
  STATE.chartInstances.speedPerDay = new Chart(ctx, {
    type: 'line',
    data: { labels: allDates, datasets },
    options: { responsive: true, scales: { y: { beginAtZero: true } } }
  });
}

function hashColor(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 50%)`;
}

// ==================== INITIALIZATION ====================
function init() {
  applySavedUnits();
  setupToggleSidebar();
  initLoginUI();
}
  // setupWebSocket();
  // console.log("Application initialized. docx loaded?", !!window.docx);

document.addEventListener("DOMContentLoaded", init);
