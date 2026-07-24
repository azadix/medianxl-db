"""Spellcheck skill text via existing checker."""

from __future__ import annotations

from pathlib import Path

from check_spelling import collect_spelling_errors


def test_no_spelling_errors(data_dir: Path, spellcheck_dicts):
    dict_files, ignore_files = spellcheck_dicts
    errors, _checked = collect_spelling_errors(
        str(data_dir),
        dict_files,
        ignore_files,
        quiet=True,
    )
    if errors:
        samples = []
        for entry in errors[:15]:
            words = sorted({e["word"] for e in entry["errors"]})
            samples.append(f"{entry['display_name']}: {', '.join(words)}")
        more = "" if len(errors) <= 15 else f"\n... and {len(errors) - 15} more skills"
        raise AssertionError(
            f"{len(errors)} skill(s) have unknown words:\n" + "\n".join(samples) + more
        )
