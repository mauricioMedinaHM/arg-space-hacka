"""Ejecuta QRNG, Grover y Shor en simuladores locales y escribe los JSON de la web."""
from __future__ import annotations

import json
import platform

import qiskit
import qiskit_aer

import grover
import qrng
import shor
from common import OUT_DIR, now_iso, write_json


def main() -> None:
    q, g, s = qrng.run(), grover.run(), shor.run()
    best = next(it for it in g["iterations"] if it["k"] == g["optimal_k"])
    try:
        import qiskit_ibm_runtime

        runtime_version = qiskit_ibm_runtime.__version__
    except Exception:
        runtime_version = None

    summary = {
        "generated_at": now_iso(),
        "qiskit_version": qiskit.__version__,
        "aer_version": qiskit_aer.__version__,
        "qiskit_ibm_runtime_version": runtime_version,
        "python_version": platform.python_version(),
        "backend": "aer_simulator",
        "simulated": True,
        "scripts": [
            {"script": "quantum/qrng.py", "output": "qrng.json",
             "description": "QRNG simulado (Hadamard + medición) que produce la semilla de 32 bytes de la clave ML-DSA-65 del recolector."},
            {"script": "quantum/grover.py", "output": "grover.json",
             "description": "Grover en 4 qubits: ventaja solo cuadrática contra preimágenes de hash; SHA3-256 se mantiene."},
            {"script": "quantum/shor.py", "output": "shor.json",
             "description": "Shor (búsqueda de orden) para N=15, a=7: por qué RSA/ECC no sobreviven y se usa ML-DSA."},
            {"script": "quantum/run_all.py", "output": "summary.json",
             "description": "Ejecuta todo y escribe los JSON en web/public/quantum/."},
        ],
        "highlights": {
            "qrng_seed_hex": q["seed_hex"],
            "qrng_entropy_bits_per_bit": q["entropy_bits_per_bit"],
            "qrng_p_value": q["p_value"],
            "qrng_noise_model": q["noise_model"].get("fake_backend"),
            "grover_target": g["target"],
            "grover_optimal_k": g["optimal_k"],
            "grover_p_success": best["p_success"],
            "shor_period": s["period"],
            "shor_factors": s["factors"],
        },
        "notes": [
            "Todo se ejecutó en simuladores locales (qiskit-aer). No se usó hardware real de IBM Quantum.",
            "Esto NO es QKD (distribución cuántica de claves): no hay canal cuántico ni intercambio de claves. La integridad de los datos la da la firma post-cuántica ML-DSA-65 (FIPS 204) sobre hashes SHA3-256.",
            "El QRNG es simulado: Aer usa un PRNG clásico por debajo, así que la semilla es pseudoaleatoria. Es una demostración didáctica del flujo QRNG -> semilla -> clave ML-DSA. En producción se usaría un QRNG de hardware certificado o el CSPRNG del sistema operativo.",
            "La semilla publicada en qrng.json es pública y solo sirve para la demo; una clave real nunca debe derivarse de una semilla publicada.",
            "El modelo de ruido (si está presente) proviene de un backend falso de qiskit-ibm-runtime: una calibración guardada localmente, sin conexión a IBM.",
            "Shor con N=15 es un ejemplo de juguete: romper RSA-2048 requiere millones de qubits físicos con corrección de errores, que hoy no existen. La amenaza práctica es 'cosechar ahora, falsificar/descifrar después', por eso se migra ya a criptografía post-cuántica.",
            "Grover solo ofrece aceleración cuadrática: SHA3-256 conserva ~128 bits de seguridad frente a preimágenes cuánticas; no hace falta reemplazar el hash.",
        ],
    }

    for name, data in (("qrng.json", q), ("grover.json", g), ("shor.json", s), ("summary.json", summary)):
        path = write_json(name, data)
        json.loads(path.read_text(encoding="utf-8"))  # validación
        print(f"OK {path} ({path.stat().st_size} bytes)")

    print(f"\nSalida: {OUT_DIR}")
    print(json.dumps(summary["highlights"], indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
