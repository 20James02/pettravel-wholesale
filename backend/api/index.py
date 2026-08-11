import os
import sys


# Vercel imports this module as the Python function entry point. Startup errors
# must fail the function instead of being exposed to public clients.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.main import app  # noqa: E402
