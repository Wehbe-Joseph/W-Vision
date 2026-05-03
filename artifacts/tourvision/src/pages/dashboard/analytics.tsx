import { useGetAnalyticsOverview } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function Analytics() {
  const { data, isLoading } = useGetAnalyticsOverview();

  if (isLoading) return <div className="p-6"><Skeleton className="h-screen w-full rounded-xl" /></div>;

  return (
    <div className="p-6 max-w-7xl mx-auto w-full space-y-6">
      <h1 className="text-3xl font-serif font-bold mb-6">Analytics Overview</h1>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-lg font-serif">Tours Generated (30 Days)</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data?.toursOverTime || []}>
                <XAxis dataKey="date" stroke="#888" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#888" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ backgroundColor: '#111', borderColor: '#222' }} />
                <Line type="monotone" dataKey="count" stroke="#00FF88" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-lg font-serif">Top Tours by Views</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.viewsByTour || []} layout="vertical" margin={{ left: 50 }}>
                <XAxis type="number" stroke="#888" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis dataKey="address" type="category" stroke="#888" fontSize={12} tickLine={false} axisLine={false} width={100} />
                <Tooltip contentStyle={{ backgroundColor: '#111', borderColor: '#222' }} />
                <Bar dataKey="views" fill="#00FF88" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card border-border">
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