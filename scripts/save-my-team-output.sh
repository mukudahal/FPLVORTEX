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

files=(01-FPL-VORTEX-Lineup.png 02-FPL-VORTEX-Transfer-Roadmap.png
       03-FPL-VORTEX-Players-to-Consider.png 04-FPL-VORTEX-Caption-and-Hashtags.txt)
for file in "${files[@]}"; do test -s "$report_dir/$file"; done

tag=my-team-plan-current
releases="repos/$GH_REPO/releases"
matches=$(gh api "$releases?per_page=100" --paginate --jq '.[] | select(.tag_name == "my-team-plan-current")' | jq -sc .)
count=$(jq 'length' <<<"$matches")
case "$count" in
  0)
    release=$(gh api "$releases" --method POST -f tag_name="$tag" -F draft=true \
      -f name='My Team Planner · current files' \
      -f body='Download the three current PNGs and the caption separately from Assets.')
    ;;
  1) release=$(jq -c '.[0]' <<<"$matches") ;;
  *) echo 'Multiple planner releases found. No files were changed.' >&2; exit 1 ;;
esac
release_id=$(jq -er 'select(.draft == true) | .id | numbers' <<<"$release")
release_url=$(jq -er '.html_url | strings' <<<"$release")

# Validate all four uploads before replacing the previous set.
prefix="my-team-plan-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"
uploaded=()
finished=false
cleanup() {
  if [[ "$finished" == false ]]; then
    for id in "${uploaded[@]}"; do gh api --method DELETE "$releases/assets/$id" || true; done
  fi
}
trap cleanup EXIT
for file in "${files[@]}"; do
  name="$prefix-$file"
  mime=image/png
  if [[ "$file" == *.txt ]]; then mime=text/plain; fi
  asset=$(curl --fail-with-body --silent --show-error --max-time 180 \
    --request POST --header "Authorization: Bearer $GH_TOKEN" \
    --header "Content-Type: $mime" --data-binary "@$report_dir/$file" \
    "https://uploads.github.com/repos/$GH_REPO/releases/$release_id/assets?name=$name")
  size=$(wc -c < "$report_dir/$file")
  id=$(jq -er '.id | numbers' <<<"$asset")
  uploaded+=("$id")
  jq -e --arg name "$name" --argjson size "$size" \
    '.name == $name and .size == $size and .state == "uploaded"' <<<"$asset" >/dev/null
done
finished=true
echo "[Open the four separate planner files under Assets]($release_url)" >> "${GITHUB_STEP_SUMMARY:?GitHub summary path is required}"
older=$(gh api "$releases/$release_id/assets?per_page=100" --paginate \
  --jq '.[] | select(.name | test("^my-team-plan-[0-9]+-[0-9]+-[0-9][0-9]-FPL-VORTEX-[A-Za-z-]+[.](png|txt)$")) | .id')
while IFS= read -r id; do
  [[ -z "$id" || " ${uploaded[*]} " == *" $id "* ]] && continue
  [[ "$id" =~ ^[0-9]+$ ]]
  gh api --method DELETE "$releases/assets/$id"
done <<<"$older"
