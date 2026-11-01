"""Executa verificações independentes sem instalar dependências nem tocar no Foundry."""
from pathlib import Path
import os
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
task_temp = ROOT / ".tmp"
task_temp.mkdir(exist_ok=True)
env = dict(os.environ, PYTHONPATH=str(ROOT / "extractor"), PYTHONUTF8="1", TMP=str(task_temp), TEMP=str(task_temp))
commands = [
    [sys.executable, "-m", "unittest", "discover", "-s", "tests/python", "-v"],
    ["node", "--test", *[str(p) for p in sorted((ROOT / "tests/js").glob("*.test.mjs"))]],
]
for command in commands:
    result = subprocess.run(command, cwd=ROOT, env=env, check=False)
    if result.returncode:
        raise SystemExit(result.returncode)
print("Verificações independentes concluídas. Testes reais de Foundry: pendentes.")
