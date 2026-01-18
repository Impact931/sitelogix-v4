/**
 * Fuzzy Name Matching Utility
 *
 * Uses Fuse.js for fuzzy string matching to handle:
 * - Spelling variations (Jon vs John)
 * - Nicknames (Mike vs Michael)
 * - Typos (Corey vs Cory)
 */

import Fuse from 'fuse.js'
import type { Employee, FuzzyMatchResult } from '../types'

// Fuse.js configuration optimized for name matching
const FUSE_OPTIONS: Fuse.IFuseOptions<Employee> = {
  keys: ['name'],
  threshold: 0.4,        // Lower = stricter matching (0.0 = exact, 1.0 = match anything)
  distance: 100,         // How far to search for pattern
  includeScore: true,
  shouldSort: true,
  minMatchCharLength: 2,
}

/**
 * Find the best matching employee for a given name
 *
 * @param searchName - The name to search for (from voice input)
 * @param employees - List of employees to search
 * @param threshold - Minimum score to consider a match (0-1, default 0.6)
 * @returns The best matching employee and score, or null if no match
 */
export function findBestMatch(
  searchName: string,
  employees: Employee[],
  threshold = 0.6
): FuzzyMatchResult | null {
  if (!searchName || employees.length === 0) {
    return null
  }

  const fuse = new Fuse(employees, FUSE_OPTIONS)
  const results = fuse.search(searchName)

  if (results.length === 0) {
    return null
  }

  const best = results[0]
  // Fuse.js score is 0 (perfect) to 1 (no match), so invert it
  const score = best.score !== undefined ? 1 - best.score : 0

  if (score < threshold) {
    return null
  }

  return {
    employee: best.item,
    score,
  }
}

/**
 * Normalize a name for comparison
 * - Lowercase
 * - Remove extra whitespace
 * - Handle common variations
 */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

/**
 * Calculate Levenshtein distance between two strings
 * Used as a backup for simple comparisons
 */
export function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = []

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i]
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        )
      }
    }
  }

  return matrix[b.length][a.length]
}

/**
 * Check if two names are likely the same person
 * Uses both exact matching and Levenshtein distance
 */
export function isLikelyMatch(name1: string, name2: string, maxDistance = 2): boolean {
  const n1 = normalizeName(name1)
  const n2 = normalizeName(name2)

  // Exact match after normalization
  if (n1 === n2) return true

  // Check Levenshtein distance
  return levenshteinDistance(n1, n2) <= maxDistance
}
