# Spec Implementation Process

Now that we have a spec and tasks list ready for implementation, we will proceed with implementation of this spec by following this multi-phase process:

PHASE 1: Plan the subagent assignments for each task group
PHASE 2: Delegate implementation of each task group to its assigned subagent
PHASE 3: Delegate verifications of the implementation to verifier subagents
PHASE 4: Delegate the production of the final verification

Follow each of these phases and their individual workflows IN SEQUENCE:

## Multi-Phase Process

### PHASE 1: Plan subagents assignments

Read the following files:
- `agent-os/specs/[this-spec]/tasks.md`
- `agent-os/roles/implementers.yml`

Create `agent-os/specs/[this-spec]/planning/task-assignments.yml` with this structure:

```yaml
task_assignments:
  - task_group: "Task Group 1: [Title from tasks.md]"
    assigned_subagent: "[implementer-id-from-implementers.yml]"

  - task_group: "Task Group 2: [Title from tasks.md]"
    assigned_subagent: "[implementer-id-from-implementers.yml]"

  # Continue for all task groups found in tasks.md
```

Ensure each assigned subagent exists in both of these locations:
- In implementers.yml there must be an implementer with this role ID.
- In `.claude/agents/agent-os` there must be a file named by this implementer ID.

### PHASE 2: Delegate task groups implementations to assigned subagents

Loop through each task group in `agent-os/specs/[this-spec]/tasks.md` and delegate its implementation to the assigned subagent specified in `task-assignments.yml`.

For each delegation, provide the subagent with:
- The task group (including the parent task and all sub-tasks)
- The spec file: `agent-os/specs/[this-spec]/spec.md`
- Instruct subagent to:
  1. Perform their implementation
  2. Check off the task and sub-task(s) in `agent-os/specs/[this-spec]/tasks.md`
  3. Document their work in an implementation report named and numbered by this task name and placed in `agent-os/specs/[this-spec]/implementation/`.

### PHASE 3: Delegate verifications of implementation to verifier subagents

1. Collect the list of subagent IDs that were delegated to in Phase 2.

2. Read `implementers.yml` and find those subagent IDs. Collect the verifier role IDs specified in their `verified_by` field.

3. If there are verifier roles, ensure those verifiers are defined in `agent-os/roles/verifiers.yml`.

4. If there are verifier roles, delegate to each verifier subagent:
   - Collect all task groups that fall under the purview of this verifier (i.e. these tasks' implementers' verified_by specifies this verifier).
   - Provide to the verifier:
     1. Details of those task groups (parent task and sub-tasks) to the verifier for verification.
     2. The spec file: `agent-os/specs/[this-spec]/spec.md` for context.
   - Instruct the verifier:
     1. Read and analyze these tasks and where they fit in the context of this spec.
     2. Run tests to verify implementation of these tasks.
     3. Verify whether `agent-os/specs/[this-spec]/tasks.md` has been updated to reflect these tasks' completeness.
     4. Document your verification report and place this document in: `agent-os/specs/[this-spec]/verification/`

### PHASE 4: Produce the final verification report

Use the **implementation-verifier** subagent to do its implementation verification and produce its final verification report.

Provide to the subagent the following:
- The path to this spec: `agent-os/specs/[this-spec]`
Instruct the subagent to do the following:
  1. Run all of its final verifications according to its built-in workflow
  2. Produce the final verification report in `agent-os/specs/[this-spec]/verifications/final-verification.md`.
