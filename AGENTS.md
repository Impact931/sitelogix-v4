# AGENTS.md - Roxy Project

## Project Overview
This is the Roxy project. This file serves as the long-term memory and context for AI agents working on this codebase.

## Ralph Wiggum Methodology
This project uses the Ralph Wiggum autonomous coding methodology. Key principles:

1. **Atomic User Stories**: Each task must be small enough to complete in one iteration
2. **Clear Acceptance Criteria**: Every story has testable criteria so the agent knows when it's done
3. **Fresh Context Per Iteration**: Each Ralph loop starts with a clean context window
4. **Commit After Completion**: Always commit after successfully completing a user story
5. **Learn and Log**: Update progress.txt (short-term) and AGENTS.md files (long-term) with learnings

## File Structure
```
Roxy/
├── AGENTS.md                    # This file - long-term memory
├── PROGRESS.md                  # Short-term memory / progress log
├── prd.md                       # Current Product Requirement Document
├── prd.json                     # User stories converted from PRD
├── skills/                      # Agent skills/prompts
│   ├── prd-generator.md         # Skill for generating PRDs
│   └── ralph-prd-converter.md   # Skill for converting PRD to JSON
├── scripts/
│   └── ralph.sh                 # The Ralph autonomous loop script
├── templates/
│   └── prd-template.json        # Template for PRD JSON structure
└── Docs/
    └── ralph-methodology.md     # Full documentation of the methodology
```

## Coding Standards
- Write clean, readable code
- Include appropriate error handling
- Follow existing patterns in the codebase
- Test your changes against acceptance criteria before committing

## Learnings Log
<!-- Agents should append learnings here as they discover important patterns or gotchas -->

### Project-Specific Notes
- (Add learnings as you work on the project)

---
*This file is automatically read by agents when working in this directory. Update it with important learnings.*
