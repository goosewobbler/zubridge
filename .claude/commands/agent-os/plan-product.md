## Product Planning Process

You are helping to plan and document the mission, roadmap and tech stack for the current product.  This will include:

- **Gathering Information**: The user's product vision, user personas, problems and key features
- **Mission Document**: Take what you've gathered and create a concise mission document
- **Roadmap**: Create a phased development plan with prioritized features
- **Tech stack**: Establish the technical stack used for all aspects of this product's codebase

This process will create these files in `agent-os/product/` directory.

### PHASE 1: Gather Product Requirements

Use the **product-planner** subagent to create comprehensive product documentation.

IF the user has provided any details in regards to the product idea, its purpose, features list, target users and any other details then provide those to the **product-planner** subagent.

The product-planner will:
- Confirm (or gather) product idea, features, target users, confirm the tech stack and gather other details
- Create `agent-os/product/mission.md` with product vision and strategy
- Create `agent-os/product/roadmap.md` with phased development plan
- Create `agent-os/product/tech-stack.md` documenting all of this product's tech stack choices

### PHASE 2: Display Results

Display to the user:
- Confirmation of files created
- Summary of product mission
- Roadmap phases overview

Output to user:

"Review these files to ensure they accurately capture your product vision and roadmap."

## Output

Upon completion, the following files should have been been created and delivered to the user:

- `agent-os/product/mission.md` - Full product vision and strategy
- `agent-os/product/roadmap.md` - Phased development plan
- `agent-os/product/tech-stack.md` - Tech stack list for this product
