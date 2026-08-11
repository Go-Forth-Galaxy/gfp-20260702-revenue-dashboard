/* Carolina Core Wellness - 2026 Revenue Dashboard App JS */

(function () {
  "use strict";

  var DATA = null;
  var CHARTS = {};
  var built = {};

  var coffeeSelectedPeriod = "august";
  var coffeeSelectedPerspective = "back";

  var COLORS = {
    navy: "#0e4d92",
    green: "#1f8a4c",
    amber: "#e9a23b",
    red: "#b3261e",
    subtle: "#6c757d",
    grid: "#e5e7eb",
    ink: "#111827",
    purple: "#8e44ad"
  };

  var CAT_COLORS = {
    Coffee: "#0e4d92",
    Food: "#2a9d8f",
    Apparel: "#e9a23b",
    Alcohol: "#e76f51"
  };

  function money(v) {
    if (v == null || isNaN(v)) return "$0";
    return "$" + Math.round(v).toLocaleString();
  }

  function money2(v) {
    if (v == null || isNaN(v)) return "$0.00";
    return "$" + Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function pct(v) {
    if (v == null || isNaN(v)) return "0.0%";
    return (v >= 0 ? "+" : "") + Number(v).toFixed(1) + "%";
  }

  function pct0(v) {
    if (v == null || isNaN(v)) return "0.0%";
    return Number(v).toFixed(1) + "%";
  }

  function momActuals(months) {
    var res = [];
    var actuals = months.filter(function (m) { return !(m.forecast !== undefined ? m.forecast : (m.forecast !== undefined ? m.forecast : m.is_forecast)); });
    for (var i = 0; i < actuals.length; i++) {
      var curr = actuals[i].revenue;
      var prev = i > 0 ? actuals[i - 1].revenue : null;
      var chg = prev !== null && prev > 0 ? ((curr - prev) / prev) * 100 : null;
      res.push({ key: actuals[i].key, name: actuals[i].label || actuals[i].name || actuals[i].key, revenue: curr, chgPct: chg });
    }
    return res;
  }

  function extremesActual(months) {
    var actuals = months.filter(function (m) { return !(m.forecast !== undefined ? m.forecast : (m.forecast !== undefined ? m.forecast : m.is_forecast)); });
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
      var isFc = months[i].forecast !== undefined ? months[i].forecast : months[i].is_forecast;
      if (!isFc) lastActualIdx = i;
    }
    for (var j = 0; j < months.length; j++) {
      var m = months[j];
      var isFc2 = m.forecast !== undefined ? m.forecast : m.is_forecast;
      if (!isFc2) {
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

  var kpiCard = renderKpiCard;
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
    var realized = o.realized || o.ytd_realized;
    var totalPlan = o.denominator || o.annual_target;
    var progress = (realized / totalPlan) * 100;
    var remaining = totalPlan - realized;

    var bar = document.getElementById("ov-bar");
    var pace = paceStatus(progress);
    if (bar) {
      bar.className = "bar " + pace.status;
      bar.style.width = Math.max(2, Math.min(100, progress)).toFixed(1) + "%";
      bar.textContent = pct0(progress);
    }

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
      { label: "Lowest Month (Jan\u2013Jun)", value: ext.worst ? (ext.worst.label || ext.worst.name || ext.worst.key) + " (" + money(ext.worst.revenue) + ")" : "N/A", meta: "Based on booked actuals only" }
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
      var labels = o.months.map(function (m) { return m.label || m.name || m.key; });
      var actData = o.months.map(function (m) { return (m.forecast !== undefined ? m.forecast : m.is_forecast) ? null : m.revenue; });
      var fcData = o.months.map(function (m, idx) {
        if (idx === 5) return m.revenue;
        return (m.forecast !== undefined ? m.forecast : m.is_forecast) ? m.revenue : null;
      });
      var consData = cons.series.map(function (v, idx) {
        if (idx < 5) return null;
        return v;
      });

      new window.Chart(ctx.getContext("2d"), {
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
        var isFc3 = m.forecast !== undefined ? m.forecast : m.is_forecast;
        var typeBadge = isFc3
          ? '<span class="badge">Forecast</span>'
          : '<span class="badge up">Actual</span>';
        var momText = "&mdash;";
        if (i > 0) {
          var prev = o.months[i - 1].revenue;
          var diff = ((m.revenue - prev) / prev) * 100;
          momText = pct(diff);
        }
        var paceRead = isFc3
          ? "AOP Target"
          : (m.revenue >= 56000 ? "On Pace" : "Soft Month");

        rowsHtml += '<tr>' +
          '<td>' + (m.label || m.name || m.key) + '</td>' +
          '<td>' + typeBadge + '</td>' +
          '<td class="num">' + money2(m.revenue) + '</td>' +
          '<td class="num">' + momText + '</td>' +
          '<td>' + paceRead + '</td>' +
          '</tr>';
      }
      tbody.innerHTML = rowsHtml;
    }
  }

  function wireCoffeeControls() {
    var periodSel = document.getElementById("cf-period-select");
    if (periodSel && !periodSel.getAttribute("data-wired")) {
      periodSel.setAttribute("data-wired", "true");
      periodSel.addEventListener("change", function () {
        coffeeSelectedPeriod = this.value;
        if (DATA && DATA.coffee) {
          renderCoffee(DATA.coffee);
          if (CHARTS.coffee) { CHARTS.coffee(); }
        }
      });
    }

    var btnBack = document.getElementById("cf-view-back");
    var btnFwd = document.getElementById("cf-view-forward");
    if (btnBack && btnFwd && !btnBack.getAttribute("data-wired")) {
      btnBack.setAttribute("data-wired", "true");
      btnBack.addEventListener("click", function () {
        btnBack.classList.add("active");
        btnFwd.classList.remove("active");
        coffeeSelectedPerspective = "back";
        if (DATA && DATA.coffee) {
          renderCoffee(DATA.coffee);
          if (CHARTS.coffee) { CHARTS.coffee(); }
        }
      });
      btnFwd.addEventListener("click", function () {
        btnFwd.classList.add("active");
        btnBack.classList.remove("active");
        coffeeSelectedPerspective = "forward";
        if (DATA && DATA.coffee) {
          renderCoffee(DATA.coffee);
          if (CHARTS.coffee) { CHARTS.coffee(); }
        }
      });
    }
  }

  function renderCoffee(c) {
    if (!c) return;
    wireCoffeeControls();

    var allDaily = c.daily || [];
    var filteredDaily = allDaily.filter(function (d) {
      if (coffeeSelectedPeriod === "august") return d.date.startsWith("2026-08");
      if (coffeeSelectedPeriod === "july") return d.date.startsWith("2026-07");
      return true;
    });

    var periodRealized = filteredDaily.reduce(function (a, b) { return a + b.revenue; }, 0);
    var periodGoalToDate = filteredDaily.reduce(function (a, b) { return a + b.goal; }, 0);
    var actualDays = filteredDaily.length;

    var totalDaysInPeriod = 31;
    var fullPeriodGoal = 30450;
    var periodTitle = "August 2026";
    var periodLabel = "Aug 1\u201310";

    if (coffeeSelectedPeriod === "july") {
      totalDaysInPeriod = 31;
      fullPeriodGoal = 33000;
      periodTitle = "July 2026";
      periodLabel = "Jul 1\u201331";
    } else if (coffeeSelectedPeriod === "august") {
      totalDaysInPeriod = 31;
      fullPeriodGoal = 30450;
      periodTitle = "August 2026";
      periodLabel = "Aug 1\u201310";
    } else {
      totalDaysInPeriod = 62;
      fullPeriodGoal = 63450;
      periodTitle = "Full Window";
      periodLabel = "Jul 1\u2013Aug 10";
    }

    var remainingDays = Math.max(0, totalDaysInPeriod - actualDays);
    var dailyAvg = actualDays > 0 ? periodRealized / actualDays : 0;
    var projectedTotal = actualDays >= totalDaysInPeriod ? periodRealized : (periodRealized + (dailyAvg * remainingDays));

    // Progress Bar
    var bar = document.getElementById("cf-bar");
    var isFwd = coffeeSelectedPerspective === "forward";
    var pctVal = isFwd
      ? (fullPeriodGoal > 0 ? (projectedTotal / fullPeriodGoal) * 100 : 0)
      : (periodGoalToDate > 0 ? (periodRealized / periodGoalToDate) * 100 : 0);

    if (bar) {
      bar.className = "bar " + (pctVal >= 98 ? "green" : (pctVal >= 80 ? "amber" : "red"));
      bar.style.width = Math.max(2, Math.min(100, pctVal)).toFixed(1) + "%";
      bar.textContent = pct0(pctVal);
    }

    var barTitle = document.getElementById("cf-bar-title");
    if (barTitle) {
      barTitle.innerHTML = (isFwd ? "Looking Forward &#8212; " : "Looking Back &#8212; ") + periodTitle + " Coffee Revenue";
    }

    var barLeft = document.getElementById("cf-bar-left");
    var barRight = document.getElementById("cf-bar-right");
    var barHint = document.getElementById("cf-bar-hint");

    if (isFwd) {
      if (barLeft) barLeft.textContent = "Projected Total " + money(projectedTotal);
      if (barRight) barRight.textContent = "Plan Goal " + money(fullPeriodGoal);
      if (barHint) {
        if (remainingDays > 0) {
          var reqDaily = Math.max(0, fullPeriodGoal - periodRealized) / remainingDays;
          barHint.textContent = "At current pace (" + money2(dailyAvg) + "/day across " + actualDays + " recorded days), " + periodTitle + " is projected to reach " + money(projectedTotal) + " vs. " + money(fullPeriodGoal) + " AOP plan (" + pct0((projectedTotal/fullPeriodGoal)*100) + "). Remaining " + remainingDays + " days require " + money2(reqDaily) + "/day average to hit plan.";
        } else {
          barHint.textContent = periodTitle + " is complete. Final result: " + money2(periodRealized) + " vs. " + money(fullPeriodGoal) + " plan (" + pct0((periodRealized/fullPeriodGoal)*100) + ").";
        }
      }
    } else {
      if (barLeft) barLeft.textContent = "Realized " + money2(periodRealized);
      if (barRight) barRight.textContent = "Goal-to-Date " + money(periodGoalToDate) + " (Full " + money(fullPeriodGoal) + ")";
      if (barHint) {
        barHint.textContent = periodTitle + " actual coffee store sales vs. AOP goal-to-date schedule. Realized " + money2(periodRealized) + " of " + money(periodGoalToDate) + " goal-to-date (" + pct0((periodRealized/periodGoalToDate)*100) + ").";
      }
    }

    // Provenance Note
    var provNote = document.getElementById("cf-provenance-note");
    if (provNote) {
      if (isFwd) {
        provNote.innerHTML = "<strong>LOOKING FORWARD:</strong> Projections assume current daily pace (" + money2(dailyAvg) + "/day) continues across the remaining " + remainingDays + " days of " + periodTitle + ".";
      } else {
        provNote.innerHTML = "<strong>LOOKING BACK:</strong> " + periodTitle + " coffee/food revenue is sourced directly from Square item-level sales receipts (cash basis, gross sales).";
      }
    }

    // Headings
    var dailyTitle = document.getElementById("cf-daily-heading");
    if (dailyTitle) dailyTitle.innerHTML = "Daily Lookout &#8212; " + periodTitle + " Actuals vs. Goal";
    var catTitle = document.getElementById("cf-mix-heading");
    if (catTitle) catTitle.innerHTML = "Revenue Mix &#8212; " + periodTitle;

    var catHint = document.getElementById("cf-mix-hint");
    if (catHint) catHint.textContent = periodTitle + " sales by category (Square item-level import).";
    var dailyHint = document.getElementById("cf-daily-hint");
    if (dailyHint) dailyHint.textContent = periodTitle + " pace compared to daily target ($1,200 wkday / $600 Sat / $450 Sun). Cash basis (Square).";

    // Best day
    var bestDay = null;
    filteredDaily.forEach(function (d) {
      if (!bestDay || d.revenue > bestDay.revenue) bestDay = d;
    });

    // KPIs
    var kpis = [];
    if (!isFwd) {
      kpis = [
        { label: periodTitle + " MTD (" + periodLabel + ")", value: money2(periodRealized), meta: pct0((periodRealized / periodGoalToDate) * 100) + " of " + money(periodGoalToDate) + " goal-to-date" },
        { label: "Daily Average (" + actualDays + " days)", value: money2(dailyAvg) + " / day", meta: "Across " + actualDays + " recorded days" },
        { label: "Best Sales Day", value: bestDay ? money2(bestDay.revenue) : "$0", meta: bestDay ? (bestDay.dow + " " + bestDay.date.slice(5) + " (" + pct0((bestDay.revenue/bestDay.goal)*100) + " of goal)") : "" },
        { label: "Full Period AOP Plan", value: money(fullPeriodGoal), meta: "Schedule target for " + periodTitle }
      ];
    } else {
      var gap = fullPeriodGoal - projectedTotal;
      var isSurplus = gap <= 0;
      kpis = [
        { label: periodTitle + " Projected Total", value: money(projectedTotal), meta: pct0((projectedTotal / fullPeriodGoal) * 100) + " of " + money(fullPeriodGoal) + " full plan", cls: projectedTotal >= fullPeriodGoal ? "up" : "down" },
        { label: "Full Month Target", value: money(fullPeriodGoal), meta: "AOP monthly budget target" },
        { label: isSurplus ? "Projected Surplus" : "Projected Shortfall", value: money(Math.abs(gap)), meta: isSurplus ? "Ahead of plan pace" : "Behind plan pace", cls: isSurplus ? "up" : "down" },
        { label: "Required Daily Pace", value: remainingDays > 0 ? money2(Math.max(0, gap) / remainingDays) + " / day" : "Period Complete", meta: remainingDays > 0 ? "For remaining " + remainingDays + " days to hit plan" : "100% of days recorded" }
      ];
    }

    document.getElementById("cf-kpis").innerHTML = kpis.map(renderKpiCard).join("");

    // Category calculation for period
    var catArr = [];
    if (coffeeSelectedPeriod === "august") {
      catArr = [
        { category: "Coffee", amount: periodRealized, units: c.unitsTotal || 0 }
      ];
    } else if (coffeeSelectedPeriod === "july") {
      catArr = [
        { category: "Coffee", amount: 20981.83, units: (c.unitsCoffee || 0) },
        { category: "Food", amount: 3799.50, units: (c.unitsFood || 0) },
        { category: "Apparel", amount: 127.00, units: (c.unitsApparel || 0) },
        { category: "Alcohol", amount: 7.00, units: (c.unitsAlcohol || 0) }
      ];
    } else {
      catArr = [
        { category: "Coffee", amount: 28904.13, units: (c.unitsCoffee || 0) },
        { category: "Food", amount: 3799.50, units: (c.unitsFood || 0) },
        { category: "Apparel", amount: 127.00, units: (c.unitsApparel || 0) },
        { category: "Alcohol", amount: 7.00, units: (c.unitsAlcohol || 0) }
      ];
    }

    CHARTS.coffee = function () {
      if (!chartReady()) return;

      var ctxDaily = document.getElementById("cf-daily-chart");
      if (ctxDaily) {
        if (window.cfDailyChartInstance) { window.cfDailyChartInstance.destroy(); }
        var labels = filteredDaily.map(function (d) { return d.date.slice(5) + " " + d.dow; });
        var act = filteredDaily.map(function (d) { return d.revenue; });
        var goals = filteredDaily.map(function (d) { return d.goal; });
        var bgColors = filteredDaily.map(function (d) {
          var ratio = d.revenue / d.goal;
          if (ratio >= 0.98) return COLORS.green;
          if (ratio >= 0.70) return COLORS.amber;
          return COLORS.red;
        });

        window.cfDailyChartInstance = new window.Chart(ctxDaily.getContext("2d"), {
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

      var ctxMix = document.getElementById("cf-cat-chart");
      if (ctxMix) {
        if (window.cfMixChartInstance) { window.cfMixChartInstance.destroy(); }
        var catLabels = catArr.map(function (k) { return k.category; });
        var catVals = catArr.map(function (k) { return k.amount; });
        var mixColors = catLabels.map(function (lbl) { return CAT_COLORS[lbl] || COLORS.subtle; });

        window.cfMixChartInstance = new window.Chart(ctxMix.getContext("2d"), {
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
      var totalMat = catArr.reduce(function (a, b) { return a + b.amount; }, 0);
      var html = '<table class="cat-table">';
      catArr.forEach(function (cat) {
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
      if (coffeeSelectedPeriod === "august") {
        catNote.textContent = "August transaction exports carry no product-mix category split; all $7,922.30 is recorded as Coffee.";
      } else {
        catNote.textContent = c.categoryNote || "Food is broken out as a 2nd core category (~20% of sales). Receipts for Jul 24\u201329 arrived without a category split, so all $4,302 across those six days was folded into Coffee.";
      }
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
      var labels = e.months.map(function (m) { return m.label || m.name || m.key; });
      var actData = e.months.map(function (m) { return (m.forecast !== undefined ? m.forecast : m.is_forecast) ? null : m.revenue; });
      var fcData = e.months.map(function (m, idx) {
        if (idx === 5) return m.revenue;
        return (m.forecast !== undefined ? m.forecast : m.is_forecast) ? m.revenue : null;
      });

      new window.Chart(ctx.getContext("2d"), {
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
              label: "Run-Rate Projection",
              data: fcData,
              backgroundColor: COLORS.amber,
              borderRadius: 4,
              maxBarThickness: 42
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

    var tbody = document.querySelector("#ev-detail tbody");
    if (tbody) {
      var rowsHtml = "";
      for (var i = 0; i < e.months.length; i++) {
        var m = e.months[i];
        var isFc = m.forecast !== undefined ? m.forecast : m.is_forecast;
        var typeBadge = isFc
          ? '<span class="badge">Run-Rate</span>'
          : '<span class="badge up">Actual</span>';
        var momText = "&mdash;";
        if (i > 0) {
          var prev = e.months[i - 1].revenue;
          var diff = ((m.revenue - prev) / prev) * 100;
          momText = pct(diff);
        }
        var paceRead = isFc ? "Projected" : (m.revenue >= 3500 ? "Above Avg" : "Below Avg");

        rowsHtml += '<tr>' +
          '<td>' + (m.label || m.name || m.key) + '</td>' +
          '<td>' + typeBadge + '</td>' +
          '<td class="num">' + money2(m.revenue) + '</td>' +
          '<td class="num">' + momText + '</td>' +
          '<td>' + paceRead + '</td>' +
          '</tr>';
      }
      tbody.innerHTML = rowsHtml;
    }
  }

  function renderExpenses(x) {
    if (!x) return;
    var t = x.totals || {};

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

    var kpis = [
      { label: "Total Expenses (Jan\u2013Jun)", value: money(t.totalExpense), meta: "COGS " + money(t.cogs) + " \u00b7 Opex " + money(t.opex) },
      { label: "Materials % vs. Goal", value: "50.2% Jun \u00b7 35.2% Jul", meta: "Goal &le; 30% of sales \u00b7 Off Track", cls: "down" },
      { label: "Direct Labor % vs. Goal", value: "19.5% Jun \u00b7 25.5% Jul", meta: "Goal &le; 30% of sales \u00b7 On Track", cls: "up" },
      { label: "Net Margin (Jan\u2013Jun)", value: pct0(t.netMarginPct !== undefined ? t.netMarginPct : ((t.netIncome / (t.revenue || t.totalIncome || t.netRevenue)) * 100)), meta: "Net Income " + money(t.netIncome) + " on " + money(t.revenue || t.totalIncome || t.netRevenue) }
    ];

    document.getElementById("ex-kpis").innerHTML = kpis.map(renderKpiCard).join("");

    renderExpensesJuly(x.july);

    CHARTS.expenses = function () {
      if (!chartReady()) return;

      var matCtx = document.getElementById("ex-mat-chart");
      if (matCtx) {
        var matLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul"];
        var matData = [45.1, 41.2, 42.8, 48.0, 32.5, 50.2, 35.2];
        var matColors = matData.map(function (v) { return v <= 30 ? COLORS.green : COLORS.red; });

        new window.Chart(matCtx.getContext("2d"), {
          type: "bar",
          data: {
            labels: matLabels,
            datasets: [
              {
                type: "bar",
                label: "Materials % of Sales",
                data: matData,
                backgroundColor: matColors,
                borderRadius: 4,
                maxBarThickness: 36
              },
              {
                type: "line",
                label: "30% Benchmark Goal",
                data: [30, 30, 30, 30, 30, 30, 30],
                borderColor: COLORS.ink,
                borderWidth: 2,
                borderDash: [5, 5],
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
                    return ctx.dataset.label + ": " + ctx.parsed.y.toFixed(1) + "%";
                  }
                }
              }
            },
            scales: {
              y: {
                beginAtZero: true,
                max: 60,
                ticks: { callback: function (v) { return v + "%"; } },
                grid: { color: COLORS.grid }
              },
              x: { grid: { display: false } }
            }
          }
        });
      }

      var labCtx = document.getElementById("ex-lab-chart");
      if (labCtx) {
        var labLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul"];
        var labData = [35.9, 63.8, 44.3, 39.1, 39.7, 19.5, 25.5];
        var labColors = labData.map(function (v) { return v <= 30 ? COLORS.green : COLORS.red; });

        new window.Chart(labCtx.getContext("2d"), {
          type: "bar",
          data: {
            labels: labLabels,
            datasets: [
              {
                type: "bar",
                label: "Direct Labor % of Sales",
                data: labData,
                backgroundColor: labColors,
                borderRadius: 4,
                maxBarThickness: 36
              },
              {
                type: "line",
                label: "30% Benchmark Goal",
                data: [30, 30, 30, 30, 30, 30, 30],
                borderColor: COLORS.ink,
                borderWidth: 2,
                borderDash: [5, 5],
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
                    return ctx.dataset.label + ": " + ctx.parsed.y.toFixed(1) + "%";
                  }
                }
              }
            },
            scales: {
              y: {
                beginAtZero: true,
                max: 70,
                ticks: { callback: function (v) { return v + "%"; } },
                grid: { color: COLORS.grid }
              },
              x: { grid: { display: false } }
            }
          }
        });
      }
    };

    var catBox = document.getElementById("ex-cat-breakdown");
    if (catBox && x.categories) {
      var catList = Array.isArray(x.categories)
        ? x.categories
        : Object.keys(x.categories).map(function (k) {
            var v = x.categories[k] || {};
            return { key: k, label: v.label, category: v.category, amount: v.amount, pct: v.pct, monthly: v.monthly };
          });

      var totalExp = (x.totals && typeof x.totals.totalExpense === "number") ? x.totals.totalExpense : 0;
      var norm = catList.map(function (c) {
        var amt = (typeof c.amount === "number") ? c.amount : 0;
        if (typeof c.amount !== "number" && c.monthly) {
          amt = Object.keys(c.monthly).reduce(function (sum, m) {
            var v = c.monthly[m];
            return sum + (typeof v === "number" ? v : 0);
          }, 0);
        }
        var label = c.label || c.category || c.key || "\u2014";
        var pctVal = (typeof c.pct === "number") ? c.pct : (totalExp ? (amt / totalExp) * 100 : 0);
        return { label: label, amount: amt, pct: pctVal };
      });

      var html = '<table class="cat-table"><thead><tr><th>Expense Category</th><th class="num">Jan\u2013Jun Total</th><th class="num">% of Total</th></tr></thead><tbody>';
      norm.forEach(function (c) {
        html += '<tr><td>' + c.label + '</td><td class="num">' + money(c.amount) + '</td><td class="num">' + c.pct.toFixed(1) + '%</td></tr>';
      });
      html += '</tbody></table>';
      catBox.innerHTML = html;
    }

    var admBox = document.getElementById("ex-admin-breakdown");
    if (admBox && x.adminDetail) {
      var adms = Array.isArray(x.adminDetail)
        ? x.adminDetail
        : Object.keys(x.adminDetail).map(function (k) { return { name: k, amount: x.adminDetail[k] }; });

      var html2 = '<table class="cat-table"><thead><tr><th>Admin Expense Item</th><th class="num">Jan\u2013Jun Total</th></tr></thead><tbody>';
      adms.forEach(function (a) {
        html2 += '<tr><td>' + a.name + '</td><td class="num">' + money(a.amount) + '</td></tr>';
      });
      html2 += '</tbody></table>';
      admBox.innerHTML = html2;
    }
  }

  function renderExpensesJuly(j) {
    if (!j) return;
    var p = document.getElementById("exj-panel");
    if (!p) return;

    var totalInc = j.income || j.totalIncome || 21759.83;
    var netMargin = (j.netMarginPct !== undefined && !isNaN(j.netMarginPct)) ? j.netMarginPct : (totalInc > 0 ? (j.netIncome / totalInc * 100) : 0);

    var html = '<div class="panel-header"><h3>July 2026 Coffee-Shop Expenses (QBO Accrual)</h3></div>' +
      '<div class="kpi-grid">' +
      '<div class="kpi"><div class="kpi-lbl">July Coffee Expenses</div><div class="kpi-val">' + money(j.totalExpense) + '</div><div class="kpi-meta">Jul 1\u201327 QBO accrual</div></div>' +
      '<div class="kpi"><div class="kpi-lbl">July Coffee Income</div><div class="kpi-val">' + money(totalInc) + '</div><div class="kpi-meta">Product + sales</div></div>' +
      '<div class="kpi up"><div class="kpi-lbl">July Net Income</div><div class="kpi-val">' + money(j.netIncome) + '</div><div class="kpi-meta">' + netMargin.toFixed(1) + '% net margin</div></div>' +
      '<div class="kpi"><div class="kpi-lbl">Material Vendors</div><div class="kpi-val">' + (j.vendors ? j.vendors.length : (j.materialVendors ? j.materialVendors.length : 10)) + '</div><div class="kpi-meta">Itemized COGS suppliers</div></div>' +
      '</div>';

    p.innerHTML = html;
  }

  function renderJuly(j) {
    if (!j) return;
    var p = document.getElementById("tab-july");
    if (!p) return;

    var bar = document.getElementById("jl-bar");
    if (bar) {
      bar.className = "bar green";
      bar.style.width = Math.max(2, Math.min(100, j.benchmarkPct)).toFixed(1) + "%";
      bar.textContent = pct0(j.benchmarkPct);
    }
    var bLeft = document.getElementById("jl-bar-left");
    if (bLeft) bLeft.textContent = "July " + money2(j.total);
    var bRight = document.getElementById("jl-bar-right");
    if (bRight) bRight.textContent = "H1 avg month " + money(j.h1Avg);
    var bHint = document.getElementById("jl-bar-hint");
    if (bHint) bHint.textContent = j.barNote;

    var topStr = typeof j.topStream === "object" ? (j.topStream.stream || j.topStream.name) + " (" + money(j.topStream.amount || j.topStream.value) + ")" : j.topStream;
    var topPct = typeof j.topStream === "object" ? pct0(j.topStream.pct) + " of July total" : "";

    var kpisEl = document.getElementById("jl-kpis");
    if (kpisEl) {
      kpisEl.innerHTML = [
        { label: "July Total Revenue", value: money2(j.total), meta: "All streams \u00b7 booked" },
        { label: "vs. H1 Monthly Average", value: pct0(j.benchmarkPct), meta: "H1 avg month " + money(j.h1Avg) },
        { label: "MoM vs. June", value: pct(j.momPct), meta: "June was " + money(j.priorMonthTotal), cls: j.momPct >= 0 ? "up" : "down" },
        { label: "Rank in 2026", value: j.rank, meta: j.rankNote },
        { label: "Net Operating Income", value: money2(j.netIncome), meta: pct0(j.grossMarginPct) + " margin" },
        { label: "Top Revenue Stream", value: topStr, meta: topPct }
      ].map(kpiCard).join("");
    }

    CHARTS.july = function () {
      if (!chartReady()) return;
      var ctx = document.getElementById("jl-chart");
      if (!ctx) return;

      var sm = j.streamsMonthly || [];
      if (!sm.length) return;

      var labels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul"];

      var datasets = sm.map(function(s) {
        return {
          label: s.name,
          data: s.data,
          backgroundColor: s.color || "#0e4d92"
        };
      });

      new window.Chart(ctx.getContext("2d"), {
        type: "bar",
        data: {
          labels: labels,
          datasets: datasets
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: true, position: "bottom" },
            tooltip: {
              callbacks: {
                label: function (c2) {
                  return c2.dataset.label + ": " + money2(c2.parsed.y);
                }
              }
            }
          },
          scales: {
            x: { stacked: true, grid: { display: false } },
            y: {
              stacked: true,
              beginAtZero: true,
              grid: { color: COLORS.grid },
              ticks: { callback: function (v) { return "$" + (v / 1000) + "k"; } }
            }
          }
        }
      });
    };

    var detTable = document.getElementById("jl-detail");
    if (detTable && j.streams) {
      var tbody = detTable.querySelector("tbody");
      if (tbody) {
        tbody.innerHTML = j.streams.map(function(s) {
          var pVal = (s.value / j.total) * 100;
          var juneVal = s.june || 0;
          var diff = juneVal > 0 ? ((s.value - juneVal) / juneVal) * 100 : 0;
          var diffStr = juneVal > 0 ? pct(diff) : "-";
          return "<tr><td><strong>" + s.name + "</strong></td><td class='num'>" + money2(s.value) + "</td><td class='num'>" + pct0(pVal) + "</td><td class='num'>" + diffStr + "</td></tr>";
        }).join("");
      }
    }
  }

  function renderAugustYtd(a) {
    if (!a) return;
    var p = document.getElementById("tab-augustYtd");
    if (!p) return;

    var bar = document.getElementById("au-bar");
    var pace = paceStatus(a.realizedPct);
    if (bar) {
      bar.className = "bar " + pace.status;
      bar.style.width = Math.max(2, Math.min(100, a.realizedPct)).toFixed(1) + "%";
      bar.textContent = pct0(a.realizedPct);
    }

    var bLeft = document.getElementById("au-bar-left");
    if (bLeft) bLeft.textContent = "YTD " + money(a.realized);
    var bRight = document.getElementById("au-bar-right");
    if (bRight) bRight.textContent = "Annual Plan " + money(a.denominator);

    var barNoteEl = document.getElementById("au-bar-hint");
    if (barNoteEl) barNoteEl.textContent = a.barNote;

    var paceEl = document.getElementById("au-pace");
    if (paceEl) {
      var paceSub = a.paceSub ? ' &nbsp;<span class="subtle">' + a.paceSub + '</span>' : '';
      paceEl.innerHTML = '<span class="badge ' + (pace.status === "green" ? "up" : (pace.status === "yellow" ? "amber" : "down")) + '">' +
        pace.label + '</span>' + paceSub;
    }

    var cavEl = document.getElementById("au-caveat");
    if (cavEl) {
      cavEl.style.display = "block";
      cavEl.innerHTML = a.caveat;
    }

    var kpis = [
      { label: "YTD Realized (" + (a.throughLabel || "Aug 5") + ")", value: money(a.realized), meta: pct0(a.realizedPct) + " of 5-stream plan" },
      { label: "Four-Stream Sub-Total", value: money(a.fourStreamYtd || 398552), meta: pct0(a.fourStreamPct || 50.9) + " of $783,074 AOP" },
      { label: "Operations YTD (Run-Rate)", value: money(a.operationsYtd || 116333), meta: "Target " + money(a.operationsRunRate || 203166) + " (" + pct0(a.operationsPct || 57.3) + ")" },
      { label: "Annual Plan (5-Stream)", value: money(a.denominator), meta: "$783,074 AOP + $203,166 Ops" },
      { label: "Remaining to Plan", value: money(a.remaining), meta: "Needed across Aug\u2013Dec" },
      { label: "August Streams Booked", value: "Coffee MTD (Aug 1\u201310)", meta: "Leasing/Event August pending month-end" }
    ];

    var kpisEl = document.getElementById("au-kpis");
    if (kpisEl) kpisEl.innerHTML = kpis.map(kpiCard).join("");

    CHARTS.augustYtd = function () {
      if (!chartReady()) return;
      var ctx = document.getElementById("au-chart");
      if (!ctx) return;
      var labels = a.months.map(function (m) { return m.label || m.name || m.key; });
      var actData = a.months.map(function (m) { return m.partial ? null : m.revenue; });
      var partData = a.months.map(function (m) { return m.partial ? m.revenue : null; });

      new window.Chart(ctx.getContext("2d"), {
        type: "bar",
        data: {
          labels: labels,
          datasets: [
            { label: "Booked Actuals", data: actData, backgroundColor: COLORS.navy, borderRadius: 4 },
            { label: "August MTD (Partial)", data: partData, backgroundColor: COLORS.amber, borderRadius: 4 }
          ]
        },
        options: baseChartOpts()
      });
    };

    var detTable = document.getElementById("au-detail");
    if (detTable && a.streams) {
      var tbody = detTable.querySelector("tbody");
      if (tbody) {
        tbody.innerHTML = a.streams.map(function(s) {
          return "<tr><td><strong>" + s.name + "</strong></td><td class='num'>" + money2(s.janJul || s.janJun || 0) + "</td><td class='num'>" + money2(s.august || s.july || 0) + "</td><td class='num'><strong>" + money2(s.ytd) + "</strong></td></tr>";
        }).join("");
      }
    }

    var noteEl = document.getElementById("au-note");
    if (noteEl && a.note) noteEl.textContent = a.note;
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
      var labels = s.months.map(function (m) { return m.label || m.name || m.key; });
      var revData = s.months.map(function (m) { return m.revenue; });
      var avgData = s.months.map(function () { return s.avgMonth; });

      new window.Chart(ctx.getContext("2d"), {
        type: "bar",
        data: {
          labels: labels,
          datasets: [
            {
              type: "bar",
              label: "Event Room Revenue",
              data: revData,
              backgroundColor: COLORS.amber,
              borderRadius: 4,
              maxBarThickness: 42
            },
            {
              type: "line",
              label: "Monthly Average ($3,384)",
              data: avgData,
              borderColor: COLORS.navy,
              borderWidth: 2,
              borderDash: [5, 5],
              pointRadius: 0
            }
          ]
        },
        options: baseChartOpts()
      });
    };

    var tbody = document.querySelector("#sn-table tbody");
    if (tbody && s.months) {
      var html = "";
      s.months.forEach(function (m) {
        var idxVal = (m.revenue / s.avgMonth) * 100;
        var badgeCls = idxVal >= 130 ? "up" : (idxVal >= 100 ? "amber" : "down");
        var badgeLabel = idxVal >= 130 ? "Peak Month" : (idxVal >= 100 ? "Above Avg" : (idxVal <= 60 ? "Low Month" : "Below Avg"));

        html += '<tr>' +
          '<td>' + (m.label || m.name || m.key) + '</td>' +
          '<td class="num">' + money2(m.revenue) + '</td>' +
          '<td class="num">' + (m.revenue / s.total * 100).toFixed(1) + '%</td>' +
          '<td class="num"><strong>' + idxVal.toFixed(1) + '</strong></td>' +
          '<td><span class="badge ' + badgeCls + '">' + badgeLabel + '</span></td>' +
          '</tr>';
      });
      tbody.innerHTML = html;
    }
  }

  function showTab(name) {
    ["overall", "coffee", "events", "expenses", "july", "augustYtd", "seasonality"].forEach(function (t) {
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
    renderJuly(data.july);
    renderAugustYtd(data.augustYtd);
    renderSeasonality(data.seasonality);
    wireTabs();
    showTab("overall");
    noteChartsUnavailable();
  }

  async function loadAndRender() {
    try {
      var dataUrl = (window.CONFIG && window.CONFIG.DATA_URL) || (window.GFP_CONFIG && window.GFP_CONFIG.DATA_URL) || "data.json?v=20260811b";
      var res = await fetch(dataUrl);
      if (!res.ok) throw new Error("HTTP " + res.status + " fetching " + dataUrl);
      var data = await res.json();
      render(data);
    } catch (err) {
      showLoadError(err.message || String(err));
    }
  }

  window.GFP = {
    render: render,
    showTab: showTab,
    loadAndRender: loadAndRender
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadAndRender);
  } else {
    loadAndRender();
  }
})();
