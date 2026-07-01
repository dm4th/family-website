"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { MapPin } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  buildDecades,
  groupByYear,
  matchesFilter,
  type TimelineItem,
  type TimelinePerson,
  type TimelinePhoto,
} from "@/lib/timeline";

export function TimelineView({
  items,
  people,
  branches,
}: {
  items: TimelineItem[];
  people: TimelinePerson[];
  branches: string[];
}) {
  const [personId, setPersonId] = useState<string | null>(null);
  const [branch, setBranch] = useState<string | null>(null);

  const filtered = useMemo(
    () => items.filter((it) => matchesFilter(it, { personId, branch })),
    [items, personId, branch],
  );
  const groups = useMemo(() => groupByYear(filtered), [filtered]);
  const decades = useMemo(
    () => buildDecades(filtered.map((it) => it.year)),
    [filtered],
  );

  const filterActive = personId !== null || branch !== null;

  function jumpToYear(year: number) {
    document
      .getElementById(`year-${year}`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Filter bar — by family branch, or by a single person (person wins). */}
      <div className="flex flex-col gap-3 border-y border-border/70 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="eyebrow mr-1 text-foreground-subtle">Show</span>
          <FilterChip
            active={!filterActive}
            onClick={() => {
              setPersonId(null);
              setBranch(null);
            }}
          >
            Everyone
          </FilterChip>
          {branches.map((b) => (
            <FilterChip
              key={b}
              active={branch === b}
              onClick={() => {
                setBranch((cur) => (cur === b ? null : b));
                setPersonId(null);
              }}
            >
              {b}
            </FilterChip>
          ))}
        </div>
        {people.length > 0 && (
          <div className="flex items-center gap-2">
            <label htmlFor="tl-person" className="text-sm text-foreground-muted">
              Just one person
            </label>
            <select
              id="tl-person"
              value={personId ?? ""}
              onChange={(e) => {
                setPersonId(e.target.value || null);
                setBranch(null);
              }}
              className="max-w-[16rem] rounded-md border border-input bg-transparent px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
            >
              <option value="">Anyone</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.displayName}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {groups.length === 0 ? (
        <p className="py-10 text-center text-sm text-foreground-muted">
          {filterActive
            ? "Nothing on the timeline matches this filter yet."
            : "The timeline is empty. Record an event, or add dates to archive photos, and they'll appear here."}
        </p>
      ) : (
        <div className="flex flex-col gap-10 lg:flex-row lg:gap-12">
          {/* Jump rail — leap through decades/years. */}
          <nav
            aria-label="Jump to a year"
            className="lg:sticky lg:top-24 lg:h-fit lg:w-40 lg:shrink-0"
          >
            <p className="eyebrow mb-3 text-foreground-subtle">Jump to</p>
            <ul className="flex flex-wrap gap-x-4 gap-y-2 lg:flex-col lg:gap-1.5">
              {decades.map((d) => (
                <li key={d.decade} className="flex flex-col gap-1">
                  <span className="font-display text-sm text-foreground">
                    {d.decade}s
                  </span>
                  <span className="flex flex-wrap gap-x-2 gap-y-1 lg:pl-2">
                    {d.years.map((y) => (
                      <button
                        key={y}
                        type="button"
                        onClick={() => jumpToYear(y)}
                        className="text-xs text-foreground-subtle underline-offset-4 transition-colors hover:text-accent-family hover:underline"
                      >
                        {y}
                      </button>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </nav>

          {/* The stream. */}
          <div className="flex min-w-0 flex-1 flex-col gap-14">
            {groups.map(({ year, items: yearItems }) => {
              const events = yearItems.filter((it) => it.kind === "event");
              const photos = yearItems.filter((it) => it.kind === "photo");
              return (
                <section
                  key={year}
                  id={`year-${year}`}
                  className="flex scroll-mt-24 flex-col gap-6"
                >
                  <div className="flex items-baseline gap-4">
                    <h2 className="font-display text-3xl leading-none text-foreground sm:text-4xl">
                      {year}
                    </h2>
                    <span aria-hidden className="h-px flex-1 bg-border" />
                  </div>

                  {events.map((ev) => (
                    <EventCard key={ev.id} item={ev} />
                  ))}

                  {photos.length > 0 && (
                    <div className="flex flex-col gap-3">
                      {events.length > 0 && (
                        <p className="eyebrow text-foreground-subtle">
                          Photographs
                        </p>
                      )}
                      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                        {photos.flatMap((it) =>
                          it.photos.map((ph) => (
                            <PhotoTile
                              key={ph.id}
                              photo={ph}
                              people={it.people}
                            />
                          )),
                        )}
                      </ul>
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-3 py-1 text-sm transition-colors",
        active
          ? "border-accent-family/60 bg-accent-family/10 text-foreground"
          : "border-border text-foreground-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function PeopleChips({ people }: { people: TimelinePerson[] }) {
  if (people.length === 0) return null;
  return (
    <p className="text-xs text-foreground-subtle">
      {people.map((p, i) => (
        <span key={p.id}>
          {i > 0 && ", "}
          <Link
            href={`/family/tree/${p.id}`}
            className="underline-offset-4 hover:text-foreground hover:underline"
          >
            {p.inMemoriam ? `† ${p.displayName}` : p.displayName}
          </Link>
        </span>
      ))}
    </p>
  );
}

function EventCard({ item }: { item: TimelineItem }) {
  return (
    <article className="flex flex-col gap-2 rounded-2xl border border-border/70 bg-surface-raised px-5 py-5 shadow-whisper sm:px-6">
      <p className="text-xs text-foreground-subtle">{item.dateLabel}</p>
      <h3 className="font-display text-xl leading-tight text-foreground">
        <Link
          href={`/family/timeline/events/${item.id}`}
          className="underline-offset-4 hover:underline"
        >
          {item.title}
        </Link>
      </h3>
      {item.location && (
        <p className="flex items-center gap-1.5 text-sm text-foreground-muted">
          <MapPin className="size-3.5 shrink-0 text-foreground-subtle" aria-hidden />
          {item.location}
        </p>
      )}
      {item.description && (
        <p className="line-clamp-3 max-w-prose whitespace-pre-wrap text-sm leading-relaxed text-foreground-muted">
          {item.description}
        </p>
      )}
      <PeopleChips people={item.people} />
      {item.photos.length > 0 && (
        <ul className="mt-1 flex flex-wrap gap-2">
          {item.photos.slice(0, 6).map((ph) => (
            <li key={ph.id} className="size-16 overflow-hidden rounded-md border border-border/70">
              <TimelineImg photo={ph} className="size-full object-cover" />
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

function PhotoTile({
  photo,
  people,
}: {
  photo: TimelinePhoto;
  people: TimelinePerson[];
}) {
  return (
    <li className="flex flex-col gap-1.5">
      <div className="overflow-hidden rounded-lg border border-border/70 bg-surface">
        <TimelineImg photo={photo} className="aspect-square w-full object-cover" />
      </div>
      {photo.caption && (
        <p className="line-clamp-1 text-xs text-foreground-subtle">
          {photo.caption}
        </p>
      )}
      <PeopleChips people={people} />
    </li>
  );
}

/** Thumb with a graceful fall back to the full object when the thumb 404s. */
function TimelineImg({
  photo,
  className,
}: {
  photo: TimelinePhoto;
  className?: string;
}) {
  const [src, setSrc] = useState(photo.signedUrl);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={photo.caption ?? "Family archive photo"}
      loading="lazy"
      onError={() => {
        if (photo.fallbackUrl && src !== photo.fallbackUrl) setSrc(photo.fallbackUrl);
      }}
      className={className}
    />
  );
}
