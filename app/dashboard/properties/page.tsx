"use client"

import { useSession } from "next-auth/react"
import { DashboardLayout } from "@/components/dashboard-layout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { MapPin, Home, Users } from "lucide-react"

// Mock data - in a real app, this would come from your database
const properties = [
  {
    id: "1",
    name: "Lakeside Cottage",
    address: "123 Lake Road, Lakeville",
    type: "Vacation Home",
    familyMembers: ["John Doe", "Jane Doe", "Sam Doe"],
    image: "/placeholder.svg?height=200&width=300",
  },
  {
    id: "2",
    name: "Downtown Apartment",
    address: "456 Main Street, Metropolis",
    type: "Apartment",
    familyMembers: ["John Doe", "Jane Doe"],
    image: "/placeholder.svg?height=200&width=300",
  },
  {
    id: "3",
    name: "Mountain Cabin",
    address: "789 Mountain View, Highland",
    type: "Vacation Home",
    familyMembers: ["John Doe", "Jane Doe", "Sam Doe", "Emma Doe"],
    image: "/placeholder.svg?height=200&width=300",
  },
]

export default function PropertiesPage() {
  const { data: session } = useSession()

  return (
    <DashboardLayout>
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Family Properties</h1>
          <p className="text-muted-foreground">View and manage properties associated with your family</p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {properties.map((property) => (
            <Card key={property.id} className="overflow-hidden">
              <div className="aspect-video w-full overflow-hidden">
                <img
                  src={property.image || "/placeholder.svg"}
                  alt={property.name}
                  className="h-full w-full object-cover"
                />
              </div>
              <CardHeader>
                <CardTitle>{property.name}</CardTitle>
                <CardDescription className="flex items-center">
                  <MapPin className="mr-1 h-4 w-4" />
                  {property.address}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center text-sm">
                    <Home className="mr-2 h-4 w-4 text-muted-foreground" />
                    <span>{property.type}</span>
                  </div>
                  <div className="flex items-center text-sm">
                    <Users className="mr-2 h-4 w-4 text-muted-foreground" />
                    <span>{property.familyMembers.length} family members have access</span>
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

