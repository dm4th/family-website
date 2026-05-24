import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type FeatureCard = {
  title: string;
  description: string;
  href: string;
  status: "ready" | "soon";
  badge?: string | null;
};

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Two cheap counts so the cards show signal instead of static copy.
  const [{ count: memberCount }, { count: propertyCount }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .is("deactivated_at", null),
    supabase
      .from("properties")
      .select("id", { count: "exact", head: true })
      .neq("status", "inactive"),
  ]);

  const firstName =
    (user?.user_metadata?.full_name as string | undefined)?.split(" ")[0] ??
    user?.email?.split("@")[0] ??
    "there";

  const cards: FeatureCard[] = [
    {
      title: "Family Directory",
      description: "Browse everyone's profiles and contribute photos.",
      href: "/family",
      status: "ready",
      badge:
        memberCount === null
          ? null
          : `${memberCount} ${memberCount === 1 ? "person" : "people"}`,
    },
    {
      title: "Properties",
      description: "House rules, photos, contacts — wiki-editable by anyone.",
      href: "/properties",
      status: "ready",
      badge:
        propertyCount === null
          ? null
          : `${propertyCount} ${propertyCount === 1 ? "place" : "places"}`,
    },
    {
      title: "Property Booking",
      description: "Reserve dates and avoid double-bookings.",
      href: "/coming-soon/booking",
      status: "soon",
    },
    {
      title: "Documents & AI",
      description: "Ask questions about trust documents.",
      href: "/coming-soon/documents",
      status: "soon",
    },
    {
      title: "Finances",
      description: "Trust performance and distributions.",
      href: "/coming-soon/finances",
      status: "soon",
    },
    {
      title: "Family Timeline",
      description: "Stories, milestones, history — preserved.",
      href: "/coming-soon/timeline",
      status: "soon",
    },
    {
      title: "Messaging",
      description: "In-context comments and a what's-new feed.",
      href: "/coming-soon/messaging",
      status: "soon",
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
          Welcome back, {firstName}.
        </h1>
        <p className="text-muted-foreground mt-1">
          Pick something to dig into.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <Link key={card.href} href={card.href} className="group">
            <Card className="h-full transition-colors group-hover:border-foreground/30">
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">{card.title}</CardTitle>
                  {card.status === "soon" ? (
                    <span className="text-[10px] uppercase tracking-wide rounded-full border border-border px-2 py-0.5 text-muted-foreground">
                      Coming soon
                    </span>
                  ) : card.badge ? (
                    <span className="text-[10px] uppercase tracking-wide rounded-full border border-border px-2 py-0.5 text-muted-foreground">
                      {card.badge}
                    </span>
                  ) : null}
                </div>
                <CardDescription>{card.description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
