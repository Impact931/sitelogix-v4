# Ralph Wiggum Methodology

## Overview

Ralph is an autonomous coding loop that enables AI agents to build entire features while you sleep. The concept is simple but powerful: give an agent a list of small tasks, and it keeps picking one, implementing it, testing it, and committing the code until the feature is complete.

## Why Ralph Works

Traditional AI coding assistance requires constant human oversight. Ralph changes this by:

1. **Breaking work into atomic units** - Each user story is small enough to complete in one iteration
2. **Providing clear success criteria** - The agent knows exactly when it's done
3. **Fresh context per iteration** - Each loop starts with a clean context window, avoiding token limits
4. **Building institutional memory** - Progress and learnings are logged for future iterations

## The Ralph Loop

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   ┌──────────┐    ┌──────────┐    ┌──────────┐            │
│   │  Pick    │───▶│Implement │───▶│  Test    │            │
│   │  Story   │    │  Story   │    │ Criteria │            │
│   └──────────┘    └──────────┘    └────┬─────┘            │
│        ▲                               │                   │
│        │                               ▼                   │
│        │                        ┌──────────┐              │
│        │         No             │  Pass?   │              │
│        │◀───────────────────────┤          │              │
│        │                        └────┬─────┘              │
│        │                             │ Yes                 │
│        │                             ▼                     │
│   ┌────┴─────┐    ┌──────────┐    ┌──────────┐           │
│   │  More    │◀───│   Log    │◀───│  Commit  │           │
│   │ Stories? │    │ Progress │    │  Code    │           │
│   └────┬─────┘    └──────────┘    └──────────┘           │
│        │ No                                               │
│        ▼                                                  │
│   ┌──────────┐                                           │
│   │  Done!   │                                           │
│   └──────────┘                                           │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

## Step-by-Step Guide

### Step 1: Create a PRD

Use the `skills/prd-generator.md` skill to create a Product Requirement Document.

```
1. Open your agent (Claude Code, Cursor, etc.)
2. Describe the feature you want to build
3. Tag the prd-generator.md skill
4. Answer the clarifying questions
5. Review and save the PRD as prd.md
```

**Time investment:** Spend at least 30-60 minutes on this. The quality of your PRD determines Ralph's success.

### Step 2: Convert PRD to JSON

Use the `skills/ralph-prd-converter.md` skill to convert your PRD.

```
1. Tag the ralph-prd-converter.md skill
2. Point it to your prd.md file
3. Review the generated prd.json
4. Ensure each story is atomic with testable criteria
5. Save as prd.json in project root
```

**Critical checks:**
- [ ] Each story is completable in ~10-15 minutes
- [ ] All acceptance criteria are specific and testable
- [ ] Stories are ordered by dependency
- [ ] All stories have `"passes": false`

### Step 3: Run Ralph

```bash
# From project root
./scripts/ralph.sh

# Or with custom max iterations
MAX_ITERATIONS=20 ./scripts/ralph.sh
```

### Step 4: Review and Polish

After Ralph completes:

1. Test the feature manually
2. Fix any edge cases
3. Review code quality
4. Commit any final polish

## File Structure

```
project/
├── AGENTS.md              # Long-term memory - project context & learnings
├── PROGRESS.md            # Short-term memory - session progress
├── prd.md                 # Product Requirement Document
├── prd.json               # User stories for Ralph
├── skills/
│   ├── prd-generator.md   # Skill for creating PRDs
│   └── ralph-prd-converter.md  # Skill for JSON conversion
├── scripts/
│   └── ralph.sh           # The Ralph loop script
└── templates/
    └── prd-template.json  # Example prd.json structure
```

## Memory Systems

### Short-Term Memory: PROGRESS.md

Updated after each iteration with:
- Which story was completed
- Files that were changed
- Notes for the next iteration
- Any blockers encountered

This allows the next iteration to pick up context without re-reading everything.

### Long-Term Memory: AGENTS.md

Updated when the agent learns something important:
- Project patterns and conventions
- Common gotchas
- File locations
- Integration details

This knowledge persists across all future sessions, not just Ralph runs.

## Writing Good Acceptance Criteria

The acceptance criteria are the most important part of Ralph. They must be:

### Specific
```
❌ "Form works correctly"
✅ "Form has email field with type='email'"
✅ "Form has password field with type='password'"
✅ "Submit button is disabled while form is submitting"
```

### Testable by an Agent
```
❌ "Looks professional"
✅ "Header uses font-size: 24px"
✅ "Primary buttons use color #0066cc"
```

### Verifiable Without Human Input
```
❌ "User experience is smooth"
✅ "Loading spinner shows during API calls"
✅ "Error message appears within 100ms of failed request"
```

### Complete
```
❌ "Handle errors"
✅ "Shows 'Invalid email' when email format is wrong"
✅ "Shows 'Password required' when password is empty"
✅ "Shows 'Network error' when API is unreachable"
```

## Typical Costs

| Feature Size | Stories | Iterations | Approx Cost |
|-------------|---------|------------|-------------|
| Small       | 3-5     | 5-8        | $5-15       |
| Medium      | 8-12    | 10-15      | $15-30      |
| Large       | 15-25   | 20-30      | $30-60      |

Costs vary based on model (Opus 4.5 is more expensive but more capable) and code complexity.

## Troubleshooting

### Story keeps failing
- Acceptance criteria may be too vague
- Story may be too large - split it up
- Check if dependencies are correct

### Agent goes off track
- Add more specific criteria
- Add constraints to AGENTS.md
- Review the story description for ambiguity

### Context window issues
- Stories are too large - make them smaller
- Too much is being read - simplify AGENTS.md
- Clear PROGRESS.md between major features

### Code quality issues
- Add coding standards to AGENTS.md
- Add specific criteria about code patterns
- Review and update after each major feature

## Best Practices

1. **Invest in the PRD** - Garbage in, garbage out
2. **Keep stories tiny** - Smaller is always better
3. **Be specific** - Vague criteria = vague results
4. **Update AGENTS.md** - Build long-term knowledge
5. **Review outputs** - Ralph isn't perfect, polish at the end
6. **Start small** - Try a simple feature first to learn the flow

## Integration with Development Workflow

Ralph works best when integrated with your existing workflow:

1. **Planning** - Use Ralph for new features after design is done
2. **Development** - Run Ralph overnight or during breaks
3. **Review** - Review Ralph's commits like any PR
4. **Testing** - Run your test suite after Ralph completes
5. **Polish** - Fix edge cases and improve code quality

---

*Ralph makes AI agents work like a well-organized engineering team - picking tasks, implementing them, and documenting progress. The key is preparation: spend time on your PRD and user stories, and Ralph will handle the implementation.*
