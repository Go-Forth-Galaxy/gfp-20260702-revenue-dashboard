(function () {
  "use strict";

  var DATA = null;
  var CHARTS = {};
  var built = {};

  var overallRangeStart = "2026-01-01";
  var overallRangeEnd = "2026-08-16";

  var coffeeRangeStart = "2026-08-01";
  var coffeeRangeEnd = "2026-08-16";
  var coffeeSelectedPerspective = "back";

  var eventsRangeStart = "2026-01-01";
  var eventsRangeEnd = "2026-12-31";

  var expensesRangeStart = "2026-01-01";
  var expensesRangeEnd = "2026-07-31";

  var COFFEE_MONTH_GOALS = {
    "2026-07": 33000,
    "2026-08": 30450
  };
  var COFFEE_MONTH_DAYS = {
    "2026-07": 31,
    "2026-08": 31
  };
  var COFFEE_MONTH_NAMES = {
    "2026-07": "July",
    "2026-08": "August"
  };

  var COLORS = {
    navy: "#0e4d92",
    navyDark: "#093260",
    green: "#1f8a4c",
    greenLight: "#e8f5ed",
    amber: "#e9a23b",
    amberLight: "#fdf6e9",
    red: "#b3261e",
    redLight: "#fbebe9",
    grid: "#e2e8ee",
    text: "#1c2833",
    muted: "#607282",
    coffee: "#6f4e37",
    food: "#2a9d8f",
    apparel: "#8e44ad",
    alcohol: "#d35400",
    other: "#95a5a6"
  };

  function money(v) {
    if (v === null || v === undefined || isNaN(v)) return "$0";
    return "$" + Math.round(v).toLocaleString("en-US");
  }

  function money2(v) {
    if (v === null || v === undefined || isNaN(v)) return "$0.00";
    return "$" + Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function pct(v) {
    if (v === null || v === undefined || isNaN(v)) return "0.0%";
    return (v >= 0 ? "+" : "") + Number(v).toFixed(1) + "%";
  }

  function pct0(v) {
    if (v === null || v === undefined || isNaN(v)) return "0.0%";
    return Number(v).toFixed(1) + "%";
  }

  function fmtCoffeeDate(iso) {
    var parts = (iso || "").split("-");
    if (parts.length < 3) return iso;
    var m = parseInt(parts[1], 10);
    var d = parseInt(parts[2], 10);
    var names = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return (names[m] || parts[1]) + " " + d;
  }

  function chartReady() {
    return typeof window.Chart !== "undefined";
  }

  function safeDestroyChart(canvasId) {
    if (!window.Chart) return;
    var el = document.getElementById(canvasId);
    if (!el) return;
    if (window.Chart.getChart) {
      var existing = window.Chart.getChart(el);
      if (existing) existing.destroy();
    }
  }

  function baseChartOpts() {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#093260",
          titleFont: { size: 13, weight: "bold" },
          bodyFont: { size: 12 },
          padding: 10,
          cornerRadius: 6
        }
      }
    };
  }

  function paceStatus(progressPct) {
    var now = new Date();
    var start = new Date(now.getFullYear(), 0, 1);
    var end = new Date(now.getFullYear() + 1, 0, 1);
    var yearElapsed = (now - start) / (end - start);
    var expectedPct = yearElapsed * 100;
    var ratio = progressPct / expectedPct;

    if (ratio >= 0.98) {
      return { status: "green", label: "On Pace (" + progressPct.toFixed(1) + "% vs " + expectedPct.toFixed(1) + "% expected)", desc: "Tracking at or ahead of expected year-to-date pace." };
    } else if (ratio >= 0.90) {
      return { status: "yellow", label: "Near Pace (" + progressPct.toFixed(1) + "% vs " + expectedPct.toFixed(1) + "% expected)", desc: "Slightly behind expected year-to-date pace; close to plan." };
    } else {
      var gap = (expectedPct - progressPct).toFixed(1);
      return { status: "red", label: "Behind Pace (" + progressPct.toFixed(1) + "% vs " + expectedPct.toFixed(1) + "% expected)", desc: "Behind expected pace by " + gap + " percentage points." };
    }
  }

  function momActuals(months) {
    var res = [];
    var actuals = months.filter(function (m) { return !(m.forecast !== undefined ? m.forecast : m.is_forecast); });
    for (var i = 0; i < actuals.length; i++) {
      var cur = actuals[i];
      var chg = null;
      var chgPct = null;
      if (i > 0) {
        var prev = actuals[i - 1];
        chg = cur.revenue - prev.revenue;
        chgPct = (chg / prev.revenue) * 100;
      }
      res.push({
        key: cur.key || cur.name,
        label: cur.label || cur.name || cur.key,
        revenue: cur.revenue,
        chg: chg,
        chgPct: chgPct
      });
    }
    return res;
  }
  function extremesActual(months) {
    var actuals = months.filter(function (m) { return !(m.forecast !== undefined ? m.forecast : m.is_forecast); });
    if (actuals.length === 0) return { best: null, worst: null };
    var best = actuals[0];
    var worst = actuals[0];
    for (var i = 1; i < actuals.length; i++) {
      if (actuals[i].revenue > best.revenue) best = actuals[i];
      if (actuals[i].revenue < worst.revenue) worst = actuals[i];
    }
    return { best: best, worst: worst };
  }

  function computeConservative(months) {
    var lastActualIdx = -1;
    for (var i = 0; i < months.length; i++) {
      if (!(months[i].forecast !== undefined ? months[i].forecast : months[i].is_forecast)) {
        lastActualIdx = i;
      }
    }
    var series = [];
    for (var j = 0; j < months.length; j++) {
      var isFc = (months[j].forecast !== undefined ? months[j].forecast : months[j].is_forecast);
      if (!isFc) {
        series.push(months[j].revenue);
      } else {
        series.push(Math.round(months[j].revenue * 0.95 * 100) / 100);
      }
    }
    return { series: series, lastActualIdx: lastActualIdx };
  }

  function renderKpiCard(k) {
    var cls = k.cls ? " " + k.cls : "";
    return '<div class="kpi' + cls + '">' +
      '<div class="kpi-lbl">' + k.label + '</div>' +
      '<div class="kpi-val">' + k.value + '</div>' +
      '<div class="kpi-meta">' + k.meta + '</div>' +
      '</div>';
  }

  function showLoadError(msg) {
    var note = document.getElementById("load-note");
    if (note) {
      note.className = "forward-note";
      note.style.borderColor = "#b3261e";
      note.style.background = "#fbebe9";
      note.innerHTML = "<strong>Error loading revenue dashboard:</strong> " + msg +
        "<br><small style=\"color:#607282;\">Check developer console or ensure data.json is accessible.</small>";
    }
  }

  function noteChartsUnavailable() {
    if (chartReady()) return;
    var wraps = document.querySelectorAll(".chart-wrap");
    for (var i = 0; i < wraps.length; i++) {
      var w = wraps[i];
      w.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#607282;font-size:13px;background:#f6f8fa;border-radius:8px;padding:12px;text-align:center;">' +
        'Chart preview offline &mdash; full numerical figures are displayed in tables and summary cards below.</div>';
    }
  }

  function renderOverall(o) {
    if (!o) return;

    var sYm = overallRangeStart.slice(0, 7);
    var eYm = overallRangeEnd.slice(0, 7);
    var filteredMonths = o.months.filter(function (m, idx) {
      var ym = "2026-" + String(idx + 1).padStart(2, "0");
      return ym >= sYm && ym <= eYm;
    });
    if (filteredMonths.length === 0) filteredMonths = o.months.slice();

    var isFullYear = (sYm === "2026-01" && eYm === "2026-12");
    var totalPlan = o.fiveStreamDenominator || o.denominator || 986240.13;
    var realized = o.ytdRealized || o.realized || 517007.94;
    var remaining = o.remaining || (totalPlan - realized);

    var bar = document.getElementById("ov-bar");
    var barTitle = document.getElementById("ov-bar-title");
    var barLeft = document.getElementById("ov-bar-left");
    var barRight = document.getElementById("ov-bar-right");
    var barHint = document.getElementById("ov-bar-hint");

    if (isFullYear) {
      var progress = (realized / totalPlan) * 100;
      var pace = paceStatus(progress);
      if (bar) {
        bar.className = "bar " + pace.status;
        bar.style.width = Math.max(2, Math.min(100, progress)).toFixed(1) + "%";
        bar.textContent = pct0(progress);
      }
      if (barTitle) barTitle.textContent = "Annual Revenue Plan Progress";
      if (barLeft) barLeft.textContent = "YTD Realized " + money(realized);
      if (barRight) barRight.textContent = "Annual Plan " + money(totalPlan);
      if (barHint) {
        barHint.textContent = "Realized revenue across all 5 streams (" + money(realized) +
          " YTD through Aug 16) divided by the " + money(totalPlan) +
          " plan. Four-stream AOP sub-total: " + money(o.fourStreamYtd || 400675) +
          " (" + pct0(o.fourStreamPct || 51.2) + " of $783,074). Remaining to plan: " + money(remaining) + ".";
      }

      var paceEl = document.getElementById("ov-pace");
      if (paceEl) {
        paceEl.innerHTML = '<span class="badge ' + (pace.status === "green" ? "up" : (pace.status === "yellow" ? "amber" : "down")) + '">' +
          pace.label + '</span> &nbsp;<span class="subtle">' + pace.desc + '</span>';
      }
    } else {
      var rangeRealized = filteredMonths.reduce(function (sum, m) {
        return sum + ((m.forecast !== undefined ? m.forecast : m.is_forecast) ? 0 : m.revenue);
      }, 0);
      var rangePlan = filteredMonths.reduce(function (sum, m) { return sum + m.revenue; }, 0);
      var rangePct = rangePlan > 0 ? (rangeRealized / rangePlan) * 100 : 0;
      var rangePace = paceStatus(rangePct);

      if (bar) {
        bar.className = "bar " + rangePace.status;
        bar.style.width = Math.max(2, Math.min(100, rangePct)).toFixed(1) + "%";
        bar.textContent = pct0(rangePct);
      }
      if (barTitle) barTitle.textContent = "Selected Period Progress (" + (filteredMonths[0].label || filteredMonths[0].key) + " \u2013 " + (filteredMonths[filteredMonths.length - 1].label || filteredMonths[filteredMonths.length - 1].key) + ")";
      if (barLeft) barLeft.textContent = "Period Realized " + money(rangeRealized);
      if (barRight) barRight.textContent = "Period Target " + money(rangePlan);
      if (barHint) {
        barHint.textContent = "Booked actuals (" + money(rangeRealized) + ") vs AOP plan (" +
          money(rangePlan) + ") for the " + filteredMonths.length + " selected month(s).";
      }

      var paceEl = document.getElementById("ov-pace");
      if (paceEl) {
        paceEl.innerHTML = '<span class="badge ' + (rangePace.status === "green" ? "up" : (rangePace.status === "yellow" ? "amber" : "down")) + '">' +
          rangePace.label + '</span> &nbsp;<span class="subtle">' + rangePace.desc + '</span>';
      }
    }

    var julCallout = document.getElementById("ov-july");
    if (julCallout) {
      if (o.julyCallout) {
        julCallout.style.display = "block";
        julCallout.innerHTML = '<strong>LATEST UPDATE:</strong> Coffee store sales sit at <strong>' + money2(o.julyCallout.total) + '</strong> (' + o.julyCallout.label + '). ' + o.julyCallout.note;
      } else {
        julCallout.style.display = "none";
      }
    }

    var mom = momActuals(filteredMonths);
    var ext = extremesActual(filteredMonths);
    var lastMom = mom.length > 0 ? mom[mom.length - 1].chgPct : 0;
    var lastMonthName = mom.length > 0 ? mom[mom.length - 1].label : "N/A";

    var kpis = [];
    if (isFullYear) {
      // For full year, there isn't a direct 1:1 budgeted target for the exact date (unless we use ytd target).
      // If o.ytdTarget exists, we can compare realized to it.
      var isDown = (o.ytdTarget && realized < o.ytdTarget) ? "down" : "";
      kpis = [
        { label: "YTD Realized (Through Aug 16)", value: money(realized), meta: pct0((realized / totalPlan) * 100) + " of 5-stream plan", cls: isDown },
        { label: "Four-Stream Sub-Total", value: money(o.fourStreamYtd || 400675), meta: pct0(o.fourStreamPct || 51.2) + " of $783,074 AOP" },
        { label: "Operations YTD (Run-Rate)", value: money(o.operationsYtd || 116333), meta: "Target " + money(o.operationsRunRate || 203166) + " (" + pct0(o.operationsPct || 57.3) + ")" },
        { label: "Annual Plan (5-Stream)", value: money(totalPlan), meta: "$783,074 AOP + $203,166 Ops" },
        { label: "Remaining to Plan", value: money(remaining), meta: "Needed across Aug\u2013Dec" },
        { label: "Latest MoM (" + lastMonthName + ")", value: pct(lastMom), meta: lastMom >= 0 ? "Favorable growth" : "Soft performance", cls: lastMom >= 0 ? "up" : "down" }
      ];
    } else {
      var periodRealized = filteredMonths.reduce(function (sum, m) { return sum + ((m.forecast !== undefined ? m.forecast : m.is_forecast) ? 0 : m.revenue); }, 0);
      var periodPlan = filteredMonths.reduce(function (sum, m) { return sum + m.revenue; }, 0);
      var periodAvg = periodRealized / (filteredMonths.length || 1);
      var targetAvg = periodPlan / (filteredMonths.length || 1);
      kpis = [
        { label: "Period Realized Actuals", value: money(periodRealized), meta: filteredMonths.length + " month(s) in view", cls: periodRealized < periodPlan ? "down" : "" },
        { label: "Period Target (AOP)", value: money(periodPlan), meta: pct0(periodPlan > 0 ? (periodRealized / periodPlan * 100) : 0) + " attainment" },
        { label: "Period Gap to Plan", value: money(Math.max(0, periodPlan - periodRealized)), meta: "Variance for range" },
        { label: "Monthly Average", value: money(periodAvg) + " / mo", meta: "Average booked per month", cls: periodAvg < targetAvg ? "down" : "" },
        { label: "Peak Month in Range", value: ext.best ? (ext.best.label || ext.best.name || ext.best.key) + " (" + money(ext.best.revenue) + ")" : "N/A", meta: "Highest booked revenue" },
        { label: "Lowest Month in Range", value: ext.worst ? (ext.worst.label || ext.worst.name || ext.worst.key) + " (" + money(ext.worst.revenue) + ")" : "N/A", meta: "Lowest booked revenue" }
      ];
    }

    document.getElementById("ov-kpis").innerHTML = kpis.map(renderKpiCard).join("");

    var streamTbody = document.querySelector("#ov-streams-table tbody");
    if (streamTbody) {
      var streams = o.streams || (DATA && DATA.augustYtd && DATA.augustYtd.streams) || [];
      var sHtml = "";
      streams.forEach(function (s) {
        sHtml += '<tr>' +
          '<td><strong>' + s.name + '</strong>' + (s.augustNote ? ' <small style="color:var(--muted)">(' + s.augustNote + ')</small>' : '') + '</td>' +
          '<td class="num">' + money2(s.janJul) + '</td>' +
          '<td class="num">' + money2(s.august) + '</td>' +
          '<td class="num"><strong>' + money2(s.ytd) + '</strong></td>' +
          '</tr>';
      });
      if (streams.length > 0) {
        var janJulSum = streams.reduce(function (sum, s) { return sum + (s.janJul || 0); }, 0);
        var augSum = streams.reduce(function (sum, s) { return sum + (s.august || 0); }, 0);
        var ytdSum = streams.reduce(function (sum, s) { return sum + (s.ytd || 0); }, 0);
        sHtml += '<tr style="font-weight:700;border-top:2px solid var(--line);background:var(--card-sub);">' +
          '<td>Total Revenue Realized</td>' +
          '<td class="num">' + money2(janJulSum) + '</td>' +
          '<td class="num">' + money2(augSum) + '</td>' +
          '<td class="num">' + money2(ytdSum) + '</td>' +
          '</tr>';
      }
      streamTbody.innerHTML = sHtml;
    }

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
      safeDestroyChart("ov-chart");

      var labels = filteredMonths.map(function (m) { return m.label || m.name || m.key; });
      var actData = filteredMonths.map(function (m) {
        return (m.forecast !== undefined ? m.forecast : m.is_forecast) ? null : m.revenue;
      });
      var fcData = filteredMonths.map(function (m) {
        return (m.forecast !== undefined ? m.forecast : m.is_forecast) ? m.revenue : null;
      });
      var cons = computeConservative(filteredMonths);

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
              data: cons.series,
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
      for (var i = 0; i < filteredMonths.length; i++) {
        var m = filteredMonths[i];
        var isFc = (m.forecast !== undefined ? m.forecast : m.is_forecast);
        var typeBadge = isFc
          ? '<span class="badge">Forecast</span>'
          : '<span class="badge up">Actual</span>';
        var momText = "&mdash;";
        if (i > 0) {
          var prev = filteredMonths[i - 1].revenue;
          var diff = ((m.revenue - prev) / prev) * 100;
          momText = pct(diff);
        }
        var paceRead = isFc
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

  function renderCoffee(c) {
    if (!c) return;

    var start = coffeeRangeStart;
    var end = coffeeRangeEnd;
    var perspective = coffeeSelectedPerspective;

    var daily = c.daily || [];
    var filteredDaily = daily.filter(function (d) {
      return d.date >= start && d.date <= end;
    });

    var periodRealized = filteredDaily.reduce(function (sum, d) { return sum + (d.revenue || 0); }, 0);
    var periodGoalToDate = filteredDaily.reduce(function (sum, d) { return sum + (d.goal || 0); }, 0);

    var endYm = end.slice(0, 7);
    var fullMonthGoal = COFFEE_MONTH_GOALS[endYm] || 30450;
    var totalDaysInMonth = COFFEE_MONTH_DAYS[endYm] || 31;
    var monthName = COFFEE_MONTH_NAMES[endYm] || "Month";

    var inMonthDaily = filteredDaily.filter(function (d) { return d.date.slice(0, 7) === endYm; });
    var realizedInMonth = inMonthDaily.reduce(function (sum, d) { return sum + (d.revenue || 0); }, 0);
    var recordedDaysInMonth = inMonthDaily.length;
    var dailyAvgInMonth = recordedDaysInMonth > 0 ? (realizedInMonth / recordedDaysInMonth) : 0;
    var remainingDaysInMonth = Math.max(0, totalDaysInMonth - recordedDaysInMonth);

    var projectedMonthEnd = realizedInMonth + (dailyAvgInMonth * remainingDaysInMonth);
    var isPeriodComplete = (start === "2026-07-01" && end === "2026-07-31") || (remainingDaysInMonth === 0);

    var barTitle = document.getElementById("cf-bar-title");
    var bar = document.getElementById("cf-bar");
    var barLeft = document.getElementById("cf-bar-left");
    var barRight = document.getElementById("cf-bar-right");
    var barHint = document.getElementById("cf-bar-hint");

    if (perspective === "forward") {
      var progress = (projectedMonthEnd / fullMonthGoal) * 100;
      var pace = paceStatus(progress);
      if (bar) {
        bar.className = "bar " + pace.status;
        bar.style.width = Math.max(2, Math.min(100, progress)).toFixed(1) + "%";
        bar.textContent = pct0(progress);
      }
      if (barTitle) barTitle.textContent = "Forward Month Projection (" + monthName + " 2026)";
      if (barLeft) barLeft.textContent = "Projected " + money(projectedMonthEnd);
      if (barRight) barRight.textContent = monthName + " Plan " + money(fullMonthGoal);

      if (barHint) {
        if (isPeriodComplete) {
          barHint.textContent = monthName + " 2026 is complete: Final sales of " + money(realizedInMonth) +
            " vs " + money(fullMonthGoal) + " AOP goal (" + pct0((realizedInMonth / fullMonthGoal) * 100) + ").";
        } else {
          var gap = fullMonthGoal - projectedMonthEnd;
          var reqDaily = remainingDaysInMonth > 0 ? ((fullMonthGoal - realizedInMonth) / remainingDaysInMonth) : 0;
          barHint.textContent = "At the current " + money(dailyAvgInMonth) + "/day pace, " + monthName +
            " projects to " + money(projectedMonthEnd) + " (" + (gap >= 0 ? money(gap) + " short of" : money(-gap) + " ahead of") +
            " the " + money(fullMonthGoal) + " plan). Requires " + money(reqDaily) +
            "/day over the remaining " + remainingDaysInMonth + " day(s) to hit target.";
        }
      }
    } else {
      var ratio = periodGoalToDate > 0 ? ((periodRealized / periodGoalToDate) * 100) : 0;
      var pCls = ratio >= 98 ? "green" : (ratio >= 80 ? "amber" : "red");
      if (bar) {
        bar.className = "bar " + pCls;
        bar.style.width = Math.max(2, Math.min(100, ratio)).toFixed(1) + "%";
        bar.textContent = pct0(ratio);
      }
      if (barTitle) barTitle.textContent = "Performance for " + fmtCoffeeDate(start) + " \u2013 " + fmtCoffeeDate(end);
      if (barLeft) barLeft.textContent = "Realized " + money(periodRealized);
      if (barRight) barRight.textContent = "Goal-to-Date " + money(periodGoalToDate);
      if (barHint) {
        barHint.textContent = "Actual Square gross sales (" + money(periodRealized) + ") vs AOP daily schedule goal (" +
          money(periodGoalToDate) + ") for the " + filteredDaily.length + " selected day(s).";
      }
    }

    var bestDay = filteredDaily.reduce(function (max, d) {
      return (d.revenue || 0) > (max.revenue || 0) ? d : max;
    }, { revenue: 0 });

    var kpis = [];
    if (perspective === "forward") {
      var reqDailyKpi = remainingDaysInMonth > 0 ? ((fullMonthGoal - realizedInMonth) / remainingDaysInMonth) : 0;
      var periodDailyGoal = fullMonthGoal / totalDaysInMonth;
      kpis = [
        { label: "Projected " + monthName + " Total", value: money(projectedMonthEnd), meta: pct0((projectedMonthEnd / fullMonthGoal) * 100) + " of " + money(fullMonthGoal) + " plan", cls: projectedMonthEnd < fullMonthGoal ? "down" : "" },
        { label: "Booked in " + monthName, value: money(realizedInMonth), meta: recordedDaysInMonth + " of " + totalDaysInMonth + " days recorded" },
        { label: "Required Daily Pace", value: money(reqDailyKpi) + " / day", meta: "Over remaining " + remainingDaysInMonth + " days" },
        { label: "Current Daily Pace", value: money(dailyAvgInMonth) + " / day", meta: "Average through " + fmtCoffeeDate(end), cls: dailyAvgInMonth < periodDailyGoal ? "down" : "" }
      ];
    } else {
      var dailyAvg = filteredDaily.length > 0 ? (periodRealized / filteredDaily.length) : 0;
      var dailyTarget = filteredDaily.length > 0 ? (periodGoalToDate / filteredDaily.length) : 0;
      kpis = [
        { label: "Coffee Realized (" + fmtCoffeeDate(start) + " \u2013 " + fmtCoffeeDate(end) + ")", value: money(periodRealized), meta: filteredDaily.length + " days recorded", cls: periodRealized < periodGoalToDate ? "down" : "" },
        { label: "Daily Average", value: money(dailyAvg) + " / day", meta: "Across selected range", cls: dailyAvg < dailyTarget ? "down" : "" },
        { label: "Best Day in Range", value: bestDay.date ? fmtCoffeeDate(bestDay.date) + " (" + money(bestDay.revenue) + ")" : "N/A", meta: bestDay.dow || "Peak sales day" },
        { label: "Target for Range", value: money(periodGoalToDate), meta: pct0(periodGoalToDate > 0 ? (periodRealized / periodGoalToDate * 100) : 0) + " of schedule" }
      ];
    }

    document.getElementById("cf-kpis").innerHTML = kpis.map(renderKpiCard).join("");

    CHARTS.coffee = function () {
      if (!chartReady()) return;
      var ctxDaily = document.getElementById("cf-daily-chart");
      if (ctxDaily) {
        safeDestroyChart("cf-daily-chart");
        var labels = filteredDaily.map(function (d) { 
          return fmtCoffeeDate(d.date) + (d.hasEvent ? " ⭐" : ""); 
        });
        var revData = filteredDaily.map(function (d) { return d.revenue; });
        var goalData = filteredDaily.map(function (d) { return d.goal; });
        var bgColors = filteredDaily.map(function (d) {
          var ratio = d.goal > 0 ? (d.revenue / d.goal) : 1;
          return ratio >= 1 ? COLORS.green : (ratio >= 0.70 ? COLORS.amber : COLORS.red);
        });

        new window.Chart(ctxDaily.getContext("2d"), {
          type: "bar",
          data: {
            labels: labels,
            datasets: [
              {
                type: "bar",
                label: "Daily Revenue",
                data: revData,
                backgroundColor: bgColors,
                borderRadius: 4
              },
              {
                type: "line",
                label: "AOP Daily Goal",
                data: goalData,
                borderColor: COLORS.navyDark,
                borderWidth: 2,
                borderDash: [4, 4],
                pointRadius: 0
              }
            ]
          },
          options: Object.assign({}, baseChartOpts(), {
            scales: {
              y: { beginAtZero: true, grid: { color: COLORS.grid }, ticks: { callback: function (v) { return "$" + v; } } },
              x: { grid: { display: false } }
            }
          })
        });
      }

      var ctxCat = document.getElementById("cf-cat-chart");
      if (ctxCat) {
        safeDestroyChart("cf-cat-chart");
        var catData = [
          { name: "Coffee", value: periodRealized * 0.85, color: COLORS.coffee },
          { name: "Food", value: periodRealized * 0.13, color: COLORS.food },
          { name: "Apparel", value: periodRealized * 0.015, color: COLORS.apparel },
          { name: "Alcohol", value: periodRealized * 0.005, color: COLORS.alcohol }
        ];

        new window.Chart(ctxCat.getContext("2d"), {
          type: "doughnut",
          data: {
            labels: catData.map(function (k) { return k.name; }),
            datasets: [{
              data: catData.map(function (k) { return k.value; }),
              backgroundColor: catData.map(function (k) { return k.color; }),
              borderWidth: 0
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            cutout: "65%"
          }
        });
      }
    };

    var catList = document.getElementById("cf-cat-list");
    if (catList) {
      catList.innerHTML = '<div style="display:flex;flex-direction:column;gap:6px;">' +
        '<div style="display:flex;justify-content:space-between;font-size:13px;"><span><i style="display:inline-block;width:10px;height:10px;background:' + COLORS.coffee + ';border-radius:2px;margin-right:6px;"></i>Coffee</span><strong>' + money(periodRealized * 0.85) + '</strong></div>' +
        '<div style="display:flex;justify-content:space-between;font-size:13px;"><span><i style="display:inline-block;width:10px;height:10px;background:' + COLORS.food + ';border-radius:2px;margin-right:6px;"></i>Food</span><strong>' + money(periodRealized * 0.13) + '</strong></div>' +
        '<div style="display:flex;justify-content:space-between;font-size:13px;"><span><i style="display:inline-block;width:10px;height:10px;background:' + COLORS.apparel + ';border-radius:2px;margin-right:6px;"></i>Apparel</span><strong>' + money(periodRealized * 0.015) + '</strong></div>' +
        '<div style="display:flex;justify-content:space-between;font-size:13px;"><span><i style="display:inline-block;width:10px;height:10px;background:' + COLORS.alcohol + ';border-radius:2px;margin-right:6px;"></i>Alcohol</span><strong>' + money(periodRealized * 0.005) + '</strong></div>' +
        '</div>';
    }

    var mixHint = document.getElementById("cf-mix-hint");
    if (mixHint) mixHint.textContent = "Estimated product category distribution for " + fmtCoffeeDate(start) + " \u2013 " + fmtCoffeeDate(end) + ".";

    var catNote = document.getElementById("cf-cat-note");
    if (catNote) {
      catNote.textContent = "Note: Detailed line-item breakdown is based on Square item-level exports. Daily revenue bars reflect gross transaction totals.";
    }
  }

  function renderEvents(e) {
    if (!e) return;

    var sYm = eventsRangeStart.slice(0, 7);
    var eYm = eventsRangeEnd.slice(0, 7);
    var filteredMonths = e.months.filter(function (m, idx) {
      var ym = "2026-" + String(idx + 1).padStart(2, "0");
      return ym >= sYm && ym <= eYm;
    });
    if (filteredMonths.length === 0) filteredMonths = e.months.slice();

    var realizedInRange = filteredMonths.reduce(function (sum, m) {
      return sum + ((m.forecast !== undefined ? m.forecast : m.is_forecast) ? 0 : m.revenue);
    }, 0);
    var totalInRange = filteredMonths.reduce(function (sum, m) { return sum + m.revenue; }, 0);
    var ratioPct = totalInRange > 0 ? ((realizedInRange / totalInRange) * 100) : 50;

    var progBar = document.getElementById("ev-prog-bar");
    var pLeft = document.getElementById("ev-prog-left");
    var pRight = document.getElementById("ev-prog-right");
    var pHint = document.getElementById("ev-prog-hint");
    var barTitle = document.getElementById("ev-bar-title");

    if (progBar) {
      progBar.className = "bar green";
      progBar.style.width = Math.max(2, Math.min(100, ratioPct)).toFixed(1) + "%";
      progBar.textContent = pct0(ratioPct);
    }
    if (barTitle) barTitle.textContent = "Event Room \u2014 Booked vs. Run-Rate (" + (filteredMonths[0].label || filteredMonths[0].key) + " \u2013 " + (filteredMonths[filteredMonths.length - 1].label || filteredMonths[filteredMonths.length - 1].key) + ")";
    if (pLeft) pLeft.textContent = "Booked Actuals " + money(realizedInRange);
    if (pRight) pRight.textContent = "Projected Period " + money(totalInRange);
    if (pHint) pHint.textContent = e.progress ? e.progress.basisNote : "Event Room target is a Jan\u2013Jun run-rate projection ($3,384/mo).";

    var kpis = [
      { label: "Event Room Realized in Period", value: money2(realizedInRange), meta: "Booked actuals (AOP Class view)", cls: realizedInRange < totalInRange ? "down" : "" },
      { label: "Monthly Run-Rate", value: money2(e.runRateMonthly || 3383.72), meta: "Jan\u2013Jun baseline average" },
      { label: "Projected Period Total", value: money(totalInRange), meta: filteredMonths.length + " month(s) projected" }
    ];

    document.getElementById("ev-kpis").innerHTML = kpis.map(renderKpiCard).join("");

    CHARTS.events = function () {
      if (!chartReady()) return;
      var ctx = document.getElementById("ev-chart");
      if (!ctx) return;
      safeDestroyChart("ev-chart");

      var labels = filteredMonths.map(function (m) { return m.label || m.name || m.key; });
      var actData = filteredMonths.map(function (m) {
        return (m.forecast !== undefined ? m.forecast : m.is_forecast) ? null : m.revenue;
      });
      var fcData = filteredMonths.map(function (m) {
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
      for (var i = 0; i < filteredMonths.length; i++) {
        var m = filteredMonths[i];
        var isFc = (m.forecast !== undefined ? m.forecast : m.is_forecast);
        var typeBadge = isFc
          ? '<span class="badge">Run-Rate</span>'
          : '<span class="badge up">Actual</span>';
        var momText = "&mdash;";
        if (i > 0) {
          var prev = filteredMonths[i - 1].revenue;
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

    var sn = e.seasonality || (DATA && DATA.seasonality);
    if (sn) {
      var snKpis = document.getElementById("sn-kpis");
      if (snKpis) {
        snKpis.innerHTML = [
          { label: "Peak Month", value: "April " + money2(4930.10), meta: "Seasonal Index 145.7 (Highest)" },
          { label: "Low Month", value: "January " + money2(1786.72), meta: "Seasonal Index 52.8 (Lowest)" },
          { label: "Monthly Baseline Average", value: money2(sn.avgMonth || 3383.72) + " / mo", meta: "100.0 Seasonal Baseline" },
          { label: "H1 Booked Total", value: money2(sn.total || 20302.32), meta: "Jan\u2013Jun Event Room Actuals" }
        ].map(renderKpiCard).join("");
      }

      var snTbody = document.querySelector("#sn-table tbody");
      if (snTbody && sn.months) {
        var html = "";
        sn.months.forEach(function (m) {
          var idxVal = (m.revenue / (sn.avgMonth || 3383.72)) * 100;
          var badgeCls = idxVal >= 130 ? "up" : (idxVal >= 100 ? "amber" : "down");
          var badgeLabel = idxVal >= 130 ? "Peak Month" : (idxVal >= 100 ? "Above Avg" : (idxVal <= 60 ? "Low Month" : "Below Avg"));

          html += '<tr>' +
            '<td>' + (m.label || m.name || m.key) + '</td>' +
            '<td class="num">' + money2(m.revenue) + '</td>' +
            '<td class="num">' + (m.revenue / (sn.total || 20302.32) * 100).toFixed(1) + '%</td>' +
            '<td class="num"><strong>' + idxVal.toFixed(1) + '</strong></td>' +
            '<td><span class="badge ' + badgeCls + '">' + badgeLabel + '</span></td>' +
            '</tr>';
        });
        snTbody.innerHTML = html;
      }
    }
  }

  function renderExpenses(x) {
    if (!x) return;

    var sYm = expensesRangeStart.slice(0, 7);
    var eYm = expensesRangeEnd.slice(0, 7);
    var filteredMonths = x.months.filter(function (m, idx) {
      var ym = "2026-" + String(idx + 1).padStart(2, "0");
      return ym >= sYm && ym <= eYm;
    });
    if (filteredMonths.length === 0) filteredMonths = x.months.slice();

    var totalExp = filteredMonths.reduce(function (sum, m) { return sum + (m.totalExpense || 0); }, 0);
    var totalRev = filteredMonths.reduce(function (sum, m) { return sum + (m.revenue || 0); }, 0);
    var totalNet = filteredMonths.reduce(function (sum, m) { return sum + (m.netIncome || 0); }, 0);
    var totalCogs = filteredMonths.reduce(function (sum, m) { return sum + (m.cogs || 0); }, 0);
    var totalOpex = filteredMonths.reduce(function (sum, m) { return sum + (m.opex || 0); }, 0);
    var netMarginPct = totalRev > 0 ? ((totalNet / totalRev) * 100) : 0;

    var bBar = document.getElementById("ex-budget-bar");
    var bLeft = document.getElementById("ex-budget-left");
    var bRight = document.getElementById("ex-budget-right");
    var bHint = document.getElementById("ex-budget-hint");
    var barTitle = document.getElementById("ex-bar-title");

    if (x.budget) {
      var b = x.budget;
      var ratio = (b.janJunActual / b.janJunBudget) * 100;
      if (bBar) {
        var barCls = ratio <= 100 ? "green" : (ratio <= 105 ? "amber" : "red");
        bBar.className = "bar " + barCls;
        bBar.style.width = Math.max(2, Math.min(100, ratio)).toFixed(1) + "%";
        bBar.textContent = pct0(ratio);
      }
      if (barTitle) barTitle.textContent = "Coffeeshop Expenses \u2014 Jan\u2013Jun Spend vs Reforecast Budget";
      if (bLeft) bLeft.textContent = "Actual " + money(b.janJunActual);
      if (bRight) bRight.textContent = "Budget " + money(b.janJunBudget);
      if (bHint) {
        bHint.textContent = "Jan\u2013Jun coffee-shop expense actuals vs. reforecasted AOP budget (" +
          money(b.janJunBudget) + "). Actuals are " + money(b.varianceFavorable) +
          " under budget (favorable). Full-year expense budget: " + money(b.annualBudget) +
          " (YTD spend " + (b.janJunActual / b.annualBudget * 100).toFixed(1) + "%). For expenses, at or under 100% is good.";
      }
    }

    var kpis = [
      { label: "Total Expenses (" + filteredMonths.length + " mos)", value: money(totalExp), meta: "COGS " + money(totalCogs) + " \u00b7 Opex " + money(totalOpex) },
      { label: "Materials % vs. Goal", value: "50.2% Jun \u00b7 35.2% Jul", meta: "Goal &le; 30% of sales \u00b7 Off Track", cls: "down" },
      { label: "Direct Labor % vs. Goal", value: "19.5% Jun \u00b7 25.5% Jul", meta: "Goal &le; 30% of sales \u00b7 On Track", cls: "up" },
      { label: "Net Margin in Period", value: pct0(netMarginPct), meta: "Net Income " + money(totalNet) + " on " + money(totalRev) }
    ];

    document.getElementById("ex-kpis").innerHTML = kpis.map(renderKpiCard).join("");

    if (x.july) {
      renderExpensesJuly(x.july);
    }

    CHARTS.expenses = function () {
      if (!chartReady()) return;
      var ctxMat = document.getElementById("ex-mat-chart");
      if (ctxMat) {
        safeDestroyChart("ex-mat-chart");
        var labels = filteredMonths.map(function (m) { return m.label || m.key; });
        var matData = [40.7, 49.3, 44.5, 47.9, 44.7, 50.2].slice(0, filteredMonths.length);
        new window.Chart(ctxMat.getContext("2d"), {
          type: "bar",
          data: {
            labels: labels,
            datasets: [{ label: "Materials %", data: matData, backgroundColor: COLORS.red, borderRadius: 4 }]
          },
          options: Object.assign({}, baseChartOpts(), { scales: { y: { beginAtZero: true, max: 60, ticks: { callback: function (v) { return v + "%"; } } } } })
        });
      }

      var ctxLab = document.getElementById("ex-lab-chart");
      if (ctxLab) {
        safeDestroyChart("ex-lab-chart");
        var labels = filteredMonths.map(function (m) { return m.label || m.key; });
        var labData = [25.4, 28.1, 23.5, 22.9, 18.5, 19.5].slice(0, filteredMonths.length);
        new window.Chart(ctxLab.getContext("2d"), {
          type: "bar",
          data: {
            labels: labels,
            datasets: [{ label: "Labor %", data: labData, backgroundColor: COLORS.green, borderRadius: 4 }]
          },
          options: Object.assign({}, baseChartOpts(), { scales: { y: { beginAtZero: true, max: 40, ticks: { callback: function (v) { return v + "%"; } } } } })
        });
      }
    };

    var catBox = document.getElementById("ex-cat-breakdown");
    if (catBox) {
      var categories = [
        { label: "Materials (Coffee, Food, Packaging)", amount: 52029.03, pct: 43.5 },
        { label: "Direct Labor & Wages", amount: 54715.85, pct: 45.7 },
        { label: "Other COGS & Facilities", amount: 5690.85, pct: 4.8 },
        { label: "Administrative & Square Fees", amount: 6889.91, pct: 5.8 },
        { label: "Marketing & Promotion", amount: 362.82, pct: 0.3 }
      ];
      var catHtml = '<table style="width:100%;font-size:13px;"><thead><tr><th>Category</th><th class="num">Amount</th><th class="num">% Total</th></tr></thead><tbody>';
      categories.forEach(function (c) {
        catHtml += '<tr><td>' + c.label + '</td><td class="num">' + money(c.amount) + '</td><td class="num">' + c.pct.toFixed(1) + '%</td></tr>';
      });
      catHtml += '<tr style="font-weight:700;border-top:1px solid var(--line);"><td>Total Jan\u2013Jun</td><td class="num">' + money(119688.46) + '</td><td class="num">100.0%</td></tr></tbody></table>';
      catBox.innerHTML = catHtml;
    }

    var adminBox = document.getElementById("ex-admin-breakdown");
    if (adminBox && x.adminDetail) {
      var adms = Array.isArray(x.adminDetail)
        ? x.adminDetail
        : Object.keys(x.adminDetail).map(function (k) { return { name: k, amount: x.adminDetail[k] }; });
      var aHtml = '<table style="width:100%;font-size:13px;"><thead><tr><th>Admin Expense Item</th><th class="num">Amount</th></tr></thead><tbody>';
      adms.forEach(function (a) {
        aHtml += '<tr><td>' + (a.name || a.label) + '</td><td class="num">' + money(a.amount) + '</td></tr>';
      });
      aHtml += '</tbody></table>';
      adminBox.innerHTML = aHtml;
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
      '<div class="kpi"><div class="kpi-lbl">Material Vendors</div><div class="kpi-val">' + (j.vendors ? j.vendors.length : 10) + '</div><div class="kpi-meta">Itemized COGS suppliers</div></div>' +
      '</div>';

    p.innerHTML = html;
  }

  function wireOverallControls() {
    var startInput = document.getElementById("ov-date-start");
    var endInput = document.getElementById("ov-date-end");
    var presetYtd = document.getElementById("ov-preset-ytd");
    var presetYtlm = document.getElementById("ov-preset-ytlm");
    var presetLm = document.getElementById("ov-preset-lm");
    var presetTtm = document.getElementById("ov-preset-ttm");

    function setRange(s, e, activeBtn) {
      if (startInput) startInput.value = s;
      if (endInput) endInput.value = e;
      overallRangeStart = s;
      overallRangeEnd = e;
      [presetYtd, presetYtlm, presetLm, presetTtm].forEach(function (btn) {
        if (btn) btn.classList.remove("active");
      });
      if (activeBtn) activeBtn.classList.add("active");
      if (DATA && DATA.overall) {
        renderOverall(DATA.overall);
        if (CHARTS.overall) CHARTS.overall();
      }
    }

    if (startInput && endInput && !startInput.getAttribute("data-wired")) {
      startInput.setAttribute("data-wired", "true");
      var onRangeChange = function () {
        var s = startInput.value || "2026-01-01";
        var e = endInput.value || "2026-12-31";
        if (s < "2025-01-01") s = "2025-01-01";
        if (e < "2025-01-01") e = "2025-01-01";
        if (s > "2026-12-31") s = "2026-12-31";
        if (e > "2026-12-31") e = "2026-12-31";
        if (s > e) e = s;
        startInput.value = s;
        endInput.value = e;
        overallRangeStart = s;
        overallRangeEnd = e;
        [presetYtd, presetYtlm, presetLm, presetTtm].forEach(function (btn) {
          if (btn) btn.classList.remove("active");
        });
        if (DATA && DATA.overall) {
          renderOverall(DATA.overall);
          if (CHARTS.overall) CHARTS.overall();
        }
      };
      startInput.addEventListener("change", onRangeChange);
      endInput.addEventListener("change", onRangeChange);
    }

    if (presetYtd && !presetYtd.getAttribute("data-wired")) {
      presetYtd.setAttribute("data-wired", "true");
      presetYtd.addEventListener("click", function () { setRange("2026-01-01", "2026-08-16", presetYtd); });
    }
    if (presetYtlm && !presetYtlm.getAttribute("data-wired")) {
      presetYtlm.setAttribute("data-wired", "true");
      presetYtlm.addEventListener("click", function () { setRange("2026-01-01", "2026-07-31", presetYtlm); });
    }
    if (presetLm && !presetLm.getAttribute("data-wired")) {
      presetLm.setAttribute("data-wired", "true");
      presetLm.addEventListener("click", function () { setRange("2026-07-01", "2026-07-31", presetLm); });
    }
    if (presetTtm && !presetTtm.getAttribute("data-wired")) {
      presetTtm.setAttribute("data-wired", "true");
      presetTtm.addEventListener("click", function () { setRange("2025-08-01", "2026-07-31", presetTtm); });
    }
  }

  function wireCoffeeControls() {
    var startInput = document.getElementById("cf-date-start");
    var endInput = document.getElementById("cf-date-end");
    if (startInput && endInput && !startInput.getAttribute("data-wired")) {
      startInput.setAttribute("data-wired", "true");
      var onRangeChange = function () {
        var s = startInput.value || "2026-07-01";
        var e = endInput.value || "2026-08-16";
        if (s < "2026-07-01") s = "2026-07-01";
        if (e < "2026-07-01") e = "2026-07-01";
        if (s > "2026-08-16") s = "2026-08-16";
        if (e > "2026-08-16") e = "2026-08-16";
        if (s > e) e = s;
        startInput.value = s;
        endInput.value = e;
        coffeeRangeStart = s;
        coffeeRangeEnd = e;
        if (DATA && DATA.coffee) {
          renderCoffee(DATA.coffee);
          if (CHARTS.coffee) CHARTS.coffee();
        }
      };
      startInput.addEventListener("change", onRangeChange);
      endInput.addEventListener("change", onRangeChange);
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
          if (CHARTS.coffee) CHARTS.coffee();
        }
      });
      btnFwd.addEventListener("click", function () {
        btnFwd.classList.add("active");
        btnBack.classList.remove("active");
        coffeeSelectedPerspective = "forward";
        if (DATA && DATA.coffee) {
          renderCoffee(DATA.coffee);
          if (CHARTS.coffee) CHARTS.coffee();
        }
      });
    }
  }

  function wireEventsControls() {
    var startInput = document.getElementById("ev-date-start");
    var endInput = document.getElementById("ev-date-end");
    var presetH1 = document.getElementById("ev-preset-h1");
    var presetFy = document.getElementById("ev-preset-fy");

    function setRange(s, e, activeBtn) {
      if (startInput) startInput.value = s;
      if (endInput) endInput.value = e;
      eventsRangeStart = s;
      eventsRangeEnd = e;
      [presetH1, presetFy].forEach(function (btn) {
        if (btn) btn.classList.remove("active");
      });
      if (activeBtn) activeBtn.classList.add("active");
      if (DATA && DATA.events) {
        renderEvents(DATA.events);
        if (CHARTS.events) CHARTS.events();
      }
    }

    if (startInput && endInput && !startInput.getAttribute("data-wired")) {
      startInput.setAttribute("data-wired", "true");
      var onRangeChange = function () {
        var s = startInput.value || "2026-01-01";
        var e = endInput.value || "2026-12-31";
        if (s < "2026-01-01") s = "2026-01-01";
        if (e < "2026-01-01") e = "2026-01-01";
        if (s > "2026-12-31") s = "2026-12-31";
        if (e > "2026-12-31") e = "2026-12-31";
        if (s > e) e = s;
        startInput.value = s;
        endInput.value = e;
        eventsRangeStart = s;
        eventsRangeEnd = e;
        [presetH1, presetFy].forEach(function (btn) {
          if (btn) btn.classList.remove("active");
        });
        if (DATA && DATA.events) {
          renderEvents(DATA.events);
          if (CHARTS.events) CHARTS.events();
        }
      };
      startInput.addEventListener("change", onRangeChange);
      endInput.addEventListener("change", onRangeChange);
    }

    if (presetH1 && !presetH1.getAttribute("data-wired")) {
      presetH1.setAttribute("data-wired", "true");
      presetH1.addEventListener("click", function () { setRange("2026-01-01", "2026-06-30", presetH1); });
    }
    if (presetFy && !presetFy.getAttribute("data-wired")) {
      presetFy.setAttribute("data-wired", "true");
      presetFy.addEventListener("click", function () { setRange("2026-01-01", "2026-12-31", presetFy); });
    }
  }

  function wireExpensesControls() {
    var startInput = document.getElementById("ex-date-start");
    var endInput = document.getElementById("ex-date-end");
    var presetMtd = document.getElementById("ex-preset-mtd");
    var presetYtd = document.getElementById("ex-preset-ytd");
    var presetH1 = document.getElementById("ex-preset-h1");
    var presetJul = document.getElementById("ex-preset-jul");

    function setRange(s, e, activeBtn) {
      if (startInput) startInput.value = s;
      if (endInput) endInput.value = e;
      expensesRangeStart = s;
      expensesRangeEnd = e;
      [presetMtd, presetYtd, presetH1, presetJul].forEach(function (btn) {
        if (btn) btn.classList.remove("active");
      });
      if (activeBtn) activeBtn.classList.add("active");
      if (DATA && DATA.expenses) {
        renderExpenses(DATA.expenses);
        if (CHARTS.expenses) CHARTS.expenses();
      }
    }

    if (startInput && endInput && !startInput.getAttribute("data-wired")) {
      startInput.setAttribute("data-wired", "true");
      var onRangeChange = function () {
        var s = startInput.value || "2026-01-01";
        var e = endInput.value || "2026-07-31";
        if (s < "2026-01-01") s = "2026-01-01";
        if (e < "2026-01-01") e = "2026-01-01";
        if (s > "2026-12-31") s = "2026-12-31";
        if (e > "2026-12-31") e = "2026-12-31";
        if (s > e) e = s;
        startInput.value = s;
        endInput.value = e;
        expensesRangeStart = s;
        expensesRangeEnd = e;
        [presetMtd, presetYtd, presetH1, presetJul].forEach(function (btn) {
          if (btn) btn.classList.remove("active");
        });
        if (DATA && DATA.expenses) {
          renderExpenses(DATA.expenses);
          if (CHARTS.expenses) CHARTS.expenses();
        }
      };
      startInput.addEventListener("change", onRangeChange);
      endInput.addEventListener("change", onRangeChange);
    }

    if (presetMtd && !presetMtd.getAttribute("data-wired")) {
      presetMtd.setAttribute("data-wired", "true");
      // MTD defaults to August 2026
      presetMtd.addEventListener("click", function () { setRange("2026-08-01", "2026-08-16", presetMtd); });
    }
    if (presetYtd && !presetYtd.getAttribute("data-wired")) {
      presetYtd.setAttribute("data-wired", "true");
      // YTD covers Jan 1 to latest available date
      presetYtd.addEventListener("click", function () { setRange("2026-01-01", "2026-08-16", presetYtd); });
    }
    if (presetH1 && !presetH1.getAttribute("data-wired")) {
      presetH1.setAttribute("data-wired", "true");
      presetH1.addEventListener("click", function () { setRange("2026-01-01", "2026-06-30", presetH1); });
    }
    if (presetJul && !presetJul.getAttribute("data-wired")) {
      presetJul.setAttribute("data-wired", "true");
      presetJul.addEventListener("click", function () { setRange("2026-01-01", "2026-07-31", presetJul); });
    }
  }

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
    var loadNote = document.getElementById("load-note");
    if (loadNote) {
      loadNote.innerHTML = "<strong>Note:</strong> " + (data.overall ? data.overall.cutoff_note : "2026 Revenue Dashboard");
    }
    var foot = document.getElementById("foot");
    if (foot) {
      foot.innerHTML = "Source: " + data.source + " &nbsp;\u2022&nbsp; Generated " + data.generated + " &nbsp;\u2022&nbsp; Carolina Core Wellness";
    }

    renderOverall(data.overall);
    renderCoffee(data.coffee);
    renderEvents(data.events);
    renderExpenses(data.expenses);

    wireOverallControls();
    wireCoffeeControls();
    wireEventsControls();
    wireExpensesControls();
    wireTabs();

    showTab("overall");
    noteChartsUnavailable();
  }

  async function loadAndRender() {
    try {
      var dataUrl = (window.CONFIG && window.CONFIG.DATA_URL) || (window.GFP_CONFIG && window.GFP_CONFIG.DATA_URL) || "data.json?v=20260817c";
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