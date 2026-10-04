const API_BASE = "http://127.0.0.1:8000/api";

let state = {
    n: 5,
    mode: "auto",
    matrix: [],
    labels: [],
    nodeOffsets: [],
    solution: null,
    currentStep: 0,
    isPlaying: false,
    animTimer: null,
    animSpeed: 1000
};

function getLabels(n) {
    const alpha = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const labels = [];
    for (let i = 0; i < n; i++) {
        if (i < 26) labels.push(alpha[i]);
        else labels.push(`V${i + 1}`);
    }
    return labels;
}

function randomizeNodeOffsets(n) {
    state.nodeOffsets = Array.from({ length: n }, () => ({
        angleOffset: (Math.random() - 0.5) * 0.35,
        radiusOffset: (Math.random() - 0.5) * 45
    }));
}

document.addEventListener("DOMContentLoaded", () => {
    initEventListeners();
    setVertexCount(5);
    generateRandomMatrix();
});

function initEventListeners() {
    const slider = document.getElementById("vertices-slider");
    slider.addEventListener("input", (e) => {
        const val = parseInt(e.target.value);
        setVertexCount(val);
    });

    const speedSlider = document.getElementById("anim-speed-slider");
    speedSlider.addEventListener("input", (e) => {
        state.animSpeed = parseInt(e.target.value);
        if (state.isPlaying) {
            restartTimer();
        }
    });
}

function setVertexCount(n) {
    state.n = n;
    state.labels = getLabels(n);
    randomizeNodeOffsets(n);
    document.getElementById("n-val-display").innerText = n;
    document.getElementById("metric-node-count").innerText = n;

    if (state.mode === "auto") {
        generateRandomMatrix();
    } else {
        resizeMatrixKeepValues();
    }
}

function setMode(mode) {
    state.mode = mode;
    document.getElementById("btn-mode-auto").classList.toggle("active", mode === "auto");
    document.getElementById("btn-mode-manual").classList.toggle("active", mode === "manual");
    document.getElementById("auto-options").classList.toggle("hidden", mode !== "auto");
    document.getElementById("manual-options").classList.toggle("hidden", mode !== "manual");
}

function switchView(viewId) {
    document.querySelectorAll(".view-tab").forEach(tab => tab.classList.remove("active"));
    document.querySelectorAll(".view-section").forEach(sec => sec.classList.remove("active"));

    document.getElementById(`tab-${viewId}`).classList.add("active");
    document.getElementById(viewId).classList.add("active");

    if (viewId === "graph-view") {
        renderGraph();
    }
}

function generateRandomMatrix() {
    const minVal = parseInt(document.getElementById("min-cost-input").value) || 1;
    const maxVal = parseInt(document.getElementById("max-cost-input").value) || 20;

    const n = state.n;
    randomizeNodeOffsets(n);

    const mat = Array.from({ length: n }, () => Array(n).fill(0));

    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            const cost = Math.floor(Math.random() * (maxVal - minVal + 1)) + minVal;
            mat[i][j] = cost;
            mat[j][i] = cost;
        }
    }

    state.matrix = mat;
    state.solution = null;
    state.currentStep = 0;

    renderMatrixTable();
    validateMatrixLocally();
    renderGraph();
    solveTSP();
}

function resizeMatrixKeepValues() {
    const n = state.n;
    const oldMat = state.matrix;
    const newMat = Array.from({ length: n }, () => Array(n).fill(0));

    for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
            if (i === j) {
                newMat[i][j] = 0;
            } else if (i < oldMat.length && j < oldMat[i].length && oldMat[i][j] > 0) {
                newMat[i][j] = oldMat[i][j];
            } else {
                newMat[i][j] = 10;
            }
        }
    }

    state.matrix = newMat;
    renderMatrixTable();
    validateMatrixLocally();
    renderGraph();
}

function clearMatrixInputs() {
    const n = state.n;
    state.matrix = Array.from({ length: n }, () => Array(n).fill(0));
    state.solution = null;
    state.currentStep = 0;

    renderMatrixTable();
    validateMatrixLocally();
    renderGraph();
}

function renderMatrixTable() {
    const n = state.n;
    const labels = state.labels;
    const table = document.getElementById("matrix-table");

    let html = `<thead><tr><th></th>`;
    for (let j = 0; j < n; j++) {
        html += `<th>${labels[j]}</th>`;
    }
    html += `</tr></thead><tbody>`;

    for (let i = 0; i < n; i++) {
        html += `<tr><th>${labels[i]}</th>`;
        for (let j = 0; j < n; j++) {
            const isDiag = i === j;
            const val = state.matrix[i][j];
            const cellClass = isDiag ? "diag-cell" : "";

            html += `<td>
                <input type="number" 
                       id="cell-${i}-${j}" 
                       class="${cellClass}" 
                       value="${val}" 
                       min="0"
                       ${isDiag ? "disabled" : ""} 
                       oninput="onCellInput(${i}, ${j}, this.value)"
                       onfocus="highlightSymmetricCells(${i}, ${j})"
                       onblur="removeCellHighlights()">
            </td>`;
        }
        html += `</tr>`;
    }
    html += `</tbody>`;
    table.innerHTML = html;
}

function onCellInput(i, j, valueStr) {
    const val = parseFloat(valueStr) || 0;
    state.matrix[i][j] = val;

    const autoMirror = document.getElementById("chk-auto-mirror").checked;
    if (autoMirror && i !== j) {
        state.matrix[j][i] = val;
        const mirrorInput = document.getElementById(`cell-${j}-${i}`);
        if (mirrorInput) mirrorInput.value = val;
    }

    validateMatrixLocally();
    renderGraph();
}

function highlightSymmetricCells(i, j) {
    removeCellHighlights();
    const cell1 = document.getElementById(`cell-${i}-${j}`);
    const cell2 = document.getElementById(`cell-${j}-${i}`);
    if (cell1) cell1.classList.add("cell-highlight");
    if (cell2) cell2.classList.add("cell-highlight");
}

function removeCellHighlights() {
    document.querySelectorAll(".matrix-table input").forEach(inp => {
        inp.classList.remove("cell-highlight");
    });
}

function validateMatrixLocally() {
    const n = state.n;
    const labels = state.labels;
    const errors = [];

    document.querySelectorAll(".matrix-table input").forEach(inp => inp.classList.remove("cell-error"));

    for (let i = 0; i < n; i++) {
        if (state.matrix[i][i] !== 0) {
            errors.push(`Diagonal principal en ${labels[i]} debe ser 0.`);
        }
    }

    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            const v1 = state.matrix[i][j];
            const v2 = state.matrix[j][i];

            if (v1 <= 0) {
                errors.push(`Tramo ${labels[i]} → ${labels[j]} debe ser positivo.`);
                markCellError(i, j);
            }
            if (v2 <= 0) {
                errors.push(`Tramo ${labels[j]} → ${labels[i]} debe ser positivo.`);
                markCellError(j, i);
            }
            if (Math.abs(v1 - v2) > 1e-5) {
                errors.push(`Asimetría entre ${labels[i]} y ${labels[j]}: (${v1} vs ${v2}).`);
                markCellError(i, j);
                markCellError(j, i);
            }
        }
    }

    const statusBox = document.getElementById("validation-status-box");
    const statusTitle = document.getElementById("status-title");
    const statusDesc = document.getElementById("status-desc");
    const alertsContainer = document.getElementById("matrix-validation-alerts");

    if (errors.length === 0) {
        statusBox.className = "status-box status-valid";
        statusBox.querySelector(".status-icon").className = "fa-solid fa-circle-check status-icon";
        statusTitle.innerText = "Matriz Válida";
        statusDesc.innerText = `Matriz ${n}x${n} simétrica con diagonal nula y pesos positivos.`;
        alertsContainer.innerHTML = "";
        return true;
    } else {
        statusBox.className = "status-box status-error";
        statusBox.querySelector(".status-icon").className = "fa-solid fa-triangle-exclamation status-icon";
        statusTitle.innerText = `Error de Validación (${errors.length})`;
        statusDesc.innerText = errors[0];

        let alertHtml = "";
        errors.forEach(err => {
            alertHtml += `<div class="alert-item alert-danger"><i class="fa-solid fa-circle-exclamation"></i> ${err}</div>`;
        });
        alertsContainer.innerHTML = alertHtml;
        return false;
    }
}

function markCellError(i, j) {
    const inp = document.getElementById(`cell-${i}-${j}`);
    if (inp) inp.classList.add("cell-error");
}

async function loadTheoreticalExample() {
    setVertexCount(5);
    setMode("manual");

    try {
        const res = await fetch(`${API_BASE}/preset/theoretical-example`);
        if (res.ok) {
            const data = await res.json();
            state.matrix = data.matrix;
        } else {
            loadTheoreticalExampleFallback();
        }
    } catch (e) {
        loadTheoreticalExampleFallback();
    }

    renderMatrixTable();
    validateMatrixLocally();
    renderGraph();
    solveTSP();
}

function loadTheoreticalExampleFallback() {
    state.matrix = [
        [0.0, 4.0, 8.0, 12.0, 7.0],
        [4.0, 0.0, 6.0, 9.0, 10.0],
        [8.0, 6.0, 0.0, 3.0, 11.0],
        [12.0, 9.0, 3.0, 0.0, 5.0],
        [7.0, 10.0, 11.0, 5.0, 0.0]
    ];
}

async function solveTSP() {
    if (!validateMatrixLocally()) {
        alert("Corrige los errores en la matriz antes de resolver.");
        switchView("matrix-view");
        return;
    }

    let solution = null;

    try {
        const res = await fetch(`${API_BASE}/tsp/solve`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ matrix: state.matrix, origin: 0 })
        });

        if (res.ok) {
            solution = await res.json();
        } else {
            solution = solveHeldKarpClient(state.matrix);
        }
    } catch (e) {
        solution = solveHeldKarpClient(state.matrix);
    }

    state.solution = solution;
    state.currentStep = 0;
    pauseAnimation();

    updateSolutionUI();
    renderGraph();
    renderProcedureTable();
    renderDPSummary();
}

function solveHeldKarpClient(matrix, origin = 0) {
    const n = matrix.length;
    const labels = getLabels(n);
    const startTime = performance.now();

    const memo = new Map();
    memo.set(`${1 << origin}_${origin}`, { cost: 0, parent: null });

    const dpSummary = [];

    for (let size = 2; size <= n; size++) {
        let subproblemsCount = 0;
        const subsets = getCombinations(n, size, origin);

        for (const subset of subsets) {
            let mask = 0;
            for (const node of subset) mask |= (1 << node);

            for (const u of subset) {
                if (u === origin) continue;
                const prevMask = mask ^ (1 << u);

                let bestCost = Infinity;
                let bestParent = null;

                for (const v of subset) {
                    if (v === u) continue;
                    const prevEntry = memo.get(`${prevMask}_${v}`);
                    if (prevEntry) {
                        const cost = prevEntry.cost + matrix[v][u];
                        if (cost < bestCost) {
                            bestCost = cost;
                            bestParent = v;
                        }
                    }
                }

                if (bestParent !== null) {
                    memo.set(`${mask}_${u}`, { cost: bestCost, parent: bestParent });
                    subproblemsCount++;
                }
            }
        }

        dpSummary.push({
            subset_size: size,
            subproblems_count: subproblemsCount
        });
    }

    const fullMask = (1 << n) - 1;
    let minTotalCost = Infinity;
    let lastNode = null;

    for (let u = 0; u < n; u++) {
        if (u === origin) continue;
        const entry = memo.get(`${fullMask}_${u}`);
        if (entry) {
            const cost = entry.cost + matrix[u][origin];
            if (cost < minTotalCost) {
                minTotalCost = cost;
                lastNode = u;
            }
        }
    }

    let currMask = fullMask;
    let currNode = lastNode;
    const middleNodes = [];

    while (currNode !== null && currNode !== undefined && currNode !== origin) {
        middleNodes.push(currNode);
        const entry = memo.get(`${currMask}_${currNode}`);
        const parent = entry ? entry.parent : null;
        currMask = currMask ^ (1 << currNode);
        currNode = parent;
    }

    middleNodes.reverse();
    const path = [origin, ...middleNodes, origin];

    const endTime = performance.now();
    const executionTimeMs = (endTime - startTime).toFixed(3);

    const stages = [];
    let accumCost = 0;
    for (let i = 0; i < path.length - 1; i++) {
        const u = path[i];
        const v = path[i + 1];
        const legCost = matrix[u][v];
        accumCost += legCost;
        stages.push({
            stage: i + 1,
            from_index: u,
            to_index: v,
            from_label: labels[u],
            to_label: labels[v],
            leg_cost: legCost,
            accumulated_cost: accumCost
        });
    }

    function fact(k) {
        let r = 1;
        for (let i = 2; i <= k; i++) r *= i;
        return r;
    }

    return {
        optimal_tour_indices: path,
        optimal_tour_labels: path.map(idx => labels[idx]),
        total_cost: minTotalCost,
        stages: stages,
        node_labels: labels,
        execution_stats: {
            n: n,
            execution_time_ms: parseFloat(executionTimeMs),
            brute_force_tours: fact(n - 1) / 2,
            held_karp_ops: (n * n) * (1 << n)
        },
        dp_summary: dpSummary
    };
}

function getCombinations(n, k, mustInclude) {
    const results = [];
    function backtrack(start, combo) {
        if (combo.length === k) {
            if (combo.includes(mustInclude)) {
                results.push([...combo]);
            }
            return;
        }
        for (let i = start; i < n; i++) {
            combo.push(i);
            backtrack(i + 1, combo);
            combo.pop();
        }
    }
    backtrack(0, []);
    return results;
}

function updateSolutionUI() {
    const sol = state.solution;
    if (!sol) return;

    document.getElementById("metric-total-cost").innerText = sol.total_cost.toFixed(1);
    document.getElementById("metric-brute-force").innerText = sol.execution_stats.brute_force_tours.toLocaleString();
    document.getElementById("metric-held-karp").innerText = sol.execution_stats.held_karp_ops.toLocaleString();
    document.getElementById("metric-exec-time").innerText = sol.execution_stats.execution_time_ms;

    const pillContainer = document.getElementById("route-pill-container");
    let pillHtml = "";
    sol.optimal_tour_labels.forEach((lbl, idx) => {
        pillHtml += `<span class="route-node-tag">${lbl}</span>`;
        if (idx < sol.optimal_tour_labels.length - 1) {
            pillHtml += `<i class="fa-solid fa-chevron-right route-arrow"></i>`;
        }
    });
    pillContainer.innerHTML = pillHtml;

    document.getElementById("total-steps-num").innerText = sol.stages.length;
    document.getElementById("current-step-num").innerText = state.currentStep;
    updateLegInfoBox();
}

function updateLegInfoBox() {
    const sol = state.solution;
    const box = document.getElementById("current-leg-info");
    if (!sol || state.currentStep === 0) {
        box.innerHTML = `<p class="text-muted">Presiona 'Play' o usa los controles para animar la ruta paso a paso.</p>`;
        return;
    }

    const stage = sol.stages[state.currentStep - 1];
    box.innerHTML = `
        <div class="p-1">
            <span class="badge badge-tech mb-2">Etapa #${stage.stage} de ${sol.stages.length}</span>
            <p style="font-size: 1.05rem; margin-top:0.4rem;">
                Tramo: <strong>${stage.from_label} → ${stage.to_label}</strong>
            </p>
            <p class="text-muted" style="font-size: 0.88rem;">
                Costo del tramo: <span style="color:var(--accent-blue); font-weight:bold;">${stage.leg_cost}</span>
            </p>
            <p class="text-muted" style="font-size: 0.88rem;">
                Costo acumulado: <span style="color:var(--accent-green); font-weight:bold;">${stage.accumulated_cost}</span>
            </p>
        </div>
    `;
}

function renderGraph() {
    const svg = document.getElementById("graph-svg");
    const showWeights = document.getElementById("chk-show-weights").checked;
    const n = state.n;
    const labels = state.labels;
    const sol = state.solution;

    svg.innerHTML = "";

    const width = 600;
    const height = 450;
    const cx = width / 2;
    const cy = height / 2;
    const baseRadius = Math.min(width, height) * 0.36;

    if (state.nodeOffsets.length !== n) {
        randomizeNodeOffsets(n);
    }

    const nodePositions = [];
    for (let i = 0; i < n; i++) {
        const offset = state.nodeOffsets[i] || { angleOffset: 0, radiusOffset: 0 };
        const angle = (2 * Math.PI * i / n) - (Math.PI / 2) + offset.angleOffset;
        const r = baseRadius + offset.radiusOffset;
        const x = cx + r * Math.cos(angle);
        const y = cy + r * Math.sin(angle);
        nodePositions.push({ x, y, label: labels[i], index: i });
    }

    const activeTourEdges = new Map();
    if (sol && sol.optimal_tour_indices) {
        const path = sol.optimal_tour_indices;
        for (let s = 0; s < path.length - 1; s++) {
            const u = path[s];
            const v = path[s + 1];
            activeTourEdges.set(`${u}_${v}`, s + 1);
            activeTourEdges.set(`${v}_${u}`, s + 1);
        }
    }

    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            const p1 = nodePositions[i];
            const p2 = nodePositions[j];
            const cost = state.matrix[i][j];

            const edgeKey1 = `${i}_${j}`;
            const stepNum = activeTourEdges.get(edgeKey1);
            const isTourEdge = stepNum !== undefined;
            const isStepActive = isTourEdge && (state.currentStep >= stepNum);
            const isCurrentAnimStep = isTourEdge && (state.currentStep === stepNum);

            let strokeClass = "svg-edge";
            if (isCurrentAnimStep) strokeClass = "svg-edge-animating";
            else if (isStepActive) strokeClass = "svg-edge-active";

            const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
            line.setAttribute("x1", p1.x);
            line.setAttribute("y1", p1.y);
            line.setAttribute("x2", p2.x);
            line.setAttribute("y2", p2.y);
            line.setAttribute("class", strokeClass);
            svg.appendChild(line);

            if (showWeights || isStepActive) {
                const mx = (p1.x + p2.x) / 2;
                const my = (p1.y + p2.y) / 2;

                const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
                text.setAttribute("x", mx);
                text.setAttribute("y", my - 4);
                text.setAttribute("class", isStepActive ? "svg-edge-text svg-edge-text-active" : "svg-edge-text");
                text.textContent = cost;
                svg.appendChild(text);
            }
        }
    }

    nodePositions.forEach((pos) => {
        let isNodeVisited = false;
        let isCurrentNode = false;

        if (sol && sol.optimal_tour_indices && state.currentStep > 0) {
            const currentVisitedPath = sol.optimal_tour_indices.slice(0, state.currentStep + 1);
            isNodeVisited = currentVisitedPath.includes(pos.index);
            isCurrentNode = sol.optimal_tour_indices[state.currentStep] === pos.index;
        }

        const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        circle.setAttribute("cx", pos.x);
        circle.setAttribute("cy", pos.y);
        circle.setAttribute("r", 19);
        circle.setAttribute("class", isCurrentNode || isNodeVisited ? "svg-node-circle svg-node-active" : "svg-node-circle");
        svg.appendChild(circle);

        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("x", pos.x);
        text.setAttribute("y", pos.y);
        text.setAttribute("class", isCurrentNode || isNodeVisited ? "svg-node-text svg-node-text-active" : "svg-node-text");
        text.textContent = pos.label;
        svg.appendChild(text);
    });
}

function renderProcedureTable() {
    const sol = state.solution;
    const tbody = document.getElementById("procedure-table-body");
    if (!sol) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-muted">Ejecute el algoritmo.</td></tr>`;
        return;
    }

    let html = "";
    sol.stages.forEach((stg) => {
        const isActive = state.currentStep === stg.stage;
        const rowClass = isActive ? "active-step-row" : "";
        const statusBadge = state.currentStep >= stg.stage
            ? `<span class="badge badge-tech"><i class="fa-solid fa-check"></i> Evaluado</span>`
            : `<span class="badge" style="opacity:0.5;">Pendiente</span>`;

        html += `
            <tr class="${rowClass}" id="proc-row-${stg.stage}">
                <td><strong>#${stg.stage}</strong></td>
                <td><span class="route-node-tag">${stg.from_label}</span></td>
                <td><span class="route-node-tag">${stg.to_label}</span></td>
                <td>${stg.from_label} → ${stg.to_label}</td>
                <td><strong>${stg.leg_cost}</strong></td>
                <td><strong style="color:var(--accent-green);">${stg.accumulated_cost}</strong></td>
                <td>${statusBadge}</td>
            </tr>
        `;
    });
    tbody.innerHTML = html;
}

function renderDPSummary() {
    const sol = state.solution;
    const container = document.getElementById("dp-summary-container");
    if (!sol || !sol.dp_summary) {
        container.innerHTML = `<p class="text-muted p-3">Ejecute el solver para explorar los subproblemas.</p>`;
        return;
    }

    let html = "";
    sol.dp_summary.forEach((item) => {
        html += `
            <div class="dp-card">
                <div class="dp-card-title">Subconjuntos de ${item.subset_size} Vértices</div>
                <div class="dp-card-count">${item.subproblems_count}</div>
                <small class="text-muted">Estados calculados</small>
            </div>
        `;
    });
    container.innerHTML = html;
}

function togglePlayAnimation() {
    if (state.isPlaying) {
        pauseAnimation();
    } else {
        startAnimation();
    }
}

function startAnimation() {
    if (!state.solution) return;
    if (state.currentStep >= state.solution.stages.length) {
        state.currentStep = 0;
    }
    state.isPlaying = true;
    updatePlayIcon();
    restartTimer();
}

function pauseAnimation() {
    state.isPlaying = false;
    if (state.animTimer) clearInterval(state.animTimer);
    updatePlayIcon();
}

function restartTimer() {
    if (state.animTimer) clearInterval(state.animTimer);
    state.animTimer = setInterval(() => {
        if (!state.solution) return;
        if (state.currentStep < state.solution.stages.length) {
            state.currentStep++;
            stepChanged();
        } else {
            pauseAnimation();
        }
    }, state.animSpeed);
}

function prevStep() {
    pauseAnimation();
    if (state.currentStep > 0) {
        state.currentStep--;
        stepChanged();
    }
}

function nextStep() {
    pauseAnimation();
    if (state.solution && state.currentStep < state.solution.stages.length) {
        state.currentStep++;
        stepChanged();
    }
}

function resetAnimation() {
    pauseAnimation();
    state.currentStep = 0;
    stepChanged();
}

function stepChanged() {
    document.getElementById("current-step-num").innerText = state.currentStep;
    updateLegInfoBox();
    renderGraph();
    renderProcedureTable();
}

function updatePlayIcon() {
    const icon = document.getElementById("play-icon");
    if (state.isPlaying) {
        icon.className = "fa-solid fa-pause";
    } else {
        icon.className = "fa-solid fa-play";
    }
}


