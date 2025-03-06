"use client"

import { useSession } from "next-auth/react"
import { DashboardLayout } from "@/components/dashboard-layout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { FileText, Calendar, Download } from "lucide-react"
import { Button } from "@/components/ui/button"

// Mock data - in a real app, this would come from your database
const documents = [
  {
    id: "1",
    name: "Lakeside Cottage Deed",
    type: "Legal Document",
    dateAdded: "Jan 15, 2023",
    property: "Lakeside Cottage",
  },
  {
    id: "2",
    name: "Downtown Apartment Lease",
    type: "Contract",
    dateAdded: "Mar 22, 2023",
    property: "Downtown Apartment",
  },
  {
    id: "3",
    name: "Mountain Cabin Insurance",
    type: "Insurance",
    dateAdded: "May 10, 2023",
    property: "Mountain Cabin",
  },
  {
    id: "4",
    name: "Property Tax Statement 2023",
    type: "Tax Document",
    dateAdded: "Apr 5, 2023",
    property: "All Properties",
  },
]

export default function DocumentsPage() {
  const { data: session } = useSession()

  return (
    <DashboardLayout>
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Property Documents</h1>
          <p className="text-muted-foreground">Access important documents related to your family properties</p>
        </div>

        <div className="grid gap-4">
          {documents.map((document) => (
            <Card key={document.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                    <CardTitle className="text-lg">{document.name}</CardTitle>
                  </div>
                  <Button variant="ghost" size="icon">
                    <Download className="h-4 w-4" />
                    <span className="sr-only">Download</span>
                  </Button>
                </div>
                <CardDescription>{document.property}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between text-sm">
                  <div className="text-muted-foreground">{document.type}</div>
                  <div className="flex items-center text-muted-foreground">
                    <Calendar className="mr-1 h-4 w-4" />
                    Added {document.dateAdded}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </DashboardLayout>
  )
}

