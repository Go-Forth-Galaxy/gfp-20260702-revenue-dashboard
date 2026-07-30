(function () {
  "use strict";

  var CONFIG = {};
  var DATA = null;
  var CHARTS = {};
  var built = {};

  var COLORS = {
    navy: "#0e4d92",
    green: "#1f8a4c",
    amber: "#e9a23b",
    red: "#b3261e",
    subtle: "#6c757d",
    grid: "rgba(0,0,0,0.06)",
    ink: "#12303f",
    cardBg: "#f8f9fa",
    food: "#2a9d8f"
  };

  var CAT_COLORS = { Coffee: COLORS.navy, Food: COLORS.food, Apparel: COLORS.amber, Alcohol: COLORS.red };

  function money(n) { return "$" + Math.round(n).toLocaleString("en-US"); }
  function money2(n) { return "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function pct(n) { return (n >= 0 ? "+" : "") + n.toFixed(1) + "%"; }
  function pct0(n) { return n.toFixed(1) + "%"; }

  function linearRegression(pts) {
    var n = pts.length;
    if (n < 2) return { slope: 0, intercept: pts[0] || 0 };
    var sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    for (var i = 0; i < n; i++) {
      sumX += i;
      sumY += pts[i];
      sumXY += i * pts[i];
      sumXX += i * i;
    }
    var slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    var intercept = (sumY - slope * sumX) / n;
    return { slope: slope, intercept: intercept };
  }

  function movingAverage(arr, windowSize) {
    var res = [];
    for (var i = 0; i < arr.length; i++) {
      var start = Math.max(0, i - windowSize + 1);
      var sub = arr.slice(start, i + 1);
      var avg = sub.reduce(function (a, b) { return a + b; }, 0) / sub.length;
      res.push(avg);
    }
    return res;
  }

  function momActuals(months) {
    var res = [];
    var actuals = months.filter(function (m) { return !m.is_forecast; });
    for (var i = 0; i < actuals.length; i++) {
      var curr = actuals[i].revenue;
      var prev = i > 0 ? actuals[i - 1].revenue : null;
      var chg = prev !== null && prev > 0 ? ((curr - prev) / prev) * 100 : null;
      res.push({ key: actuals[i].key, name: actuals[i].name, revenue: curr, chgPct: chg });
    }
    return res;
  }

  function extremesActual(months) {
    var actuals = months.filter(function (m) { return !m.is_forecast; });
    if (!actuals.length) return { best: null, worst: null };
    var best = actuals[0], worst = actuals[0];
    for (var i = 1; i < actuals.length; i++) {
      if (actuals[i].revenue > best.revenue) best = actuals[i];
      if (actuals[i].revenue < worst.revenue) worst = actuals[i];
    }
    return { best: best, worst: worst };
  }

  function computeConservative(months) {
    var res = [];
    var lastActualIdx = -1;
    for (var i = 0; i < months.length; i++) {
      if (!months[i].is_forecast) lastActualIdx = i;
    }
    for (var j = 0; j < months.length; j++) {
      var m = months[j];
      if (!m.is_forecast) {
        res.push(m.revenue);
      } else {
        res.push(m.revenue * 0.95);
      }
    }
    return { series: res, haircutFactor: 0.95, lastActualIdx: lastActualIdx };
  }

  function yearElapsedFraction() {
    var now = new Date();
    var start = new Date(now.getFullYear(), 0, 1);
    var end = new Date(now.getFullYear() + 1, 0, 1);
    return (now - start) / (end - start);
  }

  function paceStatus(realizedPct) {
    var elapsedPct = yearElapsedFraction() * 100;
    var ratio = realizedPct / elapsedPct;
    if (ratio >= 0.98) return { status: "green", label: "On Pace", desc: "Realized pace matches or exceeds the elapsed portion of 2026." };
    if (ratio >= 0.90) return { status: "yellow", label: "Slightly Behind Pace", desc: "Realized pace is close (~" + ratio.toFixed(2) + "x) to the elapsed year fraction." };
    return { status: "red", label: "Behind Pace", desc: "Realized progress (" + realizedPct.toFixed(1) + "%) is trailing the elapsed year fraction (" + elapsedPct.toFixed(1) + "%)." };
  }

  function renderKpiCard(k) {
    var cls = k.cls ? " " + k.cls : "";
    return '<div class="kpi' + cls + '">' +
      '<div class="kpi-lbl">' + k.label + '</div>' +
      '<div class="kpi-val">' + k.value + '</div>' +
      (k.meta ? '<div class="kpi-meta">' + k.meta + '</div>' : '') +
      '</div>';
  }

  function chartReady() {
    return typeof window.Chart !== "undefined";
  }

  function showLoadError(msg) {
    var el = document.getElementById("load-note");
    if (el) el.innerHTML = '<span style="color:' + COLORS.red + '">Error loading revenue dashboard: ' + msg + '</span>';
  }

  function noteChartsUnavailable() {
    if (chartReady()) return;
    var wraps = document.querySelectorAll(".chart-wrap");
    for (var i = 0; i < wraps.length; i++) {
      var box = wraps[i];
      if (!box.querySelector(".chart-fallback")) {
        var note = document.createElement("p");
        note.className = "chart-fallback subtle";
        note.style.margin = "12px 0 0 0";
        note.style.fontStyle = "italic";
        note.textContent = "Chart visualization unavailable (script blocked or offline). Figures shown in tables below.";
        box.appendChild(note);
      }
    }
  }

  function baseChartOpts() {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function (ctx) {
              var v = ctx.parsed.y;
              return ctx.dataset.label ? ctx.dataset.label + ": " + money2(v) : money2(v);
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: COLORS.grid },
          ticks: { callback: function (v) { return "$" + (v / 1000) + "k"; } }
        },
        x: { grid: { display: false } }
      }
    };
  }

  function renderOverall(o) {
    if (!o) return;
    var realized = o.ytd_realized;
    var totalPlan = o.annual_target;
    var progress = (realized / totalPlan) * 100;
    var remaining = totalPlan - realized;

    var bar = document.getElementById("ov-bar");
    var pace = paceStatus(progress);
    bar.className = "bar " + pace.status;
    bar.style.width = Math.max(2, Math.min(100, progress)).toFixed(1) + "%";
    bar.textContent = pct0(progress);

    document.getElementById("ov-bar-left").textContent = "Realized " + money(realized);
    document.getElementById("ov-bar-right").textContent = "Annual Plan " + money(totalPlan);
    document.getElementById("ov-bar-hint").textContent =
      "Realized revenue across all four streams ($338,137 Jan\u2013Jun) divided by the $783,074 annual plan. Remaining to plan: " + money(remaining) + ".";

    var paceEl = document.getElementById("ov-pace");
    if (paceEl) {
      paceEl.innerHTML = '<span class="badge ' + (pace.status === "green" ? "up" : (pace.status === "yellow" ? "amber" : "down")) + '">' +
        pace.label + '</span> &nbsp;<span class="subtle">' + pace.desc + '</span>';
    }

    var julCallout = document.getElementById("ov-july");
    if (julCallout) {
      if (o.julyCallout) {
        julCallout.style.display = "block";
        julCallout.innerHTML = '<strong>JULY UPDATE (MTD):</strong> July coffee store sales sit at <strong>' + money2(o.julyCallout.total) + '</strong> (' + o.julyCallout.label + '). ' +
          '<em>Not included in the headline figure above</em> (headline remains pure Jan\u2013Jun four-stream actuals). ' + o.julyCallout.note;
      } else {
        julCallout.style.display = "none";
      }
    }

    var mom = momActuals(o.months);
    var ext = extremesActual(o.months);
    var cons = computeConservative(o.months);
    var consTotal = cons.series.reduce(function (a, b) { return a + b; }, 0);

    var lastMom = mom.length > 0 ? mom[mom.length - 1].chgPct : 0;
    var juneRev = mom.length > 0 ? mom[mom.length - 1].revenue : 0;

    var kpis = [
      { label: "Realized Revenue (Jan\u2013Jun booked)", value: money(realized), meta: pct0(progress) + " of annual plan" },
      { label: "Revised Full Year", value: money(totalPlan), meta: "Option A four-stream AOP base" },
      { label: "Remaining to Plan", value: money(remaining), meta: "Needed across Jul\u2013Dec" },
      { label: "Conservative Full Year", value: money(consTotal), meta: "&minus;5% haircut on Jul\u2013Dec forecast" },
      { label: "June MoM Change", value: pct(lastMom), meta: "June revenue " + money(juneRev), cls: lastMom >= 0 ? "up" : "down" },
      { label: "Lowest Month (Jan\u2013Jun)", value: ext.worst ? ext.worst.name + " (" + money(ext.worst.revenue) + ")" : "N/A", meta: "Based on booked actuals only" }
    ];

    document.getElementById("ov-kpis").innerHTML = kpis.map(renderKpiCard).join("");

    var catchGrid = document.getElementById("ov-catchup-grid");
    if (catchGrid) {
      catchGrid.innerHTML = [
        { label: "Monthly Average Needed", value: money(74156) + " / mo", meta: "Up from $56,356/mo run-rate (+31.6%)" },
        { label: "Weekly Pace Needed", value: money(16927) + " / wk", meta: "Across 26.3 remaining weeks" },
        { label: "Daily Pace Needed", value: money(2418) + " / day", meta: "Across 184 remaining days (Jul\u2013Dec)" },
        { label: "Required H2 Run-Rate", value: money(444938), meta: "Jul 1 \u2013 Dec 31 total gap to plan" }
      ].map(renderKpiCard).join("");
    }

    CHARTS.overall = function () {
      if (!chartReady()) return;
      var ctx = document.getElementById("ov-chart");
      if (!ctx) return;
      var labels = o.months.map(function (m) { return m.name; });
      var actData = o.months.map(function (m) { return m.is_forecast ? null : m.revenue; });
      var fcData = o.months.map(function (m, idx) {
        if (idx === 5) return m.revenue;
        return m.is_forecast ? m.revenue : null;
      });
      var consData = cons.series.map(function (v, idx) {
        if (idx < 5) return null;
        return v;
      });

      new Chart(ctx.getContext("2d"), {
        type: "bar",
        data: {
          labels: labels,
          datasets: [
            {
              type: "bar",
              label: "Booked Actuals",
              data: actData,
              backgroundColor: COLORS.navy,
              borderRadius: 4,
              maxBarThickness: 42
            },
            {
              type: "bar",
              label: "AOP Forecast",
              data: fcData,
              backgroundColor: COLORS.green,
              borderRadius: 4,
              maxBarThickness: 42
            },
            {
              type: "line",
              label: "Conservative (-5%)",
              data: consData,
              borderColor: COLORS.red,
              borderWidth: 2,
              borderDash: [6, 4],
              pointRadius: 3,
              pointBackgroundColor: COLORS.red,
              tension: 0.2
            }
          ]
        },
        options: Object.assign({}, baseChartOpts(), {
          scales: {
            y: {
              beginAtZero: true,
              grid: { color: COLORS.grid },
              ticks: { callback: function (v) { return "$" + (v / 1000) + "k"; } }
            },
            x: { grid: { display: false } }
          }
        })
      });
    };

    var tbody = document.querySelector("#ov-detail tbody");
    if (tbody) {
      var rowsHtml = "";
      for (var i = 0; i < o.months.length; i++) {
        var m = o.months[i];
        var typeBadge = m.is_forecast
          ? '<span class="badge">Forecast</span>'
          : '<span class="badge up">Actual</span>';
        var momText = "&mdash;";
        if (i > 0) {
          var prev = o.months[i - 1].revenue;
          var diff = ((m.revenue - prev) / prev) * 100;
          momText = pct(diff);
        }
        var paceRead = m.is_forecast
          ? "AOP Target"
          : (m.revenue >= 56000 ? "On Pace" : "Soft Month");

        rowsHtml += '<tr>' +
          '<td>' + m.name + '</td>' +
          '<td>' + typeBadge + '</td>' +
          '<td class="num">' + money2(m.revenue) + '</td>' +
          '<td class="num">' + momText + '</td>' +
          '<td>' + paceRead + '</td>' +
          '</tr>';
      }
      tbody.innerHTML = rowsHtml;
    }
  }

  function renderCoffee(c) {
    if (!c) return;

    var bar = document.getElementById("cf-bar");
    var cw = c.currentWeek;
    var wkPct = cw ? cw.progressPct : 0;
    bar.className = "bar " + (wkPct >= 98 ? "green" : (wkPct >= 80 ? "amber" : "red"));
    bar.style.width = Math.max(2, Math.min(100, wkPct)).toFixed(1) + "%";
    bar.textContent = pct0(wkPct);

    document.getElementById("cf-bar-left").textContent = cw ? cw.label + ": " + money2(cw.realized) : "Current Week";
    document.getElementById("cf-bar-right").textContent = cw ? "Goal: " + money(cw.goalToDate) + " (Full " + money(cw.fullGoal) + ")" : "";
    document.getElementById("cf-bar-hint").textContent =
      cw ? "Current week coffee store sales vs. AOP goal-to-date schedule. Last complete week (" +
      (c.lastWeek ? c.lastWeek.label : "Jul 13\u201319") + ") realized " +
      money2(c.lastWeek ? c.lastWeek.realized : 5825.7) + " (" + pct0(c.lastWeek ? c.lastWeek.progressPct : 82.6) + " of $7,050 goal)." : "";

    var mtdPct = (c.mtdRealized / c.mtdBudget) * 100;
    var headEl = document.getElementById("cf-daily-heading");
    if (headEl) headEl.textContent = "Daily Lookout &#8212; " + (c.windowLabel || "July 1\u201329");
    var mixEl = document.getElementById("cf-mix-heading");
    if (mixEl) mixEl.textContent = "Revenue Mix &#8212; " + (c.windowLabel || "July 1\u201329");

    var productsSoldMeta = "Coffee " + (c.unitsCoffee || 0).toLocaleString() +
      " \u00b7 Food " + (c.unitsFood || 0).toLocaleString() +
      " \u00b7 Apparel " + (c.unitsApparel || 0).toLocaleString() +
      " \u00b7 Alcohol " + (c.unitsAlcohol || 0).toLocaleString();

    var kpis = [
      { label: "July MTD (" + (c.windowLabel ? c.windowLabel.replace("July ", "") : "1\u201329") + ")", value: money2(c.mtdRealized), meta: pct0(mtdPct) + " of " + money(c.mtdBudget) + " budget-to-date" },
      { label: "Current Week vs. Goal", value: money2(cw ? cw.realized : 0), meta: pct0(wkPct) + " of " + money(cw ? cw.goalToDate : 0) + " goal-to-date", cls: wkPct >= 80 ? "up" : "down" },
      { label: "Last Complete Week", value: money2(c.lastWeek ? c.lastWeek.realized : 5825.7), meta: pct0(c.lastWeek ? c.lastWeek.progressPct : 82.6) + " of $7,050 weekly goal" },
      { label: "Products Sold (" + (c.windowLabel ? c.windowLabel : "Jul 1\u201329") + ")", value: (c.unitsTotal || 0).toLocaleString() + " units", meta: productsSoldMeta }
    ];

    document.getElementById("cf-kpis").innerHTML = kpis.map(renderKpiCard).join("");

    CHARTS.coffee = function () {
      if (!chartReady()) return;
      var ctxDaily = document.getElementById("cf-chart");
      if (ctxDaily) {
        var labels = c.daily.map(function (d) { return d.day; });
        var act = c.daily.map(function (d) { return d.realized; });
        var goals = c.daily.map(function (d) { return d.goal; });
        var bgColors = c.daily.map(function (d) {
          var ratio = d.realized / d.goal;
          if (ratio >= 0.98) return COLORS.green;
          if (ratio >= 0.70) return COLORS.amber;
          return COLORS.red;
        });

        new Chart(ctxDaily.getContext("2d"), {
          type: "bar",
          data: {
            labels: labels,
            datasets: [
              {
                type: "bar",
                label: "Daily Realized",
                data: act,
                backgroundColor: bgColors,
                borderRadius: 3,
                maxBarThickness: 32
              },
              {
                type: "line",
                label: "AOP Daily Goal",
                data: goals,
                borderColor: COLORS.ink,
                borderWidth: 2,
                borderDash: [4, 4],
                pointRadius: 0
              }
            ]
          },
          options: Object.assign({}, baseChartOpts(), {
            scales: {
              y: {
                beginAtZero: true,
                grid: { color: COLORS.grid },
                ticks: { callback: function (v) { return "$" + v; } }
              },
              x: { grid: { display: false } }
            }
          })
        });
      }

      var ctxMix = document.getElementById("cf-mix-chart");
      if (ctxMix) {
        var catLabels = c.byCategory.map(function (k) { return k.category; });
        var catVals = c.byCategory.map(function (k) { return k.amount; });
        var mixColors = catLabels.map(function (lbl) { return CAT_COLORS[lbl] || COLORS.subtle; });

        new Chart(ctxMix.getContext("2d"), {
          type: "doughnut",
          data: {
            labels: catLabels,
            datasets: [
              {
                data: catVals,
                backgroundColor: mixColors,
                borderWidth: 2,
                borderColor: "#fff"
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: true, position: "bottom" },
              tooltip: {
                callbacks: {
                  label: function (ctx) {
                    var v = ctx.parsed;
                    var total = catVals.reduce(function (a, b) { return a + b; }, 0);
                    var pctVal = total > 0 ? ((v / total) * 100).toFixed(1) : "0.0";
                    return ctx.label + ": " + money2(v) + " (" + pctVal + "%)";
                  }
                }
              }
            }
          }
        });
      }
    };

    var catList = document.getElementById("cf-cat-list");
    if (catList) {
      var totalMat = c.byCategory.reduce(function (a, b) { return a + b.amount; }, 0);
      var html = '<table class="cat-table">';
      c.byCategory.forEach(function (cat) {
        var pctVal = totalMat > 0 ? ((cat.amount / totalMat) * 100).toFixed(1) : "0.0";
        var dotColor = CAT_COLORS[cat.category] || COLORS.subtle;
        var unitsText = cat.units ? ' \u00b7 <span class="subtle">' + cat.units.toLocaleString() + ' sold</span>' : '';
        html += '<tr>' +
          '<td><span class="swatch" style="background:' + dotColor + '"></span> ' + cat.category + unitsText + '</td>' +
          '<td class="num">' + money2(cat.amount) + '</td>' +
          '<td class="num">' + pctVal + '%</td>' +
          '</tr>';
      });
      html += '<tr style="font-weight:600; border-top:1px solid #ccc;">' +
        '<td>Total Coffee Store Sales</td>' +
        '<td class="num">' + money2(totalMat) + '</td>' +
        '<td class="num">100.0%</td>' +
        '</tr></table>';
      catList.innerHTML = html;
    }

    var catNote = document.getElementById("cf-cat-note");
    if (catNote) {
      catNote.textContent = c.categoryNote || "Food is broken out as a 2nd core category (~20% of sales). Note: Receipts for Jul 24\u201329 arrived without a category split, so all $4,302 across those six days was folded into Coffee (Food/Apparel slightly understated for that window).";
    }
    var mixHint = document.getElementById("cf-mix-hint");
    if (mixHint) {
      mixHint.textContent = c.mixHint || (c.windowLabel ? c.windowLabel + " sales by category (Square item-level import, v2)" : "July 1\u201329 sales by category (Square item-level import, v2)");
    }
  }

  function renderEvents(e) {
    if (!e) return;

    var progBar = document.getElementById("ev-prog-bar");
    if (progBar && e.progress) {
      var p = e.progress;
      var ratioPct = (p.realized / p.projectedAnnual) * 100;
      progBar.className = "bar green";
      progBar.style.width = Math.max(2, Math.min(100, ratioPct)).toFixed(1) + "%";
      progBar.textContent = pct0(ratioPct);

      var pLeft = document.getElementById("ev-prog-left");
      if (pLeft) pLeft.textContent = "Booked (Jan\u2013Jun) " + money(p.realized);
      var pRight = document.getElementById("ev-prog-right");
      if (pRight) pRight.textContent = "Projected FY " + money(p.projectedAnnual);
      var pHint = document.getElementById("ev-prog-hint");
      if (pHint) pHint.textContent = p.basisNote;
    }

    var kpis = [
      { label: "Event Room Realized (Jan\u2013Jun)", value: money2(e.realizedJanJun), meta: "Booked actuals, AOP Class view" },
      { label: "Run-Rate (per month)", value: money2(e.runRateMonthly), meta: "Jan\u2013Jun monthly average" },
      { label: "Projected Annual", value: money(e.projectedAnnual), meta: "Actuals + Jul\u2013Dec run-rate" }
    ];

    document.getElementById("ev-kpis").innerHTML = kpis.map(renderKpiCard).join("");

    CHARTS.events = function () {
      if (!chartReady()) return;
      var ctx = document.getElementById("ev-chart");
      if (!ctx) return;
      var labels = e.months.map(function (m) { return m.name; });
      var actData = e.months.map(function (m) { return m.is_forecast ? null : m.revenue; });
      var fcData = e.months.map(function (m, idx) {
        if (idx === 5) return m.revenue;
        return m.is_forecast ? m.revenue : null;
      });

      new Chart(ctx.getContext("2d"), {
        type: "bar",
        data: {
          labels: labels,
          datasets: [
            {
              label: "Booked Actuals",
              data: actData,
              backgroundColor: COLORS.amber,
              borderRadius: 4,
              maxBarThickness: 42
            },
            {
              label: "Run-Rate Forecast",
              data: fcData,
              backgroundColor: "rgba(233,162,59,0.35)",
              borderColor: COLORS.amber,
              borderWidth: 1,
              borderRadius: 4,
              maxBarThickness: 42
            }
          ]
        },
        options: baseChartOpts()
      });
    };

    var tbody = document.querySelector("#ev-detail tbody");
    if (tbody) {
      var rowsHtml = "";
      for (var i = 0; i < e.months.length; i++) {
        var m = e.months[i];
        var typeBadge = m.is_forecast
          ? '<span class="badge">Run-Rate</span>'
          : '<span class="badge up">Actual</span>';
        var momText = "&mdash;";
        if (i > 0) {
          var prev = e.months[i - 1].revenue;
          var diff = ((m.revenue - prev) / prev) * 100;
          momText = pct(diff);
        }

        rowsHtml += '<tr>' +
          '<td>' + m.name + '</td>' +
          '<td>' + typeBadge + '</td>' +
          '<td class="num">' + money2(m.revenue) + '</td>' +
          '<td class="num">' + momText + '</td>' +
          '</tr>';
      }
      tbody.innerHTML = rowsHtml;
    }
  }

  function renderExpenses(x) {
    if (!x) return;
    var t = x.totals;

    if (x.budget) {
      var b = x.budget;
      var ratio = (b.janJunActual / b.janJunBudget) * 100;
      var bBar = document.getElementById("ex-budget-bar");
      if (bBar) {
        var barCls = ratio <= 100 ? "green" : (ratio <= 105 ? "amber" : "red");
        bBar.className = "bar " + barCls;
        bBar.style.width = Math.max(2, Math.min(100, ratio)).toFixed(1) + "%";
        bBar.textContent = pct0(ratio);
      }
      var bLeft = document.getElementById("ex-budget-left");
      if (bLeft) bLeft.textContent = "Actual " + money(b.janJunActual);
      var bRight = document.getElementById("ex-budget-right");
      if (bRight) bRight.textContent = "Budget " + money(b.janJunBudget);
      var bHint = document.getElementById("ex-budget-hint");
      if (bHint) {
        bHint.textContent = "Jan\u2013Jun coffee-shop expense actuals vs. reforested AOP budget (" +
          money(b.janJunBudget) + "). Actuals are " + money(b.varianceFavorable) +
          " under budget (favorable). Full-year expense budget: " + money(b.annualBudget) +
          " (YTD spend " + (b.janJunActual / b.annualBudget * 100).toFixed(1) + "%). For expenses, at or under 100% is good.";
      }
    }

    var mtdMatPct = 35.2;
    var mtdLabPct = 25.5;

    var kpis = [
      { label: "Total Expenses (Jan\u2013Jun)", value: money(t.totalExpense), meta: "COGS " + money(t.cogs) + " \u00b7 Opex " + money(t.opex) },
      { label: "Materials % vs. Goal", value: "50.2% Jun \u00b7 35.2% Jul", meta: "Goal &le; 30% of sales \u00b7 Off Track", cls: "down" },
      { label: "Direct Labor % vs. Goal", value: "19.5% Jun \u00b7 25.5% Jul", meta: "Goal &le; 30% of sales \u00b7 On Track", cls: "up" },
      { label: "Net Margin (Jan\u2013Jun)", value: pct0((t.netIncome / t.netRevenue) * 100), meta: "Net Income " + money(t.netIncome) + " on " + money(t.netRevenue) }
    ];

    document.getElementById("ex-kpis").innerHTML = kpis.map(renderKpiCard).join("");

    renderExpensesJuly(x.july);

    CHARTS.expenses = function () {
      if (!chartReady()) return;
      var labels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul"];
      var matPctData = [31.2, 42.4, 28.7, 41.7, 29.4, 50.2, 35.2];
      var labPctData = [41.4, 47.8, 37.2, 45.9, 37.6, 19.5, 25.5];
      var goalData = [30, 30, 30, 30, 30, 30, 30];

      var ctxMat = document.getElementById("ex-materials-chart");
      if (ctxMat) {
        new Chart(ctxMat.getContext("2d"), {
          type: "bar",
          data: {
            labels: labels,
            datasets: [
              {
                type: "line", label: "30% Benchmark Goal Line", data: goalData,
                borderColor: COLORS.ink, borderWidth: 2, borderDash: [6, 4], pointRadius: 0
              },
              {
                type: "bar", label: "Materials % of Sales", data: matPctData,
                backgroundColor: matPctData.map(function(v){ return v <= 30 ? "#1f8a4c" : "#b3261e"; }),
                borderRadius: 4, maxBarThickness: 36
              }
            ]
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
              legend: { display: true, position: "bottom" },
              tooltip: { callbacks: { label: function(ctx){ return ctx.dataset.label + ": " + ctx.parsed.y.toFixed(1) + "%"; } } }
            },
            scales: {
              y: { beginAtZero: true, suggestedMax: 60, grid: { color: COLORS.grid }, ticks: { callback: function(v){ return v + "%"; } } },
              x: { grid: { display: false } }
            }
          }
        });
      }

      var ctxLab = document.getElementById("ex-labor-chart");
      if (ctxLab) {
        new Chart(ctxLab.getContext("2d"), {
          type: "bar",
          data: {
            labels: labels,
            datasets: [
              {
                type: "line", label: "30% Benchmark Goal Line", data: goalData,
                borderColor: COLORS.ink, borderWidth: 2, borderDash: [6, 4], pointRadius: 0
              },
              {
                type: "bar", label: "Direct Labor % of Sales", data: labPctData,
                backgroundColor: labPctData.map(function(v){ return v <= 30 ? "#1f8a4c" : "#b3261e"; }),
                borderRadius: 4, maxBarThickness: 36
              }
            ]
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
              legend: { display: true, position: "bottom" },
              tooltip: { callbacks: { label: function(ctx){ return ctx.dataset.label + ": " + ctx.parsed.y.toFixed(1) + "%"; } } }
            },
            scales: {
              y: { beginAtZero: true, suggestedMax: 60, grid: { color: COLORS.grid }, ticks: { callback: function(v){ return v + "%"; } } },
              x: { grid: { display: false } }
            }
          }
        });
      }
    };

    var catList = document.getElementById("ex-cat-list");
    if (catList && x.categories) {
      var html = '<table class="cat-table">';
      x.categories.forEach(function (c) {
        var pctVal = (c.amount / t.totalExpense * 100).toFixed(1);
        html += '<tr>' +
          '<td>' + c.label + '</td>' +
          '<td class="num">' + money2(c.amount) + '</td>' +
          '<td class="num">' + pctVal + '%</td>' +
          '</tr>';
      });
      html += '<tr style="font-weight:600; border-top:1px solid #ccc;">' +
        '<td>Total Coffee-Shop Expenses</td>' +
        '<td class="num">' + money2(t.totalExpense) + '</td>' +
        '<td class="num">100.0%</td>' +
        '</tr></table>';
      catList.innerHTML = html;
    }

    var adminList = document.getElementById("ex-admin-list");
    if (adminList && x.adminDetail) {
      var admTotal = x.categories.find(function (c) { return c.key === "admin"; });
      var admSum = admTotal ? admTotal.amount : 6889.91;
      var htmlA = '<table class="cat-table">';
      x.adminDetail.forEach(function (a) {
        var pctVal = (a.amount / admSum * 100).toFixed(1);
        htmlA += '<tr>' +
          '<td>' + a.label + '</td>' +
          '<td class="num">' + money2(a.amount) + '</td>' +
          '<td class="num">' + pctVal + '%</td>' +
          '</tr>';
      });
      htmlA += '<tr style="font-weight:600; border-top:1px solid #ccc;">' +
        '<td>Total Administrative Line</td>' +
        '<td class="num">' + money2(admSum) + '</td>' +
        '<td class="num">100.0%</td>' +
        '</tr></table>';
      adminList.innerHTML = htmlA;
    }

    var tbody = document.querySelector("#ex-detail tbody");
    var tfoot = document.querySelector("#ex-detail tfoot");
    if (tbody && x.months) {
      var rowsHtml = "";
      x.months.forEach(function (m) {
        var margin = (m.netIncome / m.revenue * 100).toFixed(1);
        var expPct = (m.totalExpense / m.revenue * 100).toFixed(1);
        var cls = m.netIncome < 0 ? ' class="down"' : '';
        rowsHtml += '<tr>' +
          '<td>' + m.label + '</td>' +
          '<td class="num">' + money2(m.revenue) + '</td>' +
          '<td class="num">' + money2(m.cogs) + '</td>' +
          '<td class="num">' + money2(m.opex) + '</td>' +
          '<td class="num">' + money2(m.totalExpense) + '</td>' +
          '<td class="num">' + expPct + '%</td>' +
          '<td class="num"' + cls + '>' + money2(m.netIncome) + '</td>' +
          '<td class="num"' + cls + '>' + margin + '%</td>' +
          '</tr>';
      });
      tbody.innerHTML = rowsHtml;

      if (tfoot) {
        var totMargin = (t.netIncome / t.netRevenue * 100).toFixed(1);
        var totExpPct = (t.totalExpense / t.netRevenue * 100).toFixed(1);
        tfoot.innerHTML = '<tr style="font-weight:600; border-top:2px solid #333;">' +
          '<td>Jan\u2013Jun Total</td>' +
          '<td class="num">' + money2(t.netRevenue) + '</td>' +
          '<td class="num">' + money2(t.cogs) + '</td>' +
          '<td class="num">' + money2(t.opex) + '</td>' +
          '<td class="num">' + money2(t.totalExpense) + '</td>' +
          '<td class="num">' + totExpPct + '%</td>' +
          '<td class="num">' + money2(t.netIncome) + '</td>' +
          '<td class="num">' + totMargin + '%</td>' +
          '</tr>';
      }
    }

    var basis = document.getElementById("ex-basis");
    if (basis) basis.textContent = x.basis || "Sourced from the CCPC AOP 'Profit & Loss Coffee' statement (6-30 reforecast), monthly actuals Jan\u2013Jun 2026. Revenue is Net Revenue (after discounts).";
    var note = document.getElementById("ex-note");
    if (note) note.textContent = x.note || "February was the only net-loss month ($1,037 loss; costs outran sales). Revenue peaked in March ($28,261) and expense % peaked in Feb (105%).";
  }

  function renderExpensesJuly(j) {
    if (!j) return;

    var winEl = document.getElementById("exj-window");
    if (winEl) winEl.textContent = j.window;

    var byKey = {};
    if (j.categories) {
      j.categories.forEach(function (c) { byKey[c.key] = c.amount; });
    }

    var kpis = [
      { label: "July Expenses (1\u201327)", value: money(j.totalExpense), meta: "Material " + money(byKey.materials || 7670.07) + " \u00b7 Labor " + money(byKey.labor || 5551.75) + " \u00b7 Admin " + money(byKey.admin || 343) },
      { label: "Coffee Income (QBO)", value: money(j.income), meta: "Product $21,060 \u00b7 Sales $700" },
      { label: "Net Income (July)", value: money(j.netIncome), meta: pct0((j.netIncome / j.income) * 100) + " net margin" },
      { label: "Material Vendors", value: j.vendors ? j.vendors.length.toString() : "10", meta: "Resale goods & supplies itemized" }
    ];

    var kpiBox = document.getElementById("exj-kpis");
    if (kpiBox) kpiBox.innerHTML = kpis.map(renderKpiCard).join("");

    var vList = document.getElementById("exj-vendor-list");
    if (vList && j.vendors) {
      var htmlV = '<table class="cat-table">';
      j.vendors.forEach(function (v) {
        var pctVal = (v.amount / j.materialTotal * 100).toFixed(1);
        htmlV += '<tr>' +
          '<td>' + v.name + (v.note ? ' <span class="subtle">(' + v.note + ')</span>' : '') + '</td>' +
          '<td class="num">' + money2(v.amount) + '</td>' +
          '<td class="num">' + pctVal + '%</td>' +
          '</tr>';
      });
      htmlV += '<tr style="font-weight:600; border-top:1px solid #ccc;">' +
        '<td>Total Material (COGS)</td>' +
        '<td class="num">' + money2(j.materialTotal) + '</td>' +
        '<td class="num">100.0%</td>' +
        '</tr></table>';
      vList.innerHTML = htmlV;
    }

    var cList = document.getElementById("exj-cat-list");
    if (cList && j.categories) {
      var htmlC = '<table class="cat-table">';
      j.categories.forEach(function (c) {
        var pctVal = (c.amount / j.totalExpense * 100).toFixed(1);
        htmlC += '<tr>' +
          '<td>' + c.label + '</td>' +
          '<td class="num">' + money2(c.amount) + '</td>' +
          '<td class="num">' + pctVal + '%</td>' +
          '</tr>';
      });
      htmlC += '<tr style="font-weight:600; border-top:1px solid #ccc;">' +
        '<td>Total July Expenses</td>' +
        '<td class="num">' + money2(j.totalExpense) + '</td>' +
        '<td class="num">100.0%</td>' +
        '</tr></table>';
      cList.innerHTML = htmlC;
    }

    var jNote = document.getElementById("exj-note");
    if (jNote) jNote.textContent = j.note;
    var jBasis = document.getElementById("exj-basis");
    if (jBasis) jBasis.textContent = j.basis;
  }

  function renderJune(j) {
    if (!j) return;
    if (!document.getElementById("tab-june")) return;
    var bar = document.getElementById("jn-bar");
    var ratio = j.benchmarkPct;
    bar.className = "bar green";
    bar.style.width = Math.max(2, Math.min(100, ratio)).toFixed(1) + "%";
    bar.textContent = pct0(ratio);
    document.getElementById("jn-bar-left").textContent = "June " + money2(j.total);
    document.getElementById("jn-bar-right").textContent = "H1 avg month " + money(j.h1Avg);
    document.getElementById("jn-bar-hint").textContent = j.barNote;

    document.getElementById("jn-kpis").innerHTML = [
      { label: "June Total Revenue", value: money2(j.total), meta: "All four streams \u00b7 booked" },
      { label: "vs. H1 Monthly Average", value: pct0(j.benchmarkPct), meta: "H1 avg month " + money(j.h1Avg) },
      { label: "MoM vs. May", value: pct(j.momPct), meta: "May was " + money(j.priorMonthTotal), cls: j.momPct >= 0 ? "up" : "down" },
      { label: "Rank in H1", value: j.rank, meta: j.rankNote },
      { label: "Net Operating Income", value: money2(j.netIncome), meta: pct0(j.grossMarginPct) + " gross margin" },
      { label: "Top Revenue Stream", value: j.topStream.name + " (" + money(j.topStream.amount) + ")", meta: pct0(j.topStream.pct) + " of June total" }
    ].map(kpiCard).join("");

    var tbody = document.querySelector("#jn-detail tbody");
    var tfoot = document.querySelector("#jn-detail tfoot");
    if (tbody && j.streams) {
      var rowsHtml = "";
      j.streams.forEach(function (s) {
        var vsText = s.vsMayPct !== null ? pct(s.vsMayPct) : "&mdash;";
        var cls = s.vsMayPct !== null && s.vsMayPct < 0 ? ' class="down"' : '';
        rowsHtml += '<tr>' +
          '<td>' + s.name + '</td>' +
          '<td class="num">' + money2(s.amount) + '</td>' +
          '<td class="num">' + pct0(s.pctOfJune) + '</td>' +
          '<td class="num"' + cls + '>' + vsText + '</td>' +
          '</tr>';
      });
      tbody.innerHTML = rowsHtml;

      if (tfoot) {
        tfoot.innerHTML = '<tr style="font-weight:600; border-top:2px solid #333;">' +
          '<td>Total June Revenue</td>' +
          '<td class="num">' + money2(j.total) + '</td>' +
          '<td class="num">100.0%</td>' +
          '<td class="num down">' + pct(j.momPct) + '</td>' +
          '</tr>';
      }
    }

    var noteEl = document.getElementById("jn-note");
    if (noteEl) noteEl.textContent = j.note;

    var elJnExp = document.getElementById("jn-expenses-content");
    if (elJnExp) {
      var mJn = (DATA.expenses && DATA.expenses.months) ? DATA.expenses.months.find(function(x){ return x.key === "Jun"; }) : null;
      var catsJn = (DATA.expenses && DATA.expenses.categories) ? DATA.expenses.categories : [];
      if (mJn) {
        var matJn = 10143.63, labJn = 3942.38, admJn = 856.34, othJn = 83.50;
        var matPctJn = (matJn / mJn.revenue * 100).toFixed(1);
        var labPctJn = (labJn / mJn.revenue * 100).toFixed(1);
        var htmlJn = '<div class="kpis" style="margin-bottom:16px;">' +
          '<div class="kpi"><div class="kpi-val">' + money2(mJn.revenue) + '</div><div class="kpi-lbl">June Coffee Revenue</div></div>' +
          '<div class="kpi"><div class="kpi-val">' + money2(mJn.totalExpense) + '</div><div class="kpi-lbl">Total Expenses (' + (mJn.totalExpense/mJn.revenue*100).toFixed(1) + '%)</div></div>' +
          '<div class="kpi"><div class="kpi-val ' + (parseFloat(matPctJn) <= 30 ? 'up' : 'down') + '">' + matPctJn + '%</div><div class="kpi-lbl">Materials % (Goal &le; 30%)</div><div class="kpi-meta">' + (parseFloat(matPctJn) <= 30 ? 'On Track' : 'Off Track') + '</div></div>' +
          '<div class="kpi"><div class="kpi-val ' + (parseFloat(labPctJn) <= 30 ? 'up' : 'down') + '">' + labPctJn + '%</div><div class="kpi-lbl">Direct Labor % (Goal &le; 30%)</div><div class="kpi-meta">' + (parseFloat(labPctJn) <= 30 ? 'On Track' : 'Off Track') + '</div></div>' +
          '<div class="kpi"><div class="kpi-val">' + money2(mJn.netIncome) + '</div><div class="kpi-lbl">Net Income (' + (mJn.netIncome/mJn.revenue*100).toFixed(1) + '% margin)</div></div>' +
          '</div>' +
          '<div class="split-grid">' +
          '<div><h3>June Expense Categories</h3>' +
          '<table class="cat-table">' +
          '<tr><td>Material (COGS)</td><td class="num">' + money2(matJn) + '</td><td class="num">' + matPctJn + '%</td></tr>' +
          '<tr><td>Direct Labor</td><td class="num">' + money2(labJn) + '</td><td class="num">' + labPctJn + '%</td></tr>' +
          '<tr><td>Administrative</td><td class="num">' + money2(admJn) + '</td><td class="num">' + (admJn/mJn.revenue*100).toFixed(1) + '%</td></tr>' +
          '<tr><td>Other COGS</td><td class="num">' + money2(othJn) + '</td><td class="num">' + (othJn/mJn.revenue*100).toFixed(1) + '%</td></tr>' +
          '<tr style="font-weight:600;border-top:1px solid #ccc"><td>Total June Expenses</td><td class="num">' + money2(mJn.totalExpense) + '</td><td class="num">' + (mJn.totalExpense/mJn.revenue*100).toFixed(1) + '%</td></tr>' +
          '</table></div>' +
          '<div><h3>June Profitability Summary</h3><p class="hint">June coffee sales generated <strong>' + money2(mJn.revenue) + '</strong> against <strong>' + money2(mJn.totalExpense) + '</strong> in total costs, resulting in <strong>' + money2(mJn.netIncome) + '</strong> in net operating profit (25.6% net margin). Labor was well-controlled at 19.5% (under 30% target), while Materials rose to 50.2% due to mid-year inventory purchases.</p></div>' +
          '</div>';
        elJnExp.innerHTML = htmlJn;
      }
    }

    CHARTS.june = function () {
      if (!chartReady()) return;
      var labels = j.h1.map(function (m) { return m.key; });
      var datasets = (j.streamsMonthly || []).map(function (s) {
        return {
          label: s.name,
          data: s.data,
          backgroundColor: s.color,
          borderRadius: 2,
          maxBarThickness: 40
        };
      });
      new Chart(document.getElementById("jn-chart").getContext("2d"), {
        type: "bar",
        data: { labels: labels, datasets: datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: true, position: "bottom" },
            tooltip: {
              callbacks: {
                label: function (ctx) {
                  return ctx.dataset.label + ": " + money2(ctx.parsed.y);
                }
              }
            }
          },
          scales: {
            x: { stacked: true, grid: { display: false } },
            y: {
              stacked: true,
              grid: { color: COLORS.grid },
              ticks: { callback: function (v) { return "$" + (v / 1000) + "k"; } }
            }
          }
        }
      });
    };
  }

  function renderJulyYtd(y) {
    if (!y) return;
    if (!document.getElementById("tab-julyYtd")) return;

    var bar = document.getElementById("jy-bar");
    var pace = paceStatus(y.realizedPct);
    bar.className = "bar " + pace.status;
    bar.style.width = Math.max(2, Math.min(100, y.realizedPct)).toFixed(1) + "%";
    bar.textContent = pct0(y.realizedPct);

    document.getElementById("jy-bar-left").textContent = "YTD " + money(y.realized);
    document.getElementById("jy-bar-right").textContent = "Annual Plan " + money(y.denominator);

    var barNoteEl = document.getElementById("jy-bar-hint");
    if (barNoteEl) barNoteEl.textContent = y.barNote;

    var paceEl = document.getElementById("jy-pace");
    if (paceEl) {
      var paceSub = y.paceSub ? ' &nbsp;<span class="subtle">' + y.paceSub + '</span>' : '';
      paceEl.innerHTML = '<span class="badge ' + (pace.status === "green" ? "up" : (pace.status === "yellow" ? "amber" : "down")) + '">' +
        pace.label + '</span>' + paceSub;
    }

    var cavEl = document.getElementById("jy-caveat");
    if (cavEl) {
      cavEl.style.display = "block";
      cavEl.innerHTML = y.caveat;
    }

    var kpis = [
      { label: "YTD Realized (through Jul 28)", value: money(y.realized), meta: pct0(y.realizedPct) + " of the five-stream plan" },
      { label: "Four-stream sub-total", value: money(y.fourStreamYtd), meta: pct0(y.fourStreamPct) + " of $783,074 AOP" },
      { label: "Operations YTD (run-rate)", value: money(y.operationsYtd), meta: "Target " + money(y.operationsRunRate) + " (57.3%)" },
      { label: "Annual Plan (5-stream)", value: money(y.denominator), meta: "$783,074 AOP + $203,166 Ops" },
      { label: "Remaining to Plan", value: money(y.remaining), meta: "Needed across Aug\u2013Dec" },
      { label: "July Streams Booked", value: "3 of 4 + Operations", meta: "Wellness July not booked yet" }
    ];

    document.getElementById("jy-kpis").innerHTML = kpis.map(renderKpiCard).join("");

    var tbody = document.querySelector("#jy-detail tbody");
    var tfoot = document.querySelector("#jy-detail tfoot");
    if (tbody && y.streams) {
      var rowsHtml = "";
      y.streams.forEach(function (s) {
        var junVal = money2(s.janJun);
        var julVal = s.july !== null ? money2(s.july) : "&mdash;";
        var ytdVal = money2(s.ytd);
        var julMeta = s.julyNote ? ' <span class="subtle">(' + s.julyNote + ')</span>' : '';

        rowsHtml += '<tr>' +
          '<td>' + s.name + julMeta + '</td>' +
          '<td class="num">' + junVal + '</td>' +
          '<td class="num">' + julVal + '</td>' +
          '<td class="num">' + ytdVal + '</td>' +
          '</tr>';
      });
      tbody.innerHTML = rowsHtml;

      if (tfoot) {
        tfoot.innerHTML = '<tr style="font-weight:600; border-top:2px solid #333;">' +
          '<td>Total YTD Realized (5-stream)</td>' +
          '<td class="num">' + money2(y.janJunTotal) + '</td>' +
          '<td class="num">' + money2(y.julyBooked) + '</td>' +
          '<td class="num">' + money2(y.realized) + '</td>' +
          '</tr>';
      }
    }

    var noteEl = document.getElementById("jy-note");
    if (noteEl) noteEl.textContent = y.note;

    var elJyExp = document.getElementById("jy-expenses-content");
    if (elJyExp) {
      var jJy = DATA.expenses ? DATA.expenses.july : null;
      if (jJy) {
        var jMatPct = (7670.07 / jJy.income * 100).toFixed(1);
        var jLabPct = (5551.75 / jJy.income * 100).toFixed(1);
        var htmlJy = '<div class="kpis" style="margin-bottom:16px;">' +
          '<div class="kpi"><div class="kpi-val">' + money2(jJy.income) + '</div><div class="kpi-lbl">July Coffee Income (QBO)</div></div>' +
          '<div class="kpi"><div class="kpi-val">' + money2(jJy.totalExpense) + '</div><div class="kpi-lbl">July Expenses (' + (jJy.totalExpense/jJy.income*100).toFixed(1) + '%)</div></div>' +
          '<div class="kpi"><div class="kpi-val ' + (parseFloat(jMatPct) <= 30 ? 'up' : 'down') + '">' + jMatPct + '%</div><div class="kpi-lbl">Materials % (Goal &le; 30%)</div><div class="kpi-meta">' + (parseFloat(jMatPct) <= 30 ? 'On Track' : 'Off Track') + '</div></div>' +
          '<div class="kpi"><div class="kpi-val ' + (parseFloat(jLabPct) <= 30 ? 'up' : 'down') + '">' + jLabPct + '%</div><div class="kpi-lbl">Direct Labor % (Goal &le; 30%)</div><div class="kpi-meta">' + (parseFloat(jLabPct) <= 30 ? 'On Track' : 'Off Track') + '</div></div>' +
          '<div class="kpi"><div class="kpi-val">' + money2(jJy.netIncome) + '</div><div class="kpi-lbl">July Net Income (37.7% margin)</div></div>' +
          '</div>' +
          '<div class="split-grid">' +
          '<div><h3>July Material (COGS) Vendors</h3><div id="jy-vendors-sub"></div></div>' +
          '<div><h3>July Category Breakdown</h3>' +
          '<table class="cat-table">' +
          '<tr><td>Material (COGS)</td><td class="num">' + money2(7670.07) + '</td><td class="num">' + jMatPct + '%</td></tr>' +
          '<tr><td>Direct Labor</td><td class="num">' + money2(5551.75) + '</td><td class="num">' + jLabPct + '%</td></tr>' +
          '<tr><td>Administrative</td><td class="num">' + money2(343.00) + '</td><td class="num">' + (343/jJy.income*100).toFixed(1) + '%</td></tr>' +
          '<tr style="font-weight:600;border-top:1px solid #ccc"><td>Total July Expenses</td><td class="num">' + money2(jJy.totalExpense) + '</td><td class="num">' + (jJy.totalExpense/jJy.income*100).toFixed(1) + '%</td></tr>' +
          '</table><p class="subtle" style="margin-top:10px;">QBO accrual figures for July 1–27. Direct Labor is payroll, Admin is computer supplies/maintenance.</p></div>' +
          '</div>';
        elJyExp.innerHTML = htmlJy;
        var vSubJy = document.getElementById("jy-vendors-sub");
        if (vSubJy && jJy.vendors) {
          var vHtml = '<table class="cat-table">';
          jJy.vendors.forEach(function(v) {
            vHtml += '<tr><td>' + v.name + '</td><td class="num">' + money2(v.amount) + '</td></tr>';
          });
          vHtml += '<tr style="font-weight:600;border-top:1px solid #ccc"><td>Total Material Vendors</td><td class="num">' + money2(jJy.materialTotal) + '</td></tr></table>';
          vSubJy.innerHTML = vHtml;
        }
      }
    }

    CHARTS.julyYtd = function () {
      if (!chartReady()) return;
      var ctx = document.getElementById("jy-chart");
      if (!ctx) return;
      var labels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul"];
      var vals = [
        y.janJunFourStream ? 53261.22 : 53261.22,
        55518.17,
        61241.17,
        59197.01,
        58648.82,
        50270.18,
        y.julyBooked || 63580.33
      ];
      var bgColors = [
        COLORS.navy, COLORS.navy, COLORS.navy, COLORS.navy, COLORS.navy, COLORS.navy,
        COLORS.amber
      ];

      new Chart(ctx.getContext("2d"), {
        type: "bar",
        data: {
          labels: labels,
          datasets: [
            {
              label: "Monthly Revenue",
              data: vals,
              backgroundColor: bgColors,
              borderRadius: 4,
              maxBarThickness: 42
            }
          ]
        },
        options: baseChartOpts()
      });
    };
  }

  function renderSeasonality(s) {
    if (!s) return;
    var kpis = document.getElementById("sn-kpis");
    if (kpis) {
      kpis.innerHTML = [
        { label: "Peak Month", value: "April " + money2(4930.10), meta: "Seasonal Index 145.7 (Highest)" },
        { label: "Low Month", value: "January " + money2(1786.72), meta: "Seasonal Index 52.8 (Lowest)" },
        { label: "Monthly Baseline Average", value: money2(s.avgMonth) + " / mo", meta: "100.0 Seasonal Baseline" },
        { label: "H1 Booked Total", value: money2(s.total), meta: "Jan\u2013Jun Event Room Actuals" }
      ].map(kpiCard).join("");
    }

    CHARTS.seasonality = function () {
      if (!chartReady()) return;
      var ctx = document.getElementById("sn-chart");
      if (!ctx) return;
      var labels = s.months.map(function (m) { return m.label; });
      var revData = s.months.map(function (m) { return m.revenue; });
      var avgData = s.months.map(function () { return s.avgMonth; });

      new Chart(ctx.getContext("2d"), {
        type: "bar",
        data: {
          labels: labels,
          datasets: [
            {
              type: "bar",
              label: "Event Room Revenue",
              data: revData,
              backgroundColor: "#e9a23b",
              borderRadius: 4,
              maxBarThickness: 46
            },
            {
              type: "line",
              label: "Baseline Average ($3,384)",
              data: avgData,
              borderColor: "#12303f",
              borderWidth: 2,
              borderDash: [6, 4],
              pointRadius: 0
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: true, position: "bottom" },
            tooltip: {
              callbacks: {
                label: function (ctx) {
                  return ctx.dataset.label + ": " + money2(ctx.parsed.y);
                }
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              grid: { color: COLORS.grid },
              ticks: { callback: function (v) { return "$" + v.toLocaleString(); } }
            },
            x: { grid: { display: false } }
          }
        }
      });
    };

    var tbl = document.getElementById("sn-table");
    if (tbl) {
      var tbody = tbl.querySelector("tbody");
      var tfoot = tbl.querySelector("tfoot");
      if (tbody) {
        var rowsHtml = "";
        s.months.forEach(function (m) {
          var pctH1 = (m.revenue / s.total * 100).toFixed(1) + "%";
          var idx = (m.revenue / s.avgMonth * 100).toFixed(1);
          var ratingClass = idx >= 130 ? "up" : (idx >= 105 ? "" : (idx >= 80 ? "amber" : "down"));
          var ratingText = idx >= 130 ? "Peak Month" : (idx >= 105 ? "Above Average" : (idx >= 80 ? "Below Average" : "Low Month"));
          rowsHtml += '<tr>' +
            '<td>' + m.label + '</td>' +
            '<td class="num">' + money2(m.revenue) + '</td>' +
            '<td class="num">' + pctH1 + '</td>' +
            '<td class="num">' + idx + '</td>' +
            '<td><span class="badge ' + ratingClass + '">' + ratingText + '</span></td>' +
            '</tr>';
        });
        tbody.innerHTML = rowsHtml;
      }
      if (tfoot) {
        tfoot.innerHTML = '<tr style="font-weight:600;">' +
          '<td>H1 Total / Average</td>' +
          '<td class="num">' + money2(s.total) + '</td>' +
          '<td class="num">100.0%</td>' +
          '<td class="num">100.0</td>' +
          '<td>Baseline Baseline</td>' +
          '</tr>';
      }
    }

    var noteEl = document.getElementById("sn-note");
    if (noteEl) noteEl.textContent = s.note;
  }

  function showTab(name) {
    ["overall", "coffee", "events", "expenses", "june", "julyYtd", "seasonality"].forEach(function (t) {
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
    renderJune(data.june);
    renderJulyYtd(data.julyYtd);
    renderSeasonality(data.seasonality);
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
