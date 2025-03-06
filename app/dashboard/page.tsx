"use client"

import { useSession } from "next-auth/react"
import { DashboardLayout } from "@/components/dashboard-layout"
import { ChatInterface } from "@/components/chat-interface"

export default function Dashboard() {
  const { data: session } = useSession()

  return (
    <DashboardLayout>
      <div className="flex flex-col space-y-6 p-6">
        <div>
          <h1 className="text-2xl font-bold">Welcome, {session?.user?.name}</h1>
          <p className="text-muted-foreground">
            Ask questions about your family properties or browse information using the navigation bar
          </p>
        </div>

        <ChatInterface />
      </div>
    </DashboardLayout>
  )
}

