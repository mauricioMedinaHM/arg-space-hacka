"""QRNG simulado: Hadamard sobre n qubits + medición -> semilla de 32 bytes.

Demostración didáctica del flujo de un generador cuántico de números
aleatorios. Corre en AerSimulator (que por debajo usa un PRNG clásico):
NO es aleatoriedad cuántica real ni hardware de IBM.
"""
from __future__ import annotations

import math

from qiskit import QuantumCircuit, transpile
from qiskit_aer import AerSimulator

from common import draw_text, now_iso, write_json

N_QUBITS = 8
SHOTS = 4096          # 4096 disparos x 8 qubits = 32768 bits crudos
SEED_BITS = 256       # 32 bytes para la semilla ML-DSA


def build_circuit(n: int = N_QUBITS) -> QuantumCircuit:
    qc = QuantumCircuit(n, n, name="qrng")
    qc.h(range(n))
    qc.measure(range(n), range(n))
    return qc


def chi_square_uniform(counts: dict[str, int], n_qubits: int, shots: int) -> tuple[float, float, int]:
    """Chi-cuadrado contra la uniforme sobre los 2^n resultados posibles."""
    k = 2 ** n_qubits
    expected = shots / k
    observed = [counts.get(format(i, f"0{n_qubits}b"), 0) for i in range(k)]
    chi2 = sum((o - expected) ** 2 / expected for o in observed)
    dof = k - 1
    try:
        from scipy.stats import chi2 as chi2_dist

        p = float(chi2_dist.sf(chi2, dof))
    except Exception:  # aproximación de Wilson-Hilferty si no hay scipy
        z = ((chi2 / dof) ** (1 / 3) - (1 - 2 / (9 * dof))) / math.sqrt(2 / (9 * dof))
        p = 0.5 * math.erfc(z / math.sqrt(2))
    return float(chi2), p, dof


def analyze(memory: list[str], counts: dict[str, int], n_qubits: int) -> dict:
    shots = len(memory)
    raw_bits = "".join(memory)  # bits crudos en orden de disparo
    if len(raw_bits) < SEED_BITS:
        raise RuntimeError("No hay suficientes bits para la semilla")
    seed_hex = format(int(raw_bits[:SEED_BITS], 2), f"0{SEED_BITS // 4}x")
    assert len(seed_hex) == 64

    ones = raw_bits.count("1")
    p1 = ones / len(raw_bits)
    p0 = 1 - p1
    entropy = -sum(p * math.log2(p) for p in (p0, p1) if p > 0)
    chi2, p_value, dof = chi_square_uniform(counts, n_qubits, shots)
    return {
        "shots": shots,
        "counts": dict(sorted(counts.items())),
        "seed_hex": seed_hex,
        "total_random_bits": len(raw_bits),
        "seed_bits_used": SEED_BITS,
        "ones_fraction": round(p1, 6),
        "entropy_bits_per_bit": round(entropy, 6),
        "chi_square": round(chi2, 4),
        "chi_square_dof": dof,
        "p_value": round(p_value, 6),
    }


def run_on(backend, qc: QuantumCircuit, shots: int = SHOTS) -> dict:
    tqc = transpile(qc, backend)
    result = backend.run(tqc, shots=shots, memory=True).result()
    return analyze(result.get_memory(), result.get_counts(), qc.num_qubits)


def run_noisy(qc: QuantumCircuit) -> dict:
    """Mismo circuito con el modelo de ruido de un backend falso (sin red, sin IBM)."""
    try:
        from qiskit_ibm_runtime import fake_provider
    except Exception as exc:  # pragma: no cover
        return {"available": False, "reason": f"qiskit-ibm-runtime no disponible: {exc}"}

    last_error = "sin backends falsos"
    for name in ("FakeSherbrooke", "FakeBrisbane", "FakeKyiv", "FakeManilaV2"):
        cls = getattr(fake_provider, name, None)
        if cls is None:
            continue
        try:
            fake = cls()
            sim = AerSimulator.from_backend(fake)
            data = run_on(sim, qc)
            return {
                "available": True,
                "fake_backend": fake.name,
                "backend": f"aer_simulator(noise_model={fake.name})",
                "description": (
                    "Modelo de ruido local derivado de una calibración histórica del "
                    "backend falso; no se ejecutó nada en hardware de IBM."
                ),
                **data,
            }
        except Exception as exc:
            last_error = f"{name}: {exc}"
    return {"available": False, "reason": last_error}


def run() -> dict:
    qc = build_circuit()
    ideal = run_on(AerSimulator(), qc)
    return {
        "generated_at": now_iso(),
        "backend": "aer_simulator",
        "simulated": True,
        "n_qubits": N_QUBITS,
        "circuit_text": draw_text(qc),
        **ideal,
        "seed_derivation": (
            "Se concatenan los bitstrings por disparo (memory=True) en orden de "
            "ejecución y se toman los primeros 256 bits crudos -> 32 bytes en hex."
        ),
        "disclaimer": (
            "QRNG simulado: Aer usa un PRNG clásico. Demostración didáctica del flujo; "
            "en producción usar un QRNG de hardware certificado o el CSPRNG del SO."
        ),
        "noise_model": run_noisy(qc),
    }


if __name__ == "__main__":
    data = run()
    print(write_json("qrng.json", data))
    print("seed_hex:", data["seed_hex"])
