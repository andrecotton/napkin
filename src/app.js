const SAMPLE = `# Q4 estimate
sales = 120000
growth = 8%
projection = sales + growth

price = $8 times 5
fee = 8%
fee on price in eur

20 cm in inches
5kg in lb
30 celsius in fahrenheit
today + 3 weeks`;

const RATES = {
  usd: 1,
  eur: 0.92,
  gbp: 0.78,
  cad: 1.36,
  gtq: 7.78,
  mxn: 17.1,
  jpy: 157.2,
};

const UNITS = {
  length: {
    m: 1,
    meter: 1,
    meters: 1,
    cm: 0.01,
    centimeter: 0.01,
    centimeters: 0.01,
    inch: 0.0254,
    inches: 0.0254,
    in: 0.0254,
    ft: 0.3048,
    foot: 0.3048,
    feet: 0.3048,
    km: 1000,
    mi: 1609.344,
    mile: 1609.344,
    miles: 1609.344,
  },
  weight: {
    kg: 1,
    kilogram: 1,
    kilograms: 1,
    g: 0.001,
    gram: 0.001,
    grams: 0.001,
    lb: 0.45359237,
    lbs: 0.45359237,
    pound: 0.45359237,
    pounds: 0.45359237,
    oz: 0.0283495,
    ounce: 0.0283495,
    ounces: 0.0283495,
  },
  volume: {
    l: 1,
    liter: 1,
    liters: 1,
    ml: 0.001,
    cup: 0.236588,
    cups: 0.236588,
    gal: 3.78541,
    gallon: 3.78541,
    gallons: 3.78541,
  },
};

const state = {
  text: localStorage.getItem("napkin:text") || SAMPLE,
  theme: localStorage.getItem("napkin:theme") || "dark",
};

const editor = document.querySelector("#editor");
const rows = document.querySelector("#rows");
const status = document.querySelector("#status");

editor.value = state.text;
document.documentElement.classList.toggle("light", state.theme === "light");

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function highlight(line) {
  if (line.trim().startsWith("#")) return `<span class="comment">${escapeHtml(line)}</span>`;
  return escapeHtml(line)
    .replace(/\b([a-zA-Z_][\w]*)\b(?=\s*=)/g, '<span class="key">$1</span>')
    .replace(/\b(in|to|of|on|from now|today|next)\b/gi, '<span class="op">$1</span>')
    .replace(/\b(usd|eur|gbp|cad|gtq|mxn|jpy|cm|inch|inches|kg|lb|lbs|celsius|fahrenheit|weeks?|days?|hours?)\b/gi, '<span class="unit">$1</span>');
}

function niceNumber(value, digits = 2) {
  if (!Number.isFinite(value)) throw new Error("Not a number");
  const rounded = Math.abs(value) >= 100 ? value.toFixed(2) : value.toFixed(digits);
  return rounded.replace(/\.00$/, "").replace(/(\.\d*?)0+$/, "$1");
}

function formatDate(date) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function tokenize(input) {
  const tokens = [];
  const source = input
    .toLowerCase()
    .replace(/\$/g, "")
    .replace(/,/g, "")
    .replace(/\btimes\b/g, "*")
    .replace(/\bminus\b/g, "-")
    .replace(/\bplus\b/g, "+")
    .replace(/\bdivided by\b/g, "/");
  const re = /\s*([A-Za-z_]\w*|\d*\.?\d+%?|[()+\-*/=])\s*/g;
  let match;
  while ((match = re.exec(source))) tokens.push(match[1]);
  return tokens;
}

function createParser(tokens, variables, percentVariables) {
  let index = 0;
  const peek = () => tokens[index];
  const next = () => tokens[index++];

  function primary() {
    const token = next();
    if (!token) throw new Error("Expected value");
    if (token === "(") {
      const value = expression();
      if (next() !== ")") throw new Error("Missing closing parenthesis");
      return value;
    }
    if (token === "-") return -primary();
    if (/^\d*\.?\d+%$/.test(token)) return Number(token.slice(0, -1)) / 100;
    if (/^\d*\.?\d+$/.test(token)) return Number(token);
    if (Object.hasOwn(variables, token)) return variables[token];
    throw new Error(`Unknown reference: ${token}`);
  }

  function term() {
    let value = primary();
    while (peek() === "*" || peek() === "/") {
      const op = next();
      const right = primary();
      value = op === "*" ? value * right : value / right;
    }
    return value;
  }

  function expression() {
    let value = term();
    while (peek() === "+" || peek() === "-") {
      const op = next();
      const rightToken = peek();
      const right = term();
      if (rightToken?.endsWith("%") || percentVariables.has(rightToken)) {
        value = op === "+" ? value * (1 + right) : value * (1 - right);
      } else {
        value = op === "+" ? value + right : value - right;
      }
    }
    return value;
  }

  return {
    parse() {
      const value = expression();
      if (index < tokens.length) throw new Error("Could not parse full line");
      return value;
    },
  };
}

function evaluateMath(input, variables, percentVariables) {
  return createParser(tokenize(input), variables, percentVariables).parse();
}

function findUnit(unit) {
  const key = unit.toLowerCase();
  for (const [kind, entries] of Object.entries(UNITS)) {
    if (entries[key]) return { kind, factor: entries[key], unit: key };
  }
  return null;
}

function convertUnit(value, from, to) {
  const a = findUnit(from);
  const b = findUnit(to);
  if (!a || !b || a.kind !== b.kind) return null;
  return value * a.factor / b.factor;
}

function convertTemperature(value, from, to) {
  const a = from.toLowerCase();
  const b = to.toLowerCase();
  if (a.startsWith("c") && b.startsWith("f")) return value * 9 / 5 + 32;
  if (a.startsWith("f") && b.startsWith("c")) return (value - 32) * 5 / 9;
  return null;
}

function parseDateMath(line) {
  const text = line.toLowerCase().trim();
  const now = new Date();
  const next = text.match(/^next\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/);
  if (next) {
    const target = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"].indexOf(next[1]);
    const date = new Date(now);
    const diff = (target + 7 - date.getDay()) || 7;
    date.setDate(date.getDate() + diff);
    return formatDate(date);
  }
  const relative = text.match(/^(today|\d+\s+(minutes?|hours?|days?|weeks?|months?)(\s+from now)?)\s*(?:\+\s*(\d+)\s+(minutes?|hours?|days?|weeks?|months?))?$/);
  if (!relative) return null;
  const date = new Date(now);
  const additions = [];
  if (relative[1] !== "today") {
    const [, amount, unit] = relative[1].match(/(\d+)\s+(\w+)/);
    additions.push([Number(amount), unit]);
  }
  if (relative[4]) additions.push([Number(relative[4]), relative[5]]);
  for (const [amount, unit] of additions) {
    if (unit.startsWith("minute")) date.setMinutes(date.getMinutes() + amount);
    if (unit.startsWith("hour")) date.setHours(date.getHours() + amount);
    if (unit.startsWith("day")) date.setDate(date.getDate() + amount);
    if (unit.startsWith("week")) date.setDate(date.getDate() + amount * 7);
    if (unit.startsWith("month")) date.setMonth(date.getMonth() + amount);
  }
  return formatDate(date);
}

function evaluateSpecialNumber(input, variables, percentVariables) {
  const naturalPercent = input.match(/^(.+?)\s+(of|on)\s+(.+)$/i);
  if (naturalPercent) {
    const pct = evaluateMath(naturalPercent[1], variables, percentVariables);
    const base = evaluateMath(naturalPercent[3], variables, percentVariables);
    return naturalPercent[2].toLowerCase() === "on" ? base + base * pct : base * pct;
  }
  return evaluateMath(input, variables, percentVariables);
}

function evaluateLine(line, variables, percentVariables) {
  const raw = line.trim();
  if (!raw || raw.startsWith("#")) return { result: "" };

  const dateResult = parseDateMath(raw);
  if (dateResult) return { result: dateResult };

  const percent = raw.match(/^(.+?)\s+(\d*\.?\d+)%\s+(of|on)\s+(.+)$/i);
  if (percent) {
    const left = evaluateMath(percent[1], variables, percentVariables);
    const pct = Number(percent[2]) / 100;
    const base = evaluateMath(percent[4], variables, percentVariables);
    return { result: niceNumber(percent[3].toLowerCase() === "on" ? base + base * pct : left * pct) };
  }

  const conversion = raw.match(/^(.+?)\s+(?:in|to)\s+([a-zA-Z]+)$/i);
  if (conversion) {
    const target = conversion[2].toLowerCase();
    const source = conversion[1].trim();
    const currency = source.match(/^(.+?)\s*(usd|eur|gbp|cad|gtq|mxn|jpy)$/i);
    if (currency && RATES[target]) {
      const value = evaluateSpecialNumber(currency[1], variables, percentVariables);
      const from = currency[2].toLowerCase();
      return { result: `${niceNumber(value / RATES[from] * RATES[target])} ${target.toUpperCase()}` };
    }
    if (RATES[target]) {
      const value = evaluateSpecialNumber(source, variables, percentVariables);
      return { result: `${niceNumber(value * RATES[target])} ${target.toUpperCase()}` };
    }
    const unit = source.match(/^(.+?)\s*(cm|m|km|inch|inches|ft|feet|mi|kg|g|lb|lbs|oz|l|ml|cup|cups|gal|celsius|fahrenheit)$/i);
    if (unit) {
      const value = evaluateMath(unit[1], variables, percentVariables);
      const temp = convertTemperature(value, unit[2], target);
      const converted = temp ?? convertUnit(value, unit[2], target);
      if (converted !== null) return { result: `${niceNumber(converted)} ${target}` };
    }
  }

  const assignment = raw.match(/^([a-zA-Z_]\w*)\s*=\s*(.+)$/);
  if (assignment) {
    const key = assignment[1].toLowerCase();
    const value = evaluateMath(assignment[2], variables, percentVariables);
    variables[key] = value;
    if (/^\s*\d*\.?\d+%\s*$/.test(assignment[2])) percentVariables.add(key);
    return { result: assignment[2].includes("%") && value <= 1 ? `${niceNumber(value * 100)} %` : niceNumber(value) };
  }

  return { result: niceNumber(evaluateSpecialNumber(raw, variables, percentVariables)) };
}

function render() {
  const variables = {};
  const percentVariables = new Set();
  const lines = editor.value.split("\n");
  rows.innerHTML = lines.map((line) => {
    try {
      const { result } = evaluateLine(line, variables, percentVariables);
      return `<div class="row"><div class="source">${highlight(line) || "&nbsp;"}</div><div class="result">${escapeHtml(result)}</div></div>`;
    } catch (error) {
      return `<div class="row error" title="${escapeHtml(error.message)}"><div class="source">${highlight(line) || "&nbsp;"}</div><div class="result"></div></div>`;
    }
  }).join("");
}

function save() {
  localStorage.setItem("napkin:text", editor.value);
  status.textContent = "Saved locally";
}

let saveTimer;
editor.addEventListener("input", () => {
  status.textContent = "Editing";
  render();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 180);
});

editor.addEventListener("scroll", () => {
  rows.scrollTop = editor.scrollTop;
  rows.scrollLeft = editor.scrollLeft;
});

document.querySelector("#themeToggle").addEventListener("click", () => {
  state.theme = state.theme === "light" ? "dark" : "light";
  localStorage.setItem("napkin:theme", state.theme);
  document.documentElement.classList.toggle("light", state.theme === "light");
});

document.querySelector("#newDoc").addEventListener("click", () => {
  editor.value = "";
  editor.focus();
  render();
  save();
});

document.querySelector("#exportText").addEventListener("click", () => {
  const blob = new Blob([editor.value], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement("a"), { href: url, download: "napkin.txt" });
  link.click();
  URL.revokeObjectURL(url);
});

window.addEventListener("keydown", (event) => {
  const mod = event.metaKey || event.ctrlKey;
  if (mod && event.key.toLowerCase() === "n") {
    event.preventDefault();
    document.querySelector("#newDoc").click();
  }
  if (mod && event.key.toLowerCase() === "s") {
    event.preventDefault();
    document.querySelector("#exportText").click();
  }
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js"));
}

render();
