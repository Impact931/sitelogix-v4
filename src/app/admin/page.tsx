'use client'

import { useEffect, useState } from 'react'

interface ReportSummary {
  id: string
  submittedAt: string
  jobSite: string
  employeeCount: number
  totalHours: number
  hasSafetyIncident: boolean
  hasTranscript: boolean
  hasAudio: boolean
}

interface DashboardData {
  reports: ReportSummary[]
  summary: {
    reportCount: number
    totalEmployees: number
    totalManHours: number
    incidentCount: number
  }
}

export default function AdminDashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/reports?limit=50')
      .then(async (res) => {
        const d = await res.json()
        if (!res.ok || d.error) {
          throw new Error(d.detail || d.error || `HTTP ${res.status}`)
        }
        return d
      })
      .then((d) => {
        setData(d)
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message)
        setLoading(false)
      })
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1e3a5f]" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
        Error loading dashboard: {error}
      </div>
    )
  }

  const { reports, summary } = data!

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
        <p className="text-gray-500 mt-1">Overview of recent daily reports</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Reports" value={summary.reportCount} />
        <StatCard label="Total Employees" value={summary.totalEmployees} />
        <StatCard label="Total Man-Hours" value={summary.totalManHours} />
        <StatCard
          label="Safety Incidents"
          value={summary.incidentCount}
          alert={summary.incidentCount > 0}
        />
      </div>

      {/* Reports Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Recent Reports</h3>
        </div>
        {reports.length === 0 ? (
          <div className="px-6 py-12 text-center text-gray-400">
            No reports yet. Reports will appear here after field managers submit via Roxy.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Job Site
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Employees
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Hours
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Safety
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Files
                  </th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {reports.map((report) => (
                  <tr key={report.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {new Date(report.submittedAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                      <div className="text-xs text-gray-400">
                        {new Date(report.submittedAt).toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {report.jobSite}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {report.employeeCount}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {report.totalHours}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {report.hasSafetyIncident ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                          Incident
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Clear
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                      {report.hasTranscript && (
                        <span className="mr-2" title="Transcript available">T</span>
                      )}
                      {report.hasAudio && (
                        <span title="Audio available">A</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                      <a
                        href={`/admin/reports/${report.id}`}
                        className="text-[#1e3a5f] hover:text-blue-800 font-medium"
                      >
                        View
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  alert = false,
}: {
  label: string
  value: number
  alert?: boolean
}) {
  return (
    <div
      className={`rounded-lg p-5 shadow ${
        alert ? 'bg-red-50 border border-red-200' : 'bg-white'
      }`}
    >
      <p className="text-sm text-gray-500">{label}</p>
      <p
        className={`text-3xl font-bold mt-1 ${
          alert ? 'text-red-600' : 'text-gray-900'
        }`}
      >
        {value}
      </p>
    </div>
  )
}
