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
  allowedStations: [],
  originalData: [],
  currentFilteredData: [],
  currentSort: { key: "", asc: true },
  ws: null,
  mqtt: null,
  mqttConnected: false,
  stationStates: {},
  chartInstances: {
    mainAnalysis: null,
    stationCharts: {}
  },
  trainColorMap: {},
  currentChunk: 0,
  isLoadingMore: false,
  hasMoreData: true,
  displayedRowCount: 0,
  analysisFilterState: {
    chartType: 'avgSpeed',
    train: '',
    station: '',
    dateFrom: '',
    dateTo: ''
  }
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
  
  // Extract allowed stations from login response
  STATE.allowedStations = [STATE.station]; // At minimum, the user's own station
  
  console.log("📡 Calling fetchDataAndRender");
  await fetchDataAndRender();
  console.log("✅ fetchDataAndRender complete");
  console.log("🎬 Calling initNavigation");
  initNavigation();
  console.log("⚙️ Calling setupControls");
  setupControls();
  console.log("📡 Calling initializeDashboard (MQTT)");
  initializeDashboard();
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

// ==================== MQTT SETUP ====================
function setupMQTT() {
  console.log("🔌 Setting up MQTT connection to HiveMQ...");
  
  // HiveMQ Cloud credentials
  const MQTT_BROKER = "ebb274b1a6024d7bb86a001c1083dd3a.s1.eu.hivemq.cloud";
  const MQTT_PORT = 8884;
  const MQTT_URL = `wss://${MQTT_BROKER}:${MQTT_PORT}/mqtt`;
  
  // Using example credentials (you should replace with actual ones)
  const MQTT_USERNAME = "WebApp";
  const MQTT_PASSWORD = "WebApp_1";
  
  const options = {
    protocol: 'wss',
    username: MQTT_USERNAME,
    password: MQTT_PASSWORD,
    clientId: `web_client_${Date.now()}`,
    clean: true,
    reconnectPeriod: 5000,
    connectTimeout: 30000
  };

  try {
    STATE.mqtt = mqtt.connect(MQTT_URL, options);
    
    STATE.mqtt.on('connect', () => {
      console.log("✅ MQTT Connected!");
      STATE.mqttConnected = true;
      updateMQTTStatus(true);
      
      // Subscribe to allowed station topics
      STATE.allowedStations.forEach(station => {
        const topic = `train/station/${station}/state`;
        STATE.mqtt.subscribe(topic, (err) => {
          if (err) {
            console.error(`Failed to subscribe to ${topic}:`, err);
          } else {
            console.log(`✓ Subscribed to ${topic}`);
          }
        });
      });
    });
    
    STATE.mqtt.on('message', handleMQTTMessage);
    
    STATE.mqtt.on('disconnect', () => {
      console.warn("MQTT disconnected");
      STATE.mqttConnected = false;
      updateMQTTStatus(false);
    });
    
    STATE.mqtt.on('error', (err) => {
      console.error("MQTT error:", err);
      STATE.mqttConnected = false;
      updateMQTTStatus(false);
    });
  } catch (err) {
    console.error("Failed to create MQTT client:", err);
    STATE.mqttConnected = false;
    updateMQTTStatus(false);
  }
}

function updateMQTTStatus(connected) {
  const statusDot = document.getElementById("mqttStatusDot");
  const statusText = document.getElementById("mqttStatusText");
  
  if (statusDot) {
    statusDot.className = "status-dot " + (connected ? "connected" : "disconnected");
  }
  if (statusText) {
    statusText.textContent = connected ? "🟢 MQTT Kết nối" : "🔴 MQTT Ngắt kết nối";
  }
}

function handleMQTTMessage(topic, message) {
  console.log(`📨 MQTT Message - Topic: ${topic}, Message: ${message.toString()}`);
  
  // Parse station from topic: train/station/{station}/state
  const topicParts = topic.split('/');
  if (topicParts.length >= 4 && topicParts[0] === 'train' && topicParts[1] === 'station') {
    const station = topicParts[2];
    const messageStr = message.toString();
    
    try {
      const data = JSON.parse(messageStr);
      if (data.barrier !== undefined) {
        STATE.stationStates[station] = {
          barrier: data.barrier,
          auto: data.auto !== undefined ? data.auto : STATE.stationStates[station]?.auto
        };
        updateStationControlUI(station);
      }
    } catch (e) {
      console.warn("Failed to parse MQTT message:", e);
    }
  }
}

function initializeDashboard() {
  console.log("Initializing dashboard with allowed stations:", STATE.allowedStations);
  setupMQTT();
  renderStationControls();
  setupControlListeners();
}

function renderStationControls() {
  const container = document.getElementById("stationControlsContainer");
  container.innerHTML = "";
  
  if (STATE.allowedStations.length === 0) {
    container.innerHTML = "<p style='text-align: center; color: #999;'>Không có trạm được phép quản lý</p>";
    return;
  }
  
  STATE.allowedStations.forEach(station => {
    // Initialize station state if not exists
    if (!STATE.stationStates[station]) {
      STATE.stationStates[station] = { barrier: 0, auto: false };
    }
    
    const card = document.createElement("div");
    card.className = "station-control-card";
    card.id = `stationCard_${station.replace(/\s+/g, '_')}`;
    
    card.innerHTML = `
      <h3>🏢 Trạm ${station}</h3>
      
      <div class="control-section">
        <h4>🚧 Điều Khiển Barrier</h4>
        <div class="control-status">
          <span class="control-status-label">Trạng Thái:</span>
          <span class="status-badge" id="barrierStatus_${station.replace(/\s+/g, '_')}">Chưa Biết</span>
        </div>
        <button class="control-button" id="barrierControl_${station.replace(/\s+/g, '_')}">Chuyển Đổi Barrier</button>
      </div>
      
      <div class="control-section">
        <h4>⚙️ Chế Độ Tự Động</h4>
        <div class="control-status">
          <span class="control-status-label">Trạng Thái:</span>
          <span class="status-badge" id="autoStatus_${station.replace(/\s+/g, '_')}">Chế Độ Thủ Công</span>
        </div>
        <button class="control-button" id="autoControl_${station.replace(/\s+/g, '_')}">Bật Chế Độ Tự Động</button>
      </div>
    `;
    
    container.appendChild(card);
    updateStationControlUI(station);
  });
}

function updateStationControlUI(station) {
  const state = STATE.stationStates[station];
  if (!state) return;
  
  const safeName = station.replace(/\s+/g, '_');
  
  // Update barrier status
  const barrierStatusEl = document.getElementById(`barrierStatus_${safeName}`);
  const barrierBtnEl = document.getElementById(`barrierControl_${safeName}`);
  
  if (barrierStatusEl) {
    if (state.barrier === 1 || state.barrier === "1" || state.barrier === true) {
      barrierStatusEl.textContent = "🟢 Mở";
      barrierStatusEl.className = "status-badge open";
      if (barrierBtnEl) barrierBtnEl.textContent = "Hạ Barrier";
    } else {
      barrierStatusEl.textContent = "🔴 Đóng";
      barrierStatusEl.className = "status-badge closed";
      if (barrierBtnEl) barrierBtnEl.textContent = "Nâng Barrier";
    }
  }
  
  // Update auto status
  const autoStatusEl = document.getElementById(`autoStatus_${safeName}`);
  const autoBtnEl = document.getElementById(`autoControl_${safeName}`);
  
  if (autoStatusEl) {
    if (state.auto === 1 || state.auto === "1" || state.auto === true) {
      autoStatusEl.textContent = "🟢 Tự Động";
      autoStatusEl.className = "status-badge open";
      if (autoBtnEl) autoBtnEl.textContent = "Chuyển Sang Thủ Công";
    } else {
      autoStatusEl.textContent = "🔴 Thủ Công";
      autoStatusEl.className = "status-badge closed";
      if (autoBtnEl) autoBtnEl.textContent = "Bật Chế Độ Tự Động";
    }
  }
}

function setupControlListeners() {
  STATE.allowedStations.forEach(station => {
    const safeName = station.replace(/\s+/g, '_');
    
    const barrierBtn = document.getElementById(`barrierControl_${safeName}`);
    const autoBtn = document.getElementById(`autoControl_${safeName}`);
    
    if (barrierBtn) {
      barrierBtn.addEventListener("click", () => {
        sendMQTTCommand(station, 'barrier', !STATE.stationStates[station].barrier);
      });
    }
    
    if (autoBtn) {
      autoBtn.addEventListener("click", () => {
        sendMQTTCommand(station, 'auto', !STATE.stationStates[station].auto);
      });
    }
  });
}

function sendMQTTCommand(station, command, value) {
  if (!STATE.mqtt || !STATE.mqttConnected) {
    console.error("MQTT not connected");
    alert("MQTT chưa kết nối. Vui lòng thử lại.");
    return;
  }
  
  const topic = `train/station/${station}/control`;
  const message = JSON.stringify({
    command: command,
    value: value ? 1 : 0,
    timestamp: new Date().toISOString()
  });
  
  STATE.mqtt.publish(topic, message, { qos: 1 }, (err) => {
    if (err) {
      console.error(`Failed to publish to ${topic}:`, err);
      alert(`Lỗi: ${err.message}`);
    } else {
      console.log(`✓ Command sent to ${station}: ${command} = ${value}`);
    }
  });
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
  // Settings form for MQTT commands
  const toggleBtn = document.querySelector('.toggle-form-btn');
  const form = document.getElementById('settingsForm');
  
  if (toggleBtn && form) {
    toggleBtn.addEventListener('click', () => form.classList.toggle('hidden'));

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const distance = Number(document.getElementById('distance').value || "NaN");
      const warning1 = Number(document.getElementById('delay1').value || "NaN");
      const warning2 = Number(document.getElementById('delay2').value || "NaN");

      const payload = {
        distance: !isNaN(distance) ? distance : undefined,
        warning1: !isNaN(warning1) ? warning1 : undefined,
        warning2: !isNaN(warning2) ? warning2 : undefined
      };

      // Send settings via MQTT to all allowed stations
      STATE.allowedStations.forEach(station => {
        const topic = `train/station/${station}/settings`;
        const message = JSON.stringify({
          ...payload,
          timestamp: new Date().toISOString()
        });
        
        if (STATE.mqtt && STATE.mqttConnected) {
          STATE.mqtt.publish(topic, message, { qos: 1 });
        }
      });
      
      alert("Cài đặt đã được lưu!");
    });
  }

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
  // Initialize analysis chart on first load
  console.log("📊 Initializing analysis section...");
  initializeAnalysisSection();
}

function destroyCharts() {
  if (STATE.chartInstances.mainAnalysis) {
    STATE.chartInstances.mainAnalysis.destroy();
    STATE.chartInstances.mainAnalysis = null;
  }
  Object.values(STATE.chartInstances.stationCharts).forEach(chart => chart?.destroy());
  STATE.chartInstances.stationCharts = {};
}

// ==================== ANALYSIS SECTION INITIALIZATION ====================
function initializeAnalysisSection() {
  setupAnalysisFilters();
  setupLoadMoreDataButton();
  updateDataCountDisplay();
  renderMainAnalysisChart();
  renderStationCharts();
}

function setupLoadMoreDataButton() {
  const loadMoreBtn = document.getElementById("loadMoreDataBtn");
  if (!loadMoreBtn) return;

  loadMoreBtn.addEventListener("click", () => {
    loadMoreBtn.disabled = true;
    loadMoreBtn.textContent = "⏳ Đang tải...";
    
    STATE.currentChunk++;
    fetchDataAndRender().then(() => {
      updateDataCountDisplay();
      // Refresh analysis charts after loading new data
      renderMainAnalysisChart();
      renderStationCharts();
      
      loadMoreBtn.disabled = false;
      loadMoreBtn.textContent = STATE.hasMoreData ? "📥 Tải Thêm Dữ Liệu" : "✓ Đã tải hết";
    }).catch(err => {
      console.error("Error loading more data:", err);
      loadMoreBtn.disabled = false;
      loadMoreBtn.textContent = "📥 Tải Thêm Dữ Liệu";
    });
  });

  // Disable button if no more data
  if (!STATE.hasMoreData) {
    loadMoreBtn.disabled = true;
    loadMoreBtn.textContent = "✓ Đã tải hết";
  }
}

function updateDataCountDisplay() {
  const countDisplay = document.getElementById("dataCountDisplay");
  if (countDisplay) {
    countDisplay.textContent = STATE.originalData.length;
  }
}

function setupAnalysisFilters() {
  const trainSet = new Set();
  const stationSet = new Set();

  STATE.originalData.forEach(item => {
    if (item["Tên Tàu"]) trainSet.add(item["Tên Tàu"]);
    if (item["Trạm"]) stationSet.add(item["Trạm"]);
  });

  const trainSelect = document.getElementById("analysisTrainFilter");
  const stationSelect = document.getElementById("analysisStationFilter");

  trainSelect.innerHTML = '<option value="">Tất Cả</option>';
  stationSelect.innerHTML = '<option value="">Tất Cả</option>';

  [...trainSet].sort().forEach(train => {
    trainSelect.innerHTML += `<option value="${train}">${train}</option>`;
  });

  [...stationSet].sort().forEach(station => {
    stationSelect.innerHTML += `<option value="${station}">${station}</option>`;
  });

  // Setup event listeners
  document.getElementById("analysisChartType").addEventListener("change", renderMainAnalysisChart);
  document.getElementById("analysisTrainFilter").addEventListener("change", renderMainAnalysisChart);
  document.getElementById("analysisStationFilter").addEventListener("change", renderMainAnalysisChart);
  document.getElementById("analysisApplyFilters").addEventListener("click", () => {
    STATE.analysisFilterState.dateFrom = document.getElementById("analysisDateFrom").value;
    STATE.analysisFilterState.dateTo = document.getElementById("analysisDateTo").value;
    renderMainAnalysisChart();
  });

  document.getElementById("analysisDateFrom").addEventListener("change", () => {
    STATE.analysisFilterState.dateFrom = document.getElementById("analysisDateFrom").value;
  });

  document.getElementById("analysisDateTo").addEventListener("change", () => {
    STATE.analysisFilterState.dateTo = document.getElementById("analysisDateTo").value;
  });
}

function getFilteredAnalysisData() {
  const chartType = document.getElementById("analysisChartType").value;
  const trainFilter = document.getElementById("analysisTrainFilter").value;
  const stationFilter = document.getElementById("analysisStationFilter").value;
  const dateFrom = document.getElementById("analysisDateFrom").value;
  const dateTo = document.getElementById("analysisDateTo").value;

  return STATE.originalData.filter(item => {
    if (trainFilter && item["Tên Tàu"] !== trainFilter) return false;
    if (stationFilter && item["Trạm"] !== stationFilter) return false;

    if (dateFrom || dateTo) {
      const itemDate = parseDateString(item["Ngày Đến"]);
      if (!itemDate) return false;
      if (dateFrom && itemDate < new Date(dateFrom)) return false;
      if (dateTo) {
        const toDate = new Date(dateTo);
        toDate.setHours(23, 59, 59, 999);
        if (itemDate > toDate) return false;
      }
    }
    return true;
  });
}

function renderMainAnalysisChart() {
  const chartType = document.getElementById("analysisChartType").value;
  const filteredData = getFilteredAnalysisData();

  if (STATE.chartInstances.mainAnalysis) {
    STATE.chartInstances.mainAnalysis.destroy();
    STATE.chartInstances.mainAnalysis = null;
  }

  const ctx = document.getElementById("mainAnalysisChart");
  if (!ctx) return;

  switch (chartType) {
    case "avgSpeed":
      renderAvgSpeedChartNew(ctx, filteredData);
      break;
    case "tripCount":
      renderTripCountChartNew(ctx, filteredData);
      break;
    case "speedPerDay":
      renderSpeedPerDayChartNew(ctx, filteredData);
      break;
    case "speedComparison":
      renderSpeedComparisonChart(ctx, filteredData);
      break;
  }
}

function renderAvgSpeedChartNew(ctx, data) {
  const trainSpeeds = {};
  const trainCounts = {};

  data.forEach(item => {
    const train = item["Tên Tàu"];
    const speed = Number(item["Vận Tốc"]);
    if (!isNaN(speed) && isFinite(speed)) {
      trainSpeeds[train] = (trainSpeeds[train] || 0) + speed;
      trainCounts[train] = (trainCounts[train] || 0) + 1;
    }
  });

  const trainNames = Object.keys(trainSpeeds).sort();
  if (trainNames.length === 0) {
    ctx.innerHTML = "<p style='text-align: center; color: #999;'>Không có dữ liệu</p>";
    return;
  }

  const avgSpeeds = trainNames.map(name => (trainSpeeds[name] / trainCounts[name]).toFixed(2));
  const validAvgSpeeds = avgSpeeds.filter(v => !isNaN(parseFloat(v)));
  const globalAvgSpeed = validAvgSpeeds.length > 0 
    ? (validAvgSpeeds.reduce((sum, val) => sum + parseFloat(val), 0) / validAvgSpeeds.length).toFixed(2)
    : 0;

  STATE.chartInstances.mainAnalysis = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: trainNames,
      datasets: [
        {
          label: '📍 Tốc Độ TB (km/h)',
          data: avgSpeeds,
          backgroundColor: trainNames.map(name => hashColor(name)),
          borderColor: trainNames.map(name => hashColorDark(name)),
          borderWidth: 2,
          borderRadius: 5,
          barThickness: 30
        },
        {
          label: '➖ TB Toàn Bộ',
          type: 'line',
          data: Array(avgSpeeds.length).fill(globalAvgSpeed),
          borderColor: '#ff6b6b',
          borderWidth: 3,
          fill: false,
          pointRadius: 0,
          tension: 0.4,
          borderDash: [5, 5]
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: true, position: 'top' },
        tooltip: {
          backgroundColor: 'rgba(0,0,0,0.8)',
          padding: 12,
          titleFont: { size: 13 },
          bodyFont: { size: 12 },
          borderColor: 'rgba(255,255,255,0.2)',
          borderWidth: 1
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { font: { size: 11 } },
          grid: { color: 'rgba(0,0,0,0.05)' }
        },
        x: { ticks: { font: { size: 11 } } }
      }
    }
  });
}

function renderTripCountChartNew(ctx, data) {
  const trainCounts = {};
  data.forEach(item => {
    const train = item["Tên Tàu"];
    if (train) trainCounts[train] = (trainCounts[train] || 0) + 1;
  });

  const trainNames = Object.keys(trainCounts).sort();
  if (trainNames.length === 0) {
    ctx.innerHTML = "<p style='text-align: center; color: #999;'>Không có dữ liệu</p>";
    return;
  }

  const tripCounts = trainNames.map(name => trainCounts[name]);
  const globalTripAvg = (tripCounts.reduce((a, b) => a + b, 0) / tripCounts.length).toFixed(2);

  STATE.chartInstances.mainAnalysis = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: trainNames,
      datasets: [
        {
          label: '🚂 Số Chuyến',
          data: tripCounts,
          backgroundColor: trainNames.map(name => hashColor(name)),
          borderColor: trainNames.map(name => hashColorDark(name)),
          borderWidth: 2,
          borderRadius: 5,
          barThickness: 30
        },
        {
          label: '➖ TB Toàn Bộ',
          type: 'line',
          data: Array(trainNames.length).fill(globalTripAvg),
          borderColor: '#ff6b6b',
          borderWidth: 3,
          fill: false,
          pointRadius: 0,
          tension: 0.4,
          borderDash: [5, 5]
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: true, position: 'top' },
        tooltip: {
          backgroundColor: 'rgba(0,0,0,0.8)',
          padding: 12,
          titleFont: { size: 13 },
          bodyFont: { size: 12 },
          borderColor: 'rgba(255,255,255,0.2)',
          borderWidth: 1
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { font: { size: 11 } },
          grid: { color: 'rgba(0,0,0,0.05)' }
        },
        x: { ticks: { font: { size: 11 } } }
      }
    }
  });
}

function renderSpeedPerDayChartNew(ctx, data) {
  const trainDateSpeedMap = {};
  data.forEach(item => {
    const train = item["Tên Tàu"];
    try {
      const dateValue = item["Ngày Đến"];
      if (!dateValue) return;
      const dateObj = new Date(dateValue);
      if (isNaN(dateObj.getTime())) return;
      const date = dateObj.toISOString().split("T")[0];
      const speed = Number(item["Vận Tốc"]);
      if (isNaN(speed)) return;
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

  if (allDates.length === 0) {
    ctx.innerHTML = "<p style='text-align: center; color: #999;'>Không có dữ liệu</p>";
    return;
  }

  const datasets = Object.keys(trainDateGroups).map(train => {
    if (!STATE.trainColorMap[train]) STATE.trainColorMap[train] = hashColor(train);
    return {
      label: train,
      data: allDates.map(date => trainDateGroups[train][date] || null),
      fill: false,
      borderColor: STATE.trainColorMap[train],
      backgroundColor: STATE.trainColorMap[train] + '20',
      tension: 0.4,
      pointRadius: 4,
      pointBackgroundColor: STATE.trainColorMap[train],
      pointBorderColor: 'white',
      pointBorderWidth: 2
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
    label: '➖ TB Toàn Bộ Mỗi Ngày',
    data: Array(allDates.length).fill((totalSum / totalCount).toFixed(2)),
    borderColor: '#ff6b6b',
    borderWidth: 3,
    fill: false,
    pointRadius: 0,
    tension: 0.4,
    borderDash: [5, 5]
  });

  STATE.chartInstances.mainAnalysis = new Chart(ctx, {
    type: 'line',
    data: { labels: allDates, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: true, position: 'top' },
        tooltip: {
          backgroundColor: 'rgba(0,0,0,0.8)',
          padding: 12,
          titleFont: { size: 13 },
          bodyFont: { size: 12 },
          borderColor: 'rgba(255,255,255,0.2)',
          borderWidth: 1
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { font: { size: 11 } },
          grid: { color: 'rgba(0,0,0,0.05)' }
        },
        x: { ticks: { font: { size: 11 } } }
      }
    }
  });
}

function renderSpeedComparisonChart(ctx, data) {
  const stationSpeeds = {};
  const stationCounts = {};

  data.forEach(item => {
    const station = item["Trạm"];
    const speed = Number(item["Vận Tốc"]);
    if (!isNaN(speed) && isFinite(speed)) {
      stationSpeeds[station] = (stationSpeeds[station] || 0) + speed;
      stationCounts[station] = (stationCounts[station] || 0) + 1;
    }
  });

  const stationNames = Object.keys(stationSpeeds).sort();
  if (stationNames.length === 0) {
    ctx.innerHTML = "<p style='text-align: center; color: #999;'>Không có dữ liệu</p>";
    return;
  }

  const avgSpeeds = stationNames.map(name => (stationSpeeds[name] / stationCounts[name]).toFixed(2));

  STATE.chartInstances.mainAnalysis = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: stationNames,
      datasets: [
        {
          label: '📍 Tốc Độ TB Theo Trạm (km/h)',
          data: avgSpeeds,
          backgroundColor: stationNames.map(name => hashColor(name)),
          borderColor: stationNames.map(name => hashColorDark(name)),
          borderWidth: 2,
          borderRadius: 5,
          barThickness: 30
        }
      ]
    },
    options: {
      indexAxis: avgSpeeds.length > 8 ? 'y' : 'x',
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: true, position: 'top' },
        tooltip: {
          backgroundColor: 'rgba(0,0,0,0.8)',
          padding: 12,
          titleFont: { size: 13 },
          bodyFont: { size: 12 }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { font: { size: 11 } },
          grid: { color: 'rgba(0,0,0,0.05)' }
        },
        x: { ticks: { font: { size: 11 } } }
      }
    }
  });
}

function renderStationCharts() {
  const container = document.getElementById("stationChartsContainer");
  container.innerHTML = "";

  const stationSet = new Set();
  STATE.originalData.forEach(item => {
    if (item["Trạm"]) stationSet.add(item["Trạm"]);
  });

  const stations = [...stationSet].sort();

  stations.forEach(station => {
    const stationData = STATE.originalData.filter(item => item["Trạm"] === station);
    if (stationData.length === 0) return;

    const card = document.createElement("div");
    card.className = "station-chart-card";
    
    const stationChartId = `stationChart_${station.replace(/\s+/g, '_')}`;
    const speedLineChartId = `speedLineChart_${station.replace(/\s+/g, '_')}`;
    
    card.innerHTML = `
      <h3>🏢 ${station}</h3>
      <div class="station-chart-subgrid">
        <div class="station-chart-item">
          <h4>🚂 Phân Bố Tàu</h4>
          <canvas id="${stationChartId}" height="60"></canvas>
        </div>
        <div class="station-chart-item">
          <h4>⚡ Tốc Độ Tàu Mới Nhất</h4>
          <canvas id="${speedLineChartId}" height="60"></canvas>
        </div>
      </div>
    `;
    container.appendChild(card);

    // Render station charts
    setTimeout(() => {
      const ctx1 = document.getElementById(stationChartId);
      const ctx2 = document.getElementById(speedLineChartId);
      if (ctx1) {
        renderStationDetailChart(ctx1, station, stationData);
      }
      if (ctx2) {
        renderStationLatestSpeedChart(ctx2, station, stationData);
      }
    }, 0);
  });
}

function renderStationDetailChart(ctx, stationName, stationData) {
  const trainCounts = {};

  stationData.forEach(item => {
    const train = item["Tên Tàu"];
    if (train) {
      trainCounts[train] = (trainCounts[train] || 0) + 1;
    }
  });

  const trainNames = Object.keys(trainCounts).sort();
  const trainCountValues = trainNames.map(name => trainCounts[name]);

  const chartId = `stationChart_${stationName.replace(/\s+/g, '_')}`;
  if (STATE.chartInstances.stationCharts[chartId]) {
    STATE.chartInstances.stationCharts[chartId].destroy();
  }

  STATE.chartInstances.stationCharts[chartId] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: trainNames,
      datasets: [
        {
          data: trainCountValues,
          backgroundColor: trainNames.map(name => hashColor(name)),
          borderColor: 'white',
          borderWidth: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { padding: 8, font: { size: 10 } }
        },
        tooltip: {
          backgroundColor: 'rgba(0,0,0,0.8)',
          padding: 8,
          titleFont: { size: 11 },
          bodyFont: { size: 10 }
        }
      }
    }
  });
}

function renderStationLatestSpeedChart(ctx, stationName, stationData) {
  // Get the latest entry for each train at this station
  const trainLatestSpeed = {};
  const trainLatestDate = {};

  stationData.forEach(item => {
    const train = item["Tên Tàu"];
    const speed = Number(item["Vận Tốc"]);
    const dateStr = item["Ngày Đến"];
    const timeStr = item["Giờ Đến"];
    
    if (!isNaN(speed) && isFinite(speed)) {
      const dateObj = parseDateString(dateStr);
      const timeObj = parseTimeString(timeStr);
      const dateTime = dateObj ? dateObj.getTime() : 0;
      
      if (!trainLatestDate[train] || dateTime > trainLatestDate[train]) {
        trainLatestDate[train] = dateTime;
        trainLatestSpeed[train] = speed;
      }
    }
  });

  const trainNames = Object.keys(trainLatestSpeed).sort();
  const speeds = trainNames.map(name => trainLatestSpeed[name].toFixed(2));

  const chartId = `speedLineChart_${stationName.replace(/\s+/g, '_')}`;
  if (STATE.chartInstances.stationCharts[chartId]) {
    STATE.chartInstances.stationCharts[chartId].destroy();
  }

  STATE.chartInstances.stationCharts[chartId] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: trainNames,
      datasets: [
        {
          label: 'Tốc Độ (km/h)',
          data: speeds,
          borderColor: trainNames.map(name => hashColor(name)),
          backgroundColor: trainNames.map(name => hashColor(name) + '20'),
          fill: true,
          tension: 0.4,
          pointRadius: 5,
          pointBackgroundColor: trainNames.map(name => hashColor(name)),
          pointBorderColor: 'white',
          pointBorderWidth: 2,
          pointHoverRadius: 7
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          backgroundColor: 'rgba(0,0,0,0.8)',
          padding: 8,
          titleFont: { size: 11 },
          bodyFont: { size: 10 },
          callbacks: {
            label: function(context) {
              return context.parsed.y.toFixed(2) + ' km/h';
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          max: 100,
          ticks: { font: { size: 10 } },
          grid: { color: 'rgba(0,0,0,0.05)' }
        },
        x: { ticks: { font: { size: 10 } } }
      }
    }
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

function hashColorDark(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 35%)`;
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
