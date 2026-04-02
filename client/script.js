const API_BASE = "https://healthcareai-y2ki.onrender.com/api";

const selectedChips = new Set();

const root = document.documentElement;
const themeBtn = document.getElementById("themeBtn");
const toggleLabel = document.getElementById("toggleLabel");
const chipContainer = document.getElementById("chipContainer");
const symptomInput = document.getElementById("symptomInput");
const ageGroup = document.getElementById("ageGroup");
const gender = document.getElementById("gender");
const stateInput = document.getElementById("state");
const townInput = document.getElementById("town");
const stateOptions = document.getElementById("stateOptions");
const townOptions = document.getElementById("townOptions");
const duration = document.getElementById("duration");
const analyzeBtn = document.getElementById("analyzeBtn");
const btnText = document.getElementById("btnText");
const btnSpinner = document.getElementById("btnSpinner");
const resultsCard = document.getElementById("resultsCard");
const historyCard = document.getElementById("historyCard");
const historyList = document.getElementById("historyList");
const clearHistoryBtn = document.getElementById("clearHistoryBtn");
const locationMap = typeof LOCATION_OPTIONS === "object" && LOCATION_OPTIONS ? LOCATION_OPTIONS : {};

initializeTheme();
initializeLocations();
bindEvents();
fetchHistory();

function initializeTheme() {
    const saved = localStorage.getItem("theme") || "light";
    applyTheme(saved);
}

function applyTheme(theme) {
    root.setAttribute("data-theme", theme);

    if (theme === "dark") {
        themeBtn.classList.add("is-dark");
        toggleLabel.textContent = "Light mode";
    } else {
        themeBtn.classList.remove("is-dark");
        toggleLabel.textContent = "Dark mode";
    }
}

function toggleTheme() {
    const current = root.getAttribute("data-theme");
    const next = current === "light" ? "dark" : "light";
    localStorage.setItem("theme", next);
    applyTheme(next);
}

function bindEvents() {
    themeBtn.addEventListener("click", toggleTheme);
    analyzeBtn.addEventListener("click", analyse);
    clearHistoryBtn.addEventListener("click", clearHistory);
    stateInput.addEventListener("input", handleStateChange);
    townInput.addEventListener("input", handleTownChange);

    chipContainer.addEventListener("click", (event) => {
        const chip = event.target.closest(".chip");
        if (!chip) return;

        const value = chip.dataset.val;
        if (selectedChips.has(value)) {
            selectedChips.delete(value);
            chip.classList.remove("selected");
            chip.setAttribute("aria-pressed", "false");
        } else {
            selectedChips.add(value);
            chip.classList.add("selected");
            chip.setAttribute("aria-pressed", "true");
        }
    });
}

function initializeLocations() {
    const states = Object.keys(locationMap).sort((a, b) => a.localeCompare(b));
    stateOptions.innerHTML = states.map((state) => `<option value="${state}"></option>`).join("");
    syncTownState("");
}

function normalizeSelection(value, options) {
    const normalizedValue = value.trim().toLowerCase();
    if (!normalizedValue) return "";

    return options.find((option) => option.toLowerCase() === normalizedValue) || "";
}

function syncTownState(stateValue) {
    const towns = stateValue ? (locationMap[stateValue] || []) : [];
    townOptions.innerHTML = towns
        .slice()
        .sort((a, b) => a.localeCompare(b))
        .map((town) => `<option value="${town}"></option>`)
        .join("");

    townInput.disabled = towns.length === 0;
    townInput.placeholder = towns.length === 0 ? "Select state first" : "Search town or city";
}

function handleStateChange() {
    const selectedState = normalizeSelection(stateInput.value, Object.keys(locationMap));

    if (selectedState) {
        if (stateInput.value !== selectedState) stateInput.value = selectedState;
        syncTownState(selectedState);

        const selectedTown = normalizeSelection(townInput.value, locationMap[selectedState] || []);
        if (townInput.value && !selectedTown) townInput.value = "";
        return;
    }

    syncTownState("");
    townInput.value = "";
}

function handleTownChange() {
    const selectedState = normalizeSelection(stateInput.value, Object.keys(locationMap));
    if (!selectedState) return;

    const selectedTown = normalizeSelection(townInput.value, locationMap[selectedState] || []);
    if (selectedTown && townInput.value !== selectedTown) {
        townInput.value = selectedTown;
    }
}

async function analyse() {
    const ageValue = ageGroup.value;
    const genderValue = gender.value;
    const stateValue = normalizeSelection(stateInput.value, Object.keys(locationMap)) || stateInput.value.trim();
    const townValue = stateValue
        ? (normalizeSelection(townInput.value, locationMap[stateValue] || []) || townInput.value.trim())
        : "";
    const durationValue = duration.value;

    let symptoms = symptomInput.value.trim();
    if (selectedChips.size > 0) {
        const chipSummary = [...selectedChips].join(", ");
        symptoms = symptoms ? `${symptoms}. Also reporting: ${chipSummary}` : chipSummary;
    }

    if (!symptoms) {
        symptomInput.style.borderColor = "var(--accent)";
        symptomInput.focus();
        window.setTimeout(() => { symptomInput.style.borderColor = ""; }, 1500);
        return;
    }

    setLoading(true);

    try {
        const response = await fetch(`${API_BASE}/analyse`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                symptoms,
                ageGroup: ageValue,
                gender: genderValue,
                state: stateValue,
                town: townValue,
                duration: durationValue,
            }),
        });

        const payload = await response.json();

        if (!response.ok || !payload.success) {
            renderError(payload.error || "Something went wrong. Please try again.");
            return;
        }

        renderResults(payload.data);
        fetchHistory();
    } catch (error) {
        renderError("Could not reach the server. Start it from the server folder with `npm start` or `npm run dev` on port 3001.");
    } finally {
        setLoading(false);
    }
}

function renderResults(result) {
    const conditionsHtml = result.conditions.map((condition) => {
        const level = String(condition.likelihood || "").toLowerCase();
        return `
            <article class="condition-item ${level}">
                <div class="condition-name">${condition.name}</div>
                <div class="condition-prob">${condition.likelihood} likelihood</div>
                <div class="condition-desc">${condition.description}</div>
            </article>`;
    }).join("");

    const stepsHtml = result.steps.map((step, index) => `
        <li class="step-item">
            <span class="step-num">${index + 1}</span>
            <span>${step}</span>
        </li>`
    ).join("");

    const urgentHtml = result.urgent ? `
        <div class="urgent-banner">
            <span>${result.urgentReason}</span>
        </div>` : "";

    const regionalHtml = result.regionalContext ? `
        <hr class="divider">
        <h3 class="section-title">Regional activity</h3>
        <div class="disclaimer">
            <span>${result.regionalContext}</span>
        </div>` : "";

    const sourcesHtml = Array.isArray(result.sources) && result.sources.length > 0 ? `
        <div class="sources-block">
            <h3 class="section-title">Search sources</h3>
            <div class="sources-list">
                ${result.sources.map((source) => `
                    <a class="source-link" href="${source.uri}" target="_blank" rel="noopener noreferrer">
                        <span class="source-icon" aria-hidden="true"></span>
                        <span class="source-text">${source.title || source.uri}</span>
                    </a>`).join("")}
            </div>
        </div>` : "";

    resultsCard.innerHTML = `
        <div class="disclaimer">
            <span>
                <strong>Educational disclaimer:</strong> These probable conditions and recommended countermeasures are AI-generated for educational awareness only. They do not constitute a medical diagnosis or treatment plan. Always consult a qualified healthcare professional before taking action.
            </span>
        </div>
        <h3 class="section-title">Possible conditions</h3>
        <div class="conditions-grid">${conditionsHtml}</div>
        <hr class="divider">
        <h3 class="section-title">Recommended next steps</h3>
        <ul class="steps-list">${stepsHtml}</ul>
        ${urgentHtml}
        ${regionalHtml}
        ${sourcesHtml}`;

    resultsCard.hidden = false;
    resultsCard.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderError(message) {
    resultsCard.innerHTML = `
        <div class="error-msg">
            <span>${message}</span>
        </div>`;
    resultsCard.hidden = false;
}

function setLoading(isLoading) {
    btnText.textContent = isLoading ? "Analysing..." : "Analyse symptoms";
    btnSpinner.hidden = !isLoading;
    analyzeBtn.disabled = isLoading;
}

async function fetchHistory() {
    try {
        const response = await fetch(`${API_BASE}/history?limit=5`);
        const payload = await response.json();

        if (!payload.success || payload.data.length === 0) {
            historyList.innerHTML = "";
            historyCard.hidden = true;
            return;
        }

        historyList.innerHTML = payload.data.map((entry) => `
            <button class="history-item" type="button" data-id="${entry.id}">
                <span class="history-main">
                    <span class="history-text">${truncate(entry.symptoms, 60)}</span>
                    <span class="history-time">${formatTime(entry.timestamp)}</span>
                </span>
                <span class="history-arrow" aria-hidden="true">&rsaquo;</span>
            </button>`
        ).join("");

        historyCard.hidden = false;

        historyList.querySelectorAll(".history-item").forEach((button) => {
            button.addEventListener("click", () => reloadHistory(button.dataset.id));
        });
    } catch (_) { }
}

async function clearHistory() {
    if (historyCard.hidden) return;

    clearHistoryBtn.disabled = true;

    try {
        const response = await fetch(`${API_BASE}/history`, { method: "DELETE" });
        const payload = await response.json();

        if (!response.ok || !payload.success) {
            renderError(payload.error || "Could not clear history right now.");
            return;
        }

        historyList.innerHTML = "";
        historyCard.hidden = true;
    } catch (_) {
        renderError("Could not clear history right now.");
    } finally {
        clearHistoryBtn.disabled = false;
    }
}

async function reloadHistory(id) {
    try {
        const response = await fetch(`${API_BASE}/history/${id}`);
        const payload = await response.json();
        if (!payload.success) return;
        symptomInput.value = payload.data.symptoms;
        ageGroup.value = payload.data.ageGroup || "";
        gender.value = payload.data.gender || "";
        duration.value = payload.data.duration || "";
        stateInput.value = payload.data.state || "";
        handleStateChange();
        townInput.value = payload.data.town || "";
        handleTownChange();
        renderResults(payload.data.result);
    } catch (_) { }
}

function truncate(value, length) {
    return value.length > length ? `${value.slice(0, length)}...` : value;
}

function formatTime(timestamp) {
    return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
