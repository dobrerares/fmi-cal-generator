# FMI Calendar Generator

## Architecture
- Template-based UI: HTML skeleton in `templates/index.html.j2`, CSS in `templates/style.css`, JS in `templates/app.js`
- `scripts/generate_index.py` renders the Jinja2 template with CSS/JS inlined and dynamic data (file tree, timestamps)
- Generated output: `site/index.html` (single file for GitHub Pages)

## Development
- Activate venv: `source .venv/bin/activate`
- Generate site: `python scripts/generate_index.py`
- Run tests: `python -m pytest tests/`
- Local preview: `cd site && python -m http.server 8123`

## Git
- Solo project — commit and push directly to main
