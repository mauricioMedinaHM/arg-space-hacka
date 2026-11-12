"""Verifica que los JSON publicados en web/public/quantum/ sean coherentes con lo que la web afirma.

No necesita Qiskit (solo la biblioteca estándar): recalcula las estadísticas a partir de los
conteos guardados y comprueba la aritmética de Grover y Shor. Sirve como prueba de regresión
después de regenerar los JSON con run_all.py.

    python verify_outputs.py        # sale con código 1 si alguna comprobación falla
"""
from __future__ import annotations

import json
import math
import sys
from fractions import Fraction
from pathlib import Path

OUT_DIR = Path(__file__).resolve().parent.parent / "web" / "public" / "quantum"
failures: list[str] = []


def check(cond: bool, msg: str) -> None:
    print(("ok   " if cond else "FALLA ") + msg)
    if not cond:
        failures.append(msg)


def close(a: float, b: float, tol: float) -> bool:
    return abs(a - b) <= tol


def load(name: str) -> dict:
    return json.loads((OUT_DIR / name).read_text(encoding="utf-8"))


def verify_qrng(q: dict) -> None:
    n, counts = q["n_qubits"], q["counts"]
    shots = sum(counts.values())
    check(shots == q["shots"], f"qrng: los conteos suman los disparos declarados ({shots})")
    check(all(len(k) == n and set(k) <= {"0", "1"} for k in counts), "qrng: bitstrings de n_qubits bits")
    expected = shots / 2**n
    chi2 = sum((counts.get(format(i, f"0{n}b"), 0) - expected) ** 2 / expected for i in range(2**n))
    check(close(chi2, q["chi_square"], 1e-3), f"qrng: chi-cuadrado recalculado = {chi2:.4f}")
    dof = 2**n - 1
    check(q.get("chi_square_dof", dof) == dof, f"qrng: {dof} grados de libertad")
    # p-valor por Wilson-Hilferty (suficiente con 255 g.l.) contra el publicado (scipy)
    z = ((chi2 / dof) ** (1 / 3) - (1 - 2 / (9 * dof))) / math.sqrt(2 / (9 * dof))
    p = 0.5 * math.erfc(z / math.sqrt(2))
    check(close(p, q["p_value"], 5e-3), f"qrng: p-valor ≈ {p:.4f} (publicado {q['p_value']})")
    check(0.001 < q["p_value"] < 0.999, "qrng: el p-valor no delata un sesgo evidente")
    ones = sum(k.count("1") * v for k, v in counts.items())
    p1 = ones / (shots * n)
    entropy = -sum(x * math.log2(x) for x in (p1, 1 - p1) if x > 0)
    check(close(entropy, q["entropy_bits_per_bit"], 1e-5), f"qrng: entropía de Shannon por bit = {entropy:.6f}")
    seed = q["seed_hex"]
    check(len(seed) == 64 and all(c in "0123456789abcdef" for c in seed), "qrng: seed_hex son 32 bytes en hex minúscula")
    check(shots * n >= 256, "qrng: hay al menos 256 bits crudos para la semilla")
    check(q.get("simulated") is True and "aer" in q["backend"], "qrng: marcado como simulado (Aer)")
    noisy = q.get("noise_model") or {}
    if noisy.get("available"):
        check(noisy["seed_hex"] != seed, "qrng: la semilla del modelo con ruido no es la de la clave")


def verify_grover(g: dict) -> None:
    n = g["n_qubits"]
    big_n = 2**n
    theta = math.asin(1 / math.sqrt(big_n))
    check(len(g["target"]) == n, "grover: el objetivo tiene n_qubits bits")
    best_k, best_p = -1, -1.0
    for it in g["iterations"]:
        k, shots = it["k"], sum(it["counts"].values())
        theory = math.sin((2 * k + 1) * theta) ** 2
        p = it["counts"].get(g["target"], 0) / shots
        check(close(p, it["p_success"], 1e-6), f"grover k={k}: p_success coincide con los conteos ({p:.4f})")
        if "p_theory" in it:
            check(close(theory, it["p_theory"], 1e-6), f"grover k={k}: p_theory = sin²((2k+1)θ) = {theory:.6f}")
        sigma = math.sqrt(max(theory * (1 - theory), 1e-9) / shots)
        check(abs(p - theory) <= 5 * sigma + 1e-9, f"grover k={k}: empírico a menos de 5σ del teórico")
        if p > best_p:
            best_k, best_p = k, p
    check(g["optimal_k"] == best_k, f"grover: optimal_k = {best_k} (máximo empírico)")
    check(best_k == math.floor(math.pi / 4 * math.sqrt(big_n)), "grover: el óptimo empírico coincide con ⌊π/4·√N⌋")
    check(close(g["quantum_queries"], math.pi / 4 * math.sqrt(big_n), 1e-3), "grover: quantum_queries = π/4·√N")
    check(g["classical_expected_queries"] == big_n / 2, "grover: classical_expected_queries = N/2 (aprox. de (N+1)/2)")
    after = next((it for it in g["iterations"] if it["k"] == best_k + 1), None)
    if after:
        check(after["p_success"] < best_p, "grover: pasarse del óptimo empeora el resultado")


def verify_shor(s: dict) -> None:
    big_n, a, r, n_count = s["N"], s["a"], s["period"], s["n_count"]
    check(math.gcd(a, big_n) == 1, f"shor: mcd({a}, {big_n}) = 1")
    check(pow(a, r, big_n) == 1 and all(pow(a, k, big_n) != 1 for k in range(1, r)), f"shor: {r} es el orden de {a} mod {big_n}")
    check(r % 2 == 0 and pow(a, r // 2, big_n) != big_n - 1, "shor: período par y a^(r/2) ≢ −1")
    x = a ** (r // 2)
    p, q = math.gcd(x - 1, big_n), math.gcd(x + 1, big_n)
    check(sorted([p, q]) == sorted(s["factors"]) and p * q == big_n, f"shor: mcd({x}∓1, {big_n}) = {p} y {q}; {p}·{q} = {big_n}")
    shots = sum(s["counts"].values())
    check(shots == s.get("shots", shots), "shor: los conteos suman los disparos declarados")
    seen = {}
    for m in s["measured_phases"]:
        bits = m["bitstring"]
        phase = int(bits, 2) / 2**n_count
        frac = Fraction(phase).limit_denominator(big_n)
        check(close(phase, m["phase"], 1e-12) and m["fraction"] == f"{frac.numerator}/{frac.denominator}", f"shor: {bits} → fase {m['fraction']}")
        check(m["r_guess"] == frac.denominator, f"shor: {bits} → r candidato {frac.denominator}")
        if "valid_period" in m:
            check(m["valid_period"] == (pow(a, frac.denominator, big_n) == 1), f"shor: {bits} → valid_period correcto")
        seen[bits] = s["counts"].get(bits, 0)
    # Con r | 2^n_count las fases ideales son exactamente s/r, equiprobables.
    ideal = {format(k * 2**n_count // r, f"0{n_count}b") for k in range(r)}
    check(set(s["counts"]) == ideal, f"shor: sólo aparecen las {r} fases s/{r}")
    sigma = math.sqrt(shots * (1 / r) * (1 - 1 / r))
    check(all(abs(c - shots / r) <= 5 * sigma for c in s["counts"].values()), "shor: las fases son equiprobables (5σ)")


def verify_summary(summary: dict, q: dict, g: dict, s: dict) -> None:
    h = summary.get("highlights", {})
    check(h.get("qrng_seed_hex") == q["seed_hex"], "summary: la semilla coincide con qrng.json")
    check(h.get("grover_optimal_k") == g["optimal_k"], "summary: optimal_k coincide con grover.json")
    check(h.get("shor_factors") == s["factors"], "summary: factores coinciden con shor.json")
    check(summary.get("simulated") is True, "summary: marcado como simulado")
    notes = " ".join(summary.get("notes", []))
    check("NO es QKD" in notes and "hardware real" in notes, "summary: las notas aclaran que no es QKD ni hardware real")


def main() -> int:
    q, g, s, summary = (load(f"{n}.json") for n in ("qrng", "grover", "shor", "summary"))
    verify_qrng(q)
    verify_grover(g)
    verify_shor(s)
    verify_summary(summary, q, g, s)
    print(f"\n{len(failures)} falla(s)")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
