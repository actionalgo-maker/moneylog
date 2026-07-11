
(function(){
  "use strict";

  // ---------- Users config (edit this list to add/rename accounts) ----------
  // role "admin" = main account, can see and filter every user's entries.
  // role "user"  = only sees / edits their own entries.
  const USERS = [
    { username: "yonko", label: "Yonko", role: "user" },
    { username: "admin", label: "Admin", role: "admin" }
  ];

  const CATEGORIES = {
    income: ["Salary","Business","Freelance","Investment","Gift","Other"],
    expense: ["Food","Rent","Transport","Utilities","Shopping","Entertainment","Health","Education","Bills","Other"]
  };

  const LS_CONFIG = "mlog_config";
  const LS_CACHE = "mlog_entries_cache";
  const LS_USER = "mlog_current_user";

  let config = JSON.parse(localStorage.getItem(LS_CONFIG) || "null") || {
    owner:"", repo:"", branch:"main", path:"data/moneylog.json", token:""
  };
  let entries = JSON.parse(localStorage.getItem(LS_CACHE) || "[]");
  let fileSha = null;
  let currentUser = JSON.parse(localStorage.getItem(LS_USER) || "null");
  let adminFilter = "all"; // "all" or a username, admin-only

  const $ = (id) => document.getElementById(id);

  function toast(msg, type){
    const t = $("toast");
    t.textContent = msg;
    t.className = "toast show" + (type ? " " + type : "");
    clearTimeout(toast._h);
    toast._h = setTimeout(()=> t.className = "toast", 3000);
  }

  function fmt(n){
    n = Number(n) || 0;
    return n.toLocaleString(undefined,{minimumFractionDigits:2, maximumFractionDigits:2});
  }

  function num(v){
    const n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  }

  function signedAmount(e){
    return e.type === "income" ? num(e.amount) : -num(e.amount);
  }

  function fyLabel(dateStr){
    const d = new Date(dateStr + "T00:00:00");
    const y = d.getFullYear(), m = d.getMonth(); // 0=Jan
    const startY = m >= 3 ? y : y - 1; // FY starts April
    return "FY " + startY + "-" + String((startY+1) % 100).padStart(2,"0");
  }

  function monthLabel(dateStr){
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleString(undefined,{month:"short", year:"numeric"});
  }

  function monthKey(dateStr){ return dateStr.slice(0,7); }

  function uid(){
    return (crypto.randomUUID ? crypto.randomUUID() : (Date.now() + "-" + Math.random().toString(36).slice(2)));
  }

  // ---------- Login ----------

  function findUser(username){
    return USERS.find(u => u.username === username) || null;
  }

  function renderLogin(){
    const list = $("userList");
    list.innerHTML = "";
    USERS.forEach(u=>{
      const btn = document.createElement("button");
      btn.className = "user-btn";
      btn.innerHTML = `<span>${u.label}</span><span class="badge role-${u.role}">${u.role}</span>`;
      btn.onclick = ()=> login(u.username);
      list.appendChild(btn);
    });
  }

  function login(username){
    const u = findUser(username);
    if(!u) return;
    currentUser = u;
    localStorage.setItem(LS_USER, JSON.stringify(u));
    showApp();
  }

  function logout(){
    currentUser = null;
    localStorage.removeItem(LS_USER);
    $("loginScreen").style.display = "flex";
    $("app").style.display = "none";
  }

  function showApp(){
    $("loginScreen").style.display = "none";
    $("app").style.display = "block";
    $("whoBadge").innerHTML = `Logged in as <strong>${currentUser.label}</strong> <span class="badge role-${currentUser.role}">${currentUser.role}</span>`;
    $("adminFilterBar").style.display = currentUser.role === "admin" ? "flex" : "none";
    if(currentUser.role === "admin") populateAdminFilter();
    renderAll();
  }

  function populateAdminFilter(){
    const sel = $("adminUserFilter");
    sel.innerHTML = `<option value="all">All users</option>` +
      USERS.map(u=>`<option value="${u.username}">${u.label}</option>`).join("");
    sel.value = adminFilter;
    sel.onchange = ()=>{ adminFilter = sel.value; renderAll(); };
  }

  // ---------- Visibility (own data vs admin) ----------

  function visibleEntries(){
    if(currentUser.role === "admin"){
      if(adminFilter === "all") return entries;
      return entries.filter(e => e.user === adminFilter);
    }
    return entries.filter(e => e.user === currentUser.username);
  }

  function canEdit(entry){
    return currentUser.role === "admin" || entry.user === currentUser.username;
  }

  // ---------- GitHub API ----------

  function ghHeaders(){
    return {
      "Authorization": "token " + config.token,
      "Accept": "application/vnd.github+json"
    };
  }

  function ghUrl(){
    return `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${config.path}`;
  }

  function b64EncodeUnicode(str){
    return btoa(unescape(encodeURIComponent(str)));
  }
  function b64DecodeUnicode(str){
    return decodeURIComponent(escape(atob(str)));
  }

  async function githubLoad(){
    if(!config.owner || !config.repo || !config.token){
      setConn(false, "Not connected");
      return;
    }
    setConn(false, "Syncing...");
    try{
      const res = await fetch(ghUrl() + `?ref=${encodeURIComponent(config.branch||"main")}`, { headers: ghHeaders() });
      if(res.status === 404){
        fileSha = null;
        entries = entries || [];
        setConn(true, "Connected (no data yet)");
      } else if(res.ok){
        const json = await res.json();
        fileSha = json.sha;
        const content = b64DecodeUnicode(json.content.replace(/\n/g,""));
        entries = JSON.parse(content);
        setConn(true, "Connected — synced");
      } else {
        const err = await res.text();
        throw new Error(`GitHub error ${res.status}: ${err}`);
      }
      localStorage.setItem(LS_CACHE, JSON.stringify(entries));
      renderAll();
    } catch(e){
      setConn(false, "Connection failed");
      toast(e.message, "error");
    }
  }

  async function githubSave(){
    if(!config.owner || !config.repo || !config.token){
      toast("Configure GitHub settings first (top right)", "error");
      return false;
    }
    try{
      const body = {
        message: "Update MoneyLog " + new Date().toISOString(),
        content: b64EncodeUnicode(JSON.stringify(entries, null, 2)),
        branch: config.branch || "main"
      };
      if(fileSha) body.sha = fileSha;
      const res = await fetch(ghUrl(), {
        method: "PUT",
        headers: { ...ghHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if(!res.ok){
        const err = await res.text();
        throw new Error(`GitHub error ${res.status}: ${err}`);
      }
      const json = await res.json();
      fileSha = json.content.sha;
      setConn(true, "Connected — synced");
      return true;
    } catch(e){
      setConn(true, "Sync failed — saved locally only");
      toast(e.message, "error");
      return false;
    }
  }

  function setConn(ok, text){
    $("connDot").className = "dot" + (ok ? " ok" : "");
    $("connText").textContent = text;
  }

  // ---------- Rendering ----------

  function renderAll(){
    if(!currentUser) return;
    renderDaily();
    renderMonthly();
    renderFy();
    renderCategories();
  }

  function renderDaily(){
    const list = visibleEntries();
    const sorted = [...list].sort((a,b)=> b.date.localeCompare(a.date) || (b.id||"").localeCompare(a.id||""));
    const tbody = document.querySelector("#dailyTable tbody");
    tbody.innerHTML = "";
    if(sorted.length === 0){
      tbody.innerHTML = `<tr><td colspan="7" class="empty">No entries yet. Add your first one above.</td></tr>`;
    }
    for(const e of sorted){
      const tr = document.createElement("tr");
      const editable = canEdit(e);
      tr.innerHTML = `
        <td>${e.date}</td>
        <td>${findUser(e.user) ? findUser(e.user).label : e.user}</td>
        <td><span class="badge ${e.type}">${e.type}</span></td>
        <td>${e.category || "-"}</td>
        <td>${e.note ? e.note.replace(/</g,"&lt;") : "-"}</td>
        <td class="${e.type==='income'?'pos':'neg'}">${e.type==='income'?'+':'-'}${fmt(e.amount)}</td>
        <td class="row-actions">
          ${editable ? `<button class="ghost" data-edit="${e.id}">Edit</button><button class="ghost" data-del="${e.id}">Del</button>` : ""}
        </td>`;
      tbody.appendChild(tr);
    }
    tbody.querySelectorAll("[data-edit]").forEach(b=> b.onclick = ()=> loadIntoForm(b.dataset.edit));
    tbody.querySelectorAll("[data-del]").forEach(b=> b.onclick = ()=> deleteEntry(b.dataset.del));

    // stats
    const totalIncome = list.filter(e=>e.type==="income").reduce((s,e)=> s + num(e.amount), 0);
    const totalExpense = list.filter(e=>e.type==="expense").reduce((s,e)=> s + num(e.amount), 0);
    const todayStr = new Date().toISOString().slice(0,10);
    const thisMonth = list.filter(e=> monthKey(e.date) === todayStr.slice(0,7));
    const monthIncome = thisMonth.filter(e=>e.type==="income").reduce((s,e)=> s + num(e.amount), 0);
    const monthExpense = thisMonth.filter(e=>e.type==="expense").reduce((s,e)=> s + num(e.amount), 0);
    const statsHtml = `
      <div class="stat"><div class="label">All-Time Income</div><div class="value pos">${fmt(totalIncome)}</div></div>
      <div class="stat"><div class="label">All-Time Expense</div><div class="value neg">${fmt(totalExpense)}</div></div>
      <div class="stat"><div class="label">All-Time Net</div><div class="value ${(totalIncome-totalExpense)>=0?'pos':'neg'}">${fmt(totalIncome-totalExpense)}</div></div>
      <div class="stat"><div class="label">This Month Net</div><div class="value ${(monthIncome-monthExpense)>=0?'pos':'neg'}">${fmt(monthIncome-monthExpense)}</div></div>
    `;
    $("dailyStats").innerHTML = statsHtml;

    // admin: per-user breakdown, all-time, only meaningful when viewing "all"
    const bcard = $("userBreakdownCard");
    if(currentUser.role === "admin" && adminFilter === "all"){
      bcard.style.display = "block";
      const tbody2 = document.querySelector("#userBreakdownTable tbody");
      tbody2.innerHTML = "";
      USERS.forEach(u=>{
        const uEntries = entries.filter(e=> e.user === u.username);
        const inc = uEntries.filter(e=>e.type==="income").reduce((s,e)=>s+num(e.amount),0);
        const exp = uEntries.filter(e=>e.type==="expense").reduce((s,e)=>s+num(e.amount),0);
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${u.label}</td><td class="pos">${fmt(inc)}</td><td class="neg">${fmt(exp)}</td><td class="${(inc-exp)>=0?'pos':'neg'}">${fmt(inc-exp)}</td>`;
        tbody2.appendChild(tr);
      });
    } else {
      bcard.style.display = "none";
    }
  }

  function groupBy(keyFn, labelFn){
    const list = visibleEntries();
    const map = new Map();
    for(const e of list){
      const k = keyFn(e.date);
      if(!map.has(k)) map.set(k, { key:k, label: labelFn(e.date), income:0, expense:0, count:0 });
      const g = map.get(k);
      if(e.type === "income") g.income += num(e.amount); else g.expense += num(e.amount);
      g.count += 1;
    }
    return [...map.values()].sort((a,b)=> a.key.localeCompare(b.key));
  }

  let monthlyChartInst, fyChartInst;

  function renderMonthly(){
    const groups = groupBy(monthKey, monthLabel);
    const tbody = document.querySelector("#monthlyTable tbody");
    tbody.innerHTML = groups.length ? "" : `<tr><td colspan="5" class="empty">No data yet.</td></tr>`;
    for(const g of [...groups].reverse()){
      const net = g.income - g.expense;
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${g.label}</td><td class="pos">${fmt(g.income)}</td><td class="neg">${fmt(g.expense)}</td><td class="${net>=0?'pos':'neg'}">${fmt(net)}</td><td>${g.count}</td>`;
      tbody.appendChild(tr);
    }
    drawChart("monthlyChart", groups, (inst)=> monthlyChartInst = inst, monthlyChartInst);
  }

  function renderFy(){
    const groups = groupBy(fyLabel, fyLabel);
    const tbody = document.querySelector("#fyTable tbody");
    tbody.innerHTML = groups.length ? "" : `<tr><td colspan="5" class="empty">No data yet.</td></tr>`;
    for(const g of [...groups].reverse()){
      const net = g.income - g.expense;
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${g.label}</td><td class="pos">${fmt(g.income)}</td><td class="neg">${fmt(g.expense)}</td><td class="${net>=0?'pos':'neg'}">${fmt(net)}</td><td>${g.count}</td>`;
      tbody.appendChild(tr);
    }
    drawChart("fyChart", groups, (inst)=> fyChartInst = inst, fyChartInst);
  }

  function renderCategories(){
    const list = visibleEntries();
    const map = new Map();
    for(const e of list){
      const k = (e.category || "Uncategorized") + "|" + e.type;
      if(!map.has(k)) map.set(k, { category: e.category || "Uncategorized", type: e.type, total:0, count:0 });
      const g = map.get(k);
      g.total += num(e.amount);
      g.count += 1;
    }
    const groups = [...map.values()].sort((a,b)=> b.total - a.total);
    const tbody = document.querySelector("#categoryTable tbody");
    tbody.innerHTML = groups.length ? "" : `<tr><td colspan="4" class="empty">No data yet.</td></tr>`;
    for(const g of groups){
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${g.category}</td><td><span class="badge ${g.type}">${g.type}</span></td><td class="${g.type==='income'?'pos':'neg'}">${fmt(g.total)}</td><td>${g.count}</td>`;
      tbody.appendChild(tr);
    }
  }

  function drawChart(canvasId, groups, setInst, existing){
    const ctx = document.getElementById(canvasId);
    const labels = groups.map(g=>g.label);
    const income = groups.map(g=>Number(g.income.toFixed(2)));
    const expense = groups.map(g=>Number(g.expense.toFixed(2)));
    if(existing){ existing.destroy(); }
    const inst = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          { label:"Income", data: income, backgroundColor: "#2ecc71" },
          { label:"Expense", data: expense, backgroundColor: "#ff5d5d" }
        ]
      },
      options: {
        responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{ labels:{ color:"#9aa3b2" } } },
        scales:{
          x:{ ticks:{ color:"#9aa3b2" }, grid:{ color:"#2a2f3a" } },
          y:{ ticks:{ color:"#9aa3b2" }, grid:{ color:"#2a2f3a" } }
        }
      }
    });
    setInst(inst);
  }

  // ---------- Form ----------

  function updateCategoryList(){
    const type = $("f_type").value;
    const dl = $("categoryList");
    dl.innerHTML = (CATEGORIES[type] || []).map(c=>`<option value="${c}">`).join("");
  }

  function clearForm(){
    $("f_date").value = new Date().toISOString().slice(0,10);
    $("f_type").value = "expense";
    $("f_amount").value = "";
    $("f_category").value = "";
    $("f_note").value = "";
    $("f_amount").dataset.editingId = "";
    updateCategoryList();
  }

  function loadIntoForm(id){
    const e = entries.find(x=>x.id===id);
    if(!e || !canEdit(e)) return;
    $("f_date").value = e.date;
    $("f_type").value = e.type;
    updateCategoryList();
    $("f_amount").value = e.amount;
    $("f_category").value = e.category || "";
    $("f_note").value = e.note || "";
    $("f_amount").dataset.editingId = id;
    window.scrollTo({top:0, behavior:"smooth"});
  }

  async function saveEntry(){
    const date = $("f_date").value;
    if(!date){ toast("Pick a date", "error"); return; }
    const amount = num($("f_amount").value);
    if(amount <= 0){ toast("Enter an amount greater than 0", "error"); return; }
    const editingId = $("f_amount").dataset.editingId;

    if(editingId){
      const idx = entries.findIndex(e=>e.id===editingId);
      if(idx >= 0 && canEdit(entries[idx])){
        entries[idx] = { ...entries[idx], date, type: $("f_type").value, amount, category: $("f_category").value.trim(), note: $("f_note").value.trim() };
      }
    } else {
      entries.push({
        id: uid(),
        date,
        user: currentUser.username,
        type: $("f_type").value,
        amount,
        category: $("f_category").value.trim(),
        note: $("f_note").value.trim()
      });
    }
    localStorage.setItem(LS_CACHE, JSON.stringify(entries));
    renderAll();
    toast("Saving...");
    const ok = await githubSave();
    if(ok) toast("Saved & synced to GitHub", "success");
    clearForm();
  }

  async function deleteEntry(id){
    const e = entries.find(x=>x.id===id);
    if(!e || !canEdit(e)) return;
    if(!confirm(`Delete this ${e.type} entry (${fmt(e.amount)}) from ${e.date}?`)) return;
    entries = entries.filter(x=>x.id!==id);
    localStorage.setItem(LS_CACHE, JSON.stringify(entries));
    renderAll();
    const ok = await githubSave();
    if(ok) toast("Deleted & synced", "success");
  }

  function exportCsv(){
    const headers = ["date","user","type","category","amount","note"];
    const rows = [...visibleEntries()].sort((a,b)=>a.date.localeCompare(b.date)).map(e=>
      [e.date, e.user, e.type, JSON.stringify(e.category||""), e.amount, JSON.stringify(e.note||"")].join(",")
    );
    const csv = headers.join(",") + "\n" + rows.join("\n");
    const blob = new Blob([csv], {type:"text/csv"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "moneylog.csv";
    a.click();
  }

  // ---------- Settings ----------

  function openSettings(){
    $("s_owner").value = config.owner || "";
    $("s_repo").value = config.repo || "";
    $("s_branch").value = config.branch || "main";
    $("s_path").value = config.path || "data/moneylog.json";
    $("s_token").value = config.token || "";
    $("settingsModal").classList.add("open");
  }
  function closeSettings(){ $("settingsModal").classList.remove("open"); }

  async function saveSettings(){
    config = {
      owner: $("s_owner").value.trim(),
      repo: $("s_repo").value.trim(),
      branch: $("s_branch").value.trim() || "main",
      path: $("s_path").value.trim() || "data/moneylog.json",
      token: $("s_token").value.trim()
    };
    localStorage.setItem(LS_CONFIG, JSON.stringify(config));
    closeSettings();
    await githubLoad();
  }

  // ---------- Tabs ----------

  function initTabs(){
    document.querySelectorAll(".tab").forEach(tab=>{
      tab.onclick = ()=>{
        document.querySelectorAll(".tab").forEach(t=>t.classList.remove("active"));
        document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));
        tab.classList.add("active");
        $("view-"+tab.dataset.view).classList.add("active");
      };
    });
  }

  // ---------- Init ----------

  function init(){
    renderLogin();
    initTabs();
    clearForm();
    $("f_type").onchange = updateCategoryList;
    $("saveEntryBtn").onclick = saveEntry;
    $("clearFormBtn").onclick = clearForm;
    $("exportCsvBtn").onclick = exportCsv;
    $("refreshBtn").onclick = githubLoad;
    $("settingsBtn").onclick = openSettings;
    $("settingsCancelBtn").onclick = closeSettings;
    $("settingsSaveBtn").onclick = saveSettings;
    $("switchUserBtn").onclick = logout;

    if(currentUser && findUser(currentUser.username)){
      currentUser = findUser(currentUser.username);
      showApp();
    } else {
      $("loginScreen").style.display = "flex";
      $("app").style.display = "none";
    }

    if(config.token) githubLoad(); else setConn(false, "Not connected");
  }

  document.addEventListener("DOMContentLoaded", init);

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("service-worker.js").catch(() => {});
    });
  }
})();
