/* ============================================================
   Carolina Core Wellness — 2026 Revenue Dashboard
   Public dashboard: in-browser AES-256-GCM decryption + charts.
   Math & crypto are exposed on window.GFP for headless testing.
   ============================================================ */
(function () {
  "use strict";

  var COLORS = {
    green: "#1f8a4c", greenSoft: "#9fd3b4", blue: "#0e4d92",
    amber: "#c77d0a", red: "#b3261e", ink: "#12303f", grid: "#e2e8ee"
  };

  // Conservative view: -5% haircut applied to UPCOMING (forecast) months ONLY.
  var CONS_FACTOR = 0.95;

  // ---------- number helpers ----------
  function money(n) {
    return "$" + Math.round(n).toLocaleString("en-US");
  }
  function pct(n) {
    return (n >= 0 ? "+" : "") + n.toFixed(1) + "%";
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
      var s = 0;
      for (var j = i - w + 1; j <= i; j++) s += ys[j];
      return s / w;
    });
  }
  function computeKPIs(months) {
    var revs = months.map(function (m) { return m.revenue; });
    var total = revs.reduce(function (a, b) { return a + b; }, 0);
    var best = months[0], worst = months[0];
    months.forEach(function (m) {
      if (m.revenue > best.revenue) best = m;
      if (m.revenue < worst.revenue) worst = m;
    });
    var mom = [];
    for (var i = 1; i < revs.length; i++) mom.push((revs[i] - revs[i - 1]) / revs[i - 1] * 100);
    var avgMoM = mom.length ? mom.reduce(function (a, b) { return a + b; }, 0) / mom.length : 0;
    var latestMoM = mom.length ? mom[mom.length - 1] : 0;
    return { total: total, best: best, worst: worst, avgMoM: avgMoM, latestMoM: latestMoM };
  }
  // Conservative series: -5% on forecast months only; actuals unchanged.
  // Line is anchored at the last actual month so it forks cleanly from the AOP line.
  function computeConservative(months) {
    var lastActualIdx = -1;
    months.forEach(function (m, i) { if (!m.forecast) lastActualIdx = i; });
    var line = months.map(function (m, i) {
      if (m.forecast) return m.revenue * CONS_FACTOR;   // upcoming month -> haircut
      if (i === lastActualIdx) return m.revenue;        // anchor at last actual
      return null;                                      // don't draw over actuals
    });
    var total = months.reduce(function (a, m) {
      return a + (m.forecast ? m.revenue * CONS_FACTOR : m.revenue);
    }, 0);
    return { line: line, total: total, lastActualIdx: lastActualIdx };
  }

  // ---------- crypto (pure) ----------
  function b64ToBytes(s) {
    var bin = atob(s), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  async function decryptData(enc, passphrase) {
    var subtle = (self.crypto || crypto).subtle;
    var salt = b64ToBytes(enc.salt_b64), iv = b64ToBytes(enc.iv_b64), ct = b64ToBytes(enc.ct_b64);
    var baseKey = await subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);
    var key = await subtle.deriveKey(
      { name: "PBKDF2", salt: salt, iterations: enc.iter, hash: "SHA-256" },
      baseKey, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
    var plain = await subtle.decrypt({ name: "AES-GCM", iv: iv }, key, ct);
    return JSON.parse(new TextDecoder().decode(plain));
  }

  var CONFIG;

  // ---------- app ----------
  function showLoadError(msg) {
    var note = document.getElementById("cutoff-note");
    if (note) note.innerHTML = "<strong>Could not load dashboard data:</strong> " + msg;
  }

  async function loadAndRender() {
    var enc = await fetch(CONFIG.DATA_URL, { cache: "no-store" }).then(function (r) { return r.json(); });
    var data = await decryptData(enc, CONFIG.DECRYPT_PASSPHRASE);
    render(data);
  }

  function render(data) {
    var months = data.months;
    var revs = months.map(function (m) { return m.revenue; });
    var ma = movingAverage(revs, 3);
    var reg = linearRegression(revs).points;
    var k = computeKPIs(months);
    var cons = computeConservative(months);

    document.getElementById("cutoff-note").innerHTML =
      "<strong>Note:</strong> " + data.cutoff_note;
    document.getElementById("src-name").textContent = data.source;
    document.getElementById("foot").innerHTML =
      "Source: " + data.source + " &nbsp;•&nbsp; Generated " + data.generated +
      " &nbsp;•&nbsp; Data AES-256-GCM encrypted at rest &nbsp;•&nbsp; Go-Forth Pest Control";

    // KPI cards
    var kpis = [
      { label: "Total 2026 Revenue (AOP)", value: money(k.total), meta: "Conservative: " + money(cons.total) + " (−5% Jul–Dec)" },
      { label: "Best Month", value: money(k.best.revenue), meta: k.best.label + (k.best.forecast ? " (forecast)" : " (booked)") },
      { label: "Worst Month", value: money(k.worst.revenue), meta: k.worst.label + (k.worst.forecast ? " (forecast)" : " (booked)") },
      { label: "Avg MoM Growth", value: pct(k.avgMoM), meta: "Latest MoM " + pct(k.latestMoM), cls: k.avgMoM >= 0 ? "up" : "down" }
    ];
    document.getElementById("kpis").innerHTML = kpis.map(function (c) {
      return '<div class="kpi"><div class="label">' + c.label + '</div>' +
        '<div class="value ' + (c.cls || "") + '">' + c.value + '</div>' +
        '<div class="meta">' + c.meta + "</div></div>";
    }).join("");

    // Detail table
    var tbody = "", prev = null;
    months.forEach(function (m, i) {
      var momTxt = prev == null ? "—" : pct((m.revenue - prev) / prev * 100);
      tbody += "<tr><td>" + m.label +
        '<span class="badge ' + (m.forecast ? "forecast" : "actual") + '">' + (m.forecast ? "forecast" : "booked") + "</span></td>" +
        "<td>" + m.days + "</td><td>" + money(m.revenue) + "</td>" +
        "<td>" + (ma[i] == null ? "—" : money(ma[i])) + "</td>" +
        "<td>" + momTxt + "</td></tr>";
      prev = m.revenue;
    });
    document.querySelector("#detail tbody").innerHTML = tbody;
    document.querySelector("#detail tfoot").innerHTML =
      "<tr><td>Total</td><td></td><td>" + money(k.total) + "</td><td></td><td></td></tr>";

    // Chart
    if (typeof Chart === "undefined") return;
    var ctx = document.getElementById("revChart").getContext("2d");
    new Chart(ctx, {
      data: {
        labels: months.map(function (m) { return m.key; }),
        datasets: [
          {
            type: "bar", label: "Monthly Revenue (AOP)",
            data: revs, order: 4,
            backgroundColor: months.map(function (m) { return m.forecast ? COLORS.greenSoft : COLORS.green; }),
            borderRadius: 4, maxBarThickness: 46
          },
          {
            type: "line", label: "Conservative (−5%, Jul–Dec)",
            data: cons.line, order: 0,
            borderColor: COLORS.red, backgroundColor: COLORS.red,
            borderWidth: 2.5, pointRadius: 3, pointStyle: "rectRot", tension: .3, spanGaps: false
          },
          {
            type: "line", label: "3-mo Moving Avg",
            data: ma, order: 2, borderColor: COLORS.blue, backgroundColor: COLORS.blue,
            borderWidth: 2.5, pointRadius: 2, tension: .35, spanGaps: true
          },
          {
            type: "line", label: "Linear Trend",
            data: reg, order: 3, borderColor: COLORS.amber, backgroundColor: COLORS.amber,
            borderWidth: 2, borderDash: [7, 5], pointRadius: 0, tension: 0
          }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function (c) { return c.dataset.label + ": " + money(c.parsed.y); }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: false,
            grid: { color: COLORS.grid },
            ticks: { callback: function (v) { return "$" + (v / 1000) + "k"; } }
          },
          x: { grid: { display: false } }
        }
      }
    });
  }

  // ---------- boot ----------
  function boot() {
    CONFIG = window.GFP_CONFIG;
    if (!CONFIG || !CONFIG.DATA_URL || !CONFIG.DECRYPT_PASSPHRASE) {
      showLoadError("configuration missing in config.js (DATA_URL / DECRYPT_PASSPHRASE).");
      return;
    }
    loadAndRender().catch(function (e) {
      showLoadError((e && e.message) ? e.message : String(e));
    });
  }

  if (typeof document !== "undefined" && document.getElementById) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
    else boot();
  }

  // expose pure fns for headless verification
  window.GFP = {
    linearRegression: linearRegression, movingAverage: movingAverage,
    computeKPIs: computeKPIs, computeConservative: computeConservative, decryptData: decryptData,
    render: render, loadAndRender: loadAndRender,
    _setConfig: function (c) { CONFIG = c; }
  };
})();
