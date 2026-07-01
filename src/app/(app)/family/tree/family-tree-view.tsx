"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Maximize2, ZoomIn, ZoomOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  deriveRelatives,
  isInMemoriam,
  isMember,
  lifespan,
  type TreeEdge,
  type TreePerson,
} from "@/lib/family-tree";

// The graph is small, so we lay it out around one focus person ("ego view") and
// let the family TRAVERSE by clicking to recenter — the interaction the
// requirements-lock asks for, and a far better fit for marriages + multiple
// parents than a single global org-chart layout. We show two generations up
// (parents, grandparents) and down (children, grandchildren), with spouses and
// siblings on the focus row.

type Pos = { x: number; y: number };
type Tier =
  | "focus"
  | "spouse"
  | "sibling"
  | "parent"
  | "child"
  | "grandparent"
  | "grandchild";

// Canvas is a fixed logical space; the focus person always sits at its center,
// so recentering never needs to move the camera to keep them in view.
const CX = 1000;
const CY = 600;
const COL = 200; // horizontal gap between siblings on a row
const ROW = 155; // vertical gap between generations

const MIN_SCALE = 0.5;
const MAX_SCALE = 1.8;
const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

/** Lay a set of ids out on a row, centered on x=0, skipping already-placed ids. */
function placeRow(
  ids: string[],
  y: number,
  placed: Set<string>,
  positions: Map<string, Pos>,
  tierMap: Map<string, Tier>,
  tier: Tier,
) {
  const fresh = ids.filter((id) => !placed.has(id));
  const n = fresh.length;
  fresh.forEach((id, i) => {
    positions.set(id, { x: (i - (n - 1) / 2) * COL, y });
    placed.add(id);
    tierMap.set(id, tier);
  });
}

export function FamilyTreeView({
  people,
  edges,
  initialFocusId,
}: {
  people: TreePerson[];
  edges: TreeEdge[];
  initialFocusId: string;
}) {
  const peopleById = useMemo(
    () => new Map(people.map((p) => [p.id, p])),
    [people],
  );

  const [focusId, setFocusId] = useState(
    peopleById.has(initialFocusId) ? initialFocusId : (people[0]?.id ?? ""),
  );

  const viewportRef = useRef<HTMLDivElement>(null);
  const [vp, setVp] = useState({ w: 0, h: 0 });
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState<Pos | null>(null);
  const [grabbing, setGrabbing] = useState(false);
  const dragRef = useRef<{ px: number; py: number; panX: number; panY: number } | null>(null);
  const centeredRef = useRef(false);

  // Track the viewport size and, on the first measurement, center the canvas on
  // the focus person. Both setState calls run from the observer callback (an
  // external event), not synchronously in the effect body.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setVp({ w: r.width, h: r.height });
      if (!centeredRef.current && r.width > 0) {
        centeredRef.current = true;
        setPan({ x: r.width / 2 - CX, y: r.height / 2 - CY });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const centerPan = (s: number): Pos => ({
    x: vp.w / 2 - s * CX,
    y: vp.h / 2 - s * CY,
  });

  // Layout: place every visible node relative to the focus person.
  const { positions, tierMap } = useMemo(() => {
    const positions = new Map<string, Pos>();
    const tierMap = new Map<string, Tier>();
    const placed = new Set<string>();
    if (!focusId) return { positions, tierMap };

    const rel = deriveRelatives(focusId, edges);
    const grandparents = [
      ...new Set(rel.parents.flatMap((p) => deriveRelatives(p, edges).parents)),
    ];
    const grandchildren = [
      ...new Set(rel.children.flatMap((c) => deriveRelatives(c, edges).children)),
    ];

    // Focus row: focus dead-center, spouses to the right, siblings to the left,
    // so the focus person is always at the canvas center (x=0).
    positions.set(focusId, { x: 0, y: 0 });
    tierMap.set(focusId, "focus");
    placed.add(focusId);
    rel.spouses.forEach((id, i) => {
      if (placed.has(id)) return;
      positions.set(id, { x: (i + 1) * COL, y: 0 });
      tierMap.set(id, "spouse");
      placed.add(id);
    });
    rel.siblings.forEach((id, i) => {
      if (placed.has(id)) return;
      positions.set(id, { x: -(i + 1) * COL, y: 0 });
      tierMap.set(id, "sibling");
      placed.add(id);
    });

    placeRow(rel.parents, -ROW, placed, positions, tierMap, "parent");
    placeRow(rel.children, ROW, placed, positions, tierMap, "child");
    placeRow(grandparents, -2 * ROW, placed, positions, tierMap, "grandparent");
    placeRow(grandchildren, 2 * ROW, placed, positions, tierMap, "grandchild");

    return { positions, tierMap };
  }, [focusId, edges]);

  // Edges to draw: any relationship whose BOTH ends are currently visible.
  const lines = useMemo(() => {
    const out: { key: string; x1: number; y1: number; x2: number; y2: number; type: "parent" | "spouse" }[] = [];
    for (const e of edges) {
      const a = positions.get(e.personA);
      const b = positions.get(e.personB);
      if (!a || !b) continue;
      out.push({
        key: e.id,
        x1: CX + a.x,
        y1: CY + a.y,
        x2: CX + b.x,
        y2: CY + b.y,
        type: e.type,
      });
    }
    return out;
  }, [edges, positions]);

  const focus = peopleById.get(focusId);

  function recenter(id: string) {
    setFocusId(id);
    setPan(centerPan(scale)); // bring the new focus to the middle
  }
  function zoomBy(delta: number) {
    const s = clampScale(scale + delta);
    setScale(s);
    setPan(centerPan(s));
  }
  function reset() {
    setScale(1);
    setPan(centerPan(1));
  }

  // Drag-to-pan. Node buttons stopPropagation on pointerdown, so a drag only
  // starts on the empty canvas — a click on a person recenters instead.
  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    dragRef.current = { px: e.clientX, py: e.clientY, panX: pan?.x ?? 0, panY: pan?.y ?? 0 };
    viewportRef.current?.setPointerCapture(e.pointerId);
    setGrabbing(true);
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = dragRef.current;
    if (!d) return;
    setPan({ x: d.panX + (e.clientX - d.px), y: d.panY + (e.clientY - d.py) });
  }
  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    dragRef.current = null;
    setGrabbing(false);
    viewportRef.current?.releasePointerCapture(e.pointerId);
  }

  const applied = pan ?? { x: 0, y: 0 };
  const focusFirstName = focus?.displayName.split(/\s+/)[0] ?? "this person";

  return (
    <div
      ref={viewportRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      className={cn(
        "relative h-[520px] w-full touch-none select-none overflow-hidden rounded-2xl border border-border/70 bg-surface",
        grabbing ? "cursor-grabbing" : "cursor-grab",
      )}
    >
      {/* Transformed canvas: pan + zoom applied to the whole layer at once. */}
      <div
        className="absolute inset-0 origin-top-left"
        style={{ transform: `translate(${applied.x}px, ${applied.y}px) scale(${scale})` }}
      >
        <svg
          className="pointer-events-none absolute left-0 top-0 overflow-visible"
          width={2 * CX}
          height={2 * CY}
          aria-hidden
        >
          {lines.map((l) => (
            <line
              key={l.key}
              x1={l.x1}
              y1={l.y1}
              x2={l.x2}
              y2={l.y2}
              stroke="var(--color-border)"
              strokeWidth={l.type === "spouse" ? 2 : 1.5}
              strokeDasharray={l.type === "spouse" ? "4 4" : undefined}
            />
          ))}
        </svg>

        {[...positions.entries()].map(([id, pos]) => {
          const person = peopleById.get(id);
          if (!person) return null;
          const tier = tierMap.get(id) ?? "focus";
          const isFocus = tier === "focus";
          const small = tier === "grandparent" || tier === "grandchild";
          const span = lifespan(person);
          const memoriam = isInMemoriam(person);
          return (
            <button
              key={id}
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => recenter(id)}
              style={{ left: CX + pos.x, top: CY + pos.y }}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              aria-label={`Center the tree on ${person.displayName}`}
              aria-current={isFocus ? "true" : undefined}
            >
              <span
                className={cn(
                  "flex flex-col items-center gap-0.5 rounded-lg border bg-surface-raised px-3 py-2 text-center shadow-whisper transition-shadow hover:shadow-panel",
                  small ? "w-32 opacity-90" : "w-40",
                  isFocus &&
                    "w-44 border-accent-family/60 shadow-panel ring-1 ring-accent-family/40",
                  !isFocus && "border-border",
                )}
              >
                <span className="flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className={cn(
                      "size-1.5 shrink-0 rounded-full",
                      isMember(person)
                        ? "bg-accent-family"
                        : "border border-foreground-subtle",
                    )}
                  />
                  {memoriam && (
                    <span aria-label="In memoriam" title="In memoriam" className="text-foreground-muted">
                      †
                    </span>
                  )}
                  <span
                    className={cn(
                      "font-display leading-tight text-foreground",
                      small ? "text-xs" : "text-sm",
                    )}
                  >
                    {person.displayName}
                  </span>
                </span>
                {span && !small && (
                  <span className="text-xs text-foreground-subtle">{span}</span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {/* Zoom / reset controls */}
      <div className="absolute right-3 top-3 flex flex-col gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          onClick={() => zoomBy(0.2)}
          aria-label="Zoom in"
          className="bg-surface-raised"
        >
          <ZoomIn aria-hidden />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          onClick={() => zoomBy(-0.2)}
          aria-label="Zoom out"
          className="bg-surface-raised"
        >
          <ZoomOut aria-hidden />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          onClick={reset}
          aria-label="Reset view"
          className="bg-surface-raised"
        >
          <Maximize2 aria-hidden />
        </Button>
      </div>

      {/* Hint */}
      <p className="pointer-events-none absolute left-4 top-3 text-xs text-foreground-subtle">
        Drag to move · click anyone to recenter
      </p>

      {/* Focus bar — the way into a person's full page. */}
      {focus && (
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 border-t border-border/70 bg-surface-raised/85 px-4 py-2.5 backdrop-blur">
          <p className="min-w-0 truncate text-sm text-foreground-muted">
            Centered on{" "}
            <span className="text-foreground">{focus.displayName}</span>
            {isInMemoriam(focus) && (
              <span className="text-foreground-subtle"> · in memoriam</span>
            )}
          </p>
          <Link
            href={`/family/tree/${focusId}`}
            className="shrink-0 text-sm text-accent-family underline-offset-4 hover:underline"
          >
            Open {focusFirstName}&rsquo;s page &rarr;
          </Link>
        </div>
      )}
    </div>
  );
}
