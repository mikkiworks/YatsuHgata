#!/bin/bash

set -e

HOST="sv17219.xserver.jp"
USER="xs821393"
PORT="10022"
KEY="$HOME/.ssh/xserver_deploy"

LOCAL_DIR="/Users/mikito/YatsuHigata"
REMOTE_DIR="yatsuhigata.com/public_html"

BACKUP_DIR="backups/yatsuhigata"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="yatsuhigata_${TIMESTAMP}.tar.gz"

cd "$LOCAL_DIR"

echo "=== Changed files ==="

CHANGED_FILES=$(git status --porcelain | awk '{print $2}')

if [ -z "$CHANGED_FILES" ]; then
  echo "No changed files."
  exit 0
fi

echo "$CHANGED_FILES"

echo "=== Backup start ==="

ssh -p "$PORT" \
  -i "$KEY" \
  "$USER@$HOST" \
  "mkdir -p '$BACKUP_DIR' && tar -czf '$BACKUP_DIR/$BACKUP_FILE' -C 'yatsuhigata.com' public_html"

echo "=== Backup completed: $BACKUP_FILE ==="

echo "=== Deploy start ==="

for FILE in $CHANGED_FILES
do
  # 公開不要ファイルは除外
  case "$FILE" in
    .git/*|.gitignore|.DS_Store|deploy.sh|jsconfig.json)
      echo "Skip: $FILE"
      continue
      ;;
  esac

  # 削除されたファイルはひとまずスキップ
  if [ ! -f "$FILE" ]; then
    echo "Skip deleted/non-file: $FILE"
    continue
  fi

  REMOTE_PATH="$REMOTE_DIR/$FILE"
  REMOTE_PARENT=$(dirname "$REMOTE_PATH")

  echo "Upload: $FILE"

  ssh -p "$PORT" \
    -i "$KEY" \
    "$USER@$HOST" \
    "mkdir -p '$REMOTE_PARENT'"

  sftp -P "$PORT" \
    -i "$KEY" \
    "$USER@$HOST" <<EOF
put "$LOCAL_DIR/$FILE" "$REMOTE_PATH"
bye
EOF

done

echo "=== Deploy completed ==="