# Ralph PRD Converter Skill

## Purpose
Convert a Product Requirement Document (PRD) in markdown format into a structured `prd.json` file for the Ralph autonomous agent system.

## Instructions

You are converting a PRD into a JSON file that Ralph can process autonomously. This is critical work - the quality of your conversion determines whether Ralph succeeds or fails.

### Input
A PRD markdown file (typically `prd.md`)

### Output
A JSON file (`prd.json`) with the following structure:

```json
{
  "feature": "Feature Name",
  "description": "Brief description of the feature",
  "created": "YYYY-MM-DD",
  "stories": [
    {
      "id": "STORY-001",
      "title": "Short descriptive title",
      "description": "What this story accomplishes",
      "acceptance_criteria": [
        "Specific, testable criterion 1",
        "Specific, testable criterion 2",
        "Specific, testable criterion 3"
      ],
      "priority": 1,
      "dependencies": [],
      "passes": false
    }
  ]
}
```

## Critical Rules

### 1. Story Size
**THE #1 RULE**: Each story MUST be completable in one Ralph iteration.
- If a story feels too big, split it into multiple smaller stories
- A story should take 5-15 minutes of agent work, not hours
- When in doubt, make it smaller

### 2. Story Ordering
- Stories should be ordered by dependency and priority
- Put foundational stories first (database schema, core utilities)
- Put dependent stories after their dependencies
- Use the `dependencies` array to explicitly list story IDs that must complete first

### 3. Acceptance Criteria
**MUST be verifiable by the agent without human input.**

Good criteria:
- "API endpoint `/api/tasks` returns JSON array of tasks"
- "Database table `users` has columns: id, email, created_at"
- "Form validation shows error when email field is empty"
- "Clicking delete button removes item from the list"

Bad criteria:
- "Works correctly" (not specific)
- "Looks good" (subjective)
- "Is fast" (not measurable by agent)
- "User-friendly" (subjective)

### 4. ID Format
Use a consistent ID format: `STORY-001`, `STORY-002`, etc.

### 5. Passes Field
All stories start with `"passes": false`. Ralph will update this to `true` when completed.

## Conversion Process

1. Read the PRD markdown file
2. Extract each user story
3. Ensure each story is atomic (single responsibility)
4. Write specific, testable acceptance criteria
5. Order stories by dependency
6. Set all `passes` to `false`
7. Output as formatted JSON

## Example Conversion

**From PRD:**
```markdown
### Story: User Authentication
As a user, I want to log in so I can access my dashboard.

Acceptance Criteria:
- Login form with email and password
- Validates credentials
- Redirects to dashboard on success
```

**To JSON:**
```json
{
  "id": "STORY-001",
  "title": "Create login form UI",
  "description": "Build the login form component with email and password fields",
  "acceptance_criteria": [
    "Login page exists at /login route",
    "Form has email input field with type='email'",
    "Form has password input field with type='password'",
    "Form has submit button with text 'Log In'"
  ],
  "priority": 1,
  "dependencies": [],
  "passes": false
},
{
  "id": "STORY-002",
  "title": "Add login form validation",
  "description": "Add client-side validation to the login form",
  "acceptance_criteria": [
    "Shows error message when email is empty on submit",
    "Shows error message when password is empty on submit",
    "Shows error message when email format is invalid",
    "Submit button is disabled while form is submitting"
  ],
  "priority": 2,
  "dependencies": ["STORY-001"],
  "passes": false
},
{
  "id": "STORY-003",
  "title": "Implement login API endpoint",
  "description": "Create backend endpoint to authenticate users",
  "acceptance_criteria": [
    "POST /api/auth/login endpoint exists",
    "Returns 200 with token on valid credentials",
    "Returns 401 on invalid credentials",
    "Returns 400 on missing email or password"
  ],
  "priority": 2,
  "dependencies": [],
  "passes": false
},
{
  "id": "STORY-004",
  "title": "Connect login form to API",
  "description": "Wire up the form to call the login API and handle responses",
  "acceptance_criteria": [
    "Form submits to POST /api/auth/login",
    "On success, stores token and redirects to /dashboard",
    "On 401 error, shows 'Invalid credentials' message",
    "On network error, shows 'Connection failed' message"
  ],
  "priority": 3,
  "dependencies": ["STORY-001", "STORY-002", "STORY-003"],
  "passes": false
}
```

Notice how one vague story became four specific, atomic stories with testable criteria.

## Output Location
Save as `prd.json` in the project root.

---
*Tag this skill after generating a PRD to convert it for Ralph processing.*
