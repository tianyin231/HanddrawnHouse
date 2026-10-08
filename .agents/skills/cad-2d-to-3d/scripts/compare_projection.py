#!/usr/bin/env python3
"""Compare same-scale 2D line projections and optionally write an overlay."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

try:
    import numpy as np
    from PIL import Image, ImageFilter
except ImportError as exc:  # pragma: no cover - environment-specific
    raise SystemExit(
        "compare_projection.py requires Pillow and numpy; install them in the active environment"
    ) from exc


def parse_crop(value: str | None) -> tuple[int, int, int, int] | None:
    if not value:
        return None
    parts = tuple(int(item.strip()) for item in value.split(","))
    if len(parts) != 4:
        raise argparse.ArgumentTypeError("crop must be left,top,right,bottom")
    return parts


def line_mask(image: Image.Image, threshold: int) -> np.ndarray:
    return np.asarray(image.convert("L"), dtype=np.uint8) < threshold


def otsu_threshold(image: Image.Image) -> int:
    """Choose a foreground/background split without assuming a white viewport."""
    values = np.asarray(image.convert("L"), dtype=np.uint8)
    histogram = np.bincount(values.ravel(), minlength=256).astype(np.float64)
    total = values.size
    weighted_total = float(np.dot(np.arange(256), histogram))
    background_weight = 0.0
    background_sum = 0.0
    best_variance = -1.0
    best_level = 0
    for level in range(256):
        background_weight += histogram[level]
        if background_weight == 0:
            continue
        foreground_weight = total - background_weight
        if foreground_weight == 0:
            break
        background_sum += level * histogram[level]
        background_mean = background_sum / background_weight
        foreground_mean = ((weighted_total - background_sum)
                           / foreground_weight)
        variance = (background_weight * foreground_weight
                    * (background_mean - foreground_mean) ** 2)
        if variance > best_variance:
            best_variance = variance
            best_level = level
    return min(255, best_level + 1)


def dilate(mask: np.ndarray, radius: int) -> np.ndarray:
    if radius <= 0:
        return mask
    size = radius * 2 + 1
    source = Image.fromarray((mask * 255).astype(np.uint8), mode="L")
    return np.asarray(source.filter(ImageFilter.MaxFilter(size)), dtype=np.uint8) > 0


def safe_ratio(numerator: int, denominator: int) -> float:
    return float(numerator / denominator) if denominator else 0.0


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Score two registered line drawings and create a red/blue overlay."
    )
    parser.add_argument("reference", type=Path)
    parser.add_argument("candidate", type=Path)
    parser.add_argument("--overlay", type=Path)
    parser.add_argument("--report", type=Path)
    parser.add_argument(
        "--threshold", type=int,
        help="Shared grayscale threshold; omit to choose an Otsu threshold per image",
    )
    parser.add_argument(
        "--tolerance-radius",
        type=int,
        default=4,
        help="Pixel radius used only for regression scoring (default: 4)",
    )
    parser.add_argument("--crop", help="Shared crop as left,top,right,bottom")
    args = parser.parse_args()

    crop = parse_crop(args.crop)
    reference = Image.open(args.reference).convert("RGB")
    candidate = Image.open(args.candidate).convert("RGB")
    if crop:
        reference = reference.crop(crop)
        candidate = candidate.crop(crop)
    if reference.size != candidate.size:
        raise SystemExit(
            f"images must already share scale and size: {reference.size} != {candidate.size}"
        )

    ref_threshold = args.threshold if args.threshold is not None else otsu_threshold(reference)
    cand_threshold = args.threshold if args.threshold is not None else otsu_threshold(candidate)
    ref_mask = line_mask(reference, ref_threshold)
    cand_mask = line_mask(candidate, cand_threshold)
    ref_near = dilate(ref_mask, args.tolerance_radius)
    cand_near = dilate(cand_mask, args.tolerance_radius)

    precision = safe_ratio(int((ref_near & cand_mask).sum()), int(cand_mask.sum()))
    recall = safe_ratio(int((cand_near & ref_mask).sum()), int(ref_mask.sum()))
    f1 = safe_ratio(2.0 * precision * recall, precision + recall)
    exact_overlap = int((ref_mask & cand_mask).sum())

    ref_coverage = safe_ratio(int(ref_mask.sum()), ref_mask.size)
    cand_coverage = safe_ratio(int(cand_mask.sum()), cand_mask.size)
    warnings = []
    if ref_coverage == 0 or ref_coverage > 0.5:
        warnings.append("reference mask coverage is implausible; inspect threshold/background")
    if cand_coverage == 0 or cand_coverage > 0.5:
        warnings.append("candidate mask coverage is implausible; inspect threshold/background")

    report = {
        "reference": str(args.reference),
        "candidate": str(args.candidate),
        "image_size_px": list(reference.size),
        "threshold": args.threshold if args.threshold is not None else "auto",
        "reference_threshold": ref_threshold,
        "candidate_threshold": cand_threshold,
        "tolerance_radius_px": args.tolerance_radius,
        "reference_line_pixels": int(ref_mask.sum()),
        "candidate_line_pixels": int(cand_mask.sum()),
        "reference_mask_coverage": ref_coverage,
        "candidate_mask_coverage": cand_coverage,
        "exact_overlap_pixels": exact_overlap,
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "interpretation": "Regression signal only; not dimensional or manufacturing accuracy.",
        "warnings": warnings,
    }

    if args.overlay:
        canvas = np.full((reference.height, reference.width, 3), 255, dtype=np.uint8)
        canvas[ref_mask] = (220, 45, 45)
        canvas[cand_mask] = (35, 90, 220)
        canvas[ref_mask & cand_mask] = (45, 45, 45)
        args.overlay.parent.mkdir(parents=True, exist_ok=True)
        Image.fromarray(canvas, mode="RGB").save(args.overlay)
        report["overlay"] = str(args.overlay)

    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
