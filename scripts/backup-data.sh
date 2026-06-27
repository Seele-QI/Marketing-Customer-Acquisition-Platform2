#!/usr/bin/env bash
# 备份 /data 下的 SQLite 与关键目录（供 cron 或 PaaS 定时任务调用）
# 用法: ./scripts/backup-data.sh [DATA_DIR] [BACKUP_DIR]
set -euo pipefail

DATA_DIR="${1:-/data}"
BACKUP_DIR="${2:-./backups}"
STAMP="$(date +%Y%m%d_%H%M%S)"
DEST="${BACKUP_DIR}/agenthub_${STAMP}"

mkdir -p "$DEST"

if [[ -f "${DATA_DIR}/accounts.db" ]]; then
  sqlite3 "${DATA_DIR}/accounts.db" ".backup '${DEST}/accounts.db'" 2>/dev/null \
    || cp "${DATA_DIR}/accounts.db" "${DEST}/accounts.db"
  echo "Backed up accounts.db -> ${DEST}/accounts.db"
else
  echo "WARN: ${DATA_DIR}/accounts.db not found" >&2
fi

for sub in video-postprocess video-cache; do
  if [[ -d "${DATA_DIR}/${sub}" ]]; then
    tar -czf "${DEST}/${sub}.tar.gz" -C "$DATA_DIR" "$sub" 2>/dev/null || true
    echo "Archived ${sub} -> ${DEST}/${sub}.tar.gz"
  fi
done

find "$BACKUP_DIR" -maxdepth 1 -type d -name 'agenthub_*' -mtime +30 -exec rm -rf {} + 2>/dev/null || true
echo "Backup complete: $DEST"
