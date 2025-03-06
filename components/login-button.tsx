"use client"

import { signIn, useSession } from "next-auth/react"
import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"

export function LoginButton() {
  const { data: session, status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === "authenticated" && session) {
      router.push("/dashboard")
    }
  }, [session, status, router])

  return (
    <Button onClick={() => signIn("google", { callbackUrl: "/dashboard" })} className="w-full">
      Sign in with Google
    </Button>
  )
}

