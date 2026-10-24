# Install notes

Installed from https://github.com/nextlevelbuilder/ui-ux-pro-max-skill at commit
50d8a7de0900119855614541f15a1a616691eb33 (MIT licensed, see LICENSE), taken from that
commit's `.claude/skills/ui-ux-pro-max/` folder.

Differences from upstream:
1. SKILL.md: the 11 commands of the form
   `python "${CLAUDE_PLUGIN_ROOT}/.claude/skills/ui-ux-pro-max/scripts/search.py"` (Claude Code
   plugin layout) now read `python3 .claude/skills/ui-ux-pro-max/scripts/search.py`
   (project-relative; run from the project root), and the sentence introducing them was
   reworded to match. No other instruction text was changed.
2. Removed `scripts/tests/` (upstream developer test suite; nothing at runtime imports it).
3. Added LICENSE (copied from the upstream repo root) and this file.

Integrity: before the edit in item 1, every file other than LICENSE was byte-identical to the
reviewed upstream copy (tree SHA-256 d2dc779467c35bccc473f17eff149162ad5bbf3b5203d10161e34abdb0b1d111).

To uninstall, delete this folder (`.claude/skills/ui-ux-pro-max`).
