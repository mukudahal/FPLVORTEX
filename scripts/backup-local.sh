#!/usr/bin/env bash
# Makes a full offline backup of the FPL VORTEX repository:
#   1. a mirror clone (every branch, tag and commit)
#   2. a single .bundle file that is easy to copy to Google Drive / a USB stick
#
# Usage:
#   bash scripts/backup-local.sh              # -> ~/FPLVORTEX-backups
#   bash scripts/backup-local.sh /Volumes/SSD # custom destination
#
# Requirements: git, plus gh (recommended) or a GitHub token in GITHUB_TOKEN.

set -euo pipefail

REPO_URL="${VORTEX_REPO_URL:-https://github.com/mukudahal/FPLVORTEX.git}"
DEST="${1:-$HOME/FPLVORTEX-backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
MIRROR="$DEST/FPLVORTEX-$STAMP.git"
BUNDLE="$DEST/FPLVORTEX-$STAMP.bundle"

command -v git >/dev/null 2>&1 || { echo "git is required."; exit 1; }
mkdir -p "$DEST"

# Authenticate for the private repo when gh is available.
if command -v gh >/dev/null 2>&1; then
  if gh auth status >/dev/null 2>&1; then
    gh auth setup-git >/dev/null 2>&1 || true
  else
    echo "Not logged in to GitHub. Run: gh auth login   (then re-run this script)"
    exit 1
  fi
fi

echo "Backing up $REPO_URL"
echo "  -> $MIRROR"
git clone --mirror --quiet "$REPO_URL" "$MIRROR"

echo "  -> $BUNDLE"
git -C "$MIRROR" bundle create "$BUNDLE" --all >/dev/null 2>&1

# Keep the 3 most recent snapshots of each kind.
ls -1dt "$DEST"/FPLVORTEX-*.git 2>/dev/null | tail -n +4 | xargs -r rm -rf
ls -1dt "$DEST"/FPLVORTEX-*.bundle 2>/dev/null | tail -n +4 | xargs -r rm -f

echo
echo "Backup complete:"
du -sh "$MIRROR" "$BUNDLE" 2>/dev/null || true
echo
echo "Restore with:"
echo "  git clone $MIRROR FPLVORTEX"
echo "  # or from the single file:"
echo "  git clone $BUNDLE FPLVORTEX"
