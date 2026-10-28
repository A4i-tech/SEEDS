#!/usr/bin/env bash
git log --format=%s origin/a4i/main..origin/a4i/staging | sed -nE 's/.*\(#([0-9]+)\)$/\1/p'
