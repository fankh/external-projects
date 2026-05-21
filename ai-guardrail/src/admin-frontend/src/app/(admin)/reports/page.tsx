"use client";

import React, { useEffect, useState } from "react";
import {
  FileBarChart,
  Download,
  Clock,
  Loader2,
  CheckCircle,
  XCircle,
  CalendarDays,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAdminStore } from "@/stores/admin-store";

const reportTypes = [
  { value: "usage", label: "Usage Report", description: "User activity and query statistics" },
  { value: "security", label: "Security Report", description: "Security events and threat analysis" },
  { value: "compliance", label: "Compliance Report", description: "Regulatory compliance status" },
  { value: "team_summary", label: "Team Summary", description: "Department-level usage summary" },
];

const statusIcons: Record<string, React.ElementType> = {
  generating: Loader2,
  ready: CheckCircle,
  failed: XCircle,
};

const statusVariant: Record<string, "warning" | "success" | "destructive"> = {
  generating: "warning",
  ready: "success",
  failed: "destructive",
};

const typeLabels: Record<string, string> = {
  usage: "Usage",
  security: "Security",
  compliance: "Compliance",
  team_summary: "Team Summary",
};

export default function ReportsPage() {
  const { reports, reportsLoading, fetchReports, generateReport } = useAdminStore();

  const [selectedType, setSelectedType] = useState("usage");
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [format, setFormat] = useState("pdf");
  const [scheduleFrequency, setScheduleFrequency] = useState("weekly");
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  async function handleGenerate() {
    setGenerating(true);
    await generateReport({
      type: selectedType,
      startDate,
      endDate,
      format,
    });
    setGenerating(false);
  }

  return (
    <div className="space-y-6">
      {/* Report Generator */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <FileBarChart className="h-5 w-5" />
            Generate Report
          </CardTitle>
          <CardDescription>
            Select report type, date range, and format to generate a new report.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Report Type Selector */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Report Type</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {reportTypes.map((type) => (
                <button
                  key={type.value}
                  onClick={() => setSelectedType(type.value)}
                  className={`text-left p-3 rounded-sm border-2 transition-colors ${
                    selectedType === type.value
                      ? "border-primary bg-primary/5"
                      : "border-transparent bg-muted/50 hover:bg-muted"
                  }`}
                >
                  <p className="text-sm font-medium">{type.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {type.description}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Date Range + Format */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="space-y-2 flex-1">
              <label className="text-sm font-medium flex items-center gap-1.5">
                <CalendarDays className="h-4 w-4" />
                Start Date
              </label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2 flex-1">
              <label className="text-sm font-medium flex items-center gap-1.5">
                <CalendarDays className="h-4 w-4" />
                End Date
              </label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Format</label>
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value)}
                className="h-10 w-full sm:w-32 rounded-sm border border-input bg-background px-3 text-sm"
              >
                <option value="pdf">PDF</option>
                <option value="xlsx">XLSX</option>
                <option value="json">JSON</option>
              </select>
            </div>
          </div>

          <Button onClick={handleGenerate} disabled={generating} className="gap-2">
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Generating...
              </>
            ) : (
              <>
                <FileBarChart className="h-4 w-4" /> Generate Report
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Recent Reports */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Reports</CardTitle>
        </CardHeader>
        <CardContent>
          {reportsLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-3 font-medium text-muted-foreground">Type</th>
                    <th className="pb-3 font-medium text-muted-foreground">Scope</th>
                    <th className="pb-3 font-medium text-muted-foreground">Period</th>
                    <th className="pb-3 font-medium text-muted-foreground">Format</th>
                    <th className="pb-3 font-medium text-muted-foreground">Status</th>
                    <th className="pb-3 font-medium text-muted-foreground text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((report) => {
                    const StatusIcon = statusIcons[report.status] ?? Clock;
                    return (
                      <tr key={report.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                        <td className="py-3 font-medium">
                          {typeLabels[report.type] ?? report.type}
                        </td>
                        <td className="py-3 text-muted-foreground">{report.scope}</td>
                        <td className="py-3 text-muted-foreground">{report.period}</td>
                        <td className="py-3">
                          <Badge variant="outline" className="uppercase">
                            {report.format}
                          </Badge>
                        </td>
                        <td className="py-3">
                          <Badge
                            variant={statusVariant[report.status] ?? "secondary"}
                            className="gap-1"
                          >
                            <StatusIcon
                              className={`h-3 w-3 ${report.status === "generating" ? "animate-spin" : ""}`}
                            />
                            {report.status}
                          </Badge>
                        </td>
                        <td className="py-3 text-right">
                          {report.status === "ready" && report.downloadUrl && (
                            <Button variant="ghost" size="sm" className="gap-1">
                              <Download className="h-4 w-4" /> Download
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {reports.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-muted-foreground">
                        No reports generated yet
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Schedule Reports */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Schedule Report
          </CardTitle>
          <CardDescription>
            Set up automated report generation on a recurring schedule.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4 items-end">
            <div className="space-y-2 flex-1">
              <label className="text-sm font-medium">Report Type</label>
              <select className="w-full h-10 rounded-sm border border-input bg-background px-3 text-sm">
                <option value="usage">Usage Report</option>
                <option value="security">Security Report</option>
                <option value="compliance">Compliance Report</option>
                <option value="team_summary">Team Summary</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Frequency</label>
              <select
                value={scheduleFrequency}
                onChange={(e) => setScheduleFrequency(e.target.value)}
                className="h-10 w-full sm:w-40 rounded-sm border border-input bg-background px-3 text-sm"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
              </select>
            </div>
            <Button variant="outline" className="gap-2">
              <Clock className="h-4 w-4" /> Schedule
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
