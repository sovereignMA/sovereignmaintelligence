#!/bin/bash
# take-screenshots.sh
# Drives the user's logged-in Chrome to capture each app feature page,
# then crops to the content area and saves to public/img/screenshots/

BASE="https://sovereigncmd.xyz"
OUT="/Users/a1692/Downloads/svfinal/public/img/screenshots"
mkdir -p "$OUT"

# Pages to capture: slug, filename
declare -a PAGES=(
  "/command|command"
  "/pipeline|pipeline"
  "/intelligence|intelligence"
  "/scout|scout"
  "/analytics|analytics"
  "/vault|vault"
  "/comms|comms"
  "/mail|mail"
  "/campaigns|campaigns"
  "/agents|agents"
  "/upgrade|upgrade"
)

capture() {
  local URL="$1"
  local NAME="$2"
  local FILE="$OUT/${NAME}.png"

  echo "→ Capturing $URL"

  # Navigate Chrome to the page
  osascript <<APPLESCRIPT
tell application "Google Chrome"
  activate
  set theURL to "$URL"
  if (count of windows) = 0 then
    make new window
  end if
  set URL of active tab of front window to theURL
  delay 3
end tell
APPLESCRIPT

  # Wait for page to settle
  sleep 3

  # Take fullscreen screenshot, then crop to browser content area
  # Capture just the Chrome window
  TMPFILE="/tmp/sv_ss_${NAME}_full.png"
  osascript -e "tell application \"Google Chrome\" to activate"
  sleep 0.5
  screencapture -o -l $(osascript -e 'tell app "Google Chrome" to id of window 1') "$TMPFILE" 2>/dev/null || screencapture -o "$TMPFILE"

  # Crop: remove the browser chrome (top ~100px on Retina = 200px, nav bar = 56px)
  # Use sips to get dimensions then crop
  if [ -f "$TMPFILE" ]; then
    # Convert to proper resolution, crop top browser chrome, resize to 1280x800
    sips --resampleWidth 1280 "$TMPFILE" --out "$TMPFILE" 2>/dev/null
    HEIGHT=$(sips -g pixelHeight "$TMPFILE" 2>/dev/null | awk '/pixelHeight/{print $2}')
    # Crop away browser address bar area (approx 90px) to get content only
    sips --cropOffset 0 90 --cropToHeightWidth $((HEIGHT - 90)) 1280 "$TMPFILE" --out "$FILE" 2>/dev/null || cp "$TMPFILE" "$FILE"
    rm -f "$TMPFILE"
    echo "  ✓ Saved $FILE"
  else
    echo "  ✗ Screenshot failed for $NAME"
  fi
}

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Sovereign Screenshot Capture"
echo "Make sure you're logged in to sovereigncmd.xyz in Chrome"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

for entry in "${PAGES[@]}"; do
  IFS='|' read -r PATH NAME <<< "$entry"
  capture "${BASE}${PATH}" "$NAME"
  sleep 1
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Done! Screenshots saved to:"
echo "$OUT"
ls -la "$OUT"/*.png 2>/dev/null | awk '{print "  "$NF, $5}'
