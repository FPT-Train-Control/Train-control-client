const navButtons = document.querySelectorAll(".nav-bar button");
navButtons[0].classList.add("active-nav");
const sections = {
  "Thông Tin Tàu": "sectionHoSoTau",
  "Phân tích dữ liệu": "sectionPhanTich",
  "Bảng Điều Khiển": "sectionBangDieuKhien"
};
navButtons.forEach(button => {
  button.addEventListener("click", () => {
    Object.values(sections).forEach(id => {
      document.getElementById(id).style.display = "none";
    });
    const sectionId = sections[button.textContent.trim()];
    if (sectionId) {
      const section = document.getElementById(sectionId);
      section.style.opacity = 0;
      section.style.display = "block";
      setTimeout(() => section.style.opacity = 1, 10);
    }
    navButtons.forEach(btn => btn.classList.remove("active-nav"));
    button.classList.add("active-nav");
  });
});

const GAS_URL = "https://script.google.com/macros/s/AKfycbziweULUcvboDYnWmFpxHqjC8Hcra7B3jG_5jX04AtTQW2h3ltqlsvzt0uIRdBS5mpi/exec";
let originalData = [];
let currentFilteredData = [];
let currentSort = {
  key: "",
  asc: true
};
let ws = null;

function applySavedUnits() {
  const savedSpeedUnit = localStorage.getItem("speedUnit");
  if (savedSpeedUnit) document.getElementById("speedUnit").value = savedSpeedUnit;
}

function reapplyFiltersAndSort() {
  filterAndSearch();
  if (currentSort.key) {
    sortBy(currentSort.key);
  }
}

function hashColor(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 50%)`;
}

async function fetchDataAndRender() {
  try {
    const res = await fetch(GAS_URL + "?t=" + Date.now());
    const json = await res.json();
    if (json.status === "success") {
      originalData = json.data;
      currentFilteredData = originalData;
      populateFilters();
      reapplyFiltersAndSort();
      renderCharts();
    }
  } catch (err) {
    console.error("Error fetching train data:", err);
  }
}

function populateFilters() {
  const tenTauSelect = document.getElementById("filterTenTau");
  const tuyenSelect = document.getElementById("filterTuyen");
  const savedTenTau = tenTauSelect.value;
  const savedTuyen = tuyenSelect.value;
  const tenTauSet = new Set();
  const tuyenSet = new Set();
  originalData.forEach(item => {
    tenTauSet.add(item["Tên Tàu"]);
    tuyenSet.add(item["Tuyến"]);
  });
  tenTauSelect.innerHTML = `<option value="">Tất Cả Tên Tàu</option>`;
  tuyenSelect.innerHTML = `<option value="">Tất Cả Tuyến</option>`;
  tenTauSet.forEach(val => {
    tenTauSelect.innerHTML += `<option value="${val}">${val}</option>`;
  });
  tuyenSet.forEach(val => {
    tuyenSelect.innerHTML += `<option value="${val}">${val}</option>`;
  });
  tenTauSelect.value = savedTenTau;
  tuyenSelect.value = savedTuyen;
}

function isValidDate(d) {
  return d instanceof Date && !isNaN(d);
}

function parseDateString(str) {
  let d = new Date(str);
  if (isValidDate(d)) return d;
  const parts = str.split("/");
  if (parts.length === 3) {
    const day = parseInt(parts[0]);
    const month = parseInt(parts[1]) - 1;
    const year = parseInt(parts[2]);
    d = new Date(year, month, day);
    if (isValidDate(d)) return d;
  }
  return null;
}

function parseTimeString(excelTimeStr) {
  const parts = excelTimeStr.split(" ");
  for (const p of parts) {
    if (/^\d{2}:\d{2}:\d{2}$/.test(p)) {
      return p;
    }
  }
  return null;
}

function parseTimeOnly(excelTimeStr) {
  const date = new Date(excelTimeStr);
  if (isNaN(date)) return "⚠ Invalid";
  const h = date.getHours().toString().padStart(2, '0');
  const m = date.getMinutes().toString().padStart(2, '0');
  const s = date.getSeconds().toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function renderTable(data) {
  currentFilteredData = data;
  const tbody = document.querySelector("#trainTable tbody");
  tbody.innerHTML = "";
  const speedUnit = document.getElementById("speedUnit").value;
  data.forEach(row => {
    let speed = Number(row["Vận Tốc"]);
    if (speedUnit === "ms") speed = speed.toFixed(2) + " m/s";
    else if (speedUnit === "mh") speed = (speed * 3600).toFixed(2) + " m/h";
    else if (speedUnit === "kmh") speed = (speed / 1000 * 3600).toFixed(2) + " km/h";
    else if (speedUnit === "cms") speed = (speed * 100).toFixed(2) + " cm/s";
    const ngayDenDate = parseDateString(row["Ngày Đến"]);
    const gioDenDate = parseTimeString(row["Giờ Đến"]);
    const ngayRoiDate = parseDateString(row["Ngày Rời"]);
    const gioRoiDate = parseTimeString(row["Giờ Rời"]);
    const ngayDen = ngayDenDate ? ngayDenDate.toLocaleDateString("vi-VN") : "⚠ Invalid";
    const gioDen = gioDenDate ? gioDenDate : "⚠ Invalid";
    const ngayRoi = ngayRoiDate ? ngayRoiDate.toLocaleDateString("vi-VN") : "⚠ Invalid";
    const gioRoi = gioRoiDate ? gioRoiDate : "⚠ Invalid";
    if (!ngayDenDate || !gioDenDate || !ngayRoiDate || !gioRoiDate) {
      console.warn("Invalid date or time format in row:", row);
    }
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row["STT"]}</td>
      <td>${row["Tên Tàu"]}</td>
      <td>${row["Tuyến"]}</td>
      <td>${row["Trạm"]}</td>
      <td>${speed}</td>
      <td>${ngayDen}</td>
      <td>${gioDen}</td>
      <td>${ngayRoi}</td>
      <td>${gioRoi}</td>
      <td>${row["Trạng Thái"]}</td>
    `;
    tbody.appendChild(tr);
  });
}

function filterAndSearch() {
  const searchValue = document.getElementById("searchInput").value.toLowerCase();
  const tenTauFilter = document.getElementById("filterTenTau").value;
  const tuyenFilter = document.getElementById("filterTuyen").value;
  const dateFromValue = document.getElementById("dateFrom").value;
  const dateToValue = document.getElementById("dateTo").value;
  const timeFromValue = document.getElementById("timeFrom").value;
  const timeToValue = document.getElementById("timeTo").value;
  const filtered = originalData.filter(item => {
    const matchSearch = Object.values(item).some(val => String(val).toLowerCase().includes(searchValue));
    const matchTenTau = !tenTauFilter || item["Tên Tàu"] === tenTauFilter;
    const matchTuyen = !tuyenFilter || item["Tuyến"] === tuyenFilter;
    let matchDateTime = true;
    if (dateFromValue || dateToValue || timeFromValue || timeToValue) {
      const date = new Date(item["Ngày Đến"]);
      const time = new Date(item["Giờ Đến"]);
      const combinedDateTime = new Date(date.getFullYear(), date.getMonth(), date.getDate(), time.getHours(), time.getMinutes(), time.getSeconds());
      if (dateFromValue) {
        const dateFrom = new Date(dateFromValue);
        if (combinedDateTime < dateFrom) matchDateTime = false;
      }
      if (dateToValue) {
        const dateTo = new Date(dateToValue);
        dateTo.setHours(23, 59, 59, 999);
        if (combinedDateTime > dateTo) matchDateTime = false;
      }
      if (timeFromValue) {
        const [h, m] = timeFromValue.split(":");
        if (combinedDateTime.getHours() < +h || (combinedDateTime.getHours() === +h && combinedDateTime.getMinutes() < +m)) {
          matchDateTime = false;
        }
      }
      if (timeToValue) {
        const [h, m] = timeToValue.split(":");
        if (combinedDateTime.getHours() > +h || (combinedDateTime.getHours() === +h && combinedDateTime.getMinutes() > +m)) {
          matchDateTime = false;
        }
      }
    }
    return matchSearch && matchTenTau && matchTuyen && matchDateTime;
  });
  renderTable(filtered);
}

function sortBy(key) {
  const asc = currentSort.key === key ? !currentSort.asc : true;
  currentSort = {
    key,
    asc
  };
  const sorted = [...currentFilteredData].sort((a, b) => {
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

let servoState = null;
let autoState = null;

function sendJSON(obj) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify(obj));
    } catch (e) {
      console.error("Failed to send JSON over WS:", e, obj);
    }
  } else {
    console.warn("WebSocket not open - cannot send:", obj);
  }
}

function setupWebSocket() {
  ws = new WebSocket("wss://durable-chat-template.templates.workers.dev/parties/chat/FPTTrainWSS");
  ws.onopen = () => {
    console.log("WebSocket connected.");
    sendJSON({
      command: "barrier_state_request"
    });
    sendJSON({
      command: "auto_state_request"
    });
  };
  ws.onmessage = async (event) => {
    let text;
    try {
      if (typeof event.data === "string") {
        text = event.data;
      } else if (event.data instanceof Blob && event.data.text) {
        text = await event.data.text();
      } else {
        text = String(event.data);
      }
    } catch (e) {
      console.error("Error reading WS message:", e);
      return;
    }
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      parsed = null;
    }
    if (parsed && parsed.command) {
      const cmd = parsed.command;
      console.log("WS JSON command:", cmd, parsed);
      switch (cmd) {
        case "barrier_state_response":
        case "barrier_state_update": {
          const state = (parsed.state || "").toUpperCase();
          if (state === "OPEN") servoState = 0;
          else if (state === "CLOSED") servoState = 1;
          else {
            console.warn("Unknown barrier state from WS:", parsed.state);
          }
          updateServoUI();
          break;
        }
        case "auto_state_response": {
          const st = !!parsed.state;
          autoState = st ? "True" : "False";
          updateautoUI();
          break;
        }
        case "update_data": {
          console.log("WS -> update_data: refreshing data");
          if (typeof fetchDataAndRender === "function") fetchDataAndRender();
          break;
        }
        case "update_warning": {
          console.log("WS -> update_warning:", parsed);
          if (parsed.distance !== undefined) document.getElementById('distance').value = parsed.distance;
          if (parsed.warning1 !== undefined) document.getElementById('delay1').value = parsed.warning1;
          if (parsed.warning2 !== undefined) document.getElementById('delay2').value = parsed.warning2;
          break;
        }
        default:
          console.log("Unhandled WS JSON command:", parsed);
      }
      return;
    }
    console.log("WebSocket message received (text):", text);
    if (text === "update_data") {
      if (typeof fetchDataAndRender === "function") fetchDataAndRender();
    } else if (text.startsWith("servo is")) {
      const parts = text.split(" ");
      const val = parseInt(parts[2], 10);
      if (!isNaN(val)) {
        servoState = val;
        updateServoUI();
      }
    } else if (text.startsWith("auto is")) {
      const parts = text.split(" ");
      const val = parseInt(parts[2], 10);
      if (!isNaN(val)) {
        autoState = val;
        updateautoUI();
      }
    } else {
      console.log("Unhandled legacy message:", text);
    }
  };
  ws.onclose = () => {
    console.warn("WebSocket disconnected. Reconnecting in 5s...");
    setTimeout(setupWebSocket, 5000);
  };
  ws.onerror = (err) => {
    console.error("WebSocket error:", err);
    try {
      ws.close();
    } catch (e) {}
  };
}

function exportExcel() {
  const ws_data = [
    ["STT", "Tên Tàu", "Tuyến", "Trạm", "Vận Tốc", "Ngày Đến", "Giờ Đến", "Ngày Rời", "Giờ Rời", "Trạng Thái"],
    ...currentFilteredData.map(row => [
      row["STT"],
      row["Tên Tàu"],
      row["Tuyến"],
      row["Trạm"],
      row["Vận Tốc"],
      row["Ngày Đến"],
      row["Giờ Đến"],
      row["Ngày Rời"],
      row["Giờ Rời"],
      row["Trạng Thái"]
    ])
  ];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(ws_data);
  XLSX.utils.book_append_sheet(wb, ws, "Data");
  XLSX.writeFile(wb, "TrainData.xlsx");
}

async function exportPDF() {
  const {
    jsPDF
  } = window.jspdf;
  const pdf = new jsPDF('l', 'pt', 'a4');
  const table = document.querySelector("#trainTable");
  await html2canvas(table).then(canvas => {
    const imgData = canvas.toDataURL('image/png');
    const imgProps = pdf.getImageProperties(imgData);
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    pdf.save("TrainData.pdf");
  });
}

const servoToggleButton = document.getElementById("servoToggle");
const servoStateLabel = document.getElementById("servoStateLabel");
servoToggleButton.addEventListener("click", () => {
  if (ws && ws.readyState === WebSocket.OPEN && servoState !== null) {
    if (servoState === 0) {
      sendJSON({
        command: "close_barrier"
      });
    } else {
      sendJSON({
        command: "open_barrier"
      });
    }
  }
});

async function exportReportDOCX(tableData, filterTuyenValue, filterTenTauValue, dateFromValue, dateToValue, timeFromValue, timeToValue) {
  const {
    Document,
    Packer,
    Paragraph,
    TextRun,
    Table,
    TableRow,
    TableCell,
    WidthType,
    AlignmentType,
    BorderStyle,
    ShadingType
  } = docx;
  const formatDate = (val) => {
    if (!val) return "";
    const d = new Date(val);
    if (isNaN(d)) return "";
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;
  };
  const formatTime = (val) => {
    if (!val) return "";
    const d = new Date(val);
    if (isNaN(d)) return "";
    return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}:${String(d.getSeconds()).padStart(2,"0")}`;
  };
  const now = new Date();
  const ngay = now.getDate();
  const thang = now.getMonth() + 1;
  const nam = now.getFullYear();
  const header1 = new Paragraph({
    children: [
      new TextRun({
        text: "TRƯỜNG CAO ĐẲNG GIAO THÔNG VẬN TẢI",
        bold: true,
        size: 22
      }),
      new TextRun({
        text: "		CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
        bold: true,
        size: 22
      })
    ],
    spacing: {
      after: 200
    }
  });
  const header2 = new Paragraph({
    children: [
      new TextRun({
        text: "	KHOA KỸ THUẬT ĐIỆN - ĐIỆN TỬ",
        bold: true,
        size: 20
      }),
      new TextRun({
        text: "						Độc lập - Tự do - Hạnh phúc",
        bold: true,
        size: 20
      })
    ],
    spacing: {
      after: 200
    }
  });
  const dateLine = new Paragraph({
    alignment: AlignmentType.RIGHT,
    children: [
      new TextRun({
        text: `TP.HCM, ngày ${ngay} tháng ${thang} năm ${nam}`,
        italics: true,
        size: 20
      })
    ],
    spacing: {
      after: 200
    }
  });
  const title = new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({
      text: "BẢNG THÔNG TIN TÀU CHẠY",
      bold: true,
      color: "0000FF",
      size: 32
    })],
    spacing: {
      after: 300
    }
  });
  const infoFields = [{
    label: "Tuyến",
    value: filterTuyenValue
  }, {
    label: "Tên tàu",
    value: filterTenTauValue
  }, {
    label: "Từ ngày",
    value: dateFromValue
  }, {
    label: "Đến ngày",
    value: dateToValue
  }, {
    label: "Từ giờ",
    value: timeFromValue
  }, {
    label: "Đến giờ",
    value: timeToValue
  }];
  const infoParagraphs = infoFields.filter(f => f.value).map(f => new Paragraph({
    text: `${f.label}: ${f.value}`,
    spacing: {
      after: 100
    },
    size: 20
  }));
  let table = null;
  if (tableData && tableData.length > 0) {
    const keys = Object.keys(tableData[0]);
    const colWidth = Math.floor(100 / keys.length);
    const headerRow = new TableRow({
      children: keys.map(k => new TableCell({
        children: [new Paragraph({
          text: k,
          bold: true,
          alignment: AlignmentType.CENTER,
          size: 20
        })],
        shading: {
          fill: "BDB76B"
        },
        width: {
          size: colWidth,
          type: WidthType.PERCENTAGE
        },
        margins: {
          top: 200,
          bottom: 200,
          left: 200,
          right: 200
        }
      }))
    });
    const dataRows = tableData.map((rowObj, idx) => new TableRow({
      children: keys.map(k => {
        let val = rowObj[k];
        if (k.includes("Giờ")) val = formatTime(val);
        if (k.includes("Ngày")) val = formatDate(val);
        return new TableCell({
          children: [new Paragraph({
            text: String(val ?? ""),
            size: 20
          })],
          shading: {
            fill: idx % 2 === 0 ? "FFFFFF" : "FFF4E6"
          },
          width: {
            size: colWidth,
            type: WidthType.PERCENTAGE
          },
          margins: {
            top: 200,
            bottom: 200,
            left: 200,
            right: 200
          }
        });
      })
    }));
    table = new Table({
      rows: [headerRow, ...dataRows],
      width: {
        size: 100,
        type: WidthType.PERCENTAGE
      },
      alignment: AlignmentType.CENTER
    });
  }
  const subDateLine = new Paragraph({
    alignment: AlignmentType.RIGHT,
    children: [
      new TextRun({
        text: `TP.HCM, ngày ${ngay} tháng ${thang} năm ${nam}`,
        italics: true,
        size: 20
      })
    ],
    spacing: {
      after: 200,
      before: 200
    }
  });
  const signLine = new Paragraph({
    alignment: AlignmentType.RIGHT,
    children: [
      new TextRun({
        text: `Trưởng Trạm		`,
        bold: true,
        size: 28
      })
    ],
    spacing: {
      after: 200
    }
  });
  const subSignLine = new Paragraph({
    alignment: AlignmentType.RIGHT,
    children: [
      new TextRun({
        text: `(Ký và ghi rõ họ tên)		`,
        italics: true,
        size: 20
      })
    ],
    spacing: {
      after: 200
    }
  });
  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: "Times New Roman",
          },
          paragraph: {
            spacing: {
              line: 276
            }
          }
        }
      }
    },
    sections: [{
      properties: {
        page: {
          margin: {
            top: 720,
            bottom: 720,
            left: 720,
            right: 720
          }
        }
      },
      children: [
        header1, header2, dateLine, title,
        ...infoParagraphs, ...(table ? [table] : []),
        subDateLine, signLine, subSignLine
      ]
    }]
  });
  const blob = await Packer.toBlob(doc);
  const filename = `BaoCao_${(filterTenTauValue || 'Tau').replace(/\s+/g,'_')}.docx`;
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
}

function updateServoUI() {
  if (servoState === 0) {
    servoToggleButton.textContent = "Hạ barrier";
    servoToggleButton.style.backgroundColor = "#f37021";
    servoStateLabel.textContent = "Open";
    servoStateLabel.style.backgroundColor = "#51b848";
    document.getElementById("servoSatateLabelImg").src = "./Barrier Open.png"
  } else if (servoState === 1) {
    servoToggleButton.textContent = "Nâng barrier";
    servoToggleButton.style.backgroundColor = "#51b848";
    servoStateLabel.textContent = "Close";
    servoStateLabel.style.backgroundColor = "#f37021";
    document.getElementById("servoSatateLabelImg").src = "./Barrier Close (1).png"
  }
}

const autoToggleButton = document.getElementById("autoToggle");
const autoStateLabel = document.getElementById("autoStateLabel");
autoToggleButton.addEventListener("click", () => {
  if (ws && ws.readyState === WebSocket.OPEN && autoState !== null) {
    const nextStateBool = !(autoState === "True");
    sendJSON({
      command: "set_auto_state",
      state: nextStateBool
    });
  }
});

function updateautoUI() {
  if (autoState === "False") {
    autoToggleButton.textContent = "MANUAL";
    autoToggleButton.style.backgroundColor = "#f37021";
    autoStateLabel.textContent = "AUTO";
    autoStateLabel.style.backgroundColor = "#51b848";
    document.getElementById("autoSatateLabelImg").src = "./Automation.png";
  } else if (autoState === "True") {
    autoToggleButton.textContent = "AUTO";
    autoToggleButton.style.backgroundColor = "#51b848";
    autoStateLabel.textContent = "MANUAL";
    autoStateLabel.style.backgroundColor = "#f37021";
    document.getElementById("autoSatateLabelImg").src = "./Automation.gif";
  }
}

const toggleBtn = document.querySelector('.toggle-form-btn');
const form = document.getElementById('settingsForm');
toggleBtn.addEventListener('click', () => {
  form.classList.toggle('hidden');
});

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const distanceRaw = document.getElementById('distance').value;
  const delay1Raw = document.getElementById('delay1').value;
  const delay2Raw = document.getElementById('delay2').value;
  const distance = distanceRaw === "" ? undefined : Number(distanceRaw);
  const warning1 = delay1Raw === "" ? undefined : Number(delay1Raw);
  const warning2 = delay2Raw === "" ? undefined : Number(delay2Raw);
  console.log("Submitted values:", {
    distance,
    warning1,
    warning2
  });
  const payload = {
    command: "update_warning"
  };
  if (!isNaN(distance) && distance !== undefined) payload.distance = distance;
  if (!isNaN(warning1) && warning1 !== undefined) payload.warning1 = warning1;
  if (!isNaN(warning2) && warning2 !== undefined) payload.warning2 = warning2;
  sendJSON(payload);
});

document.getElementById("searchInput").addEventListener("input", filterAndSearch);
document.getElementById("filterTenTau").addEventListener("change", filterAndSearch);
document.getElementById("filterTuyen").addEventListener("change", filterAndSearch);
document.getElementById("speedUnit").addEventListener("change", () => {
  localStorage.setItem("speedUnit", document.getElementById("speedUnit").value);
  renderTable(currentFilteredData);
});
document.getElementById("dateFrom").addEventListener("change", filterAndSearch);
document.getElementById("dateTo").addEventListener("change", filterAndSearch);
document.getElementById("timeFrom").addEventListener("change", filterAndSearch);
document.getElementById("timeTo").addEventListener("change", filterAndSearch);
document.querySelectorAll("#trainTable th").forEach(th => {
  th.addEventListener("click", () => sortBy(th.dataset.key));
});
document.getElementById("exportExcel").addEventListener("click", exportExcel);
document.getElementById("exportPDF").addEventListener("click", exportPDF);
document.getElementById("exportDOCX").addEventListener("click", () => {
  const filterTuyenValue = document.getElementById("filterTuyen").value;
  const filterTenTauValue = document.getElementById("filterTenTau").value;
  const dateFromValue = document.getElementById("dateFrom").value;
  const dateToValue = document.getElementById("dateTo").value;
  const timeFromValue = document.getElementById("timeFrom").value;
  const timeToValue = document.getElementById("timeTo").value;
  exportReportDOCX(currentFilteredData, filterTuyenValue, filterTenTauValue, dateFromValue, dateToValue, timeFromValue, timeToValue);
});

let avgSpeedChartInstance = null;
let tripCountChartInstance = null;
let speedPerDayChartInstance = null;
const trainColorMap = {};

function renderCharts() {
  if (avgSpeedChartInstance) avgSpeedChartInstance.destroy();
  if (tripCountChartInstance) tripCountChartInstance.destroy();
  if (speedPerDayChartInstance) speedPerDayChartInstance.destroy();
  const trainSpeeds = {};
  const trainCounts = {};
  originalData.forEach(item => {
    const train = item["Tên Tàu"];
    const speed = Number(item["Vận Tốc"]);
    trainSpeeds[train] = (trainSpeeds[train] || 0) + speed;
    trainCounts[train] = (trainCounts[train] || 0) + 1;
  });
  const trainNames = Object.keys(trainSpeeds);
  const avgSpeeds = trainNames.map(name => (trainSpeeds[name] / trainCounts[name]).toFixed(2));
  const globalAvgSpeed = (avgSpeeds.reduce((sum, val) => sum + parseFloat(val), 0) / avgSpeeds.length).toFixed(2);
  const ctxAvgSpeed = document.getElementById('avgSpeedChart').getContext('2d');
  avgSpeedChartInstance = new Chart(ctxAvgSpeed, {
    type: 'bar',
    data: {
      labels: trainNames,
      datasets: [{
        label: 'Tốc Độ Trung Bình (km/h)',
        data: avgSpeeds,
        backgroundColor: trainNames.map(name => hashColor(name)),
        barThickness: 20,
        maxBarThickness: 20
      }, {
        label: 'Tốc độ TB tất cả tàu',
        type: 'line',
        data: Array(avgSpeeds.length).fill(globalAvgSpeed),
        borderColor: 'red',
        borderWidth: 2,
        fill: false,
        pointRadius: 0
      }]
    },
    options: {
      responsive: true,
      scales: {
        y: {
          beginAtZero: true
        }
      }
    }
  });
  const tripCounts = trainCounts;
  const globalTripAvg = (Object.values(tripCounts).reduce((a, b) => a + b, 0) / Object.values(tripCounts).length).toFixed(2);
  const ctxTripCount = document.getElementById('tripCountChart').getContext('2d');
  tripCountChartInstance = new Chart(ctxTripCount, {
    type: 'bar',
    data: {
      labels: Object.keys(tripCounts),
      datasets: [{
        label: 'Số Chuyến',
        data: Object.values(tripCounts),
        backgroundColor: Object.keys(tripCounts).map(name => hashColor(name)),
        barThickness: 20,
        maxBarThickness: 20
      }, {
        label: 'Số chuyến TB tất cả tàu',
        type: 'line',
        data: Array(Object.keys(tripCounts).length).fill(globalTripAvg),
        borderColor: 'red',
        borderWidth: 2,
        fill: false,
        pointRadius: 0
      }]
    },
    options: {
      responsive: true,
      scales: {
        y: {
          beginAtZero: true
        }
      }
    }
  });
  const trainDateSpeedMap = {};
  originalData.forEach(item => {
    const train = item["Tên Tàu"];
    const date = new Date(item["Ngày Đến"]).toISOString().split("T")[0];
    const speed = Number(item["Vận Tốc"]);
    const key = train + "_" + date;
    if (!trainDateSpeedMap[key]) {
      trainDateSpeedMap[key] = {
        sum: 0,
        count: 0
      };
    }
    trainDateSpeedMap[key].sum += speed;
    trainDateSpeedMap[key].count += 1;
  });
  const trainDateGroups = {};
  Object.keys(trainDateSpeedMap).forEach(key => {
    const [train, date] = key.split("_");
    if (!trainDateGroups[train]) trainDateGroups[train] = {};
    trainDateGroups[train][date] = (trainDateSpeedMap[key].sum / trainDateSpeedMap[key].count).toFixed(2);
  });
  const allDatesSet = new Set();
  Object.values(trainDateGroups).forEach(obj => {
    Object.keys(obj).forEach(date => allDatesSet.add(date));
  });
  const allDates = Array.from(allDatesSet).sort();
  const datasets = Object.keys(trainDateGroups).map(train => {
    if (!trainColorMap[train]) {
      trainColorMap[train] = hashColor(train);
    }
    return {
      label: train,
      data: allDates.map(date => trainDateGroups[train][date] || null),
      fill: false,
      borderColor: trainColorMap[train],
      tension: 0.1
    };
  });
  const ctxSpeedPerDay = document.getElementById('speedPerDayChart').getContext('2d');
  speedPerDayChartInstance = new Chart(ctxSpeedPerDay, {
    type: 'line',
    data: {
      labels: allDates,
      datasets: datasets
    },
    options: {
      responsive: true,
      scales: {
        y: {
          beginAtZero: true
        }
      }
    }
  });
  let totalSum = 0;
  let totalCount = 0;
  Object.values(trainDateGroups).forEach(trainData => {
    Object.values(trainData).forEach(val => {
      if (val !== null && val !== undefined) {
        totalSum += parseFloat(val);
        totalCount++;
      }
    });
  });
  const globalDailyAvg = (totalSum / totalCount).toFixed(2);
  datasets.push({
    label: 'Tốc độ TB tất cả tàu mỗi ngày',
    data: Array(allDates.length).fill(globalDailyAvg),
    borderColor: 'red',
    borderWidth: 2,
    fill: false,
    pointRadius: 0,
    borderDash: [5, 5]
  });
}

applySavedUnits();
fetchDataAndRender();
setupWebSocket();
console.log("docx loaded?", window.docx);
