/**
 * PostgreSQL Employee Repository Adapter
 *
 * Implements EmployeeRepository interface using Prisma/PostgreSQL.
 * Used for local development.
 */

import type { Employee, EmployeeRepository } from '../../types'
import { findBestMatch } from '../../utils/fuzzy-match'
import prisma from './prisma'

export class PostgresEmployeeRepository implements EmployeeRepository {
  async getAllActive(): Promise<Employee[]> {
    const employees = await prisma.employee.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
    })

    return employees.map(this.mapToEmployee)
  }

  async getAll(): Promise<Employee[]> {
    const employees = await prisma.employee.findMany({
      orderBy: { name: 'asc' },
    })

    return employees.map(this.mapToEmployee)
  }

  async findByName(name: string): Promise<Employee | null> {
    const employee = await prisma.employee.findFirst({
      where: {
        name: {
          equals: name,
          mode: 'insensitive',
        },
      },
    })

    return employee ? this.mapToEmployee(employee) : null
  }

  async fuzzyMatch(name: string, threshold = 0.6): Promise<Employee | null> {
    // First try exact match
    const exact = await this.findByName(name)
    if (exact) return exact

    // Fall back to fuzzy matching
    const employees = await this.getAllActive()
    const result = findBestMatch(name, employees, threshold)

    return result?.employee ?? null
  }

  async create(data: Omit<Employee, 'id' | 'createdAt' | 'updatedAt'>): Promise<Employee> {
    const employee = await prisma.employee.create({
      data: {
        name: data.name,
        active: data.active ?? true,
      },
    })

    return this.mapToEmployee(employee)
  }

  async update(id: string, data: Partial<Employee>): Promise<Employee> {
    const employee = await prisma.employee.update({
      where: { id },
      data: {
        name: data.name,
        active: data.active,
      },
    })

    return this.mapToEmployee(employee)
  }

  /**
   * Map Prisma model to domain type
   */
  private mapToEmployee(prismaEmployee: {
    id: string
    name: string
    active: boolean
    createdAt: Date
    updatedAt: Date
  }): Employee {
    return {
      id: prismaEmployee.id,
      name: prismaEmployee.name,
      active: prismaEmployee.active,
      createdAt: prismaEmployee.createdAt,
      updatedAt: prismaEmployee.updatedAt,
    }
  }
}
