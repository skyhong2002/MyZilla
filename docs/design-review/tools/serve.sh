#!/bin/bash
# Serve one interface build against a fresh copy of the seeded review database.
#   docs/design-review/tools/serve.sh PORT WEB_ROOT NAME
# The copy lives in /tmp/mz-review/data/NAME.sqlite; the process id in NAME.pid.
set -euo pipefail
port=$1 web=$2 name=$3
data=/tmp/mz-review/data
cp "$data/seed.sqlite" "$data/$name.sqlite"
rm -f "$data/$name.sqlite-wal" "$data/$name.sqlite-shm"
cd "$(dirname "$0")/../../.."
MYZILLA_DB="$data/$name.sqlite" MYZILLA_TOKEN=design-review-master-token-0123456789abcdef \
  MYZILLA_WEB_ROOT="$web" PORT="$port" HOST=127.0.0.1 \
  nice -n 10 node --import tsx src/index.ts >"$data/$name.log" 2>&1 &
echo $! >"$data/$name.pid"
for _ in $(seq 60); do
  curl -sf "http://127.0.0.1:$port/health" >/dev/null && exit 0
  sleep 0.3
done
echo "server $name did not start" >&2
exit 1
