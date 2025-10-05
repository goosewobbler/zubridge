---
description: Sync Agent OS Standards Updates
globs:
alwaysApply: false
version: 1.0
encoding: UTF-8
---

# Sync Product Agent OS Standards

## Overview

Synchronize updated Agent OS standard files from global defaults (`~/.agent-os/`) to project-specific installation, preserving project customizations.

<pre_flight_check>
  EXECUTE: @.agent-os/instructions/meta/pre-flight.md
</pre_flight_check>

<process_flow>

<step number="1" name="detect_installation">

### Step 1: Detect Installation Locations

Verify both global and project Agent OS installations exist.

<verification>
  CHECK: ~/.agent-os/ exists (global defaults)
  CHECK: ./.agent-os/ exists (project installation)

  IF either missing:
    ERROR: "Agent OS installation not found. Run /analyze-product to install."
    STOP
</verification>

</step>

<step number="2" name="scan_for_updates">

### Step 2: Scan for Updates

Compare global defaults with project files to identify updates.

<scan_locations>
  <standards>
    - ~/.agent-os/standards/*.md
    - Compare versions in file headers
    - Identify new files
  </standards>
  <instructions>
    - ~/.agent-os/instructions/core/*.md
    - Compare version numbers in frontmatter
  </instructions>
</scan_locations>

<categorize_changes>
  NEW_FILES: Files in global that don't exist in project
  UPDATED_FILES: Files with version mismatch
  PROJECT_SPECIFIC: Files in project/product/ (never sync)
  CUSTOMIZED: Files with project-specific content (warn before sync)
</categorize_changes>

</step>

<step number="3" name="analyze_customizations">

### Step 3: Analyze Project Customizations

Detect which files have project-specific customizations that should be preserved.

<detection_logic>
  IF file_path contains ".agent-os/product/":
    CATEGORY: PROJECT_SPECIFIC
    ACTION: Never sync (these are project-unique)

  ELIF file_name == "tech-stack.md":
    CHECK: Contains project-specific language conventions?
    IF yes:
      CATEGORY: CUSTOMIZED
      ACTION: Offer merge assistance
    ELSE:
      CATEGORY: SAFE_TO_SYNC

  ELSE:
    CATEGORY: SAFE_TO_SYNC
    ACTION: Direct copy
</detection_logic>

<project_specific_files>
  ALWAYS PRESERVE:
  - .agent-os/product/mission.md
  - .agent-os/product/mission-lite.md
  - .agent-os/product/roadmap.md
  - .agent-os/product/tech-stack.md (has project customizations)
</project_specific_files>

</step>

<step number="4" name="present_sync_plan">

### Step 4: Present Sync Plan to User

Show user what will be synced and ask for confirmation.

<sync_report_template>
  ## Agent OS Sync Plan

  ### ✅ New Files (will be copied):
  - .agent-os/standards/cicd-patterns.md (v1.0.0)
  - .agent-os/standards/monorepo-conventions.md (v1.0.0)

  ### 🔄 Updated Files (will be synced):
  - .agent-os/standards/best-practices.md (v1.2.0 → v1.3.0)
  - .agent-os/instructions/core/create-spec.md (v1.1 → v1.2)

  ### ⚠️ Customized Files (require manual merge):
  - .agent-os/product/tech-stack.md
    - Global: Added language-specific conventions
    - Project: Has Zubridge-specific tech stack
    - Action: Will assist with merge

  ### 🔒 Project-Specific Files (never synced):
  - .agent-os/product/mission.md
  - .agent-os/product/mission-lite.md
  - .agent-os/product/roadmap.md

  Proceed with sync? (y/n)
</sync_report_template>

<user_confirmation>
  WAIT: for user approval
  IF approved:
    PROCEED to step 5
  ELSE:
    EXIT: "Sync cancelled"
</user_confirmation>

</step>

<step number="5" subagent="file-creator" name="sync_new_files">

### Step 5: Copy New Files

Use file-creator subagent to copy new files from global to project.

<copy_operations>
  FOR each file in NEW_FILES:
    SOURCE: ~/.agent-os/{path}
    DESTINATION: ./.agent-os/{path}
    ACTION: Direct copy

  REPORT: "Copied {filename} (v{version})"
</copy_operations>

</step>

<step number="6" subagent="file-creator" name="sync_updated_files">

### Step 6: Update Standard Files

Use file-creator subagent to copy updated standard files.

<copy_operations>
  FOR each file in UPDATED_FILES where category == SAFE_TO_SYNC:
    SOURCE: ~/.agent-os/{path}
    DESTINATION: ./.agent-os/{path}
    ACTION: Overwrite with global version

  REPORT: "Updated {filename} (v{old_version} → v{new_version})"
</copy_operations>

</step>

<step number="7" name="assist_customized_merge">

### Step 7: Assist with Customized File Merges

For files with project customizations, provide merge guidance.

<merge_assistance>
  FOR each file in CUSTOMIZED:
    DISPLAY:
      ## Merge Required: {filename}

      ### Changes in Global Default:
      [SHOW_DIFF_OF_CHANGES]

      ### Your Project Customizations:
      [SHOW_PROJECT_SPECIFIC_CONTENT]

      ### Recommended Action:
      1. Keep your project-specific content
      2. Add these new sections from global:
         - [LIST_NEW_SECTIONS]

      Would you like me to:
      a) Auto-merge (preserve project content + add new sections)
      b) Show manual merge instructions
      c) Skip this file

    WAIT: for user choice
    EXECUTE: chosen option
</merge_assistance>

<auto_merge_logic>
  IF user chooses auto-merge:
    READ: project file sections
    READ: global file new sections
    MERGE: Append new global sections while preserving project content
    UPDATE: version number to global version
    ADD: comment noting merge date

  EXAMPLE:
    # Tech Stack
    Version: 1.2.0
    Last Updated: 2025-10-05

    [PROJECT CONTENT]
    ...

    ## Language-Specific Conventions
    <!-- Auto-merged from global defaults on 2025-10-05 -->

    [GLOBAL NEW CONTENT]
</auto_merge_logic>

</step>

<step number="8" name="verify_sync">

### Step 8: Verify Sync

Confirm all operations completed successfully.

<verification>
  CHECK: All NEW_FILES copied successfully
  CHECK: All UPDATED_FILES synced successfully
  CHECK: All CUSTOMIZED files handled (merged or skipped)

  GENERATE: sync report
</verification>

<sync_summary_template>
  ## ✅ Agent OS Sync Complete

  ### Synced Successfully:
  - ✓ {count} new files added
  - ✓ {count} files updated
  - ✓ {count} customized files merged

  ### Skipped:
  - ⊘ {count} project-specific files (as expected)
  - ⊘ {count} user-skipped customizations

  ### Action Items:
  - [ ] Review merged files for any conflicts
  - [ ] Test updated workflows with /create-spec

  Your project Agent OS is now synchronized with global defaults!
</sync_summary_template>

</step>

</process_flow>

<post_flight_check>
  EXECUTE: @.agent-os/instructions/meta/post-flight.md
</post_flight_check>
