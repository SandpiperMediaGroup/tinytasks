# Desktop and Storage Contract: Archive Empty Lists

## Read availability

Tauri command `get_empty_list_cleanup()` returns:

```json
{"eligible_names":["Later","Scratch"],"eligible_count":2}
```

It reads all stored task data and raw list sections. Names are exact destination identities,
aggregated across duplicate sections. No age/status filter or top-level-only count is permitted.
Personal's underlying empty-string key is excluded. Return current eligibility, not a cached
sidebar count. The preview is advisory and may be stale by invocation time.

## Apply

Tauri command `archive_empty_lists()` accepts no names or preview tokens; it recomputes the full
eligible set under the shared same-machine write lock. Before invoking, the UI finishes any active
text/new-task/list draft; on failure it keeps the editor and does not invoke cleanup.

Successful result:

```json
{"archived_names":["Later","Scratch"],"archived_count":2,"archive_path":"/chosen-folder/archive.md"}
```

No-op result has empty names and count zero; no active/archive write occurs. Return success only
after both journalled file replacements complete and journal cleanup succeeds. On failure, reject
with a concise recoverable error and preserve files/journal as appropriate. Do not report the
preview count as completed work. If interrupted recovery later completes the move, a retried
invocation can correctly return zero; it does not append the old sections a second time.

## Selection and transaction algorithm

1. Acquire the existing task writer lock; recover any prior ArchiveMove or stop on conflict.
2. Read active file once. Parse all tasks without UI/agent cutoffs; inspect raw sections with
   the existing comment/fence-aware scanner.
3. Select named identities with zero tasks across all matching sections. For malformed input
   that could obscure task detection, fail conservative validation instead of declaring it empty.
4. Build active_after by removing selected spans. Append selected raw spans to archive_after
   in original file order, preserving notes, whitespace, line endings, and unknown attributes.
5. Prepare metadata lifecycle changes before producing final after-images. Empty cleanup normally
   has no task metadata changes. Other archive operations must copy relevant sources into archive
   and preserve active response history, including question withdrawal from feature 004.
6. Write one journal containing complete before/after images for both files. Fail-closed atomic
   replacement is mandatory for journal and destinations; no in-place truncating fallback.
7. Write archive_after first, then active_after. Remove the journal after both succeed. Return
   actual selected names only now and emit tasks-changed.

Recovery compares both files against their before/after images. Either valid stage resumes the
same move without duplicate append. Any third-party contents preserve all material and surface a
conflict. This is same-computer serialization and recoverable two-file commit, not cross-device
atomicity or a guarantee against arbitrary cloud overwrites.

## Sidebar behavior

- Add an archive icon plus visible Archive empty lists label to blank-space and list-section
  menus. Individual list menus include this global action separated from Archive list/Delete list.
- A focusable list-section menu trigger supports Shift+F10 and ContextMenu. Name-scoped menus
  retain existing keyboard behavior; global menu focus returns to its trigger if still connected.
- Disable while querying/applying and when eligible_count is zero. If an enabled stale menu now
  has no candidates, show No empty lists without a confirmation dialog.
- After success refresh lists and tasks. Prune only returned archived_names from local icon/order
  preferences. If selectedChat is one of them, select All; otherwise preserve the active view.
- A local failure keeps navigation/preferences unchanged and displays the recoverable error.
- Proposed messages: “Archived 1 empty list.”, “Archived 3 empty lists.”, “No empty lists.”

## Fixture coverage

Test ordinary empty, notes-only, completed-only old history, child-only parsed recovery, duplicate
headings with a task in one section, Personal, fenced task examples, custom comments, CRLF,
file-unavailable failure, append failure, active replacement failure, journal deletion failure,
restart recovery, external edit conflict, stale preview, and repeated invocation. Validate exact
raw spans in archive and unaffected active bytes, not just counts.

Successful and no-op archives update navigation silently, without an in-flow notice. Errors remain visible. User refinement supersedes any earlier count-notification proposal.
