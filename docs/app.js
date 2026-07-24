/* ============================================================
   Carolina Core Wellness \u2014 2026 Revenue Dashboard
   3 tabs: Overall (company-wide, 4 streams) \u00b7 Coffee \u00b7 Events
   Public dashboard: plain-JSON data + charts.
   Loads in EVERY context (HTTPS, HTTP, file://, in-app browsers) \u2014
   no Web Crypto / secure-context dependency.
   Pure math exposed on window.GFP for headless testing.
   ============================================================ */
(function () {
  "use strict";

  var COLORS = {
    green: "#1f8a4c", greenSoft: "#9fd3b4", blue: "#0e4d92", blueSoft: "#9db8d6",
    amber: "#c77d0a", red: "#b3261e", ink: "#12303f", grid: "#e2e8ee",
    coffee: "#6f4e37", food: "#2a9d8f", apparel: "#c77d0a", alcohol: "#8e44ad"
  };
  var CAT_COLORS = { Coffee: COLORS.coffee, Food: COLORS.food, Apparel: COLORS.apparel, Alcohol: COLORS.alcohol };
  var CONS_FACTOR = 0.95;

  function chartReady() { return typeof Chart !== "undefined"; }

  // ---------- number helpers ----------
  function money(n) { return "$" + Math.round(n).toLocaleString("en-US"); }
  function money2(n) { return "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function num(n) { return Number(n).toLocaleString("en-US"); }
  function pct(n) { return (n >= 0 ? "+" : "") + n.toFixed(1) + "%"; }
  function pct0(n) { return n.toFixed(1) + "%"; }

  // ---------- pace / time-of-year (pure, date-driven) ----------
  function yearElapsedFraction(now) {
    now = now || new Date();
    var y = now.getFullYear();
    var start = new Date(y, 0, 1).getTime();
    var end = new Date(y + 1, 0, 1).getTime();
    return (now.getTime() - start) / (end - start);
  }
  function paceStatus(realized, target, now) {
    var realizedPct = target > 0 ? realized / target : 0;
    var elapsed = yearElapsedFraction(now);
    var ratio = elapsed > 0 ? realizedPct / elapsed : 1;
    var level = ratio >= 0.98 ? "green" : ratio >= 0.90 ? "yellow" : "red";
    return {
      realizedPct: realizedPct * 100,
      elapsedPct: elapsed * 100,
      ratio: ratio,
      level: level,
      gapPts: (realizedPct - elapsed) * 100
    };
  }
  function paceLabel(level) {
    return level === "green" ? "On track" : level === "yellow" ? "Slightly behind" : "Behind pace";
  }

  // ---------- trend math (pure) ----------
  function linearRegression(ys) {
    var n = ys.length, sx = 0, sy = 0, sxy = 0, sxx = 0;
    for (var i = 0; i < n; i++) { sx += i; sy += ys[i]; sxy += i * ys[i]; sxx += i * i; }
    var denom = (n * sxx - sx * sx) || 1;
    var slope = (n * sxy - sx * sy) / denom;
    var intercept = (sy - slope * sx) / n;
    return { slope: slope, intercept: intercept, points: ys.map(function (_, i) { return slope * i + intercept; }) };
  }
  function movingAverage(ys, w) {
    w = w || 3;
    return ys.map(function (_, i) {
      if (i < w - 1) return null;
      var s = 0; for (var j = i - w + 1; j <= i; j++) s += ys[j];
      return s / w;
    });
  }
  function momActuals(months) {
    var acts = months.filter(function (m) { return !m.forecast; }).map(function (m) { return m.revenue; });
    var mom = [];
    for (var i = 1; i < acts.length; i++) mom.push((acts[i] - acts[i - 1]) / acts[i - 1] * 100);
    return {
      series: mom,
      avg: mom.length ? mom.reduce(function (a, b) { return a + b; }, 0) / mom.length : 0,
      latest: mom.length ? mom[mom.length - 1] : 0
    };
  }
  function extremesActual(months) {
    var acts = months.filter(function (m) { return !m.forecast; });
    if (!acts.length) acts = months;
    var lo = acts[0], hi = acts[0];
    acts.forEach(function (m) { if (m.revenue < lo.revenue) lo = m; if (m.revenue > hi.revenue) hi = m; });
    return { lowest: lo, highest: hi };
  }
  function computeConservative(months) {
    var lastActualIdx = -1;
    months.forEach(function (m, i) { if (!m.forecast) lastActualIdx = i; });
    var line = months.map(function (m, i) {
      if (m.forecast) return m.revenue * CONS_FACTOR;
      if (i === lastActualIdx) return m.revenue;
      return null;
    });
    var total = months.reduce(function (a, m) { return a + (m.forecast ? m.revenue * CONS_FACTOR : m.revenue); }, 0);
    return { line: line, total: total, lastActualIdx: lastActualIdx };
  }

  var CONFIG, DATA, CHARTS = {};

  function showLoadError(msg) {
    var note = document.getElementById("load-note");
    if (note) note.innerHTML = "<strong>Could not load dashboard data:</strong> " + msg;
  }
  // If the Chart.js CDN is blocked/unavailable, replace each canvas with a small note
  // so the page still shows all numbers instead of an empty chart box.
  function noteChartsUnavailable() {
    if (chartReady()) return;
    var wraps = document.querySelectorAll(".chart-wrap");
    for (var i = 0; i < wraps.length; i++) {
      wraps[i].innerHTML = '<p class="hint" style="padding:18px 4px">Charts unavailable (the chart library didn\u2019t load) \u2014 all figures are shown in the tables and cards above.</p>';
    }
  }
  function kpiCard(c) {
    return '<div class="kpi"><div class="label">' + c.label + '</div>' +
      '<div class="value ' + (c.cls || "") + '">' + c.value + '</div>' +
      '<div class="meta">' + (c.meta || "") + "</div></div>";
  }

  // ===================== OVERALL =====================
  function renderOverall(o) {
    var months = o.months;
    var revs = months.map(function (m) { return m.revenue; });
    var ma = movingAverage(revs, 3);
    var reg = linearRegression(revs).points;
    var mom = momActuals(months);
    var ext = extremesActual(months);
    var cons = computeConservative(months);

    var realized = o.realized;
    var target = o.denominator;
    var projectedFull = revs.reduce(function (a, b) { return a + b; }, 0);
    var progress = realized / target * 100;
    var pace = o.pace || {};
    var ps = paceStatus(realized, target);

    var bar = document.getElementById("ov-bar");
    bar.className = "bar " + ps.level;
    bar.style.width = Math.max(2, Math.min(100, progress)).toFixed(1) + "%";
    bar.textContent = pct0(progress);
    document.getElementById("ov-bar-left").textContent = "Realized " + money(realized);
    document.getElementById("ov-bar-right").textContent = "Target " + money(target);
    document.getElementById("ov-progress-hint").textContent =
      "Realized revenue as a percent of the overall yearly projection (all four streams). " +
      "Denominator = " + money(target) + " four-stream AOP plan. Realized reflects booked actuals through Jun 30.";

    var gapTxt = ps.gapPts < 0
      ? " \u2014 behind by " + Math.abs(ps.gapPts).toFixed(1) + " pts"
      : " \u2014 ahead by " + ps.gapPts.toFixed(1) + " pts";
    document.getElementById("ov-pace").innerHTML =
      '<div class="pace pace-' + ps.level + '">' +
        '<div class="pace-head">' + paceLabel(ps.level) + ": " + pct0(ps.realizedPct) +
          " realized vs " + pct0(ps.elapsedPct) + " of the year elapsed" + gapTxt + ".</div>" +
        '<div class="pace-sub">To make it up and still hit ' + money(target) +
          ', revenue needs to average <b>' + money(pace.perMonth) + "/mo</b> \u00b7 <b>" +
          money(pace.perWeek) + "/wk</b> \u00b7 <b>" + money(pace.perDay) + "/day</b> across the remaining " +
          (pace.remMonths || 6) + " months (Jul\u2013Dec) \u2014 up from the current " +
          money(pace.currentRunRateMonthly) + "/mo run-rate (<b>+" + (pace.upliftPct != null ? pace.upliftPct.toFixed(1) : "0.0") +
          "%</b>, +" + money(pace.upliftMonthly) + "/mo).</div>" +
      "</div>";

    document.getElementById("ov-forward").innerHTML =
      "<strong>Forward progress:</strong> " + money(realized) + " of the " + money(target) +
      " annual plan is booked (" + pct0(progress) + "). We've made real progress \u2014 but we can't stop: " +
      money(target - realized) + " remains across the back half of the year.";

    if (o.julyCallout) {
      var jc = o.julyCallout;
      document.getElementById("ov-july").innerHTML =
        "<strong>July-to-date callout (not in the headline above):</strong> The coffee store has booked <b>" +
        money2(jc.total) + "</b> in Jul 1\u201323 \u2014 Coffee " + money2(jc.coffee) + " \u00b7 Food " +
        money2(jc.food) + " \u00b7 Apparel " + money2(jc.apparel) + " \u00b7 Alcohol " + money2(jc.alcohol) +
        ". " + jc.note;
    }

    document.getElementById("ov-kpis").innerHTML = [
      { label: "Realized Revenue (Jan\u2013Jun booked)", value: money(realized), meta: pct0(progress) + " of annual plan" },
      { label: "Revised Full Year", value: money(projectedFull), meta: "Actuals + Jul\u2013Dec budget \u00b7 Conservative " + money(cons.total) },
      { label: "Overall Annual Plan (AOP)", value: money(target), meta: "All four revenue streams" },
      { label: "Monthly Avg to Hit Target", value: money(pace.perMonth), meta: "Needed Jul\u2013Dec vs " + money(pace.currentRunRateMonthly) + "/mo now" },
      { label: "Lowest Month", value: money(ext.lowest.revenue), meta: ext.lowest.label + " (booked)" },
      { label: "Avg MoM Growth (actuals)", value: pct(mom.avg), meta: "Latest MoM " + pct(mom.latest), cls: mom.avg >= 0 ? "up" : "down" }
    ].map(kpiCard).join("");

    var tbody = "", prevAct = null;
    months.forEach(function (m, i) {
      var momTxt;
      if (m.forecast) { momTxt = '<span class="subtle">\u2014 (forecast)</span>'; }
      else { momTxt = prevAct == null ? "\u2014" : pct((m.revenue - prevAct) / prevAct * 100); prevAct = m.revenue; }
      tbody += "<tr><td>" + m.label +
        ' <span class="badge ' + (m.forecast ? "forecast" : "actual") + '">' + (m.forecast ? "budget" : "booked") + "</span></td>" +
        "<td>" + money(m.revenue) + "</td>" +
        "<td>" + (ma[i] == null ? "\u2014" : money(ma[i])) + "</td>" +
        "<td>" + momTxt + "</td></tr>";
    });
    document.querySelector("#ov-detail tbody").innerHTML = tbody;
    document.querySelector("#ov-detail tfoot").innerHTML =
      "<tr><td>Revised Full Year</td><td>" + money(projectedFull) + "</td><td></td><td></td></tr>";

    CHARTS.overall = function () {
      if (!chartReady()) return;
      new Chart(document.getElementById("ov-chart").getContext("2d"), {
        data: {
          labels: months.map(function (m) { return m.key; }),
          datasets: [
            { type: "bar", label: "Monthly Revenue", data: revs, order: 4,
              backgroundColor: months.map(function (m) { return m.forecast ? COLORS.greenSoft : COLORS.green; }),
              borderRadius: 4, maxBarThickness: 46 },
            { type: "line", label: "Conservative (\u22125%, Jul\u2013Dec)", data: cons.line, order: 0,
              borderColor: COLORS.red, backgroundColor: COLORS.red, borderWidth: 2.5, pointRadius: 3, pointStyle: "rectRot", tension: .3, spanGaps: false },
            { type: "line", label: "3-mo Moving Avg", data: ma, order: 2,
              borderColor: COLORS.blue, backgroundColor: COLORS.blue, borderWidth: 2.5, pointRadius: 2, tension: .35, spanGaps: true },
            { type: "line", label: "Linear Trend", data: reg, order: 3,
              borderColor: COLORS.amber, backgroundColor: COLORS.amber, borderWidth: 2, borderDash: [7, 5], pointRadius: 0, tension: 0 }
          ]
        },
        options: baseChartOpts()
      });
    };
  }

  // ===================== COFFEE =====================
  function renderCoffee(c) {
    var mtdPct = c.mtdRealized / c.mtdBudget * 100;
    var wk = c.currentWeek;
    var wkPctToDate = wk.realized / wk.goalToDate * 100;
    var units = c.units || { total: 0, byCategory: {} };

    document.getElementById("cf-week-hint").textContent =
      wk.label + ": " + money2(wk.realized) + " booked vs " + money(wk.goalToDate) +
      " goal-to-date (full-week goal " + money(wk.fullGoal) + ").";
    var wb = document.getElementById("cf-week-bar");
    var wl = wkPctToDate >= 98 ? "green" : wkPctToDate >= 80 ? "yellow" : "red";
    wb.className = "bar " + wl;
    wb.style.width = Math.max(2, Math.min(100, wkPctToDate)).toFixed(1) + "%";
    wb.textContent = pct0(wkPctToDate);
    document.getElementById("cf-week-left").textContent = "Week-to-date " + money(wk.realized);
    document.getElementById("cf-week-right").textContent = "Goal-to-date " + money(wk.goalToDate);

    document.getElementById("cf-kpis").innerHTML = [
      { label: "July MTD (1\u201323)", value: money2(c.mtdRealized), meta: pct0(mtdPct) + " of " + money(c.mtdBudget) + " budget-to-date" },
      { label: "Current Week vs. Goal", value: pct0(wkPctToDate), meta: wk.label },
      { label: "Last Complete Week", value: money(c.lastWeek.realized), meta: c.lastWeek.label + " vs " + money(c.lastWeek.goal) + " goal" },
      { label: "Products Sold (Jul 1\u201323)", value: num(units.total),
        meta: "Coffee " + num(units.byCategory.Coffee || 0) + " \u00b7 Food " + num(units.byCategory.Food || 0) + " \u00b7 Apparel " + num(units.byCategory.Apparel || 0) + " \u00b7 Alcohol " + num(units.byCategory.Alcohol || 0) }
    ].map(kpiCard).join("");

    var cats = c.byCategory;
    var catTotal = Object.keys(cats).reduce(function (a, k) { return a + cats[k]; }, 0);
    var order = ["Coffee", "Food", "Apparel", "Alcohol"];
    document.getElementById("cf-cat-list").innerHTML = order.map(function (k) {
      var v = cats[k] || 0, u = (units.byCategory[k] || 0);
      return '<div class="catrow"><span><i class="sw" style="background:' + CAT_COLORS[k] + '"></i>' + k + "</span>" +
        "<span><b>" + money2(v) + "</b> &nbsp;<span class='subtle'>" + pct0(v / catTotal * 100) + " \u00b7 " + num(u) + " sold</span></span></div>";
    }).join("") +
      '<div class="catrow"><span><b>Total</b></span><span><b>' + money2(catTotal) + "</b> &nbsp;<span class='subtle'>" + num(units.total) + " sold</span></span></div>";
    document.getElementById("cf-cat-note").textContent =
      "Food is now broken out as its own category: " + money2(cats.Food || 0) + " (" +
      pct0((cats.Food || 0) / catTotal * 100) + " of July sales, " + num(units.byCategory.Food || 0) +
      " items). Apparel and alcohol stay tiny (" + money2((cats.Apparel || 0) + (cats.Alcohol || 0)) +
      " combined) \u2014 the store is coffee-led, with food the clear #2.";

    CHARTS.coffee = function () {
      if (!chartReady()) return;
      new Chart(document.getElementById("cf-chart").getContext("2d"), {
        data: {
          labels: c.daily.map(function (d) { return d.date.slice(5) + " " + d.dow; }),
          datasets: [
            { type: "bar", label: "Daily Revenue",
              data: c.daily.map(function (d) { return d.revenue; }),
              backgroundColor: c.daily.map(function (d) {
                var r = d.goal > 0 ? d.revenue / d.goal : 0;
                return r >= 1 ? COLORS.green : r >= 0.7 ? COLORS.amber : COLORS.red;
              }),
              borderRadius: 4, maxBarThickness: 34, order: 2 },
            { type: "line", label: "Daily Goal", data: c.daily.map(function (d) { return d.goal; }),
              borderColor: COLORS.ink, backgroundColor: COLORS.ink, borderWidth: 2, borderDash: [6, 4], pointRadius: 0, tension: 0, order: 1 }
          ]
        },
        options: baseChartOpts(true)
      });
      new Chart(document.getElementById("cf-cat-chart").getContext("2d"), {
        type: "doughnut",
        data: {
          labels: ["Coffee", "Food", "Apparel", "Alcohol"],
          datasets: [{ data: [cats.Coffee || 0, cats.Food || 0, cats.Apparel || 0, cats.Alcohol || 0],
            backgroundColor: [COLORS.coffee, COLORS.food, COLORS.apparel, COLORS.alcohol], borderWidth: 2, borderColor: "#fff" }]
        },
        options: {
          responsive: true, maintainAspectRatio: false, cutout: "58%",
          plugins: { legend: { position: "bottom" },
            tooltip: { callbacks: { label: function (x) { return x.label + ": " + money2(x.parsed); } } } }
        }
      });
    };
  }

  // ===================== EVENTS =====================
  function renderEvents(e) {
    var months = e.months;
    var revs = months.map(function (m) { return m.revenue; });
    document.getElementById("ev-kpis").innerHTML = [
      { label: "Event Room Realized (Jan\u2013Jun)", value: money2(e.realizedJanJun), meta: "Booked actuals, AOP Class view" },
      { label: "Run-Rate (per month)", value: money2(e.runRateMonthly), meta: "Jan\u2013Jun monthly average" },
      { label: "Projected Annual", value: money(e.projectedAnnual), meta: "Actuals + Jul\u2013Dec run-rate" }
    ].map(kpiCard).join("");

    var tbody = "";
    months.forEach(function (m) {
      tbody += "<tr><td>" + m.label + "</td><td>" + money2(m.revenue) + "</td><td>" +
        (m.forecast ? '<span class="badge forecast">run-rate proj.</span>' : '<span class="badge actual">booked</span>') + "</td></tr>";
    });
    document.querySelector("#ev-detail tbody").innerHTML = tbody;
    document.querySelector("#ev-detail tfoot").innerHTML =
      "<tr><td>Projected Annual</td><td>" + money2(e.projectedAnnual) + "</td><td></td></tr>";
    document.getElementById("ev-note").textContent = e.note;

    CHARTS.events = function () {
      if (!chartReady()) return;
      new Chart(document.getElementById("ev-chart").getContext("2d"), {
        data: {
          labels: months.map(function (m) { return m.key; }),
          datasets: [{ type: "bar", label: "Event Room Revenue", data: revs,
            backgroundColor: months.map(function (m) { return m.forecast ? COLORS.blueSoft : COLORS.blue; }),
            borderRadius: 4, maxBarThickness: 46 }]
        },
        options: baseChartOpts()
      });
    };
  }

  // ===================== COFFEESHOP EXPENSES =====================
  function renderExpenses(x) {
    if (!x) return;
    var months = x.months, cats = x.categories, t = x.totals;
    var EXP_COLORS = { materials: "#6f4e37", labor: "#0e4d92", otherCogs: "#8e8478", marketing: "#c77d0a", admin: "#1f8a4c" };

    document.getElementById("ex-kpis").innerHTML = [
      { label: "Total Expenses (Jan\u2013Jun)", value: money(t.totalExpense), meta: "COGS " + money(t.cogs) + " \u00b7 Opex " + money(t.opex) },
      { label: "Net Revenue (Coffee P&L)", value: money(t.revenue), meta: "Total Income, net of discounts" },
      { label: "Net Income (Jan\u2013Jun)", value: money(t.netIncome), meta: pct0(t.netMarginPct) + " net margin", cls: t.netIncome >= 0 ? "up" : "down" },
      { label: "Gross Margin", value: pct0(t.grossMarginPct), meta: "Gross profit " + money(t.grossProfit) }
    ].map(kpiCard).join("");

    var tbody = "";
    months.forEach(function (m) {
      var margin = m.revenue > 0 ? m.netIncome / m.revenue * 100 : 0;
      var expPct = m.revenue > 0 ? m.totalExpense / m.revenue * 100 : 0;
      tbody += "<tr><td>" + m.label + "</td><td>" + money2(m.revenue) + "</td><td>" + money2(m.cogs) +
        "</td><td>" + money2(m.opex) + "</td><td>" + money2(m.totalExpense) +
        "</td><td>" + pct0(expPct) + "</td><td class='" + (m.netIncome >= 0 ? "up" : "down") + "'>" + money2(m.netIncome) +
        "</td><td>" + pct0(margin) + "</td></tr>";
    });
    document.querySelector("#ex-detail tbody").innerHTML = tbody;
    document.querySelector("#ex-detail tfoot").innerHTML =
      "<tr><td><b>Total (Jan\u2013Jun)</b></td><td><b>" + money2(t.revenue) + "</b></td><td><b>" + money2(t.cogs) +
      "</b></td><td><b>" + money2(t.opex) + "</b></td><td><b>" + money2(t.totalExpense) +
      "</b></td><td><b>" + pct0(t.totalExpense / t.revenue * 100) + "</b></td><td><b>" + money2(t.netIncome) + "</b></td><td><b>" + pct0(t.netMarginPct) + "</b></td></tr>";

    document.getElementById("ex-cat-list").innerHTML = cats.map(function (c) {
      var sum = Object.keys(c.monthly).reduce(function (a, k) { return a + c.monthly[k]; }, 0);
      return '<div class="catrow"><span><i class="sw" style="background:' + (EXP_COLORS[c.key] || "#888") + '"></i>' +
        c.label + ' <span class="subtle">(' + c.group + ')</span></span><span><b>' + money2(sum) +
        '</b> &nbsp;<span class="subtle">' + pct0(sum / t.totalExpense * 100) + '</span></span></div>';
    }).join("") +
      '<div class="catrow"><span><b>Total Expenses</b></span><span><b>' + money2(t.totalExpense) + '</b></span></div>';

    var ad = x.adminDetail || {};
    document.getElementById("ex-admin-list").innerHTML = Object.keys(ad).map(function (k) {
      return '<div class="catrow"><span>' + k + '</span><span><b>' + money2(ad[k]) + '</b></span></div>';
    }).join("");

    document.getElementById("ex-basis").textContent = x.basis;
    document.getElementById("ex-note").textContent = x.note;

    CHARTS.expenses = function () {
      if (!chartReady()) return;
      var maxExp = Math.max.apply(null, months.map(function (m) { return m.totalExpense; }));
      var maxRev = Math.max.apply(null, months.map(function (m) { return m.revenue; }));
      var maxV = Math.max(maxExp, maxRev) * 1.08;
      var ds = cats.map(function (c) {
        return { type: "bar", label: c.label, stack: "exp", yAxisID: "y",
          data: months.map(function (m) { return c.monthly[m.key]; }),
          backgroundColor: EXP_COLORS[c.key] || "#888", borderWidth: 0, maxBarThickness: 46 };
      });
      ds.push({ type: "line", label: "Net Revenue (sales)", yAxisID: "y", order: 0,
        data: months.map(function (m) { return m.revenue; }),
        borderColor: COLORS.ink, backgroundColor: COLORS.ink, borderWidth: 2.5, pointRadius: 3, tension: .3 });
      var pctData = months.map(function (m) { return m.revenue > 0 ? m.totalExpense / m.revenue * 100 : 0; });
      var maxPct = Math.max(120, Math.max.apply(null, pctData) * 1.1);
      ds.push({ type: "line", label: "Expense % of sales", yAxisID: "yPct", order: -1,
        data: pctData,
        borderColor: COLORS.red, backgroundColor: COLORS.red, borderWidth: 2, borderDash: [6, 4], pointRadius: 3, tension: .3 });
      new Chart(document.getElementById("ex-chart").getContext("2d"), {
        data: { labels: months.map(function (m) { return m.key; }), datasets: ds },
        options: {
          responsive: true, maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false },
          plugins: {
            legend: { display: true, position: "bottom" },
            tooltip: { callbacks: { label: function (xx) {
              return xx.dataset.yAxisID === "yPct"
                ? xx.dataset.label + ": " + pct0(xx.parsed.y)
                : xx.dataset.label + ": " + money2(xx.parsed.y);
            } } }
          },
          scales: {
            y: { stacked: true, beginAtZero: true, suggestedMax: maxV, position: "left",
                 grid: { color: COLORS.grid }, ticks: { callback: function (v) { return "$" + (v / 1000) + "k"; } } },
            yPct: { stacked: false, beginAtZero: true, suggestedMax: maxPct, position: "right",
                 grid: { display: false }, ticks: { callback: function (v) { return v + "%"; } } },
            x: { stacked: true, grid: { display: false } }
          }
        }
      });
    };
  }

  function baseChartOpts(currency2) {
    return {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: function (x) { return x.dataset.label + ": " + (currency2 ? money2(x.parsed.y) : money(x.parsed.y)); } } }
      },
      scales: {
        y: { beginAtZero: false, grid: { color: COLORS.grid }, ticks: { callback: function (v) { return "$" + (v / 1000) + "k"; } } },
        x: { grid: { display: false } }
      }
    };
  }

  // ---------- tabs ----------
  var built = {};
  function showTab(name) {
    ["overall", "coffee", "events", "expenses"].forEach(function (t) {
      var panel = document.getElementById("tab-" + t);
      var btn = document.querySelector('.tabbtn[data-tab="' + t + '"]');
      if (panel) panel.classList.toggle("active", t === name);
      if (btn) btn.classList.toggle("active", t === name);
    });
    if (!built[name] && CHARTS[name]) { CHARTS[name](); built[name] = true; }
  }
  function wireTabs() {
    var btns = document.querySelectorAll(".tabbtn");
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener("click", function () { showTab(this.getAttribute("data-tab")); });
    }
  }

  function render(data) {
    DATA = data;
    document.getElementById("load-note").innerHTML = "<strong>Note:</strong> " + data.overall.cutoff_note;
    document.getElementById("foot").innerHTML =
      "Source: " + data.source + " &nbsp;\u2022&nbsp; Generated " + data.generated +
      " &nbsp;\u2022&nbsp; Carolina Core Wellness";
    renderOverall(data.overall);
    renderCoffee(data.coffee);
    renderEvents(data.events);
    renderExpenses(data.expenses);
    wireTabs();
    showTab("overall");
    noteChartsUnavailable();
  }

  async function loadAndRender() {
    var data = await fetch(CONFIG.DATA_URL, { cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status + " fetching " + CONFIG.DATA_URL);
      return r.json();
    });
    render(data);
  }

  function boot() {
    CONFIG = window.GFP_CONFIG || {};
    if (!CONFIG.DATA_URL) CONFIG.DATA_URL = "data.json";
    loadAndRender().catch(function (e) { showLoadError((e && e.message) ? e.message : String(e)); });
  }

  if (typeof document !== "undefined" && document.getElementById) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
    else boot();
  }

  window.GFP = {
    linearRegression: linearRegression, movingAverage: movingAverage, momActuals: momActuals,
    extremesActual: extremesActual, computeConservative: computeConservative,
    yearElapsedFraction: yearElapsedFraction, paceStatus: paceStatus,
    render: render, loadAndRender: loadAndRender, showTab: showTab,
    _setConfig: function (c) { CONFIG = c; }
  };
})();
