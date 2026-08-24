"""Textbook remediation pipelines, built on OmniIngest.

Importing this package registers the custom steps its pipeline YAMLs name.
OmniIngest resolves steps from a global registry populated by `register_step`,
so the modules have to be imported before a pipeline is built.

The `omni-ingest` dependency lives in the optional `remediation` Poetry group,
installed in the consumer tier only.
"""

from app.remediation import alt_translate, postcorrect, remediate, write_markdown  # noqa: F401
