import { LoginButton } from "@/components/login-button"

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100 p-4">
      <div className="w-full max-w-md space-y-8 rounded-lg bg-white p-6 shadow-lg">
        <div className="text-center">
          <h1 className="text-3xl font-bold">Family Property Portal</h1>
          <p className="mt-2 text-slate-600">
            Access information about family properties and get answers to your questions
          </p>
        </div>

        <div className="flex flex-col items-center space-y-4">
          <LoginButton />

          <div className="text-sm text-slate-500">
            Sign in with your Google account to access your family's properties
          </div>
        </div>
      </div>
    </div>
  )
}

