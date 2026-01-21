// ==================== SETTINGS ====================
function getSettings() {
  let settingsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Settings");
  
  if (!settingsSheet) {
    settingsSheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet("Settings", 0);
    settingsSheet.appendRow(["Key", "Value"]);
    settingsSheet.appendRow(["USE_SERVER_TIME", "true"]);
  }

  const data = settingsSheet.getDataRange().getValues();
  const settings = {};

  for (let i = 1; i < data.length; i++) {
    settings[data[i][0]] = data[i][1];
  }

  return settings;
}

function shouldUseServerTime() {
  const settings = getSettings();
  return settings["USE_SERVER_TIME"] === "true" || settings["USE_SERVER_TIME"] === true;
}

// ==================== USER MANAGEMENT ====================
function getUserSheet() {
  let userSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Users");
  
  if (!userSheet) {
    userSheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet("Users");
    userSheet.appendRow(["Username", "Password", "Station", "Active"]);
    // Example user: admin/admin123 with access to all stations (use "All")
    userSheet.appendRow(["admin", "admin123", "All", "true"]);
  }

  return userSheet;
}

function authenticateUser(username, password) {
  const userSheet = getUserSheet();
  const data = userSheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    const [user, pass, station, active] = data[i];
    if (user === username && pass === password && (active === "true" || active === true)) {
      return {
        authenticated: true,
        username: user,
        station: station
      };
    }
  }

  return {
    authenticated: false,
    username: null,
    station: null
  };
}

// ==================== DATA RETRIEVAL ====================
function getFilteredTrainData(station, dateFilter = null, chunk = 0, chunkSize = 50) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Train Log");
  
  if (!sheet) {
    return { data: [], hasMoreData: false };
  }

  const rows = sheet.getDataRange().getValues();
  
  if (rows.length <= 1) {
    return { data: [], hasMoreData: false };
  }

  const headers = rows[0];
  const stationColumnIndex = headers.indexOf("Trạm");
  const arrivalDateColumnIndex = headers.indexOf("Ngày Đến");
  
  const filteredData = [];

  // Iterate from newest (end) to oldest (beginning)
  for (let i = rows.length - 1; i >= 1; i--) {
    const row = rows[i];
    const rowStation = row[stationColumnIndex];
    const rowDate = row[arrivalDateColumnIndex];

    // Filter by station (unless station is "All")
    if (station !== "All" && rowStation !== station) {
      continue;
    }

    // Filter by date if provided
    if (dateFilter) {
      const rowDateObj = new Date(rowDate);
      const filterDateObj = new Date(dateFilter);
      
      if (rowDateObj.toDateString() !== filterDateObj.toDateString()) {
        continue;
      }
    }

    // Convert row to object
    let obj = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = row[j];
    }
    filteredData.push(obj);
  }

  // Calculate pagination
  const startIndex = chunk * chunkSize;
  const endIndex = startIndex + chunkSize;
  const paginatedData = filteredData.slice(startIndex, endIndex);
  const hasMoreData = endIndex < filteredData.length;

  return {
    data: paginatedData,
    hasMoreData: hasMoreData,
    totalCount: filteredData.length
  };
}

// ==================== GET HANDLER ====================
function doGet(e) {
  const action = e.parameter.action || "";
  const username = e.parameter.username || "";
  const password = e.parameter.password || "";
  const dateFilter = e.parameter.date || null;
  const chunk = parseInt(e.parameter.chunk) || 0;
  const chunkSize = parseInt(e.parameter.chunkSize) || 50;

  // ==================== LOGIN ====================
  if (action === "login") {
    if (!username || !password) {
      return sendJSON({
        status: "error",
        message: "Username and password required"
      });
    }

    const auth = authenticateUser(username, password);
    
    if (!auth.authenticated) {
      return sendJSON({
        status: "error",
        message: "Invalid credentials"
      });
    }

    return sendJSON({
      status: "success",
      message: "Login successful",
      user: {
        username: auth.username,
        station: auth.station
      }
    });
  }

  // ==================== FETCH DATA ====================
  if (action === "fetch" || action === "") {
    // Require authentication
    if (!username || !password) {
      return sendJSON({
        status: "error",
        message: "Authentication required"
      });
    }

    const auth = authenticateUser(username, password);
    
    if (!auth.authenticated) {
      return sendJSON({
        status: "error",
        message: "Invalid credentials"
      });
    }

    // Fetch filtered data for user's station with pagination
    const result = getFilteredTrainData(auth.station, dateFilter, chunk, chunkSize);
    
    return sendJSON({
      status: "success",
      station: auth.station,
      date: dateFilter || "all",
      chunk: chunk,
      chunkSize: chunkSize,
      dataCount: result.data.length,
      totalCount: result.totalCount,
      hasMoreData: result.hasMoreData,
      data: result.data
    });
  }

  return sendJSON({
    status: "error",
    message: "Invalid action"
  });
}

// ==================== POST HANDLER ====================
function doPost(e) {
  let json;
  
  try {
    json = JSON.parse(e.postData.contents);
  } catch (err) {
    return sendJSON({
      status: "error",
      message: "Invalid JSON"
    });
  }

  const action = json.action || "";
  const trainID = json.id || "";
  const direction = json.direction || "";
  const station = json.station || "";
  const arriveDate = json.arrive_date || "";
  const arriveTime = json.arrive_time || "";
  const leaveDate = json.leave_date || "";
  const leaveTime = json.leave_time || "";
  const speed = json.speed_m_s != null ? json.speed_m_s : "";

  // ==================== ADD RECORD ====================
  if (action === "add_record") {
    if (!trainID || !direction || !station) {
      return sendJSON({
        status: "error",
        message: "Missing required parameters: id, direction, station"
      });
    }

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Train Log");
    
    if (!sheet) {
      return sendJSON({
        status: "error",
        message: "Sheet 'Train Log' not found"
      });
    }

    const data = sheet.getDataRange().getValues();
    let nextId = 1;

    if (data.length > 1) {
      const lastRow = data[data.length - 1];
      const lastId = lastRow[0];
      nextId = (typeof lastId === "number" && !isNaN(lastId)) ? lastId + 1 : data.length;
    }

    // Determine which time to use
    let finalArriveDate = arriveDate;
    let finalArriveTime = arriveTime;
    let finalLeaveDate = leaveDate;
    let finalLeaveTime = leaveTime;

    if (shouldUseServerTime()) {
      const now = new Date();
      finalArriveDate = Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyy-MM-dd");
      finalArriveTime = Utilities.formatDate(now, Session.getScriptTimeZone(), "HH:mm:ss");
    }

    // STT, Tên Tàu, Tuyến, Trạm, Vận Tốc, Ngày Đến, Giờ Đến, Ngày Rời, Giờ Rời, Trạng Thái
    sheet.appendRow([
      nextId,
      trainID,
      direction,
      station,
      speed,
      finalArriveDate,
      finalArriveTime,
      finalLeaveDate,
      finalLeaveTime,
      "recorded"
    ]);

    return sendJSON({
      status: "success",
      message: "New record added",
      id: nextId
    });
  }

  return sendJSON({
    status: "error",
    message: "Invalid action"
  });
}

// ==================== UTILITIES ====================
function sendJSON(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
