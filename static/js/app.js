(() => {
  "use strict";

  const MONTH_NAMES = ["فروردین","اردیبهشت","خرداد","تیر","مرداد","شهریور","مهر","آبان","آذر","دی","بهمن","اسفند"];
  const WEEKDAY_SHORT = ["ش", "ی", "د", "س", "چ", "پ", "ج"];

  const $ = (sel) => document.querySelector(sel);

  // ---------------------------------------------------------- theme toggle --
  const themeToggle = $("#themeToggle");
  themeToggle.addEventListener("click", () => {
    const root = document.documentElement;
    const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    localStorage.setItem("taskinoo-theme", next);
    if (overallChart) paintOverallChart(lastHistory);
  });

  // ------------------------------------------------------------------ api --
  async function api(path, options) {
    const res = await fetch(path, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || "خطای غیرمنتظره");
    }
    return res.status === 204 ? null : res.json();
  }

  // ------------------------------------------------------------------ quote --
  async function loadQuote() {
    try {
      const data = await api("/api/quote");
      $("#quoteText").textContent = data.quote;
    } catch {
      $("#quoteText").textContent = "امروز رو با یک قدم کوچیک شروع کن.";
    }
  }

  // ------------------------------------------------------------------ tasks --
  const taskForm = $("#taskForm");
  const tasksBody = $("#tasksBody");

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function renderTasks(tasks) {
    $("#tasksSummary").textContent = tasks.length
      ? `${tasks.length} کار · ${tasks.filter((t) => t.progress === 100).length} انجام‌شده`
      : "بدون کار";

    if (!tasks.length) {
      tasksBody.innerHTML = `<tr class="empty-row"><td colspan="5">هنوز کاری اضافه نکردی. از بالا شروع کن!</td></tr>`;
      return;
    }

    tasksBody.innerHTML = tasks
      .map((t) => {
        const done = t.progress === 100;
        return `
        <tr data-id="${t.id}">
          <td>
            <span class="task-title">${escapeHtml(t.title)}</span>
            ${t.description ? `<span class="task-desc">${escapeHtml(t.description)}</span>` : ""}
          </td>
          <td><span class="cat-badge">${escapeHtml(t.category)}</span></td>
          <td class="due-cell">${t.due_date || "—"}</td>
          <td class="progress-cell">
            <div class="progress-inline">
              <div class="progress-track"><div class="progress-fill ${done ? "done" : ""}" style="width:${t.progress}%"></div></div>
              <input type="range" class="progress-slider" min="0" max="100" step="5" value="${t.progress}" data-id="${t.id}">
              <span class="progress-pct num">${t.progress}٪</span>
            </div>
          </td>
          <td>
            <div class="row-actions">
              <button class="icon-btn edit-btn" data-id="${t.id}" title="ویرایش عنوان">✎</button>
              <button class="icon-btn danger delete-btn" data-id="${t.id}" title="حذف">✕</button>
            </div>
          </td>
        </tr>`;
      })
      .join("");
  }

  async function loadTasks() {
    const tasks = await api("/api/tasks");
    renderTasks(tasks);
    renderChecklist(tasks);
    return tasks;
  }

  // --------------------------------------------------------------- checklist --
  const checklistList = $("#checklistList");

  function renderChecklist(tasks) {
    if (!tasks.length) {
      checklistList.innerHTML = `<li class="empty-row">هنوز کاری اضافه نکردی.</li>`;
      $("#checklistSummary").textContent = "بدون کار";
      return;
    }

    const sorted = [...tasks].sort((a, b) => (a.progress === 100) - (b.progress === 100));
    const doneCount = tasks.filter((t) => t.progress === 100).length;
    $("#checklistSummary").textContent = `${doneCount} از ${tasks.length} انجام شد`;

    checklistList.innerHTML = sorted
      .map((t) => {
        const done = t.progress === 100;
        return `
        <li class="check-item ${done ? "done" : ""}" data-id="${t.id}">
          <input type="checkbox" ${done ? "checked" : ""} data-id="${t.id}">
          <span class="chk-title">${escapeHtml(t.title)}</span>
          <span class="cat-badge">${escapeHtml(t.category)}</span>
        </li>`;
      })
      .join("");
  }

  checklistList.addEventListener("change", async (e) => {
    if (e.target.type !== "checkbox") return;
    const id = e.target.dataset.id;
    try {
      await api(`/api/tasks/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ toggle_done: true }),
      });
      await refreshAll();
    } catch (err) {
      alert(err.message);
    }
  });

  taskForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const title = $("#taskTitle").value.trim();
    if (!title) return;
    try {
      await api("/api/tasks", {
        method: "POST",
        body: JSON.stringify({
          title,
          category: $("#taskCategory").value,
          due_date: $("#taskDue").value || null,
          description: $("#taskDesc").value.trim(),
        }),
      });
      taskForm.reset();
      await refreshAll();
    } catch (err) {
      alert(err.message);
    }
  });

  tasksBody.addEventListener("input", async (e) => {
    if (!e.target.classList.contains("progress-slider")) return;
    const id = e.target.dataset.id;
    const value = e.target.value;
    const row = e.target.closest("tr");
    const fill = row.querySelector(".progress-fill");
    const pctLabel = row.querySelector(".progress-pct");
    fill.style.width = value + "%";
    pctLabel.textContent = value + "٪";
    fill.classList.toggle("done", Number(value) === 100);
  });

  tasksBody.addEventListener("change", async (e) => {
    if (!e.target.classList.contains("progress-slider")) return;
    const id = e.target.dataset.id;
    try {
      await api(`/api/tasks/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ progress: Number(e.target.value) }),
      });
      await refreshSecondary();
      const tasks = await loadTasks();
    } catch (err) {
      alert(err.message);
    }
  });

  tasksBody.addEventListener("click", async (e) => {
    const delBtn = e.target.closest(".delete-btn");
    const editBtn = e.target.closest(".edit-btn");

    if (delBtn) {
      const id = delBtn.dataset.id;
      if (!confirm("این کار حذف بشه؟")) return;
      try {
        await api(`/api/tasks/${id}`, { method: "DELETE" });
        await refreshAll();
      } catch (err) {
        alert(err.message);
      }
      return;
    }

    if (editBtn) {
      const id = editBtn.dataset.id;
      const row = editBtn.closest("tr");
      const currentTitle = row.querySelector(".task-title").textContent;
      const newTitle = prompt("عنوان جدید:", currentTitle);
      if (newTitle === null || !newTitle.trim() || newTitle.trim() === currentTitle) return;
      try {
        await api(`/api/tasks/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ title: newTitle.trim() }),
        });
        await refreshAll();
      } catch (err) {
        alert(err.message);
      }
    }
  });

  // --------------------------------------------------------------- calendar --
  let calState = { jy: null, jm: null };

  async function loadCalendar(jy, jm) {
    const data = await api(`/api/calendar?jy=${jy}&jm=${jm}`);
    calState = { jy: data.jy, jm: data.jm };
    $("#calendarLabel").textContent = `${data.month_name} ${data.jy}`;

    $("#calendarWeekdays").innerHTML = WEEKDAY_SHORT.map((w) => `<span>${w}</span>`).join("");

    const cells = [];
    for (let i = 0; i < data.start_weekday; i++) cells.push(`<div class="cal-cell empty"></div>`);
    data.days.forEach((d) => {
      let level = 0;
      if (d.activity >= 6) level = 3;
      else if (d.activity >= 3) level = 2;
      else if (d.activity >= 1) level = 1;
      cells.push(
        `<div class="cal-cell ${d.is_today ? "today" : ""}" data-level="${level}" title="${d.activity} فعالیت">${d.jd}</div>`
      );
    });
    $("#calendarGrid").innerHTML = cells.join("");
  }

  $("#prevMonth").addEventListener("click", () => {
    let { jy, jm } = calState;
    jm -= 1;
    if (jm < 1) { jm = 12; jy -= 1; }
    loadCalendar(jy, jm);
  });
  $("#nextMonth").addEventListener("click", () => {
    let { jy, jm } = calState;
    jm += 1;
    if (jm > 12) { jm = 1; jy += 1; }
    loadCalendar(jy, jm);
  });

  // --------------------------------------------------------------- progress --
  let overallChart = null;
  let lastHistory = [];

  function renderTaskProgressList(tasks) {
    const wrap = $("#taskProgressList");
    if (!tasks.length) {
      wrap.innerHTML = `<p class="muted">کاری برای نمایش وجود نداره.</p>`;
      return;
    }
    wrap.innerHTML = tasks
      .map(
        (t) => `
      <div class="tp-row">
        <span class="tp-title">${escapeHtml(t.title)}</span>
        <div class="tp-track"><div class="tp-fill ${t.progress === 100 ? "done" : ""}" style="width:${t.progress}%"></div></div>
        <span class="tp-pct num">${t.progress}٪</span>
      </div>`
      )
      .join("");
  }

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function paintOverallChart(history) {
    const ctx = $("#overallChart").getContext("2d");
    const labels = history.map((h) => h.date.slice(5));
    const values = history.map((h) => h.avg_progress);
    const accent = cssVar("--accent") || "#8c93f5";
    const text = cssVar("--text-muted") || "#888";
    const grid = cssVar("--border") || "#333";

    if (overallChart) overallChart.destroy();
    overallChart = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            data: values,
            borderColor: accent,
            backgroundColor: accent + "33",
            fill: true,
            tension: 0.35,
            pointRadius: 0,
            pointHoverRadius: 4,
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: text, font: { family: "JetBrains Mono", size: 10 } }, grid: { color: grid } },
          y: {
            min: 0, max: 100,
            ticks: { color: text, font: { family: "JetBrains Mono", size: 10 }, callback: (v) => v + "٪" },
            grid: { color: grid },
          },
        },
      },
    });
  }

  async function loadProgress() {
    const data = await api("/api/progress");
    renderTaskProgressList(data.tasks);
    lastHistory = data.history.length ? data.history : [{ date: new Date().toISOString().slice(0, 10), avg_progress: 0 }];
    paintOverallChart(lastHistory);
    $("#overallAvg").textContent = data.current_avg + "٪";
  }

  // ------------------------------------------------------------- refreshers --
  async function refreshSecondary() {
    await Promise.all([loadProgress(), loadCalendar(calState.jy, calState.jm)]);
  }

  async function refreshAll() {
    await loadTasks();
    await refreshSecondary();
  }

  // ------------------------------------------------------------------- init --
  (async function init() {
    loadQuote();
    const today = await api("/api/today");
    await loadCalendar(today.jy, today.jm);
    await loadTasks();
    await loadProgress();
  })();
})();
