"""Use the same byte-preserving server for local previews and browser checks."""
from pathlib import Path
import sys


sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
sys.dont_write_bytecode = True
from serve import main

main()
