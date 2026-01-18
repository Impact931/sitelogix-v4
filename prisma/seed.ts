import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Sample employees for Parkway Construction (test data)
const employees = [
  'Corey Davis',
  'Mike Johnson',
  'James Wilson',
  'Robert Brown',
  'David Martinez',
  'Chris Anderson',
  'Matt Thompson',
  'John Garcia',
  'Steve Rodriguez',
  'Tom Williams',
  'Kevin Jones',
  'Brian Miller',
  'Mark Taylor',
  'Paul Moore',
  'Eric Jackson',
  'Ryan White',
  'Jason Harris',
  'Dan Martin',
  'Jeff Clark',
  'Tony Lewis',
  'Greg Walker',
  'Tim Hall',
  'Joe Young',
  'Bill King',
  'Frank Wright',
]

async function main() {
  console.log('🌱 Seeding database...')

  // Clear existing data
  await prisma.reportEmployee.deleteMany()
  await prisma.report.deleteMany()
  await prisma.employee.deleteMany()

  // Create employees
  for (const name of employees) {
    await prisma.employee.create({
      data: {
        name,
        active: true,
      },
    })
  }

  console.log(`✅ Created ${employees.length} employees`)

  // Create a sample report for testing
  const sampleEmployees = await prisma.employee.findMany({ take: 3 })

  const report = await prisma.report.create({
    data: {
      submittedAt: new Date(),
      timezone: 'America/New_York',
      jobSite: 'Main Street Renovation',
      deliveries: 'Lumber delivery arrived at 9am',
      incidents: null,
      shortages: 'Need more drywall screws',
      employees: {
        create: sampleEmployees.map((emp, index) => ({
          employeeId: emp.id,
          name: emp.name,
          normalizedName: emp.name,
          regularHours: 8,
          overtimeHours: index === 0 ? 2 : 0, // First employee has OT
          totalHours: index === 0 ? 10 : 8,
        })),
      },
    },
  })

  console.log(`✅ Created sample report: ${report.id}`)
  console.log('🎉 Seeding complete!')
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
