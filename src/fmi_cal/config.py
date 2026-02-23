from pathlib import Path

import yaml

from .models import UserPreferences

CONFIG_DIR = Path.home() / ".config" / "fmi-cal"
CONFIG_FILE = CONFIG_DIR / "config.yaml"


def load_config() -> UserPreferences | None:
    """Load saved preferences. Return None if no config file exists."""
    if not CONFIG_FILE.exists():
        return None
    try:
        data = yaml.safe_load(CONFIG_FILE.read_text())
        if not isinstance(data, dict):
            return None
        return UserPreferences(
            spec_code=data["spec_code"],
            group=str(data["group"]),
            subgroup=str(data["subgroup"]) if data.get("subgroup") else None,
            include_types=data.get("include_types", ["Curs", "Seminar", "Laborator"]),
            excluded_subjects=data.get("excluded_subjects", []),
        )
    except (KeyError, yaml.YAMLError):
        return None


def save_config(prefs: UserPreferences) -> None:
    """Save preferences to YAML config file."""
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    data = {
        "spec_code": prefs.spec_code,
        "group": prefs.group,
        "subgroup": prefs.subgroup,
        "include_types": prefs.include_types,
        "excluded_subjects": prefs.excluded_subjects,
    }
    CONFIG_FILE.write_text(yaml.dump(data, default_flow_style=False, allow_unicode=True))
