<!--
Sync Impact Report (review scratch; remove before committing the constitution)
Version: unconfigured scaffold -> 1.0.0 (initial project constitution)
Principles: human action ownership; durable task data; quiet accessible interactions;
truthful agent state; focused changes with evidence.
Added sections: Product Constraints; Development Workflow; Governance.
Removed sections: none. Deferred placeholders: none.
Derived from the current README, storage contracts, and the user's feedback in this chat.
-->
# TinyTasks Constitution

## Core Principles

### I. Human Action Ownership

TinyTasks MUST hold actions and decisions for the human. Agents MUST keep their own execution
plans elsewhere, reuse existing tasks and lists where appropriate, and report write failures.
Only the user may accept or decline a proposed My Desk arrangement. A selected answer MUST NOT
be submitted until the user explicitly sends it.

### II. Durable, Portable Task Data

Task changes MUST preserve unrelated tasks, subtasks, notes, identifiers, and unknown metadata.
Archive operations MUST preserve the archived content and recover from interrupted writes.
Data migrations MUST document compatibility and recovery. Cloud folder synchronization MUST
NOT be represented as a cross-computer transaction lock. Tasks MUST survive daily desk expiry.

### III. Quiet, Accessible Interactions

The interface MUST remain usable with keyboard, pointer, narrow windows, and supported themes.
Removing visible tooltip noise MUST preserve accessible control names. Essential controls MUST
NOT depend solely on hover. Task interactions MUST NOT move the native window or unexpectedly
reset the user's reading position. Reduced-motion preferences MUST be respected.

### IV. Truthful Agent State

Planning, pending review, saved answers, and acknowledged answers MUST be distinct states backed
by actual events. A connection alone MUST NOT be described as active work. Interrupted work MUST
stop appearing active after a defined expiry. Automatic delivery or continuation MUST only be
claimed for an integration that has demonstrated it with the intended conversation.

### V. Focused Changes with Evidence

Each feature MUST have testable user outcomes, bounded scope, and recorded assumptions.
Validation MUST match the change: storage/protocol checks for durable behavior, rendered UI
checks for interaction, and native checks for native window behavior. A browser simulation MUST
NOT be claimed to verify native macOS or Windows behavior. Specifications MUST distinguish
requirements from implemented and tested functionality.

## Product Constraints

Preserve TinyTasks' small desktop-app scope and its Markdown task-file model. My Desk is a daily
arrangement of existing tasks; schedule times are separate from due dates and list membership.
Subtasks retain one level of nesting. Use the existing Rust/Tauri and vanilla JavaScript
architecture unless a separately justified implementation plan requires a change. New agent
contracts MUST state their compatibility behavior for existing clients.

## Development Workflow

Record the upstream baseline and Spec Kit version before creating specifications. Describe
user outcomes in each spec; keep source investigations and implementation choices in supporting
research or plans. Review requirement coverage and failure cases before implementation. Run
only the checks appropriate to actual changes and report untested platform behavior. Keep
runtime dependencies pinned during specification work; dependency upgrades are implementation
work with their own compatibility checks.

## Governance

This is the initial constitution for Spec Kit work in TinyTasks. Explicit user direction takes
precedence. Amendments MUST record the reason and affected specifications, with a major version
for incompatible principle changes, minor for new principles, and patch for clarifications.
Feature reviews MUST record any justified exception. This document creates no additional
approval gates beyond the user's requested scope.

**Version**: 1.0.0 | **Ratified**: 2026-11-20 | **Last Amended**: 2026-11-20
