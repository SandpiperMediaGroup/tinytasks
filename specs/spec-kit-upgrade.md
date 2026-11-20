# Spec Kit upgrade: 0.16.1.dev0 to 1.4.3

Compared on 2026-11-20 using the old installed source commit
`71125fc3461778b4df1b543bb4d365cab35e2763` (2026-08-05) and the stable 1.4.3 commit
`980b3d027f4bd7958c35f97f618d854b41320e3f` (release published 2026-11-19).
The old version is a development build, not exactly the later 0.16.1 release.

The core specification → plan → tasks → implementation approach remains. Most changes improve
workflow control, customization, integrations, and reliability around that process.

| Area | Meaningful changes | Practical effect |
| --- | --- | --- |
| Agent execution | Workflow steps gained reasoning-effort/context-size settings and mappings for Codex, Claude Code, and Copilot | More explicit control over how individual steps run |
| Workflow automation | Custom installable step types, a built-in GitHub step, and project-defined pipe functions | More automation can be represented within the workflow |
| Templates and presets | Consistent composed-template resolution, constitution templates resolved at use time, bounded Markdown section replacement | Layered customization is less likely to be skipped or replace unrelated sections |
| Integration maintenance | Generated skills record version provenance; installation/refresh fixes and rollback on failed init/upgrade | Easier to identify which instructions are installed and recover from failures |
| File/platform handling | Safer filesystem access, URL/catalog handling, Unicode and Windows encoding/path fixes | Fewer platform-specific failures and less risk of damaging configuration |
| Breaking change | Core taskstoissues was removed in 1.3.0 in favor of the GitHub extension | Workflows using that old core command need the extension |

Skills, extensions, presets, bundles, self-upgrade, and converge already existed in the old build.
They should not be described as entirely new features of this upgrade. The 1.0 version boundary
also is not by itself proof of a stricter compatibility guarantee; evaluate specific changes and
project artifacts.

For TinyTasks, the immediate benefit is current planning instructions and more reliable setup,
template composition, and integration tooling. Better plans still require source investigation,
clear requirements, and review. Updating the global CLI does not automatically refresh every
other repository's generated project skills; this TinyTasks repository was initialized at 1.4.3.

## Primary sources

- [Old build README](https://github.com/github/spec-kit/blob/71125fc3461778b4df1b543bb4d365cab35e2763/README.md): existing skills, workflows, customization, and self-upgrade.
- [0.16.2 release](https://github.com/github/spec-kit/releases/tag/v0.16.2): runtime constitution template resolution and template/script extension support.
- [1.1.0 release](https://github.com/github/spec-kit/releases/tag/v1.1.0): custom workflow step types and exact catalog release selection.
- [1.2.0 release](https://github.com/github/spec-kit/releases/tag/v1.2.0): built-in GitHub workflow step and scoped filesystem policy.
- [1.2.6 release](https://github.com/github/spec-kit/releases/tag/v1.2.6): composed spec templates and workflow/integration fixes.
- [1.3.0 release](https://github.com/github/spec-kit/releases/tag/v1.3.0): taskstoissues removal and workflow parsing changes.
- [1.4.0 release](https://github.com/github/spec-kit/releases/tag/v1.4.0): agent reasoning/context mapping, workflow functions, and filesystem handling.
- [1.4.2 release](https://github.com/github/spec-kit/releases/tag/v1.4.2): skill version provenance and task constraint guidance.
- [1.4.3 release](https://github.com/github/spec-kit/releases/tag/v1.4.3): transactional initialization/upgrade recovery, Markdown section replacement, and encoding/integration fixes.
