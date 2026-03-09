// Prevent double-injection if the user clicks the button more than once
if (document.getElementById("eb-overlay")) {
  document.getElementById("eb-overlay").style.display = "flex";
  const rb = document.getElementById("eb-restore");
  if (rb) rb.remove();
} else {

(function () {

const sleep = ms => new Promise(r => setTimeout(r, ms));
const qn    = name => document.querySelector(`[name="${name}"]`);
const q     = sel  => document.querySelector(sel);
const qid   = id   => document.getElementById(id);

const GT_LABEL    = "NSA-HP Others > 4hrs - Non-Engineering Business/Services/Others";
const LT_LABEL    = "NSA-HP Others < 4hrs - Non-Engineering Business/Services/Others";
const SCOPE_LABEL = "Employee";
const AMOUNT      = "400";
const CAL         = "ctl00_ContentPlaceHolder1_uxReceiptDateCalendar";
let   CLAIM_TYPE_LABEL = GT_LABEL;

function pickOption(selectEl, label) {
  for (const opt of selectEl.options) {
    if (opt.text.trim() === label.trim()) {
      selectEl.selectedIndex = opt.index;
      selectEl.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }
  }
  return false;
}

function getVisibleMonthYear() {
  const title = qid(`${CAL}_title`);
  if (!title) return null;
  return title.innerText.trim();
}

async function waitForEl(id, timeout=2000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const el = document.getElementById(id);
    if (el) return el;
    await sleep(50);
  }
  throw new Error("Timed out waiting for #" + id);
}

async function pickDateFromCalendar(dateStr) {
  const [dd, mm, yyyy] = dateStr.split("/").map(Number);

  const calIcon = await waitForEl("ctl00_ContentPlaceHolder1_uxCalendarImage1", 3000);
  calIcon.click();
  await waitForEl(CAL + "_title");

  const MONTHS = ["January","February","March","April","May","June",
                  "July","August","September","October","November","December"];
  const target = MONTHS[mm-1] + ", " + yyyy;

  for (let i = 0; i < 24; i++) {
    const visible = getVisibleMonthYear();
    if (visible === target) break;
    const parts    = (visible || "").split(" ");
    const curMm    = MONTHS.indexOf(parts[0]) + 1;
    const curYy    = parseInt(parts[1]);
    const curTotal = curYy * 12 + curMm;
    const tgtTotal = yyyy  * 12 + mm;
    if (tgtTotal > curTotal) {
      qid(CAL + "_nextArrow").click();
    } else {
      qid(CAL + "_prevArrow").click();
    }
    await sleep(60);
  }

  const dayCells = document.querySelectorAll("[id^=\"" + CAL + "_day_\"]");
  for (const cell of dayCells) {
    if (cell.parentElement && cell.parentElement.classList.contains("ajax__calendar_other")) continue;
    if (parseInt(cell.innerText.trim()) === dd) {
      cell.click();
      await sleep(50);
      return;
    }
  }
  throw new Error("Day " + dd + " not found in calendar");
}

async function waitForAjaxIdle(timeout=3000) {
  // Wait until no pending ASP.NET __doPostBack / UpdatePanel requests
  const start = Date.now();
  while (Date.now() - start < timeout) {
    await sleep(100);
    const prm = window.Sys && window.Sys.WebForms && window.Sys.WebForms.PageRequestManager;
    if (!prm) break;
    try {
      const inst = prm.getInstance();
      if (!inst.get_isInAsyncPostBack()) break;
    } catch(e) { break; }
  }
  await sleep(200); // extra buffer after AJAX settles
}

async function setDateField(dateStr) {
  // Try calendar picker first
  await pickDateFromCalendar(dateStr);
  await sleep(400);

  // Check if textbox got the value
  const dateEl = qn("ctl00$ContentPlaceHolder1$uxReceiptDateTextBox");
  if (dateEl && dateEl.value) return;

  // Fallback: directly write into the textbox and fire events the portal expects
  if (dateEl) {
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    nativeInputValueSetter.call(dateEl, dateStr);
    dateEl.dispatchEvent(new Event("input",  { bubbles: true }));
    dateEl.dispatchEvent(new Event("change", { bubbles: true }));
    dateEl.dispatchEvent(new Event("blur",   { bubbles: true }));
    await sleep(300);
  }

  // Last resort: try calendar one more time
  if (!dateEl || !dateEl.value) {
    await pickDateFromCalendar(dateStr);
    await sleep(400);
  }
}

async function runOneClaim(dateStr) {
  await waitForEl("ctl00_ContentPlaceHolder1_uxClaimTypeDropDownList", 4000);
  await sleep(300);

  // 1. Claim Type
  const ctEl = qn("ctl00$ContentPlaceHolder1$uxClaimTypeDropDownList");
  if (!ctEl) throw new Error("Claim Type dropdown not found");
  if (!pickOption(ctEl, CLAIM_TYPE_LABEL)) throw new Error("Claim type option not found");
  await waitForAjaxIdle(3000);

  // 2. Scope
  const scopeEl = qn("ctl00$ContentPlaceHolder1$uxSelfDependentDropDownList");
  if (!scopeEl) throw new Error("Scope dropdown not found");
  pickOption(scopeEl, SCOPE_LABEL);
  await waitForAjaxIdle(2000);

  // 3. Amount (set before date so any AJAX from amount doesn't clear date)
  const amtEl = qn("ctl00$ContentPlaceHolder1$uxAmountTextBox");
  if (amtEl && !amtEl.value) {
    amtEl.value = AMOUNT;
    amtEl.dispatchEvent(new Event("change", { bubbles: true }));
    await sleep(300);
  }

  // 4. Date — set LAST so nothing can clear it afterwards
  await setDateField(dateStr);

  // 5. Final check
  const dateEl = qn("ctl00$ContentPlaceHolder1$uxReceiptDateTextBox");
  if (!dateEl || !dateEl.value) throw new Error("Date field still empty after all attempts");

  await sleep(200);

  const saveBtn = qn("ctl00$ContentPlaceHolder1$uxSaveClaimButton");
  if (!saveBtn) throw new Error("Save button not found");
  const rowsBefore = document.querySelectorAll("tr").length;

  saveBtn.click();

  const saved = await (async () => {
    const start = Date.now();
    while (Date.now() - start < 6000) {
      await sleep(200);
      const rv = q("[id*='RangeValidator'], [id*='RequiredField']");
      if (rv && rv.style.display !== "none" && rv.innerText.trim()) throw new Error("Validation: " + rv.innerText.trim());
      const rowsNow = document.querySelectorAll("tr").length;
      if (rowsNow > rowsBefore) return true;
    }
    return false;
  })();

  if (saved) return "✅ Saved!";
  return "⚠️ Submitted — check table";
}

// ── STYLES ───────────────────────────────────
document.head.insertAdjacentHTML("beforeend", `
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  #eb-overlay {
    position:fixed;inset:0;z-index:999998;
    background:rgba(10,12,20,0.55);backdrop-filter:blur(6px);
    display:flex;align-items:center;justify-content:center;
    animation:ebFadeIn .2s ease;
  }
  @keyframes ebFadeIn  { from{opacity:0}to{opacity:1} }
  @keyframes ebSlideUp { from{opacity:0;transform:translateY(18px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)} }
  @keyframes ebCollapse{ from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:translateY(0)} }

  #eb {
    font-family:'DM Sans',sans-serif;background:#0f1117;border-radius:20px;
    padding:28px 28px 22px;width:370px;max-height:90vh;overflow-y:auto;
    box-shadow:0 32px 80px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.07);
    color:#e8eaf0;animation:ebSlideUp .25s cubic-bezier(.16,1,.3,1);
    position:relative;transition:all .3s cubic-bezier(.16,1,.3,1);
  }
  #eb::-webkit-scrollbar{width:4px}
  #eb::-webkit-scrollbar-thumb{background:#2a2d3a;border-radius:4px}

  #eb.minimized{width:320px;padding:18px 20px;overflow:hidden;}
  #eb.minimized #eb-main{display:none;}
  #eb.minimized #eb-log-view{display:flex;flex-direction:column;animation:ebCollapse .2s ease;}
  #eb-log-view{display:none;}

  #eb-head{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:22px;}
  #eb-head h2{margin:0;font-size:18px;font-weight:700;color:#fff;letter-spacing:-.3px;}
  #eb-head p{margin:3px 0 0;font-size:11.5px;color:#5a6080;}
  #eb-x{background:rgba(255,255,255,.06);border:none;border-radius:8px;width:30px;height:30px;
    cursor:pointer;color:#6a7090;font-size:16px;display:flex;align-items:center;
    justify-content:center;transition:all .15s;flex-shrink:0;}
  #eb-x:hover{background:rgba(255,255,255,.1);color:#fff;}

  .ebl{font-size:10px;font-weight:600;color:#4a5070;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;}

  .eb-toggle{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:22px;}
  .eb-toggle button{padding:10px 8px;border-radius:12px;font-family:'DM Sans',sans-serif;
    font-size:11.5px;font-weight:600;cursor:pointer;transition:all .18s;
    border:1.5px solid rgba(255,255,255,.08);background:rgba(255,255,255,.04);color:#5a6080;line-height:1.4;}
  .eb-toggle button:hover{border-color:rgba(99,102,241,.4);color:#a0a8c0;}
  .eb-toggle button.active{background:linear-gradient(135deg,#6366f1,#4f46e5);
    border-color:#6366f1;color:#fff;box-shadow:0 4px 16px rgba(99,102,241,.35);}
  .eb-toggle button .hrs{font-size:15px;font-weight:700;display:block;margin-bottom:2px;}
  .eb-toggle button .nsa{font-size:9px;opacity:.7;}

  .eb-nav{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;}
  .eb-nav span{font-weight:600;font-size:13.5px;color:#c8cce0;}
  .eb-nav button{background:rgba(255,255,255,.06);border:none;border-radius:8px;
    width:30px;height:30px;cursor:pointer;color:#8890b0;font-size:15px;
    transition:all .15s;display:flex;align-items:center;justify-content:center;}
  .eb-nav button:hover{background:rgba(255,255,255,.1);color:#fff;}

  .eb-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:3px;margin-bottom:14px;}
  .eb-dh{text-align:center;font-size:10px;font-weight:600;color:#3a4060;padding:4px 0;}
  .eb-day{text-align:center;padding:7px 2px;border-radius:8px;font-size:12px;
    cursor:pointer;color:#7880a0;border:1.5px solid transparent;transition:all .12s;}
  .eb-day:hover:not(.empty){background:rgba(99,102,241,.15);color:#a0a8ff;}
  .eb-day.sel{background:linear-gradient(135deg,#6366f1,#4f46e5)!important;
    color:#fff!important;font-weight:700;box-shadow:0 2px 10px rgba(99,102,241,.4);}
  .eb-day.today{border-color:rgba(99,102,241,.5);color:#9098f0;font-weight:600;}
  .eb-day.empty{color:#1e2030;cursor:default;pointer-events:none;}

  #eb-chips{min-height:34px;background:rgba(255,255,255,.03);border:1.5px solid rgba(255,255,255,.06);
    border-radius:10px;padding:6px 10px;margin-bottom:14px;
    display:flex;flex-wrap:wrap;gap:5px;align-items:center;}
  #eb-chips .empty-msg{font-size:11px;color:#3a4060;}
  .chip{background:rgba(99,102,241,.2);color:#9098f8;border:1px solid rgba(99,102,241,.3);
    border-radius:20px;padding:3px 10px;font-size:10.5px;font-weight:600;
    font-family:'DM Mono',monospace;display:flex;align-items:center;gap:5px;}
  .chip b{cursor:pointer;opacity:.6;font-size:13px;font-weight:400;}
  .chip b:hover{opacity:1;}

  #eb-run{width:100%;padding:12px;border:none;border-radius:12px;cursor:pointer;
    font-family:'DM Sans',sans-serif;font-size:13.5px;font-weight:700;
    background:linear-gradient(135deg,#6366f1,#4f46e5);color:#fff;margin-bottom:10px;
    transition:all .18s;box-shadow:0 4px 20px rgba(99,102,241,.3);letter-spacing:.2px;}
  #eb-run:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 6px 24px rgba(99,102,241,.45);}
  #eb-run:disabled{background:rgba(255,255,255,.07);color:#3a4060;box-shadow:none;cursor:not-allowed;}

  .eb-divider{border:none;border-top:1px solid rgba(255,255,255,.05);margin:18px 0;}

  #eb-log-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;}
  #eb-log-head .eb-log-title{font-size:11px;font-weight:600;color:#6a7090;}
  #eb-expand{background:rgba(255,255,255,.06);border:none;border-radius:7px;
    padding:4px 10px;cursor:pointer;color:#8890b0;font-size:11px;
    font-family:'DM Sans',sans-serif;transition:all .15s;font-weight:600;}
  #eb-expand:hover{background:rgba(255,255,255,.1);color:#fff;}

  #eb-mini-prog{height:3px;background:rgba(255,255,255,.06);border-radius:4px;margin-bottom:10px;}
  #eb-mini-prog-bar{height:3px;background:linear-gradient(90deg,#6366f1,#818cf8);border-radius:4px;width:0%;transition:width .4s;}

  #eb-log-mini{background:#080a10;border:1px solid rgba(255,255,255,.05);
    border-radius:10px;padding:12px 14px;height:220px;overflow-y:auto;
    font-size:10.5px;color:#4a90d9;font-family:'DM Mono',monospace;line-height:2;}
  #eb-log-mini::-webkit-scrollbar{width:3px}
  #eb-log-mini::-webkit-scrollbar-thumb{background:#1a1d2a;border-radius:4px}

  #eb-done-btn{width:100%;margin-top:10px;padding:10px;border:none;border-radius:12px;
    font-family:'DM Sans',sans-serif;font-size:13px;font-weight:700;cursor:pointer;
    background:rgba(255,255,255,.06);color:#8890b0;transition:all .18s;display:none;}
  #eb-done-btn:hover{background:rgba(255,255,255,.1);color:#fff;}

  .lg{color:#4ade80!important}.lr{color:#f87171!important}.lw{color:#fbbf24!important}
</style>`);

// ── UI HTML ───────────────────────────────────
document.body.insertAdjacentHTML("beforeend", `
<div id="eb-overlay">
  <div id="eb">
    <div id="eb-head">
      <div>
        <h2>⚡ e-Bens Scheduler</h2>
        <p id="eb-subtitle">Select type + dates, then run</p>
      </div>
      <button id="eb-x">✕</button>
    </div>
    <div id="eb-main">
      <div class="ebl">Claim Type</div>
      <div class="eb-toggle">
        <button id="eb-gt" class="active">
          <span class="hrs">&gt; 4 hrs</span>
          <span class="nsa">NSA · Non-Engineering</span>
        </button>
        <button id="eb-lt">
          <span class="hrs">&lt; 4 hrs</span>
          <span class="nsa">NSA · Non-Engineering</span>
        </button>
      </div>
      <hr class="eb-divider">
      <div class="ebl">Select Dates</div>
      <div class="eb-nav">
        <button id="eb-prev">‹</button>
        <span id="eb-month"></span>
        <button id="eb-next">›</button>
      </div>
      <div class="eb-grid" id="eb-grid"></div>
      <div id="eb-chips"></div>
      <button id="eb-run" disabled>Select dates to continue</button>
    </div>
    <div id="eb-log-view">
      <div id="eb-log-head">
        <span class="eb-log-title" id="eb-log-status">Running…</span>
        <button id="eb-expand">↑ Expand</button>
      </div>
      <div id="eb-mini-prog"><div id="eb-mini-prog-bar"></div></div>
      <div id="eb-log-mini"></div>
      <button id="eb-done-btn">✓ Done — Back to Scheduler</button>
    </div>
  </div>
</div>`);

// ── CALENDAR LOGIC ────────────────────────────
let dates = [], vy = new Date().getFullYear(), vm = new Date().getMonth();
const now = new Date();
const ML  = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DL  = ["Su","Mo","Tu","We","Th","Fr","Sa"];
const fmt = (y,m,d) => `${String(d).padStart(2,"0")}/${String(m+1).padStart(2,"0")}/${y}`;
const todayStr = fmt(now.getFullYear(), now.getMonth(), now.getDate());

function renderCal() {
  q("#eb-month").textContent = `${ML[vm]} ${vy}`;
  const g = q("#eb-grid");
  g.innerHTML = DL.map(d => `<div class="eb-dh">${d}</div>`).join("");
  const first = new Date(vy, vm, 1).getDay();
  const total = new Date(vy, vm+1, 0).getDate();
  for (let i = 0; i < first; i++) g.innerHTML += `<div class="eb-day empty"></div>`;
  for (let d = 1; d <= total; d++) {
    const ds  = fmt(vy, vm, d);
    const cls = ["eb-day", dates.includes(ds)?"sel":"", ds===todayStr?"today":""].filter(Boolean).join(" ");
    g.innerHTML += `<div class="${cls}" data-d="${ds}">${d}</div>`;
  }
  g.querySelectorAll(".eb-day:not(.empty)").forEach(e => e.onclick = () => toggle(e.dataset.d));
}

function toggle(ds) {
  const i = dates.indexOf(ds);
  i === -1 ? dates.push(ds) : dates.splice(i, 1);
  dates.sort(); renderCal(); renderChips();
}

function renderChips() {
  const chips = q("#eb-chips"), btn = q("#eb-run");
  if (!dates.length) {
    chips.innerHTML = `<span class="empty-msg">No dates selected</span>`;
    btn.disabled = true; btn.textContent = "Select dates to continue"; return;
  }
  chips.innerHTML = dates.map(ds => `<div class="chip">${ds}<b data-r="${ds}">×</b></div>`).join("");
  chips.querySelectorAll("[data-r]").forEach(b => b.onclick = () => toggle(b.dataset.r));
  btn.disabled = false;
  btn.textContent = `▶  Submit ${dates.length} Claim${dates.length>1?"s":""}`;
}

function logMini(msg, cls="") {
  const l = q("#eb-log-mini");
  l.innerHTML += `<span class="${cls}">${msg}</span><br>`;
  l.scrollTop = l.scrollHeight;
}

function setProgress(done, total) {
  q("#eb-mini-prog-bar").style.width = `${Math.round((done/total)*100)}%`;
}

function minimize() {
  q("#eb").classList.add("minimized");
  q("#eb-subtitle").textContent = "Running claims…";
  q("#eb-overlay").onclick = null;
}

function expand() {
  q("#eb").classList.remove("minimized");
  q("#eb-subtitle").textContent = "Select type + dates, then run";
  q("#eb-overlay").onclick = e => { if (e.target === q("#eb-overlay")) q("#eb-overlay").style.display = "none"; };
}

function setClaimType(type) {
  CLAIM_TYPE_LABEL = type === "gt" ? GT_LABEL : LT_LABEL;
  q("#eb-gt").classList.toggle("active", type === "gt");
  q("#eb-lt").classList.toggle("active", type === "lt");
}
q("#eb-gt").onclick = () => setClaimType("gt");
q("#eb-lt").onclick = () => setClaimType("lt");

q("#eb-prev").onclick = () => { vm--; if (vm < 0)  { vm=11; vy--; } renderCal(); };
q("#eb-next").onclick = () => { vm++; if (vm > 11) { vm=0;  vy++; } renderCal(); };

q("#eb-x").onclick = () => {
  q("#eb-overlay").style.display = "none";
  if (!q("#eb-restore")) {
    const rb = document.createElement("button");
    rb.id = "eb-restore";
    rb.textContent = "⚡ e-Bens";
    rb.style.cssText = "position:fixed;bottom:20px;right:20px;z-index:999999;background:linear-gradient(135deg,#6366f1,#4f46e5);color:#fff;border:none;border-radius:20px;padding:8px 16px;font-family:'DM Sans',sans-serif;font-size:12px;font-weight:700;cursor:pointer;box-shadow:0 4px 20px rgba(99,102,241,.4);";
    rb.onclick = () => { q("#eb-overlay").style.display = "flex"; rb.remove(); };
    document.body.appendChild(rb);
  }
};

q("#eb-expand").onclick  = () => expand();
q("#eb-done-btn").onclick = () => {
  q("#eb-log-mini").innerHTML = "";
  q("#eb-mini-prog-bar").style.width = "0%";
  q("#eb-done-btn").style.display = "none";
  q("#eb-log-status").textContent = "Running…";
  expand();
};

q("#eb-overlay").onclick = e => { if (e.target === q("#eb-overlay")) q("#eb-overlay").style.display = "none"; };

// ── RUN ───────────────────────────────────────
q("#eb-run").onclick = async () => {
  const queue = [...dates];
  const typeLabel = CLAIM_TYPE_LABEL.includes(">") ? "> 4hrs" : "< 4hrs";

  minimize();
  q("#eb-log-mini").innerHTML = "";
  q("#eb-mini-prog-bar").style.width = "0%";
  q("#eb-done-btn").style.display = "none";

  logMini(`🚀 ${queue.length} claim(s) · ${typeLabel}`);

  let passed = 0, failed = 0;
  for (let i = 0; i < queue.length; i++) {
    const ds = queue[i];
    logMini(`[${i+1}/${queue.length}] 📝 ${ds}`);
    setProgress(i, queue.length);
    q("#eb-log-status").textContent = `${i+1} / ${queue.length} claims…`;
    try {
      const result = await runOneClaim(ds);
      logMini(`  ${result}`, result.startsWith("✅") ? "lg" : "lw");
      passed++;
    } catch(e) {
      logMini(`  ❌ ${e.message}`, "lr");
      failed++;
    }
    await sleep(80);
  }

  setProgress(queue.length, queue.length);
  logMini("────────────────────────");
  logMini(`Done! ✅ ${passed}  ❌ ${failed}`, passed === queue.length ? "lg" : "lw");
  q("#eb-log-status").textContent = `✅ ${passed} saved  ❌ ${failed} failed`;
  q("#eb-done-btn").style.display = "block";
};

renderCal();
renderChips();

})();

} // end double-injection guard
