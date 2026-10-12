---
name: tasks
description: How tasks work in this repo — the .tasks/ folder, the task list in .tasks/TASKS.md, and the status markers agents must keep updated. Use whenever creating, picking up, or finishing a task.
---

# Tasks

## Where tasks live

1. One task per file, in `.tasks/`, named `NNN-short-slug.md` (zero-padded, next free number).
2. Each file starts with a `Status:` line carrying one of the markers below, then the title and sections: Context, Requirements, Acceptance criteria, Progress (dated notes at the bottom).
3. Never delete a finished task file. Completed tasks stay in the folder, marked `[DONE]`. Do not reorder, rename, or delete task files unless explicitly asked.

## The task list in .tasks/TASKS.md

4. `.tasks/TASKS.md` holds the task list: one line per task. Tasks must be ordered with latest added at the top of the list.
5. Each line is `- NNN [MARKER] Title`. The marker goes right after the task number, at the start of the line.
6. The `.tasks/TASKS.md` list is THE authoritative record of task state. Whenever the task file's `Status:` line changes — starting, finishing, handing off, superseding — its `.tasks/TASKS.md` line must change in the same edit. An agent that finds drift must fix it immediately.

## Status markers

7. `[TODO]` — not started (default for a new task).
8. `[IN_PROGRESS]` — an agent is actively working on it. Set this the moment you start.
9. `[DONE]` — complete, verified against the acceptance criteria.

## Picking the next task

10. Read `.tasks/TASKS.md`, the canonical list, and pick the lowest `NNN` whose status is `[TODO]`. **Exception:** if any task has `HIGH PRIORITY` in its status line, pick that one first regardless of NNN number.
11. Never start a `[DONE]` task, and never start an `[IN_PROGRESS]` task unless you are taking it over (see Progress log below).

## When to update

12. Creating a task → add the file in `.tasks/` and its line in `.tasks/TASKS.md`, both with `[TODO]`.
13. Starting work on a task → set `[IN_PROGRESS]` in the `.tasks/TASKS.md` list **and** in the task file's `Status:` line, in the same change, and add the first dated `## Progress` entry. Read the whole task file first (Context / Requirements / Acceptance criteria); ask for tokens if anything is unclear.
14. Finishing a task → verify the acceptance criteria, set `[DONE]` in both places, and add a short dated note to the task file's Progress section.
15. After a task is `[DONE]`, stop and report back to the user. Do not auto-continue into the next task in a loop — wait for an explicit order.

## Progress log (handoff record)

16. Keep the `## Progress` section updated as you work, not just at the start or end. Every meaningful step gets a short dated entry: what was done, current state, and what comes next.
17. If you run out of tokens mid-task, your last `## Progress` entry MUST state exactly where you left off and what the next agent should do. A replacement agent taking over an `[IN_PROGRESS]` task reads the `## Progress` log, sets `[IN_PROGRESS]` again, and appends a dated handoff entry saying it is continuing.

## Migrating a repo to .tasks/TASKS.md

18. If a repo using this skill still keeps its task list inside AGENTS.md as a `## Tasks` section, migrate it once:
    1. Create `.tasks/TASKS.md` and move the `## Tasks` content from AGENTS.md into it as the list body.
    2. Remove the `## Tasks` section from AGENTS.md. Leave AGENTS.md with a single pointer line to `.tasks/TASKS.md`.
    3. Keep every task's status marker identical during the move. Do not change any `[TODO]`, `[IN_PROGRESS]`, `[DONE]`, or `HIGH PRIORITY` state.
    4. Keep the ordering identical (latest added at the top).
