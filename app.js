const ROWS = [
  { row: 1, seats: 10, type: "standard", price: 250 },
  { row: 2, seats: 10, type: "standard", price: 250 },
  { row: 3, seats: 10, type: "standard", price: 250 },
  { row: 4, seats: 8,  type: "standard", price: 450 },
  { row: 5, seats: 8,  type: "standard", price: 450 },
  { row: 6, seats: 8,  type: "standard", price: 450 },
  { row: 7, seats: 8,  type: "standard", price: 450 },
  { row: 8, seats: 8,  type: "standard", price: 450 },
  { row: 9, seats: 10, type: "sofa",     price: 900 },
];
const SESSION_LABELS = { 1: "12:00", 2: "15:30", 3: "19:00", 4: "21:45" };
const STORAGE_KEY = "fjord_cinema_v1";
const STORAGE_VERSION = 7;
const STUDENT_DISCOUNT = 100;
const RESERVE_MS = 10 * 60 * 1000;

const state = {
  currentSession: 1,
  occupied: {},
  cart: {},
  bookings: {},
  student: false,
  cartStartedAt: {},
  view: "scheme",
};

const $ = (id) => document.getElementById(id);
const hallEl = $("hall");
const seatListWrap = $("seatListWrap");
const seatListEl = $("seatList");
const screenArcEl = document.querySelector(".screen-arc");
const sessionSelect = $("sessionSelect");
const typeFilter = $("typeFilter");
const onlyFree = $("onlyFree");
const resetDemoBtn = $("resetDemo");
const noticeEl = $("notice");
const cartListEl = $("cartList");
const cartTotalEl = $("cartTotal");
const confirmBtn = $("confirmBooking");
const clearCartBtn = $("clearCart");
const studentToggle = $("studentDiscount");
const bookingsListEl = $("bookingsList");
const cartTimerEl = $("cartTimer");
const cartTimerValueEl = $("cartTimerValue");
const viewButtons = Array.from(document.querySelectorAll(".view-switcher button"));

let noticeTimer = null;
function hideNotice() {
  if (!noticeEl) return;
  noticeEl.hidden = true;
  noticeEl.innerHTML = "";
}
function showNotice(msg, kind = "info", timeout = 6000) {
  if (!noticeEl) return;
  noticeEl.hidden = false;
  noticeEl.dataset.kind = kind;
  noticeEl.innerHTML = "";
  const span = document.createElement("span");
  span.textContent = msg;
  noticeEl.appendChild(span);
  const btn = document.createElement("button");
  btn.className = "close-note";
  btn.textContent = "✕";
  btn.setAttribute("aria-label", "Закрыть");
  btn.addEventListener("click", hideNotice);
  noticeEl.appendChild(btn);
  if (noticeTimer) clearTimeout(noticeTimer);
  if (timeout > 0) noticeTimer = setTimeout(hideNotice, timeout);
}

function rowById(r) { return ROWS.find((x) => x.row === r); }
function seatPrice(id) { const r = rowById(+id.split("-")[0]); return r ? r.price : 0; }
function seatType(id)  { const r = rowById(+id.split("-")[0]); return r ? r.type : "standard"; }
function seatLabel(id) {
  const [r, c] = id.split("-").map(Number);
  return seatType(id) === "sofa"
    ? `Диван ${r} ряд, ${c}–${c + 1}`
    : `Место ${r} ряд, ${c}`;
}
function seatShortLabel(id) {
  const [r, c] = id.split("-").map(Number);
  return seatType(id) === "sofa"
    ? `Диван ${c}–${c + 1}`
    : `Место ${c}`;
}
function totalOf(list) { return list.reduce((s, id) => s + seatPrice(id), 0); }
function isSeatValid(id) {
  if (typeof id !== "string") return false;
  const p = id.split("-");
  if (p.length !== 2) return false;
  const r = Number(p[0]), c = Number(p[1]);
  if (!Number.isInteger(r) || !Number.isInteger(c)) return false;
  const row = rowById(r);
  if (!row) return false;
  if (c < 1 || c > row.seats) return false;
  if (row.type === "sofa" && c % 2 === 0) return false;
  return true;
}
function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}
function priceBreakdown(ids, hasStudent) {
  const subtotal = totalOf(ids);
  const discount = hasStudent ? Math.min(subtotal, ids.length * STUDENT_DISCOUNT) : 0;
  return { subtotal, discount, total: subtotal - discount, count: ids.length };
}
function formatTime(ms) {
  if (ms < 0) ms = 0;
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

let timerInterval = null;

function hideCartTimer() {
  if (!cartTimerEl) return;
  cartTimerEl.hidden = true;
  cartTimerEl.classList.remove("warning", "expired");
  if (cartTimerValueEl) cartTimerValueEl.textContent = "10:00";
}

function ensureCartStart(sid) {
  if (!state.cart[sid]) return;
  const has = Object.keys(state.cart[sid]).length > 0;
  if (has && !state.cartStartedAt[sid]) {
    state.cartStartedAt[sid] = Date.now();
  }
  if (!has) {
    state.cartStartedAt[sid] = null;
  }
}

function tickTimer() {
  const sid = state.currentSession;
  const started = state.cartStartedAt[sid];
  const hasSeats = state.cart[sid] && Object.keys(state.cart[sid]).length > 0;

  if (!hasSeats || !started) {
    hideCartTimer();
    return;
  }

  const left = started + RESERVE_MS - Date.now();

  if (left <= 0) {
    state.cart[sid] = {};
    state.cartStartedAt[sid] = null;
    hideCartTimer();
    renderAll();
    saveToStorage();
    showNotice(
      "Время резерва истекло (10 минут). Выбранные места снова свободны — выберите заново.",
      "warn", 6000
    );
    return;
  }

  cartTimerEl.hidden = false;
  cartTimerValueEl.textContent = formatTime(left);

  cartTimerEl.classList.toggle("warning", left <= 2 * 60 * 1000 && left > 60 * 1000);
  cartTimerEl.classList.toggle("expired", left <= 60 * 1000);
}

function startTimerLoop() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(tickTimer, 1000);
  tickTimer();
}

function initOccupied() {
  Object.keys(SESSION_LABELS).forEach((sid) => {
    state.occupied[sid] = {};
    state.cart[sid] = {};
    state.bookings[sid] = [];
    state.cartStartedAt[sid] = null;

    const all = [];
    ROWS.forEach((r) => {
      for (let c = 1; c <= r.seats; c++) all.push(`${r.row}-${c}`);
    });
    for (let i = all.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = all[i]; all[i] = all[j]; all[j] = t;
    }

    const taken = new Set();
    let count = 0;
    for (const id of all) {
      if (count >= 8) break;
      const [r, col] = id.split("-").map(Number);
      const row = rowById(r);
      if (!row) continue;
      if (row.type === "sofa") {
        const first = col % 2 === 1 ? col : col - 1;
        const a = `${r}-${first}`, b = `${r}-${first + 1}`;
        if (taken.has(a) || taken.has(b)) continue;
        state.occupied[sid][a] = true;
        state.occupied[sid][b] = true;
        taken.add(a); taken.add(b);
        count++;
      } else {
        state.occupied[sid][id] = true;
        count++;
      }
    }
  });
}

function snapshot() {
  return {
    v: STORAGE_VERSION,
    savedAt: new Date().toISOString(),
    currentSession: state.currentSession,
    student: state.student,
    view: state.view,
    data: {
      occupied: state.occupied,
      cart: state.cart,
      bookings: state.bookings,
      cartStartedAt: state.cartStartedAt,
    },
  };
}

function validateSeatMap(obj) {
  if (!isPlainObject(obj)) return {};
  const out = {};
  for (const k of Object.keys(obj)) {
    if (obj[k] === true && isSeatValid(k)) out[k] = true;
  }
  return out;
}

function parseSnapshot(raw) {
  if (typeof raw !== "string" || !raw) return { ok: false, reason: "empty" };
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch { return { ok: false, reason: "json" }; }

  if (!isPlainObject(parsed)) return { ok: false, reason: "shape" };
  if (parsed.v !== STORAGE_VERSION) return { ok: false, reason: "version" };
  if (!isPlainObject(parsed.data)) return { ok: false, reason: "shape" };

  const curNum = Number(parsed.currentSession);
  const currentSession = SESSION_LABELS[curNum] ? curNum : 1;
  const student = parsed.student === true;
  const view = parsed.view === "list" ? "list" : "scheme";
  const data = parsed.data;

  if (!isPlainObject(data.occupied)) return { ok: false, reason: "shape" };
  if (!isPlainObject(data.cart))     return { ok: false, reason: "shape" };
  if (!isPlainObject(data.bookings)) return { ok: false, reason: "shape" };

  const nextOccupied = {}, nextCart = {}, nextBookings = {}, nextCartStartedAt = {};
  const sids = Object.keys(SESSION_LABELS);

  for (const sid of sids) {
    nextOccupied[sid] = validateSeatMap(data.occupied[sid]);
    nextCart[sid] = validateSeatMap(data.cart[sid]);

    const rawStart = Number(data.cartStartedAt && data.cartStartedAt[sid]);
    if (Number.isFinite(rawStart) && rawStart > 0) {
      if (Date.now() < rawStart + RESERVE_MS && Object.keys(nextCart[sid]).length > 0) {
        nextCartStartedAt[sid] = rawStart;
      } else {
        nextCart[sid] = {};
        nextCartStartedAt[sid] = null;
      }
    } else {
      nextCartStartedAt[sid] = null;
    }

    nextBookings[sid] = [];
    const rawList = data.bookings[sid];
    if (Array.isArray(rawList)) {
      for (const b of rawList) {
        if (!isPlainObject(b)) continue;
        if (typeof b.id !== "string" || !b.id) continue;
        if (!Array.isArray(b.seats)) continue;
        const seen = new Set();
        const seats = [];
        for (const s of b.seats) {
          if (isSeatValid(s) && !seen.has(s)) { seen.add(s); seats.push(s); }
        }
        if (seats.length === 0) continue;
        const hasStudent = b.student === true;
        const pb = priceBreakdown(seats, hasStudent);
        nextBookings[sid].push({
          id: b.id,
          seats,
          student: hasStudent,
          subtotal: pb.subtotal,
          discount: pb.discount,
          total: pb.total,
          createdAt: typeof b.createdAt === "string" ? b.createdAt : new Date().toISOString(),
        });
      }
    }
  }

  for (const sid of sids) {
    const bookedSet = new Set();
    nextBookings[sid].forEach((b) => b.seats.forEach((id) => bookedSet.add(id)));
    Object.keys(nextCart[sid]).forEach((id) => {
      if (nextOccupied[sid][id] || bookedSet.has(id)) delete nextCart[sid][id];
    });
    bookedSet.forEach((id) => { nextOccupied[sid][id] = true; });
    if (Object.keys(nextCart[sid]).length === 0) nextCartStartedAt[sid] = null;
  }

  return {
    ok: true,
    state: {
      currentSession,
      student,
      view,
      occupied: nextOccupied,
      cart: nextCart,
      bookings: nextBookings,
      cartStartedAt: nextCartStartedAt,
    },
  };
}

function loadFromStorage() {
  let raw = null;
  try { raw = localStorage.getItem(STORAGE_KEY); }
  catch {
    showNotice(
      "Браузер запретил доступ к хранилищу. Брони не сохранятся до конца сессии.",
      "warn", 0
    );
    return false;
  }
  if (raw == null) return false;

  const res = parseSnapshot(raw);
  if (!res.ok) return false;

  Object.assign(state, res.state);
  if (SESSION_LABELS[res.state.currentSession]) {
    sessionSelect.value = String(res.state.currentSession);
  }
  studentToggle.checked = !!res.state.student;
  return true;
}

function saveToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot()));
    return true;
  } catch {
    showNotice(
      "Не удалось сохранить брони: браузер запретил запись в localStorage (приватный режим или переполнение). Данные хранятся только в текущей вкладке.",
      "warn", 0
    );
    return false;
  }
}

function applyView() {
  const v = state.view === "list" ? "list" : "scheme";

  if (v === "list") {
    hallEl.hidden = true;
    if (screenArcEl) screenArcEl.hidden = true;
    seatListWrap.hidden = false;
  } else {
    hallEl.hidden = false;
    if (screenArcEl) screenArcEl.hidden = false;
    seatListWrap.hidden = true;
  }

  viewButtons.forEach((b) => {
    const on = b.dataset.view === v;
    b.setAttribute("aria-selected", on ? "true" : "false");
    b.tabIndex = on ? 0 : -1;
  });
}

function setView(v) {
  state.view = v === "list" ? "list" : "scheme";
  applyView();
  saveToStorage();
}

function passesFilter(id, row) {
  const type = typeFilter.value;
  const freeOnly = onlyFree.checked;
  const sid = state.currentSession;

  if (type !== "all" && row.type !== type) return false;

  if (freeOnly) {
    const isMine = state.bookings[sid].some((b) => b.seats.includes(id));
    const isSel = !!state.cart[sid][id];
    const isOcc = !!state.occupied[sid][id] && !isMine;
    if (isMine || isSel || isOcc) return false;
  }
  return true;
}

let hallFocusId = null;

function renderHall() {
  hallEl.innerHTML = "";
  const sid = state.currentSession;

  ROWS.forEach((row) => {
    const rowEl = document.createElement("div");
    rowEl.className = "row";

    const label = document.createElement("span");
    label.className = "row-label";
    label.textContent = row.row;
    rowEl.appendChild(label);

    if (row.type === "sofa") {
      for (let c = 1; c <= row.seats; c += 2) {
        rowEl.appendChild(createSeatEl(`${row.row}-${c}`, row, true));
      }
    } else {
      for (let c = 1; c <= row.seats; c++) {
        rowEl.appendChild(createSeatEl(`${row.row}-${c}`, row, false));
      }
    }
    hallEl.appendChild(rowEl);
  });

  initHallRovingTabindex();

  if (state.view === "scheme" && hallFocusId) {
    const target = hallEl.querySelector(
      `.seat[data-id="${hallFocusId}"]`
    );
    if (target && !target.disabled && !target.classList.contains("hidden")) {
      target.focus({ preventScroll: true });
    }
  }
}

function createSeatEl(id, row, isSofa) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "seat" + (isSofa ? " sofa" : "");
  btn.dataset.id = id;
  btn.dataset.type = row.type;
  btn.dataset.price = row.price;
  btn.title = `${seatLabel(id)} — ${row.price} ₽`;
  btn.setAttribute("aria-label", `${seatLabel(id)}, ${row.price} ₽`);
  btn.tabIndex = -1;

  const sid = state.currentSession;
  const isMine     = state.bookings[sid].some((b) => b.seats.includes(id));
  const isSelected = !!state.cart[sid][id];
  const isOccupied = !!state.occupied[sid][id] && !isMine;

  if (isMine) {
    btn.classList.add("mine");
    btn.textContent = isSofa ? "★" : "✓";
    btn.setAttribute("aria-pressed", "true");
    btn.addEventListener("click", () => {
      showNotice(
        "Это место уже забронировано. Отменить бронь можно в панели «Ваши брони».",
        "info", 3500
      );
    });
  } else if (isSelected) {
    btn.classList.add("selected");
    btn.textContent = isSofa ? "★" : "✓";
    btn.setAttribute("aria-pressed", "true");
    btn.addEventListener("click", () => toggleSeat(id));
  } else if (isOccupied) {
    btn.classList.add("occupied");
    btn.disabled = true;
    btn.textContent = isSofa ? "🚫" : "";
    btn.setAttribute("aria-pressed", "false");
  } else {
    btn.setAttribute("aria-pressed", "false");
    btn.addEventListener("click", () => toggleSeat(id));
  }

  if (!passesFilter(id, row)) {
    btn.classList.add("hidden");
    btn.disabled = true;
    btn.setAttribute("aria-hidden", "true");
    btn.tabIndex = -1;
  }

  btn.addEventListener("focus", () => {
    hallFocusId = id;
    refreshHallRovingTabindex();
  });

  btn.addEventListener("keydown", (e) => {
    handleHallKeydown(e, id, row);
  });

  return btn;
}

function getVisibleHallItems() {
  return Array.from(hallEl.querySelectorAll(".seat")).filter((el) => {
    if (el.disabled) return false;
    if (el.classList.contains("hidden")) return false;
    if (el.getAttribute("aria-hidden") === "true") return false;
    return true;
  });
}

function refreshHallRovingTabindex() {
  const items = getVisibleHallItems();
  if (items.length === 0) return;

  let target = null;
  if (hallFocusId) {
    target = items.find((el) => el.dataset.id === hallFocusId) || null;
  }
  if (!target) target = items[0];

  items.forEach((el) => {
    el.tabIndex = el === target ? 0 : -1;
  });
}

function initHallRovingTabindex() {
  const items = getVisibleHallItems();
  if (items.length === 0) return;

  let target = null;
  if (hallFocusId) {
    target = items.find((el) => el.dataset.id === hallFocusId) || null;
  }
  if (!target) target = items[0];

  items.forEach((el) => {
    el.tabIndex = el === target ? 0 : -1;
  });
}

function handleHallKeydown(e, currentId, currentRow) {
  if (e.key === " " || e.code === "Space") {
    e.preventDefault();
    e.stopPropagation();
    return;
  }
  if (e.key === "Home" || e.key === "End") {
    e.preventDefault();
    return;
  }

  const keys = [
    "ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight",
    "PageDown", "PageUp",
  ];
  if (!keys.includes(e.key)) return;

  e.preventDefault();

  const all = getVisibleHallItems();
  if (all.length === 0) return;

  const currentIndex = all.findIndex((el) => el.dataset.id === currentId);
  if (currentIndex === -1) return;

  const byRow = new Map();
  all.forEach((el) => {
    const r = Number(el.dataset.id.split("-")[0]);
    if (!byRow.has(r)) byRow.set(r, []);
    byRow.get(r).push(el);
  });
  const rowKeys = Array.from(byRow.keys()).sort((a, b) => a - b);

  const moveFocus = (el) => {
    if (!el) return;
    hallFocusId = el.dataset.id;
    el.focus();
    refreshHallRovingTabindex();
  };

  const currentEl = all[currentIndex];
  const rowSeats = byRow.get(currentRow.row) || [];
  const idxInRow = rowSeats.indexOf(currentEl);

  switch (e.key) {
    case "ArrowDown": {
      const next = all.find((el) => all.indexOf(el) > currentIndex);
      if (next) moveFocus(next);
      break;
    }
    case "ArrowUp": {
      const prev = [...all].reverse().find((el) => all.indexOf(el) < currentIndex);
      if (prev) moveFocus(prev);
      break;
    }
    case "ArrowRight": {
      for (let i = idxInRow + 1; i < rowSeats.length; i++) {
        moveFocus(rowSeats[i]);
        return;
      }
      break;
    }
    case "ArrowLeft": {
      for (let i = idxInRow - 1; i >= 0; i--) {
        moveFocus(rowSeats[i]);
        return;
      }
      break;
    }
    case "PageDown": {
      const pos = rowKeys.indexOf(currentRow.row);
      for (let i = pos + 1; i < rowKeys.length; i++) {
        const targetRow = byRow.get(rowKeys[i]);
        const candidate = targetRow[Math.min(idxInRow, targetRow.length - 1)];
        if (candidate) { moveFocus(candidate); return; }
      }
      break;
    }
    case "PageUp": {
      const pos = rowKeys.indexOf(currentRow.row);
      for (let i = pos - 1; i >= 0; i--) {
        const targetRow = byRow.get(rowKeys[i]);
        const candidate = targetRow[Math.min(idxInRow, targetRow.length - 1)];
        if (candidate) { moveFocus(candidate); return; }
      }
      break;
    }
  }
}

let listFocusId = null;

function renderList() {
  seatListEl.innerHTML = "";
  const sid = state.currentSession;

  ROWS.forEach((row) => {
    const group = document.createElement("div");
    group.className = "seat-row-group";
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", `Ряд ${row.row}`);

    const header = document.createElement("div");
    header.className = "seat-row-header";
    const rowTypeLabel = row.type === "sofa" ? "диваны" : "стандарт";
    header.innerHTML = `<strong>Ряд ${row.row}</strong> <small>${row.seats} ${rowTypeLabel} · ${row.price} ₽</small>`;
    group.appendChild(header);

    const seatsToShow = [];
    if (row.type === "sofa") {
      for (let c = 1; c <= row.seats; c += 2) seatsToShow.push(`${row.row}-${c}`);
    } else {
      for (let c = 1; c <= row.seats; c++) seatsToShow.push(`${row.row}-${c}`);
    }

    seatsToShow.forEach((id) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "seat-item";
      item.dataset.id = id;
      item.tabIndex = -1;
      item.setAttribute("aria-pressed", "false");

      const isMine     = state.bookings[sid].some((b) => b.seats.includes(id));
      const isSelected = !!state.cart[sid][id];
      const isOccupied = !!state.occupied[sid][id] && !isMine;

      let status = "Свободно";
      if (isMine) status = "Забронировано";
      else if (isSelected) status = "Выбрано";
      else if (isOccupied) status = "Занято";

      const price = seatPrice(id);
      const short = seatShortLabel(id);

      item.innerHTML = `
        <span class="seat-item-label">
          <span class="name">${short}</span>
          <span class="sub">${seatType(id) === "sofa" ? "Диван на двоих" : "Стандартное место"}</span>
        </span>
        <span class="seat-item-right">
          <span class="seat-item-price">${price} ₽</span>
          <span class="seat-item-status">${status}</span>
        </span>
      `;
      item.setAttribute("aria-label", `${seatLabel(id)}, ${price} ₽, ${status}`);

      if (isMine) {
        item.classList.add("mine-row");
        item.setAttribute("aria-pressed", "true");
        item.addEventListener("click", () => {
          showNotice(
            "Это место уже забронировано. Отменить бронь можно в панели «Мои брони».",
            "info", 3500
          );
        });
      } else if (isOccupied) {
        item.disabled = true;
      } else {
        item.setAttribute("aria-pressed", isSelected ? "true" : "false");
        item.addEventListener("click", () => toggleSeat(id));
      }

      if (!passesFilter(id, row)) {
        item.hidden = true;
        item.tabIndex = -1;
      }

      item.addEventListener("focus", () => {
        listFocusId = id;
        refreshRovingTabindex();
      });

      item.addEventListener("keydown", (e) => {
        handleListKeydown(e, id, row);
      });

      group.appendChild(item);
    });

    seatListEl.appendChild(group);
  });

  initRovingTabindex();

  if (state.view === "list" && listFocusId) {
    const target = seatListEl.querySelector(
      `.seat-item[data-id="${listFocusId}"]`
    );
    if (target && !target.hidden) {
      target.focus({ preventScroll: true });
    }
  }
}

function getVisibleListItems() {
  return Array.from(seatListEl.querySelectorAll(".seat-item")).filter(
    (el) => !el.hidden
  );
}

function getFocusableListItems() {
  return getVisibleListItems().filter((el) => !el.disabled);
}

function refreshRovingTabindex() {
  const items = getVisibleListItems();
  if (items.length === 0) return;

  let target = null;
  if (listFocusId) {
    target = items.find((el) => el.dataset.id === listFocusId) || null;
  }
  if (!target || target.disabled) {
    target = items.find((el) => !el.disabled) || items[0];
  }

  items.forEach((el) => {
    el.tabIndex = el === target ? 0 : -1;
  });
}

function initRovingTabindex() {
  const focusable = getFocusableListItems();
  const items = getVisibleListItems();
  if (items.length === 0) return;

  let target = null;
  if (listFocusId) {
    target = focusable.find((el) => el.dataset.id === listFocusId) || null;
  }
  if (!target) target = focusable[0] || items[0];

  items.forEach((el) => {
    el.tabIndex = el === target ? 0 : -1;
  });
}

function handleListKeydown(e, currentId, currentRow) {
  if (e.key === " " || e.code === "Space") {
    e.preventDefault();
    e.stopPropagation();
    return;
  }
  if (e.key === "Home" || e.key === "End") {
    e.preventDefault();
    return;
  }

  const keys = [
    "ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight",
    "PageDown", "PageUp",
  ];
  if (!keys.includes(e.key)) return;

  e.preventDefault();

  const all = getVisibleListItems();
  const focusable = getFocusableListItems();
  if (all.length === 0) return;

  const currentIndex = all.findIndex((el) => el.dataset.id === currentId);
  if (currentIndex === -1) return;

  const byRow = new Map();
  all.forEach((el) => {
    const r = Number(el.dataset.id.split("-")[0]);
    if (!byRow.has(r)) byRow.set(r, []);
    byRow.get(r).push(el);
  });
  const rowKeys = Array.from(byRow.keys()).sort((a, b) => a - b);

  const moveFocus = (el) => {
    if (!el) return;
    if (el.disabled) {
      const idx = all.indexOf(el);
      if (idx === -1) return;
      const fwd = all.slice(idx).find((x) => !x.disabled);
      const back = all.slice(0, idx).reverse().find((x) => !x.disabled);
      const next = fwd || back;
      if (next) {
        listFocusId = next.dataset.id;
        next.focus();
        refreshRovingTabindex();
      }
      return;
    }
    listFocusId = el.dataset.id;
    el.focus();
    refreshRovingTabindex();
  };

  const currentEl = all[currentIndex];
  const rowSeats = byRow.get(currentRow.row) || [];
  const idxInRow = rowSeats.indexOf(currentEl);

  switch (e.key) {
    case "ArrowDown": {
      const next = focusable.find((el) => all.indexOf(el) > currentIndex);
      if (next) moveFocus(next);
      break;
    }
    case "ArrowUp": {
      const prev = [...focusable].reverse().find((el) => all.indexOf(el) < currentIndex);
      if (prev) moveFocus(prev);
      break;
    }
    case "ArrowRight": {
      for (let i = idxInRow + 1; i < rowSeats.length; i++) {
        if (!rowSeats[i].disabled) { moveFocus(rowSeats[i]); return; }
      }
      break;
    }
    case "ArrowLeft": {
      for (let i = idxInRow - 1; i >= 0; i--) {
        if (!rowSeats[i].disabled) { moveFocus(rowSeats[i]); return; }
      }
      break;
    }
    case "PageDown": {
      const pos = rowKeys.indexOf(currentRow.row);
      for (let i = pos + 1; i < rowKeys.length; i++) {
        const targetRow = byRow.get(rowKeys[i]);
        const sameIdx = targetRow[Math.min(idxInRow, targetRow.length - 1)];
        const candidate = !sameIdx.disabled ? sameIdx : targetRow.find((el) => !el.disabled);
        if (candidate) { moveFocus(candidate); return; }
      }
      break;
    }
    case "PageUp": {
      const pos = rowKeys.indexOf(currentRow.row);
      for (let i = pos - 1; i >= 0; i--) {
        const targetRow = byRow.get(rowKeys[i]);
        const sameIdx = targetRow[Math.min(idxInRow, targetRow.length - 1)];
        const candidate = !sameIdx.disabled ? sameIdx : targetRow.find((el) => !el.disabled);
        if (candidate) { moveFocus(candidate); return; }
      }
      break;
    }
  }
}

function renderAll() {
  renderHall();
  renderList();
  applyView();
}

function toggleSeat(id) {
  const sid = state.currentSession;
  if (state.bookings[sid].some((b) => b.seats.includes(id))) return;

  if (state.cart[sid][id]) delete state.cart[sid][id];
  else state.cart[sid][id] = true;

  ensureCartStart(sid);
  hallFocusId = id;
  listFocusId = id;

  renderAll();
  renderCart();
  tickTimer();
  saveToStorage();
}

function clearCart() {
  const sid = state.currentSession;
  state.cart[sid] = {};
  state.cartStartedAt[sid] = null;
  renderAll();
  renderCart();
  hideCartTimer();
  saveToStorage();
}

function confirmBooking() {
  const sid = state.currentSession;
  const ids = Object.keys(state.cart[sid]);
  if (ids.length === 0) return;

  const started = state.cartStartedAt[sid];
  if (started && Date.now() >= started + RESERVE_MS) {
    state.cart[sid] = {};
    state.cartStartedAt[sid] = null;
    renderAll();
    renderCart();
    hideCartTimer();
    saveToStorage();
    showNotice("Время резерва истекло. Выберите места заново.", "warn", 6000);
    return;
  }

  const blocked = ids.filter((id) => {
    if (!state.occupied[sid][id]) return false;
    return !state.bookings[sid].some((b) => b.seats.includes(id));
  });
  if (blocked.length > 0) {
    showNotice("Часть мест уже занята. Выбор очищен, попробуйте снова.", "warn", 5000);
    blocked.forEach((id) => delete state.cart[sid][id]);
    ensureCartStart(sid);
    renderAll();
    renderCart();
    tickTimer();
    saveToStorage();
    return;
  }

  const pb = priceBreakdown(ids, state.student);
  const booking = {
    id: `BK-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    seats: ids.slice().sort(),
    student: state.student,
    subtotal: pb.subtotal,
    discount: pb.discount,
    total: pb.total,
    createdAt: new Date().toISOString(),
  };

  state.bookings[sid].push(booking);
  ids.forEach((id) => {
    state.occupied[sid][id] = true;
    delete state.cart[sid][id];
  });

  state.cartStartedAt[sid] = null;
  state.student = false;
  studentToggle.checked = false;

  renderAll();
  renderCart();
  renderBookings();
  hideCartTimer();
  saveToStorage();
}

function cancelBooking(sessionId, bookingId) {
  const list = state.bookings[sessionId];
  const idx = list.findIndex((b) => b.id === bookingId);
  if (idx === -1) return;
  const b = list[idx];
  b.seats.forEach((id) => { delete state.occupied[sessionId][id]; });
  list.splice(idx, 1);
  renderAll();
  renderCart();
  renderBookings();
  tickTimer();
  saveToStorage();
}

function applyFilters() {
  renderAll();
}

function renderCart() {
  const sid = state.currentSession;
  const ids = Object.keys(state.cart[sid]).sort((a, b) => {
    const [ra, ca] = a.split("-").map(Number);
    const [rb, cb] = b.split("-").map(Number);
    return ra - rb || ca - cb;
  });

  cartListEl.innerHTML = "";
  if (ids.length === 0) {
    const li = document.createElement("li");
    li.className = "empty-line";
    li.textContent = "Пока ничего не выбрано";
    cartListEl.appendChild(li);
    cartTotalEl.innerHTML = `<div class="line total"><span>Итого</span><strong>0 ₽</strong></div>`;
    confirmBtn.disabled = true;
    clearCartBtn.disabled = true;
    hideCartTimer();
    return;
  }

  ids.forEach((id) => {
    const li = document.createElement("li");
    li.innerHTML = `<div><div>${seatLabel(id)}</div><div class="meta">${seatPrice(id)} ₽</div></div>`;
    const rm = document.createElement("button");
    rm.className = "remove";
    rm.textContent = "✕";
    rm.title = "Убрать из выбора";
    rm.setAttribute("aria-label", `Убрать ${seatLabel(id)} из выбора`);
    rm.addEventListener("click", () => toggleSeat(id));
    li.appendChild(rm);
    cartListEl.appendChild(li);
  });

  const pb = priceBreakdown(ids, state.student);
  let html = `<div class="line"><span>Билеты (${pb.count} шт.)</span><span>${pb.subtotal} ₽</span></div>`;
  if (pb.discount > 0) {
    html += `<div class="line discount"><span>Студенческая скидка</span><span>−${pb.discount} ₽</span></div>`;
  }
  html += `<div class="line total"><span>Итого</span><strong>${pb.total} ₽</strong></div>`;
  cartTotalEl.innerHTML = html;

  confirmBtn.disabled = false;
  clearCartBtn.disabled = false;

  tickTimer();
}

function renderBookings() {
  const sid = state.currentSession;
  const list = state.bookings[sid] || [];
  bookingsListEl.innerHTML = "";

  if (list.length === 0) {
    const li = document.createElement("li");
    li.className = "empty-line";
    li.textContent = "Пока нет броней";
    bookingsListEl.appendChild(li);
    return;
  }

  const sorted = list.slice().sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));

  sorted.forEach((booking) => {
    const li = document.createElement("li");
    li.style.flexDirection = "column";
    li.style.alignItems = "stretch";

    const head = document.createElement("div");
    head.className = "booking-head";
    head.innerHTML = `
      <strong>${booking.id}</strong>
      <span class="meta">${booking.total} ₽${booking.student ? '<span class="badge-student">студ.</span>' : ""}</span>
    `;
    li.appendChild(head);

    const seatsEl = document.createElement("div");
    seatsEl.className = "meta";
    seatsEl.style.marginBottom = "6px";
    seatsEl.textContent = booking.seats.map(seatLabel).join(", ");
    li.appendChild(seatsEl);

    if (booking.student && booking.discount > 0) {
      const discEl = document.createElement("div");
      discEl.className = "booking-total discount";
      discEl.innerHTML = `<span>Скидка</span><span>−${booking.discount} ₽</span>`;
      li.appendChild(discEl);
    }

    const cancel = document.createElement("button");
    cancel.className = "cancel";
    cancel.textContent = "Отменить бронь";
    cancel.addEventListener("click", () => cancelBooking(sid, booking.id));
    li.appendChild(cancel);

    bookingsListEl.appendChild(li);
  });
}

function resetDemo() {
  if (!confirm("Сбросить демо? Все брони, выбор и занятость мест будут удалены.")) return;
  try { localStorage.removeItem(STORAGE_KEY); }
  catch {}
  hideNotice();
  initOccupied();
  state.currentSession = 1;
  state.student = false;
  state.view = "scheme";
  sessionSelect.value = "1";
  typeFilter.value = "all";
  onlyFree.checked = false;
  studentToggle.checked = false;
  hallFocusId = null;
  listFocusId = null;
  renderAll();
  renderCart();
  renderBookings();
  hideCartTimer();
  saveToStorage();
  showNotice("Демо сброшено: брони, выбор и занятость очищены.", "info", 4000);
}

function initEvents() {
  sessionSelect.addEventListener("change", () => {
    state.currentSession = Number(sessionSelect.value);
    hallFocusId = null;
    listFocusId = null;
    renderAll();
    renderCart();
    renderBookings();
    tickTimer();
    saveToStorage();
  });
  typeFilter.addEventListener("change", applyFilters);
  onlyFree.addEventListener("change", applyFilters);
  confirmBtn.addEventListener("click", confirmBooking);
  clearCartBtn.addEventListener("click", clearCart);
  resetDemoBtn.addEventListener("click", resetDemo);

  confirmBtn.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " " || e.code === "Space") {
      e.preventDefault();
      if (!confirmBtn.disabled) confirmBooking();
    }
  });

  studentToggle.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " " || e.code === "Space") {
      e.preventDefault();
      studentToggle.checked = !studentToggle.checked;
      state.student = studentToggle.checked;
      renderCart();
      saveToStorage();
    }
  });

  studentToggle.addEventListener("change", () => {
    state.student = studentToggle.checked;
    renderCart();
    saveToStorage();
  });

  viewButtons.forEach((btn, i) => {
    btn.addEventListener("click", () => setView(btn.dataset.view));
    btn.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        const dir = e.key === "ArrowRight" ? 1 : -1;
        const next = (i + dir + viewButtons.length) % viewButtons.length;
        viewButtons[next].focus();
        setView(viewButtons[next].dataset.view);
      }
    });
  });

  const isNarrow = window.matchMedia("(max-width: 720px)").matches;
  if (isNarrow && !localStorage.getItem(STORAGE_KEY)) {
    state.view = "list";
  }
}

function init() {
  initOccupied();
  loadFromStorage();
  initEvents();
  renderAll();
  renderCart();
  renderBookings();
  startTimerLoop();
  saveToStorage();
}

init();