#!/bin/bash

# ============================================================================
# RALPH - Autonomous Coding Agent Loop
# ============================================================================
# This script runs an autonomous coding loop that:
# 1. Reads user stories from prd.json
# 2. Picks the next incomplete story
# 3. Spawns an agent (Claude Code) to implement it
# 4. Agent commits changes and updates progress
# 5. Repeats until all stories are complete
# ============================================================================

set -e

# Configuration
MAX_ITERATIONS=${MAX_ITERATIONS:-10}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
PRD_FILE="${PROJECT_DIR}/prd.json"
PROGRESS_FILE="${PROJECT_DIR}/PROGRESS.md"
AGENTS_FILE="${PROJECT_DIR}/AGENTS.md"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."

    if [ ! -f "$PRD_FILE" ]; then
        log_error "prd.json not found at $PRD_FILE"
        log_info "Please create a PRD and convert it to prd.json first."
        log_info "Use the skills/prd-generator.md and skills/ralph-prd-converter.md skills."
        exit 1
    fi

    if ! command -v claude &> /dev/null; then
        log_error "Claude Code CLI not found. Please install it first."
        log_info "Visit: https://docs.anthropic.com/claude-code"
        exit 1
    fi

    if ! command -v jq &> /dev/null; then
        log_error "jq not found. Please install it: brew install jq"
        exit 1
    fi

    log_success "Prerequisites check passed"
}

# Get the next incomplete story
get_next_story() {
    jq -r '.stories[] | select(.passes == false) | .id' "$PRD_FILE" | head -1
}

# Get story details
get_story_title() {
    local story_id=$1
    jq -r --arg id "$story_id" '.stories[] | select(.id == $id) | .title' "$PRD_FILE"
}

get_story_description() {
    local story_id=$1
    jq -r --arg id "$story_id" '.stories[] | select(.id == $id) | .description' "$PRD_FILE"
}

get_story_criteria() {
    local story_id=$1
    jq -r --arg id "$story_id" '.stories[] | select(.id == $id) | .acceptance_criteria[]' "$PRD_FILE"
}

# Count stories
count_total_stories() {
    jq '.stories | length' "$PRD_FILE"
}

count_completed_stories() {
    jq '[.stories[] | select(.passes == true)] | length' "$PRD_FILE"
}

# Initialize progress file if needed
init_progress_file() {
    if [ ! -f "$PROGRESS_FILE" ]; then
        cat > "$PROGRESS_FILE" << 'EOF'
# PROGRESS.md - Ralph Session Progress

This file tracks progress during Ralph autonomous coding sessions.

## Session Log

EOF
        log_info "Created PROGRESS.md"
    fi
}

# Run one iteration
run_iteration() {
    local iteration=$1
    local story_id=$2
    local story_title=$(get_story_title "$story_id")

    log_info "=========================================="
    log_info "ITERATION $iteration: $story_id"
    log_info "Story: $story_title"
    log_info "=========================================="

    # Build the prompt for Claude Code
    local prompt=$(cat << EOF
You are an autonomous coding agent running as part of the Ralph system.

## Your Task
Implement the following user story:

**Story ID:** $story_id
**Title:** $story_title
**Description:** $(get_story_description "$story_id")

**Acceptance Criteria:**
$(get_story_criteria "$story_id" | sed 's/^/- /')

## Instructions

1. **Read Context First**
   - Read AGENTS.md for project context and learnings
   - Read PROGRESS.md for recent session progress
   - Read prd.json to understand the full feature scope

2. **Implement the Story**
   - Write clean, well-structured code
   - Follow existing patterns in the codebase
   - Test your implementation against EACH acceptance criterion
   - Do not move on until ALL criteria pass

3. **When Complete**
   - Commit your changes with message: "[$story_id] $story_title"
   - Update prd.json: set this story's "passes" to true
   - Append to PROGRESS.md with:
     - Iteration number: $iteration
     - Story completed: $story_id
     - Files changed
     - Any learnings or notes for future iterations
   - If you learned something important about the codebase, update AGENTS.md

4. **Important Rules**
   - Do NOT skip acceptance criteria
   - Do NOT mark as complete unless ALL criteria are verified
   - If you get stuck, document what you learned and leave passes as false
   - Keep your changes focused on THIS story only

Begin implementation now.
EOF
)

    # Run Claude Code with the prompt
    cd "$PROJECT_DIR"
    echo "$prompt" | claude --dangerously-skip-permissions

    # Check if story was completed
    local still_incomplete=$(jq -r --arg id "$story_id" '.stories[] | select(.id == $id and .passes == false) | .id' "$PRD_FILE")

    if [ -z "$still_incomplete" ]; then
        log_success "Story $story_id completed!"
        return 0
    else
        log_warning "Story $story_id not completed in this iteration"
        return 1
    fi
}

# Main loop
main() {
    log_info "Starting Ralph Autonomous Coding Loop"
    log_info "Max iterations: $MAX_ITERATIONS"
    log_info "Project: $PROJECT_DIR"
    echo ""

    check_prerequisites
    init_progress_file

    local total=$(count_total_stories)
    local completed=$(count_completed_stories)
    log_info "Stories: $completed/$total completed"
    echo ""

    for ((i=1; i<=MAX_ITERATIONS; i++)); do
        local next_story=$(get_next_story)

        if [ -z "$next_story" ]; then
            log_success "=========================================="
            log_success "ALL STORIES COMPLETE!"
            log_success "=========================================="
            completed=$(count_completed_stories)
            log_success "Completed $completed/$total stories"
            exit 0
        fi

        run_iteration $i "$next_story"

        # Brief pause between iterations
        sleep 2

        completed=$(count_completed_stories)
        log_info "Progress: $completed/$total stories completed"
        echo ""
    done

    log_warning "Reached max iterations ($MAX_ITERATIONS)"
    completed=$(count_completed_stories)
    log_info "Final progress: $completed/$total stories completed"

    local remaining=$(jq -r '.stories[] | select(.passes == false) | .id' "$PRD_FILE")
    if [ -n "$remaining" ]; then
        log_warning "Remaining stories:"
        echo "$remaining" | while read story; do
            echo "  - $story: $(get_story_title "$story")"
        done
    fi
}

# Run
main "$@"
