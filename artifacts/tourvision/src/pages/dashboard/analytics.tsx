import { useGetAnalyticsOverview } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
} from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { motion } from "framer-motion";

const CHART_COLORS = ["#10b981", "#f43f5e", "#8b5cf6", "#f59e0b", "#06b6d4"];

export default function Analytics() {
  const { data, isLoading } = useGetAnalyticsOverview();

  if (isLoading) return <div className="p-6"><Skeleton className="h-screen w-full rounded-2xl" /></div>;

  return (
    <div className="relative p-6 max-w-7xl mx-auto w-full space-y-6">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-16 -right-16 h-72 w-72 rounded-full bg-gradient-to-br from-cyan-200/35 to-transparent blur-3xl" />
      </div>

      <div className="relative rounded-3xl border border-zinc-200 bg-white/90 backdrop-blur p-6 shadow-[0_10px_30px_-18px_rgba(0,0,0,0.45)]">
        <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-[#f5f4ef] px-3 py-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-600">
            Analytics
          </span>
        </div>
        <h1 className="mt-3 text-3xl md:text-4xl font-semibold tracking-tight text-zinc-900">Analytics Overview</h1>
        <p className="text-zinc-500 mt-1 text-sm">
          Interactive performance insights across tours, views, and engagement.
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6 [perspective:1000px]">
        <motion.div
          whileHover={{ y: -5, rotateX: 2, rotateY: -2 }}
          transition={{ type: "spring", stiffness: 240, damping: 18 }}
        >
        <Card className="bg-white border-zinc-200 rounded-2xl shadow-[0_14px_28px_-18px_rgba(0,0,0,0.5)]">
          <CardHeader>
            <CardTitle className="text-lg font-serif">Tours Generated (30 Days)</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data?.toursOverTime || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                <XAxis dataKey="date" stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#ffffff",
                    borderColor: "#d4d4d8",
                    borderRadius: "12px",
                  }}
                />
                <Line type="monotone" dataKey="count" stroke="#10b981" strokeWidth={3} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        </motion.div>

        <motion.div
          whileHover={{ y: -5, rotateX: 2, rotateY: 2 }}
          transition={{ type: "spring", stiffness: 240, damping: 18 }}
        >
        <Card className="bg-white border-zinc-200 rounded-2xl shadow-[0_14px_28px_-18px_rgba(0,0,0,0.5)]">
          <CardHeader>
            <CardTitle className="text-lg font-serif">Top Tours by Views</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.viewsByTour || []} layout="vertical" margin={{ left: 50 }}>
                <XAxis type="number" stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis dataKey="address" type="category" stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} width={120} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#ffffff",
                    borderColor: "#d4d4d8",
                    borderRadius: "12px",
                  }}
                />
                <Bar dataKey="views" fill="#f43f5e" radius={[0, 8, 8, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        </motion.div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6 [perspective:1000px]">
        <motion.div
          whileHover={{ y: -5, rotateX: 2, rotateY: -2 }}
          transition={{ type: "spring", stiffness: 240, damping: 18 }}
        >
          <Card className="bg-white border-zinc-200 rounded-2xl shadow-[0_14px_28px_-18px_rgba(0,0,0,0.5)]">
            <CardHeader>
              <CardTitle className="text-lg font-serif">Views by Country</CardTitle>
            </CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data?.viewsByCountry || []}
                    dataKey="views"
                    nameKey="country"
                    innerRadius={55}
                    outerRadius={95}
                    paddingAngle={2}
                  >
                    {(data?.viewsByCountry || []).map((_, idx) => (
                      <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#ffffff",
                      borderColor: "#d4d4d8",
                      borderRadius: "12px",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          whileHover={{ y: -5, rotateX: 2, rotateY: 2 }}
          transition={{ type: "spring", stiffness: 240, damping: 18 }}
        >
          <Card className="bg-white border-zinc-200 rounded-2xl shadow-[0_14px_28px_-18px_rgba(0,0,0,0.5)]">
            <CardHeader>
              <CardTitle className="text-lg font-serif">Processing Trend</CardTitle>
            </CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data?.processingTrend || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                  <XAxis dataKey="date" stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#ffffff",
                      borderColor: "#d4d4d8",
                      borderRadius: "12px",
                    }}
                  />
                  <Line type="monotone" dataKey="avgMinutes" stroke="#8b5cf6" strokeWidth={3} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <Card className="bg-white border-zinc-200 rounded-2xl shadow-[0_14px_28px_-18px_rgba(0,0,0,0.5)]">
        <CardHeader>
          <CardTitle className="text-lg font-serif">Tour Performance</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead>Address</TableHead>
                <TableHead className="text-right">Views</TableHead>
                <TableHead className="text-right">Countries</TableHead>
                <TableHead className="text-right">Avg Time</TableHead>
                <TableHead className="text-right">Leads</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.tourPerformance?.map((row: any) => (
                <TableRow key={row.tourId} className="border-border border-b hover:bg-accent cursor-pointer transition-colors">
                  <TableCell className="font-medium">{row.address}</TableCell>
                  <TableCell className="text-right text-primary font-mono">{row.views}</TableCell>
                  <TableCell className="text-right">{row.countries}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{Math.round(row.avgTimeInTour)}s</TableCell>
                  <TableCell className="text-right font-bold">{row.leads}</TableCell>
                </TableRow>
              ))}
              {!data?.tourPerformance?.length && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">No data available yet</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}