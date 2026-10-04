import math
import time
import random
import itertools
from pathlib import Path
from typing import List, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

app = FastAPI(title="Matemática Computacional - TSP Held-Karp")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = BASE_DIR / "FrontEnd"

class MatrixGenerateRequest(BaseModel):
    n: int = Field(..., ge=5, le=15)
    min_cost: int = Field(1, ge=1)
    max_cost: int = Field(50, le=999)
    seed: Optional[int] = None

class MatrixValidateRequest(BaseModel):
    matrix: List[List[float]]

class TSPSolveRequest(BaseModel):
    matrix: List[List[float]]
    origin: int = Field(0, ge=0)

def get_node_labels(n: int) -> List[str]:
    alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    labels = []
    for i in range(n):
        if i < 26:
            labels.append(alphabet[i])
        else:
            labels.append(f"V{i+1}")
    return labels

def validate_matrix_structure(matrix: List[List[float]]) -> dict:
    errors = []
    warnings = []
    n = len(matrix)

    if n < 5 or n > 15:
        errors.append(f"El número de vértices n={n} debe cumplir 5 ≤ n ≤ 15.")

    for i in range(n):
        if len(matrix[i]) != n:
            errors.append(f"La fila {i+1} no tiene tamaño {n}.")

    if errors:
        return {"is_valid": False, "errors": errors, "warnings": warnings, "n": n}

    labels = get_node_labels(n)
    for i in range(n):
        if abs(matrix[i][i]) > 1e-6:
            errors.append(f"La diagonal principal en el nodo {labels[i]} (c[{i+1},{i+1}]) debe ser 0.")

    for i in range(n):
        for j in range(i + 1, n):
            val_ij = matrix[i][j]
            val_ji = matrix[j][i]

            if val_ij <= 0:
                errors.append(f"El costo {labels[i]} → {labels[j]} debe ser positivo (>0).")
            if val_ji <= 0:
                errors.append(f"El costo {labels[j]} → {labels[i]} debe ser positivo (>0).")
            if abs(val_ij - val_ji) > 1e-5:
                errors.append(f"La matriz no es simétrica entre {labels[i]} y {labels[j]}: {val_ij} ≠ {val_ji}.")

    return {
        "is_valid": len(errors) == 0,
        "errors": errors,
        "warnings": warnings,
        "n": n
    }

def solve_held_karp(matrix: List[List[float]], origin: int = 0):
    n = len(matrix)
    labels = get_node_labels(n)
    start_time = time.perf_counter()

    memo = {}
    memo[(1 << origin, origin)] = (0.0, None)
    dp_summary = []

    for size in range(2, n + 1):
        subproblems_count = 0
        for subset in itertools.combinations(range(n), size):
            if origin not in subset:
                continue
            
            mask = 0
            for node in subset:
                mask |= (1 << node)
            
            for u in subset:
                if u == origin:
                    continue
                
                prev_mask = mask ^ (1 << u)
                best_cost = float('inf')
                best_parent = None
                
                for v in subset:
                    if v == u:
                        continue
                    if (prev_mask, v) in memo:
                        cost = memo[(prev_mask, v)][0] + matrix[v][u]
                        if cost < best_cost:
                            best_cost = cost
                            best_parent = v
                
                if best_parent is not None:
                    memo[(mask, u)] = (best_cost, best_parent)
                    subproblems_count += 1

        dp_summary.append({
            "subset_size": size,
            "subproblems_count": subproblems_count
        })

    full_mask = (1 << n) - 1
    min_total_cost = float('inf')
    last_node = None

    for u in range(n):
        if u == origin:
            continue
        if (full_mask, u) in memo:
            cost = memo[(full_mask, u)][0] + matrix[u][origin]
            if cost < min_total_cost:
                min_total_cost = cost
                last_node = u

    curr_mask = full_mask
    curr_node = last_node
    middle_nodes = []

    while curr_node is not None and curr_node != origin:
        middle_nodes.append(curr_node)
        parent = memo.get((curr_mask, curr_node), (0, None))[1]
        curr_mask = curr_mask ^ (1 << curr_node)
        curr_node = parent

    middle_nodes.reverse()
    path = [origin] + middle_nodes + [origin]

    end_time = time.perf_counter()
    execution_time_ms = round((end_time - start_time) * 1000, 3)

    stages = []
    accumulated_cost = 0.0
    for i in range(len(path) - 1):
        u = path[i]
        v = path[i+1]
        leg_cost = matrix[u][v]
        accumulated_cost += leg_cost
        stages.append({
            "stage": i + 1,
            "from_index": u,
            "to_index": v,
            "from_label": labels[u],
            "to_label": labels[v],
            "leg_cost": round(leg_cost, 2),
            "accumulated_cost": round(accumulated_cost, 2)
        })

    brute_force_tours = math.factorial(n - 1) // 2 if n >= 3 else 1
    held_karp_ops = (n ** 2) * (2 ** n)

    return {
        "optimal_tour_indices": path,
        "optimal_tour_labels": [labels[idx] for idx in path],
        "total_cost": round(min_total_cost, 2),
        "stages": stages,
        "node_labels": labels,
        "execution_stats": {
            "n": n,
            "execution_time_ms": execution_time_ms,
            "brute_force_tours": brute_force_tours,
            "held_karp_ops": held_karp_ops
        },
        "dp_summary": dp_summary
    }

@app.get("/api/health")
def health_check():
    return {"status": "ok"}

@app.post("/api/matrix/generate")
def generate_matrix(req: MatrixGenerateRequest):
    if req.seed is not None:
        random.seed(req.seed)

    n = req.n
    matrix = [[0.0] * n for _ in range(n)]

    for i in range(n):
        for j in range(i + 1, n):
            val = float(random.randint(req.min_cost, req.max_cost))
            matrix[i][j] = val
            matrix[j][i] = val

    return {
        "n": n,
        "matrix": matrix,
        "labels": get_node_labels(n)
    }

@app.post("/api/matrix/validate")
def validate_matrix(req: MatrixValidateRequest):
    return validate_matrix_structure(req.matrix)

@app.post("/api/tsp/solve")
def solve_tsp(req: TSPSolveRequest):
    validation = validate_matrix_structure(req.matrix)
    if not validation["is_valid"]:
        raise HTTPException(status_code=400, detail={"errors": validation["errors"]})

    return solve_held_karp(req.matrix, origin=req.origin)

@app.get("/api/preset/theoretical-example")
def get_theoretical_example():
    matrix = [
        [0.0,  4.0,  8.0, 12.0,  7.0],
        [4.0,  0.0,  6.0,  9.0, 10.0],
        [8.0,  6.0,  0.0,  3.0, 11.0],
        [12.0, 9.0,  3.0,  0.0,  5.0],
        [7.0, 10.0, 11.0,  5.0,  0.0]
    ]
    labels = ["A", "B", "C", "D", "E"]
    return {
        "n": 5,
        "matrix": matrix,
        "labels": labels
    }

if FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
