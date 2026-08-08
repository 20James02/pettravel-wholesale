---
name: antigravity-skills
description: "Guide for managing and using Antigravity Skills in the workspace. Use when creating, modifying, installing, or auditing Antigravity skills, rules, and configurations."
category: guidelines
risk: safe
source: local
version: "1.0.0"
tags: [antigravity, skills, configuration, rules, mcp]
---

# Google Antigravity Skills Management Guide

Antigravity Skills are modular packages of knowledge, workflows, and procedures designed to extend the agent's capabilities without cluttering its context window.

## Skill Folder Structure

A skill must be contained in a dedicated folder inside a customization root:
*   **Workspace Scope**: `<workspace-root>/.agents/skills/<skill-name>/`
*   **Global Scope**: `~/.gemini/antigravity/skills/<skill-name>/` (on Windows: `C:\Users\<username>\.gemini\antigravity\skills\<skill-name>\`)

```text
skills/<skill_name>/
├── SKILL.md          # Required: Main instruction file with YAML frontmatter
├── scripts/          # Optional: Helper scripts and automation utilities
├── examples/         # Optional: Sample implementations and code snippets
├── resources/        # Optional: Templates, schemas, or static assets
└── references/       # Optional: In-depth documentation or user manuals
```

## Main Instruction File (`SKILL.md`)

The `SKILL.md` must start with a YAML frontmatter block containing metadata fields:

```markdown
---
name: your-skill-name
description: >-
  Describe what the skill does and when the agent should use it.
  Example: "Use this skill when the user wants to audit their Docker container security."
version: 1.0.0
---

# Skill Title

Step-by-step instructions for the agent...
```

### Frontmatter Fields:
*   **`name`** (required): Unique lowercase, hyphenated string identifier.
*   **`description`** (required): Critical field read by the primary agent to decide whether to activate the skill for a user prompt.

## Best Practices

1.  **Progressive Disclosure**: Keep `SKILL.md` clean and concise. Put large references in the `references/` directory. The agent only reads them if needed.
2.  **Executable Helpers**: Place complex CLI commands into scripts under the `scripts/` directory so they can be run easily via `run_command`.
3.  **No Duplication**: Focus strictly on the unique procedures of your custom workflow.
4.  **Verification**: Include clear validation steps to confirm successful execution.
