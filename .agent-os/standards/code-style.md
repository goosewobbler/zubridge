# Code Style Guide

**Version:** 1.1.0  
**Last Updated:** 2024-12-19

## Context

Global code style rules for Agent OS projects. **All formatting is handled by Biome 2.x** - this guide covers conventions and patterns that complement Biome's automated formatting.

## Biome Configuration

All projects use Biome 2.x for consistent formatting and linting. The configuration includes:

- **Formatter**: 2-space indentation, 100-character line width, single quotes, trailing commas
- **Linter**: Recommended rules with custom overrides for specific needs
- **Import Organization**: Automatic import sorting and organization
- **TailwindCSS**: Automatic class ordering and formatting

## Code Conventions

### Naming Conventions
- **Methods and Variables**: Use camelCase (e.g., `userProfile`, `calculateTotal`)
- **Classes and Modules**: Use PascalCase (e.g., `UserProfile`, `PaymentProcessor`)
- **Constants**: Use UPPER_SNAKE_CASE (e.g., `MAX_RETRY_COUNT`)

### Code Comments
- Add brief comments above non-obvious business logic
- Document complex algorithms or calculations
- Explain the "why" behind implementation choices
- Never remove existing comments unless removing the associated code
- Update comments when modifying code to maintain accuracy
- Keep comments concise and relevant

<conditional-block task-condition="html-css-tailwind" context-check="html-css-style">
IF current task involves writing or updating HTML, CSS, or TailwindCSS:
  IF html-style.md AND css-style.md already in context:
    SKIP: Re-reading these files
    NOTE: "Using HTML/CSS style guides already in context"
  ELSE:
    <context_fetcher_strategy>
      IF current agent is Claude Code AND context-fetcher agent exists:
        USE: @agent:context-fetcher
        REQUEST: "Get HTML formatting rules from code-style/html-style.md"
        REQUEST: "Get CSS and TailwindCSS rules from code-style/css-style.md"
        PROCESS: Returned style rules
      ELSE:
        READ the following style guides (only if not already in context):
        - @.agent-os/standards/code-style/html-style.md (if not in context)
        - @.agent-os/standards/code-style/css-style.md (if not in context)
    </context_fetcher_strategy>
ELSE:
  SKIP: HTML/CSS style guides not relevant to current task
</conditional-block>

<conditional-block task-condition="javascript" context-check="javascript-style">
IF current task involves writing or updating JavaScript:
  IF javascript-style.md already in context:
    SKIP: Re-reading this file
    NOTE: "Using JavaScript style guide already in context"
  ELSE:
    <context_fetcher_strategy>
      IF current agent is Claude Code AND context-fetcher agent exists:
        USE: @agent:context-fetcher
        REQUEST: "Get JavaScript style rules from code-style/javascript-style.md"
        PROCESS: Returned style rules
      ELSE:
        READ: @.agent-os/standards/code-style/javascript-style.md
    </context_fetcher_strategy>
ELSE:
  SKIP: JavaScript style guide not relevant to current task
</conditional-block>

---

## Changelog

### v1.1.0 (2024-12-19)
- Delegated all formatting to Biome 2.x
- Updated naming conventions to camelCase (Biome standard)
- Removed manual formatting rules in favor of Biome automation
- Added Biome configuration overview
- Updated conditional blocks for HTML/CSS/JavaScript style guides

### v1.0.0 (2024-12-19)
- Initial version with manual formatting rules
