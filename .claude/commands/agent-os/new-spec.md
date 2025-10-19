# New Spec Process

You are initiating a new spec for a new feature.  This process will follow 3 main phases, each with their own workflow steps:

Process overview (details to follow)

PHASE 1. Initilize spec
PHASE 2. Research requirements for this spec
PHASE 3. Inform the user that the spec has been initialized

Follow each of these phases and their individual workflows IN SEQUENCE:

## Multi-Phase Process:

### PHASE 1: Initialize Spec

Use the **spec-initializer** subagent to initialize a new spec.

IF the user has provided a description, provide that to the spec-initializer.

The spec-initializer will provide the path to the dated spec folder (YYYY-MM-DD-spec-name) they've created.

### PHASE 2: Research Requirements

After spec-initializer completes, immediately use the **spec-researcher** subagent:

Provide the spec-researcher with:
- The spec folder path from spec-initializer

The spec-researcher will give you several separate responses that you MUST show to the user. These include:
1. Numbered clarifying questions along with a request for visual assets (show these to user, wait for user's response)
2. Follow-up questions if needed (based on user's answers and provided visuals)

**IMPORTANT**:
- Display these questions to the user and wait for their response
- The spec-researcher may ask you to relay follow-up questions that you must present to user

### PHASE 3: Inform the user

After all steps complete, inform the user:

"Spec initialized successfully!

✅ Spec folder created: `[spec-path]`
✅ Requirements gathered
✅ Visual assets: [Found X files / No files provided]

👉 Run `/create-spec` to generate the detailed specification and task breakdown."
