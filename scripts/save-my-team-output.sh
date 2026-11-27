#!/usr/bin/env bash
set -euo pipefail

report_dir=${1:?Provide the planner report directory}
: "${GH_REPO:?GitHub repository is required}" "${GH_TOKEN:?GitHub token is required}"
: "${GITHUB_RUN_ID:?GitHub run ID is required}" "${GITHUB_RUN_ATTEMPT:?GitHub run attempt is required}"
[[ "$GITHUB_RUN_ID" =~ ^[0-9]+$ && "$GITHUB_RUN_ATTEMPT" =~ ^[0-9]+$ ]]
[[ "$GH_REPO" =~ ^[A-Za-z0-9-]+/[A-Za-z0-9._-]+$ ]]
[[ "$(gh api "repos/$GH_REPO" --jq .private)" == true ]] || {
  echo 'Planner output can only be saved in a private repository.' >&2
  exit 1
}

test -s "$report_dir/plan.md"
test -s "$report_dir/plan.json"
test -s "$report_dir/graphics/FPL_VORTEX_transfer_roadmap.png"
test -s "$report_dir/graphics/image-provenance.json"

tmp=$(mktemp -d)
trap 'rm -rf -- "$tmp"' EXIT
name="my-team-plan-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT.zip"
bundle="$tmp/$name"
(
  cd "$report_dir"
  zip -q "$bundle" plan.md plan.json graphics/*.png graphics/image-provenance.json
)
unzip -tq "$bundle" >/dev/null

tag=my-team-plan-current
releases="repos/$GH_REPO/releases"
matches=$(gh api "$releases?per_page=100" --paginate --jq '.[] | select(.tag_name == "my-team-plan-current")' | jq -sc .)
count=$(jq 'length' <<<"$matches")
case "$count" in
  0)
    release=$(gh api "$releases" --method POST -f tag_name="$tag" -F draft=true \
      -f name='My Team Planner · current files' \
      -f body='Download the current planner ZIP from Assets. The workflow replaces it after validating the new upload.')
    ;;
  1) release=$(jq -c '.[0]' <<<"$matches") ;;
  *) echo 'Multiple planner releases found. No files were changed.' >&2; exit 1 ;;
esac
release_id=$(jq -er 'select(.draft == true) | .id | numbers' <<<"$release")
release_url=$(jq -er '.html_url | strings' <<<"$release")

# Upload under a new name first so a failed transfer leaves the last ZIP available.
asset=$(curl --fail-with-body --silent --show-error --max-time 180 \
  --request POST --header "Authorization: Bearer $GH_TOKEN" \
  --header 'Content-Type: application/zip' --data-binary "@$bundle" \
  "https://uploads.github.com/repos/$GH_REPO/releases/$release_id/assets?name=$name")
size=$(wc -c < "$bundle")
asset_id=$(jq -er --arg name "$name" --argjson size "$size" \
  'select(.name == $name and .size == $size and .state == "uploaded") | .id | numbers' <<<"$asset")

# Report the saved download before pruning, so it remains findable if cleanup fails.
echo "[Download the current plan ZIP from Assets]($release_url)" >> "${GITHUB_STEP_SUMMARY:?GitHub summary path is required}"
older=$(gh api "$releases/$release_id/assets?per_page=100" --paginate \
  --jq '.[] | select(.name | test("^my-team-plan-[0-9]+-[0-9]+[.]zip$")) | .id')
while IFS= read -r id; do
  [[ -z "$id" || "$id" == "$asset_id" ]] && continue
  [[ "$id" =~ ^[0-9]+$ ]]
  gh api --method DELETE "$releases/assets/$id"
done <<<"$older"
