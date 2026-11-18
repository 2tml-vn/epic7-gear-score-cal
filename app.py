"""E7 Gear Sheet desktop launcher.

The interface lives in ``web/`` and is rendered inside a native WebView2
window.  State is persisted to a small JSON file under %APPDATA% so the
portable executable remembers the last gear and theme.
"""

import json
import os
import sys
from pathlib import Path

import webview

APP_NAME = "E7 Gear Sheet"
APP_DIR = Path(os.environ.get("APPDATA", str(Path.home()))) / "E7GearSheet"
STATE_FILE = APP_DIR / "state.json"


def resource_path(*parts: str) -> Path:
    """Resolve a bundled resource in both source and PyInstaller builds."""
    base = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))
    return base.joinpath(*parts)


class Api:
    """Small bridge exposed to JavaScript as window.pywebview.api."""

    def load_state(self):
        try:
            if STATE_FILE.exists():
                return json.loads(STATE_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
        return {}

    def save_state(self, state):
        try:
            APP_DIR.mkdir(parents=True, exist_ok=True)
            STATE_FILE.write_text(
                json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8"
            )
            return True
        except Exception:
            return False


def main() -> None:
    index = resource_path("web", "index.html")
    webview.create_window(
        APP_NAME,
        url=str(index),
        js_api=Api(),
        width=1320,
        height=900,
        min_size=(1080, 720),
        background_color="#090c11",
        text_select=True,
    )
    webview.start(debug="--debug" in sys.argv)


if __name__ == "__main__":
    main()
