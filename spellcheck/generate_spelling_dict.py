import sys
import re
import argparse
from collections import Counter
from pathlib import Path

_REPO = Path(__file__).resolve().parent.parent
if str(_REPO / "py") not in sys.path:
    sys.path.insert(0, str(_REPO / "py"))

from tree_data_loader import resolve_data_dir, load_merged_skills


def extract_words(text):
    if not text:
        return []

    text = re.sub(r'\{\{[^}]*\}\}', '', text)
    text = re.sub(r'\[\[[^\]]*\]\]', '', text)

    words = re.findall(r'\b[a-zA-Z]+(?:[\'-][a-zA-Z]+)*\b', text)

    return [word.lower() for word in words if len(word) > 1]


def generate_dictionary(data_dir_arg, output_file, min_word_length=2, min_occurrences=1):
    data_dir = resolve_data_dir(data_dir_arg)
    print(f"Reading skills from: {data_dir}")

    rows = load_merged_skills(data_dir)
    print(f"Found {len(rows)} skills to process\n")

    all_words = []

    for row in rows:
        for key in ("description", "restriction", "skill_effect"):
            text = row.get(key) or ""
            if text:
                all_words.extend(extract_words(text))

    word_counts = Counter(all_words)

    filtered_words = {
        word: count
        for word, count in word_counts.items()
        if len(word) >= min_word_length and count >= min_occurrences
    }

    sorted_words = sorted(filtered_words.keys())

    print(f"Total words extracted: {len(all_words)}")
    print(f"Unique words found: {len(word_counts)}")
    print(
        f"Words after filtering (length >= {min_word_length}, "
        f"occurrences >= {min_occurrences}): {len(filtered_words)}"
    )
    print()

    output_path = Path(output_file)
    if not output_path.is_absolute() and not output_path.exists():
        script_dir = Path(__file__).parent
        output_path = script_dir / output_file

    output_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        with open(output_path, "w", encoding="utf-8") as f:
            for word in sorted_words:
                f.write(f"{word}\n")

        print(f"Dictionary saved to: {output_path.absolute()}")
        print(f"Total words written: {len(sorted_words)}")

        if filtered_words:
            print("\nMost common words:")
            for word, count in word_counts.most_common(10):
                if len(word) >= min_word_length:
                    print(f"  {word}: {count} occurrences")

    except Exception as e:
        print(f"Error writing dictionary file: {e}")
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(
        description="Generate spelling dictionary from tree_data skill text fields"
    )
    parser.add_argument(
        "data_dir",
        nargs="?",
        default=None,
        help="tree_data version folder (required), e.g. public/tree_data/2_12",
    )
    parser.add_argument(
        "--output",
        "-o",
        default="py/spelling-dict.txt",
        help="Output dictionary file path (default: py/spelling-dict.txt)",
    )
    parser.add_argument(
        "--min-length", type=int, default=2, help="Minimum word length (default: 2)"
    )
    parser.add_argument(
        "--min-occurrences",
        type=int,
        default=1,
        help="Minimum occurrences (default: 1)",
    )

    args = parser.parse_args()

    generate_dictionary(args.data_dir, args.output, args.min_length, args.min_occurrences)


if __name__ == "__main__":
    main()
