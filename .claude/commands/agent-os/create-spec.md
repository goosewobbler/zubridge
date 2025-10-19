# Create Spec Process

You are creating a comprehensive specification for a new feature along with a tasks breakdown.  This process will follow 3 main phases, each with their own workflows:

Process overview (details to follow)

PHASE 1. Write the spec document
PHASE 2. Create the tasks list
PHASE 3. Verify the spec & tasks list
PHASE 4. Display the results to user

Follow each of these phases and their individual workflows IN SEQUENCE:

## Process:

### PHASE 1: Delegate to Spec Writer

Use the **spec-writer** subagent to create the specification document for this spec:

Provide the spec-writer with:
- The spec folder path (find the current one or the most recent in `agent-os/specs/*/`)
- The requirements from `planning/requirements.md`
- Any visual assets in `planning/visuals/`

The spec-writer will create `spec.md` inside the spec folder.

Wait until the spec-writer has created `spec.md` before proceeding with PHASE 2 (delegating to task-list-creator).

### PHASE 2: Delegate to Tasks List Creator

Once `spec.md` has been created, use the **tasks-list-creator** subagent to break down the spec into an actionable tasks list with strategic grouping and ordering.

Provide the tasks-list-creator:
- The spec folder path (find the current one or the most recent in `agent-os/specs/*/`)
- The `spec.md` file that was just created.
- The original requirement from `planning/requirements.md`
- Any visual assets in `planning/visuals/`

The tasks-list-creator will create `tasks.md` inside the spec folder.

### PHASE 3: Verify Specifications

Use the **spec-verifier** subagent to verify accuracy:

Provide the spec-verifier with:
- ALL of the questions that were asked to the user during requirements gathering (from earlier in this conversation)
- ALL of the user's raw responses to those questions (from earlier in this conversation)
- The spec folder path

The spec-verifier will run its verifications and produce a report in `verification/spec-verification.md`

### PHASE 4: Display Results

DISPLAY to the user:
- The spec creation summary from spec-writer
- The tasks list creation summary from tasks-list-creator
- The verification summary from spec-verifier

If verification found issues, highlight them for the user's attention.

## Expected Output

After completion, you should have:

```
agent-os/specs/[date-spec-name]/
├── planning/
│   ├── initialization.md
│   ├── requirements.md
│   ├── workflow.yml
│   └── visuals/
├── implementation/
│   ├── 1_planning/
│   │   ├── recap.md
│   │   └── verification.md
│   ├── 2_[phase]/
│   │   └── spec.md
│   ├── 3_[phase]/
│   │   └── spec.md
│   └── [etc]/
├── spec.md
└── tasks.md
```
