import type { NextAuthOptions } from "next-auth"
import GoogleProvider from "next-auth/providers/google"

// Configure NextAuth options
export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        // Add custom claims to the token
        // token.familyId = user.familyId
      }
      return token
    },
    async session({ session, token }) {
      // Here you would add family-specific data to the session
      // For example, fetching the user's family ID and permissions
      return session
    },
  },
  pages: {
    signIn: "/",
    error: "/error",
  },
  secret: process.env.NEXTAUTH_SECRET,
}

// Export a simplified auth check function that doesn't use crypto directly
export async function getSessionData() {
  // This will be implemented in a different way for server and client components
  return null
}

