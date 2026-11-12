"""Grover sobre 4 qubits (16 elementos): preimagen de un "hash" de juguete de 4 bits.

Muestra que la ventaja cuántica contra funciones hash es solo cuadrática
(~pi/4*sqrt(N) consultas frente a ~N/2 clásicas): por eso SHA3-256 sigue
siendo adecuado (seguridad de preimagen ~2^128 frente a Grover).
"""
from __future__ import annotations

import math

from qiskit import QuantumCircuit, transpile
from qiskit_aer import AerSimulator

from common import draw_text, now_iso, write_json

N_QUBITS = 4
TARGET = "1011"       # bitstring tal como lo reporta Qiskit (qubit 0 a la derecha)
SHOTS = 4096
MAX_K = 4


def oracle(n: int, target: str) -> QuantumCircuit:
    """Invierte la fase de |target>."""
    qc = QuantumCircuit(n, name="oráculo")
    zeros = [i for i, bit in enumerate(reversed(target)) if bit == "0"]
    if zeros:
        qc.x(zeros)
    qc.h(n - 1)
    qc.mcx(list(range(n - 1)), n - 1)
    qc.h(n - 1)
    if zeros:
        qc.x(zeros)
    return qc


def diffuser(n: int) -> QuantumCircuit:
    """Inversión respecto de la media: 2|s><s| - I."""
    qc = QuantumCircuit(n, name="difusor")
    qc.h(range(n))
    qc.x(range(n))
    qc.h(n - 1)
    qc.mcx(list(range(n - 1)), n - 1)
    qc.h(n - 1)
    qc.x(range(n))
    qc.h(range(n))
    return qc


def build_circuit(k: int, n: int = N_QUBITS, target: str = TARGET, boxed: bool = False) -> QuantumCircuit:
    qc = QuantumCircuit(n, n)
    qc.h(range(n))
    orc, dif = oracle(n, target), diffuser(n)
    for _ in range(k):
        if boxed:
            qc.append(orc.to_gate(), range(n))
            qc.append(dif.to_gate(), range(n))
        else:
            qc.barrier()
            qc.compose(orc, inplace=True)
            qc.barrier()
            qc.compose(dif, inplace=True)
    qc.barrier()
    qc.measure(range(n), range(n))
    return qc


def run() -> dict:
    n, big_n = N_QUBITS, 2 ** N_QUBITS
    sim = AerSimulator()
    theta = math.asin(1 / math.sqrt(big_n))
    iterations = []
    for k in range(MAX_K + 1):
        qc = build_circuit(k)
        counts = sim.run(transpile(qc, sim), shots=SHOTS).result().get_counts()
        iterations.append(
            {
                "k": k,
                "p_success": round(counts.get(TARGET, 0) / SHOTS, 6),
                "p_theory": round(math.sin((2 * k + 1) * theta) ** 2, 6),
                "counts": dict(sorted(counts.items())),
            }
        )
    optimal_k = max(iterations, key=lambda it: it["p_success"])["k"]
    return {
        "generated_at": now_iso(),
        "backend": "aer_simulator",
        "simulated": True,
        "n_qubits": n,
        "search_space": big_n,
        "shots": SHOTS,
        "target": TARGET,
        "circuit_text": draw_text(build_circuit(optimal_k, boxed=True)),
        "circuit_text_one_iteration": draw_text(build_circuit(1)),
        "iterations": iterations,
        "optimal_k": optimal_k,
        "optimal_k_theory": math.floor(math.pi / 4 * math.sqrt(big_n)),
        # Aproximación habitual N/2; el valor exacto de la búsqueda sin reposición es (N+1)/2 = 8,5.
        "classical_expected_queries": big_n / 2,
        "quantum_queries": round(math.pi / 4 * math.sqrt(big_n), 4),
        "interpretation": (
            "Grover solo da ventaja cuadrática: una preimagen de SHA3-256 costaría "
            "~2^128 evaluaciones cuánticas, inviable. Los hashes se mantienen."
        ),
    }


if __name__ == "__main__":
    data = run()
    print(write_json("grover.json", data))
    for it in data["iterations"]:
        print(it["k"], it["p_success"], it["p_theory"])
