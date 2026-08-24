"""OmniIngest's CLI with this package's steps registered.

    python -m app.remediation.run app/remediation/textbook_ocr.yaml \
        --input book.pdf --output run.json

OmniIngest's CLI has no plugin hook, so the steps a pipeline names must already
be in the registry when it is built — importing this package does that.
"""

from omni_ingest.cli import main

from app import remediation  # noqa: F401  registers the custom steps

if __name__ == "__main__":
    main()
