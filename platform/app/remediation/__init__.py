"""Textbook remediation pipelines, built on OmniIngest.

Importing this package registers the custom steps its pipeline YAMLs name.
OmniIngest resolves steps from a global registry populated by `register_step`,
so the modules have to be imported before a pipeline is built.

`omni-ingest` is installed from PyPI in the platform's Poetry environment
(`pyproject.toml`), the same as any other dependency.
"""

from app.remediation import (  # noqa: F401
    azure_mistral_ocr,
    postcorrect,
    remediate,
    render,
    safe_extract,
)
