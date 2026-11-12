#!/bin/bash
# Capture one full screenshot set after the host load settles.
#   docs/design-review/tools/capture-set.sh site PORT OUT_DIR
#   docs/design-review/tools/capture-set.sh references OUT_DIR
set -euo pipefail
cd "$(dirname "$0")/../../.."
wait_load() { while awk '{exit !($1 > 10)}' /proc/loadavg; do sleep 20; done; }
wait_load
if [ "$1" = site ]; then
  rm -rf "$3"
  # One size at a time so a load spike between them can be waited out.
  for size in desktop mobile; do
    wait_load
    ONLY_SIZE=$size nice -n 10 node docs/design-review/tools/capture.mjs site "http://127.0.0.1:$2" /tmp/mz-review/data/tokens.json "$3"
  done
else
  nice -n 10 node docs/design-review/tools/capture.mjs references "$2"
fi
ls "${3:-$2}" | wc -l
