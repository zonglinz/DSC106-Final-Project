const NS = "http://www.w3.org/2000/svg";

const rawRecords = (window.CLIMATE_DATA && window.CLIMATE_DATA.records ? window.CLIMATE_DATA.records : []).map((record) => ({
  ...record,
  year: record.year === null || record.year === "" ? null : Number(record.year),
  value: record.value === null || record.value === "" ? null : Number(record.value)
}));

const scenarios = ["SSP1-2.6", "SSP2-4.5", "SSP5-8.5"];
const periods = ["2050", "2080s"];
const seasons = ["Winter", "Spring", "Summer", "Fall"];
const state = {
  scenario: "SSP5-8.5",
  period: "2080s",
  selectedCity: null,
  year: 2080
};

function byId(id) {
  return document.getElementById(id);
}

function svgEl(tag, attrs = {}, parent) {
  const node = document.createElementNS(NS, tag);
  Object.entries(attrs).forEach(([key, value]) => {
    if (value !== undefined && value !== null) node.setAttribute(key, value);
  });
  if (parent) parent.appendChild(node);
  return node;
}

function addText(parent, text, attrs = {}) {
  const node = svgEl("text", attrs, parent);
  node.textContent = text;
  return node;
}

function clearSvg(svg, width, height) {
  svg.innerHTML = "";
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
}

function scaleLinear(domain, range) {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  return (value) => r0 + ((value - d0) / (d1 - d0)) * (r1 - r0);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function recordsOf(type) {
  return rawRecords.filter((record) => record.record_type === type);
}

function profileName() {
  return `${state.period} ${state.scenario}`;
}

function cityLocations() {
  return recordsOf("city_location").map((record) => ({
    city: record.city,
    lat: Number(record.lat),
    lon: Number(record.lon)
  }));
}

function similarityRows() {
  return recordsOf("climate_twin_similarity")
    .filter((record) => record.scenario === state.scenario && record.profile === profileName())
    .sort((a, b) => b.value - a.value);
}

function similarityByCity() {
  const rows = similarityRows();
  return new Map(rows.map((row) => [row.comparison_city, row.value]));
}

function anomalyRows() {
  return recordsOf("annual_temp_anomaly")
    .filter((record) => record.scenario === state.scenario)
    .sort((a, b) => a.year - b.year);
}

function nearestAnomaly() {
  const rows = anomalyRows();
  if (!rows.length) return null;
  return rows.reduce((nearest, row) => {
    return Math.abs(row.year - state.year) < Math.abs(nearest.year - state.year) ? row : nearest;
  }, rows[0]);
}

function futureSeasonalRows() {
  return recordsOf("seasonal_future_profile")
    .filter((record) => record.scenario === state.scenario && record.profile === profileName() && record.metric === "seasonal_mean_temp_c")
    .sort((a, b) => seasons.indexOf(a.season) - seasons.indexOf(b.season));
}

function comparisonSeasonalRows(city) {
  return recordsOf("seasonal_comparison_profile")
    .filter((record) => record.city === city && record.metric === "seasonal_mean_temp_c")
    .sort((a, b) => seasons.indexOf(a.season) - seasons.indexOf(b.season));
}

function ensureSelectedCity() {
  const rows = similarityRows();
  const names = rows.map((row) => row.comparison_city);
  if (!rows.length) {
    state.selectedCity = null;
    return;
  }
  if (!state.selectedCity || !names.includes(state.selectedCity)) {
    state.selectedCity = rows[0].comparison_city;
  }
}

function scoreColor(score) {
  if (score === undefined || Number.isNaN(score)) return "#9ca3af";
  const lightness = clamp(76 - score * 0.34, 34, 76);
  const hue = clamp(207 - score * 0.35, 170, 207);
  return `hsl(${hue}, 76%, ${lightness}%)`;
}

function setButtonStates() {
  document.querySelectorAll("[data-scenario]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.scenario === state.scenario));
  });
  document.querySelectorAll("[data-period]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.period === state.period));
  });
  byId("yearSlider").value = String(state.year);
  byId("yearLabel").textContent = String(state.year);
}

function initControls() {
  const scenarioButtons = byId("scenarioButtons");
  scenarios.forEach((scenario) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "control-button";
    button.dataset.scenario = scenario;
    button.textContent = scenario;
    button.setAttribute("aria-pressed", "false");
    button.addEventListener("click", () => {
      state.scenario = scenario;
      ensureSelectedCity();
      updateAll();
    });
    scenarioButtons.appendChild(button);
  });

  const periodButtons = byId("periodButtons");
  periods.forEach((period) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "control-button";
    button.dataset.period = period;
    button.textContent = period;
    button.setAttribute("aria-pressed", "false");
    button.addEventListener("click", () => {
      state.period = period;
      ensureSelectedCity();
      updateAll();
    });
    periodButtons.appendChild(button);
  });

  byId("yearSlider").addEventListener("input", (event) => {
    state.year = Number(event.target.value);
    updateAll();
  });

  byId("resetButton").addEventListener("click", () => {
    state.scenario = "SSP5-8.5";
    state.period = "2080s";
    state.year = 2080;
    state.selectedCity = null;
    ensureSelectedCity();
    updateAll();
  });
}

function updateSummary() {
  const rows = similarityRows();
  const top = rows[0];
  const selected = rows.find((row) => row.comparison_city === state.selectedCity) || top;
  const anomaly = nearestAnomaly();

  if (!top || !selected || !anomaly) {
    byId("currentFinding").textContent = "Dataset is loading.";
    byId("currentDetail").textContent = "No climate-twin records are available for the current selection.";
    return;
  }

  byId("currentFinding").textContent = `${profileName()}: closest twin is ${top.comparison_city}.`;
  byId("currentDetail").textContent = `${state.selectedCity} is currently selected with a similarity score of ${selected.value.toFixed(1)} out of 100. The ${state.year} San Diego annual temperature anomaly under ${state.scenario} is about ${anomaly.value.toFixed(1)}°C.`;
  byId("selectedTwinBadge").textContent = `${state.selectedCity}: ${selected.value.toFixed(1)}`;
  byId("anomalyBadge").textContent = `${state.year}: ${anomaly.value.toFixed(1)}°C`;
}

function drawMap() {
  const svg = byId("mapSvg");
  const width = 690;
  const height = 340;
  const margin = { top: 18, right: 24, bottom: 24, left: 24 };
  clearSvg(svg, width, height);

  const x = scaleLinear([-123.2, -110.2], [margin.left, width - margin.right]);
  const y = scaleLinear([31.5, 48.5], [height - margin.bottom, margin.top]);
  const scores = similarityByCity();
  const locations = cityLocations();
  const sanDiego = locations.find((city) => city.city === "San Diego");
  const selected = locations.find((city) => city.city === state.selectedCity);

  svgEl("rect", { x: 0, y: 0, width, height, rx: 20, fill: "#eef6ff" }, svg);

  [-122, -118, -114, -110].forEach((lon) => {
    const gx = x(lon);
    svgEl("line", { x1: gx, x2: gx, y1: margin.top, y2: height - margin.bottom, class: "grid-line", opacity: 0.7 }, svg);
    addText(svg, `${Math.abs(lon)}°W`, { x: gx, y: height - 6, "text-anchor": "middle", class: "chart-label" });
  });
  [32, 36, 40, 44, 48].forEach((lat) => {
    const gy = y(lat);
    svgEl("line", { x1: margin.left, x2: width - margin.right, y1: gy, y2: gy, class: "grid-line", opacity: 0.7 }, svg);
    addText(svg, `${lat}°N`, { x: 8, y: gy + 4, class: "chart-label" });
  });

  const coastPoints = [
    [-122.33, 47.61], [-122.42, 37.77], [-121.49, 38.58], [-119.79, 36.74],
    [-118.24, 34.05], [-117.16, 32.72], [-110.97, 32.22]
  ].map(([lon, lat]) => `${x(lon)},${y(lat)}`).join(" ");
  svgEl("polyline", {
    points: coastPoints,
    fill: "none",
    stroke: "#8ec5ff",
    "stroke-width": 5,
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    opacity: 0.52
  }, svg);
  addText(svg, "Approximate geographic layout", { x: width - 24, y: 28, "text-anchor": "end", class: "chart-label" });

  if (sanDiego && selected) {
    svgEl("line", {
      x1: x(sanDiego.lon), y1: y(sanDiego.lat),
      x2: x(selected.lon), y2: y(selected.lat),
      stroke: "#111827", "stroke-width": 2.5, "stroke-dasharray": "5 7", opacity: 0.7
    }, svg);
  }

  locations.forEach((city) => {
    const score = scores.get(city.city);
    const isSanDiego = city.city === "San Diego";
    const isComparable = score !== undefined;
    const isSelected = city.city === state.selectedCity;
    const radius = isSanDiego ? 10 : isComparable ? 5 + score / 13 : 5;
    const group = svgEl("g", {
      tabindex: isComparable ? "0" : "-1",
      role: isComparable ? "button" : "img",
      "aria-label": isComparable ? `${city.city}, similarity score ${score.toFixed(1)}` : city.city
    }, svg);

    if (isComparable) {
      group.addEventListener("click", () => {
        state.selectedCity = city.city;
        updateAll();
      });
      group.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          state.selectedCity = city.city;
          updateAll();
        }
      });
    }

    const cx = x(city.lon);
    const cy = y(city.lat);
    svgEl("circle", {
      cx,
      cy,
      r: radius,
      fill: isSanDiego ? "#ef7d31" : scoreColor(score),
      stroke: isSelected || isSanDiego ? "#111827" : "#ffffff",
      "stroke-width": isSelected || isSanDiego ? 3 : 2,
      class: `city-dot ${isSelected ? "selected" : ""} ${!isComparable && !isSanDiego ? "context" : ""}`
    }, group);
    addText(group, isSanDiego ? "San Diego" : city.city, {
      x: cx + 9,
      y: cy - 9,
      class: `map-label city-label ${isSelected ? "selected" : ""}`
    });
    const title = svgEl("title", {}, group);
    title.textContent = isSanDiego ? "San Diego: projected future climate" : score !== undefined ? `${city.city}: ${score.toFixed(1)} / 100 climate-twin score` : `${city.city}: context city without a current similarity score`;
  });

  const legendX = margin.left + 6;
  const legendY = height - 70;
  svgEl("rect", { x: legendX - 8, y: legendY - 24, width: 235, height: 54, rx: 12, fill: "rgba(255,255,255,0.86)", stroke: "#d7dfec" }, svg);
  svgEl("circle", { cx: legendX + 8, cy: legendY - 6, r: 7, fill: "#ef7d31", stroke: "#111827", "stroke-width": 2 }, svg);
  addText(svg, "San Diego future", { x: legendX + 24, y: legendY - 2, class: "chart-label" });
  svgEl("circle", { cx: legendX + 8, cy: legendY + 17, r: 7, fill: scoreColor(75), stroke: "#fff", "stroke-width": 2 }, svg);
  addText(svg, "Comparison city score", { x: legendX + 24, y: legendY + 21, class: "chart-label" });
}

function drawRanking() {
  const svg = byId("rankingSvg");
  const width = 520;
  const height = 320;
  const margin = { top: 18, right: 52, bottom: 32, left: 118 };
  clearSvg(svg, width, height);

  const rows = similarityRows();
  if (!rows.length) {
    addText(svg, "No similarity records available.", { x: width / 2, y: height / 2, "text-anchor": "middle", class: "chart-label" });
    return;
  }

  const x = scaleLinear([0, 100], [margin.left, width - margin.right]);
  const barGap = 9;
  const rowHeight = (height - margin.top - margin.bottom) / rows.length;
  const barHeight = Math.max(18, rowHeight - barGap);

  [0, 25, 50, 75, 100].forEach((tick) => {
    const tx = x(tick);
    svgEl("line", { x1: tx, x2: tx, y1: margin.top, y2: height - margin.bottom, class: "grid-line" }, svg);
    addText(svg, String(tick), { x: tx, y: height - 8, "text-anchor": "middle", class: "chart-label" });
  });
  addText(svg, "Similarity score", { x: (margin.left + width - margin.right) / 2, y: height - 2, "text-anchor": "middle", class: "chart-label" });

  rows.forEach((row, index) => {
    const y = margin.top + index * rowHeight + barGap / 2;
    const selected = row.comparison_city === state.selectedCity;
    addText(svg, row.comparison_city, { x: margin.left - 12, y: y + barHeight / 2 + 4, "text-anchor": "end", class: `chart-label ${selected ? "selected" : ""}` });
    const group = svgEl("g", { tabindex: "0", role: "button", "aria-label": `${row.comparison_city} similarity ${row.value.toFixed(1)}` }, svg);
    group.addEventListener("click", () => {
      state.selectedCity = row.comparison_city;
      updateAll();
    });
    group.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        state.selectedCity = row.comparison_city;
        updateAll();
      }
    });
    svgEl("rect", {
      x: margin.left,
      y,
      width: Math.max(2, x(row.value) - margin.left),
      height: barHeight,
      rx: 9,
      fill: scoreColor(row.value),
      stroke: selected ? "#111827" : "transparent",
      "stroke-width": selected ? 3 : 0,
      class: `rank-bar ${selected ? "selected" : ""}`
    }, group);
    addText(group, row.value.toFixed(1), { x: x(row.value) + 8, y: y + barHeight / 2 + 4, class: "chart-label" });
  });
}

function drawLineChart() {
  const svg = byId("lineSvg");
  const width = 690;
  const height = 320;
  const margin = { top: 18, right: 36, bottom: 42, left: 52 };
  clearSvg(svg, width, height);

  const rows = anomalyRows();
  if (!rows.length) {
    addText(svg, "No anomaly records available.", { x: width / 2, y: height / 2, "text-anchor": "middle", class: "chart-label" });
    return;
  }

  const maxY = Math.ceil(Math.max(...rawRecords.filter((record) => record.record_type === "annual_temp_anomaly").map((record) => record.value)) + 0.5);
  const x = scaleLinear([2020, 2100], [margin.left, width - margin.right]);
  const y = scaleLinear([0, maxY], [height - margin.bottom, margin.top]);

  [0, 1, 2, 3, 4, 5, 6].filter((tick) => tick <= maxY).forEach((tick) => {
    const ty = y(tick);
    svgEl("line", { x1: margin.left, x2: width - margin.right, y1: ty, y2: ty, class: "grid-line" }, svg);
    addText(svg, `${tick}°C`, { x: margin.left - 10, y: ty + 4, "text-anchor": "end", class: "chart-label" });
  });
  [2020, 2040, 2060, 2080, 2100].forEach((tick) => {
    const tx = x(tick);
    svgEl("line", { x1: tx, x2: tx, y1: height - margin.bottom, y2: height - margin.bottom + 6, stroke: "#a8b3c5" }, svg);
    addText(svg, String(tick), { x: tx, y: height - 14, "text-anchor": "middle", class: "chart-label" });
  });

  addText(svg, "Annual temperature anomaly", { x: margin.left, y: 14, class: "chart-label" });
  addText(svg, "Year", { x: (margin.left + width - margin.right) / 2, y: height - 2, "text-anchor": "middle", class: "chart-label" });

  const path = rows.map((row, index) => `${index === 0 ? "M" : "L"}${x(row.year)},${y(row.value)}`).join(" ");
  svgEl("path", { d: path, fill: "none", stroke: "#2563eb", "stroke-width": 4, "stroke-linecap": "round", "stroke-linejoin": "round" }, svg);

  const selected = nearestAnomaly();
  if (selected) {
    const sx = x(selected.year);
    const sy = y(selected.value);
    svgEl("line", { x1: sx, x2: sx, y1: margin.top, y2: height - margin.bottom, stroke: "#111827", "stroke-width": 2, "stroke-dasharray": "5 6", opacity: 0.75 }, svg);
    svgEl("circle", { cx: sx, cy: sy, r: 7, fill: "#ef7d31", stroke: "#111827", "stroke-width": 2 }, svg);
    svgEl("rect", { x: Math.min(sx + 12, width - 176), y: Math.max(18, sy - 42), width: 164, height: 34, rx: 11, fill: "#fff7ed", stroke: "#fed7aa" }, svg);
    addText(svg, `${selected.year}: ${selected.value.toFixed(2)}°C`, { x: Math.min(sx + 24, width - 164), y: Math.max(40, sy - 20), class: "chart-label" });
  }
}

function drawSeasonalChart() {
  const svg = byId("seasonalSvg");
  const width = 520;
  const height = 320;
  const margin = { top: 26, right: 28, bottom: 46, left: 48 };
  clearSvg(svg, width, height);

  const future = futureSeasonalRows();
  const comparison = comparisonSeasonalRows(state.selectedCity);
  if (!future.length || !comparison.length) {
    addText(svg, "Select a comparison city with seasonal data.", { x: width / 2, y: height / 2, "text-anchor": "middle", class: "chart-label" });
    return;
  }

  const futureBySeason = new Map(future.map((row) => [row.season, row.value]));
  const compBySeason = new Map(comparison.map((row) => [row.season, row.value]));
  const values = seasons.flatMap((season) => [futureBySeason.get(season), compBySeason.get(season)]).filter((value) => value !== undefined);
  const maxY = Math.ceil(Math.max(...values) + 2);
  const x0 = scaleLinear([0, seasons.length], [margin.left, width - margin.right]);
  const y = scaleLinear([0, maxY], [height - margin.bottom, margin.top]);
  const groupWidth = (width - margin.left - margin.right) / seasons.length;
  const barWidth = Math.min(34, groupWidth * 0.27);

  [0, 10, 20, 30].filter((tick) => tick <= maxY).forEach((tick) => {
    const ty = y(tick);
    svgEl("line", { x1: margin.left, x2: width - margin.right, y1: ty, y2: ty, class: "grid-line" }, svg);
    addText(svg, `${tick}°`, { x: margin.left - 10, y: ty + 4, "text-anchor": "end", class: "chart-label" });
  });

  seasons.forEach((season, index) => {
    const center = x0(index + 0.5);
    const futureValue = futureBySeason.get(season);
    const compValue = compBySeason.get(season);
    const futureH = y(0) - y(futureValue);
    const compH = y(0) - y(compValue);

    svgEl("rect", {
      x: center - barWidth - 4,
      y: y(futureValue),
      width: barWidth,
      height: futureH,
      rx: 8,
      fill: "#2563eb"
    }, svg);
    svgEl("rect", {
      x: center + 4,
      y: y(compValue),
      width: barWidth,
      height: compH,
      rx: 8,
      fill: "#ef7d31"
    }, svg);
    addText(svg, season, { x: center, y: height - 18, "text-anchor": "middle", class: "chart-label" });
    addText(svg, futureValue.toFixed(1), { x: center - barWidth / 2 - 4, y: y(futureValue) - 6, "text-anchor": "middle", class: "chart-label" });
    addText(svg, compValue.toFixed(1), { x: center + barWidth / 2 + 4, y: y(compValue) - 6, "text-anchor": "middle", class: "chart-label" });
  });

  addText(svg, "Seasonal mean temperature (°C)", { x: margin.left, y: 15, class: "chart-label" });
  const legendY = height - 310;
  svgEl("rect", { x: width - 204, y: legendY, width: 12, height: 12, rx: 3, fill: "#2563eb" }, svg);
  addText(svg, `San Diego ${profileName()}`, { x: width - 186, y: legendY + 11, class: "chart-label" });
  svgEl("rect", { x: width - 204, y: legendY + 20, width: 12, height: 12, rx: 3, fill: "#ef7d31" }, svg);
  addText(svg, `${state.selectedCity} today`, { x: width - 186, y: legendY + 31, class: "chart-label" });
}

function updateAll() {
  ensureSelectedCity();
  setButtonStates();
  updateSummary();
  drawMap();
  drawRanking();
  drawLineChart();
  drawSeasonalChart();
}

function boot() {
  if (!rawRecords.length) {
    byId("currentFinding").textContent = "Dataset did not load.";
    byId("currentDetail").textContent = "Check that data.js is present next to index.html.";
    return;
  }
  initControls();
  ensureSelectedCity();
  updateAll();
}

boot();
