#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <youtube_url> [output_dir] [whisper_model]"
  echo "Example: $0 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' ~/Downloads/yt-summaries medium"
  exit 1
fi

URL="$1"
OUT_DIR="${2:-$HOME/Downloads/yt-summaries}"
MODEL="${3:-medium}"

mkdir -p "$OUT_DIR"
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

STAMP="$(date +%Y%m%d-%H%M%S)"

# Get clean title for filenames
title="$(yt-dlp --print title --no-playlist "$URL" 2>/dev/null | head -n1)"
if [[ -z "$title" ]]; then
  title="youtube-video"
fi
safe_title="$(echo "$title" | tr '/:' '-' | tr -cd '[:alnum:] ._()-' | sed 's/  */ /g' | sed 's/^ *//;s/ *$//')"
base="$OUT_DIR/${STAMP} - ${safe_title}"

echo "[1/4] Downloading audio..."
yt-dlp -x --audio-format mp3 -o "$WORK_DIR/%(title)s.%(ext)s" "$URL" >/dev/null
AUDIO_FILE="$(find "$WORK_DIR" -type f \( -name '*.mp3' -o -name '*.m4a' -o -name '*.webm' \) | head -n1)"

if [[ -z "${AUDIO_FILE:-}" ]]; then
  echo "Could not find downloaded audio file"
  exit 1
fi

echo "[2/4] Transcribing with Whisper (model: $MODEL)..."
whisper "$AUDIO_FILE" \
  --model "$MODEL" \
  --output_dir "$WORK_DIR" \
  --output_format txt \
  --task transcribe \
  --language en >/dev/null

TRANSCRIPT="$(find "$WORK_DIR" -type f -name '*.txt' | head -n1)"
if [[ -z "${TRANSCRIPT:-}" ]]; then
  echo "Whisper transcript not found"
  exit 1
fi

cp "$TRANSCRIPT" "${base}.transcript.txt"

echo "[3/4] Summarizing transcript..."
summarize "${base}.transcript.txt" --length medium > "${base}.summary.md"

echo "[4/4] Done"
echo "Transcript: ${base}.transcript.txt"
echo "Summary:    ${base}.summary.md"
