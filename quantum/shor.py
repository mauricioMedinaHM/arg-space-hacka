"""Shor (búsqueda de orden) para N=15, a=7 con 8 qubits de conteo.

Construcción de libro de texto: multiplicación modular controlada por
potencias de a (permutaciones con SWAP/X) + QFT inversa. Encuentra el
período r=4 y de ahí los factores 3 y 5. Ilustra por qué RSA/ECC caen
ante un computador cuántico tolerante a fallos, y por qué se firma con ML-DSA.
"""
from __future__ import annotations

import math
from fractions import Fraction

from qiskit import QuantumCircuit, transpile
from qiskit_aer import AerSimulator

from common import draw_text, now_iso, write_json

N = 15
A = 7
N_COUNT = 8
SHOTS = 2048


def c_amod15(a: int, power: int):
    """Compuerta controlada U^power con U|y> = |a*y mod 15>."""
    if a not in (2, 4, 7, 8, 11, 13):
        raise ValueError("a debe ser 2, 4, 7, 8, 11 o 13")
    u = QuantumCircuit(4)
    for _ in range(power):
        if a in (2, 13):
            u.swap(2, 3)
            u.swap(1, 2)
            u.swap(0, 1)
        if a in (7, 8):
            u.swap(0, 1)
            u.swap(1, 2)
            u.swap(2, 3)
        if a in (4, 11):
            u.swap(1, 3)
            u.swap(0, 2)
        if a in (7, 11, 13):
            u.x(range(4))
    gate = u.to_gate()
    gate.name = f"{a}^{power} mod 15"
    return gate.control()


def qft_dagger(n: int):
    qc = QuantumCircuit(n)
    for q in range(n // 2):
        qc.swap(q, n - q - 1)
    for j in range(n):
        for m in range(j):
            qc.cp(-math.pi / float(2 ** (j - m)), m, j)
        qc.h(j)
    gate = qc.to_gate()
    gate.name = "QFT†"
    return gate


def build_circuit(a: int = A, n_count: int = N_COUNT) -> QuantumCircuit:
    qc = QuantumCircuit(n_count + 4, n_count)
    qc.h(range(n_count))
    qc.x(n_count)  # registro de trabajo en |1>
    for q in range(n_count):
        qc.append(c_amod15(a, 2 ** q), [q] + [n_count + i for i in range(4)])
    qc.append(qft_dagger(n_count), range(n_count))
    qc.measure(range(n_count), range(n_count))
    return qc


def factors_from_period(a: int, r: int, n: int) -> list[int] | None:
    if r % 2 or pow(a, r, n) != 1:
        return None
    x = pow(a, r // 2, n)
    if x == n - 1:
        return None
    p, q = math.gcd(x - 1, n), math.gcd(x + 1, n)
    if p * q == n and 1 < p < n:
        return sorted([p, q])
    return None


def run() -> dict:
    qc = build_circuit()
    sim = AerSimulator()
    counts = sim.run(transpile(qc, sim), shots=SHOTS).result().get_counts()

    measured, votes = [], {}
    for bitstring, c in sorted(counts.items(), key=lambda kv: -kv[1]):
        phase = int(bitstring, 2) / 2 ** N_COUNT
        frac = Fraction(phase).limit_denominator(N)
        r_guess = frac.denominator
        valid = pow(A, r_guess, N) == 1
        measured.append(
            {
                "bitstring": bitstring,
                "decimal": int(bitstring, 2),
                "count": c,
                "phase": phase,
                "fraction": f"{frac.numerator}/{frac.denominator}",
                "r_guess": r_guess,
                "valid_period": valid,
            }
        )
        if valid and r_guess > 1:
            votes[r_guess] = votes.get(r_guess, 0) + c

    if not votes:
        raise RuntimeError("No se encontró un período válido")
    period = min(votes)  # el orden es el menor r con a^r = 1 (mod N)
    factors = factors_from_period(A, period, N)
    if factors is None:
        raise RuntimeError(f"El período {period} no produjo factores")

    return {
        "generated_at": now_iso(),
        "backend": "aer_simulator",
        "simulated": True,
        "N": N,
        "a": A,
        "n_count": N_COUNT,
        "n_qubits_total": qc.num_qubits,
        "shots": SHOTS,
        "circuit_text": draw_text(qc),
        "counts": dict(sorted(counts.items())),
        "measured_phases": measured,
        "period": period,
        "period_success_fraction": round(votes[period] / SHOTS, 4),
        "factors": factors,
        "classical_check": f"{A}^{period} mod {N} = {pow(A, period, N)}; "
        f"gcd({A}^{period // 2}-1,{N})={factors[0]}, gcd({A}^{period // 2}+1,{N})={factors[1]}",
        "interpretation": (
            "Shor resuelve factorización y logaritmo discreto en tiempo polinómico: "
            "RSA y ECDSA quedan rotos con un computador cuántico a escala. N=15 es un "
            "ejemplo de juguete simulado; por eso el recolector firma con ML-DSA-65."
        ),
    }


if __name__ == "__main__":
    data = run()
    print(write_json("shor.json", data))
    print("period:", data["period"], "factors:", data["factors"])
