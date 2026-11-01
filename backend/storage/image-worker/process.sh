#!/bin/sh
set -eu
magick /work/source -auto-orient -strip -resize '2560x2560>' -orient Undefined PNG:/work/working.png
magick /work/working.png -strip -resize '480x480>' -orient Undefined PNG:/work/thumbnail.png
