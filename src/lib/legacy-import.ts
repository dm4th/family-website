// Pure, dependency-free helpers for the bulk people import (PRD 18, slice 1).
//
// No DOM and no server imports live here, so this module is safe to run in a
// Client Component (to preview a pasted/uploaded CSV) and in a Server Action
// (to re-validate before committing), and it's trivially unit-testable.
//
// The column set maps 1:1 onto the `people` table's editable columns — the same
// fields the single-row tree form writes — so a bulk import is just that form
// looped, with a preview in front of it.

/** The documented CSV columns, in template order. Maps 1:1 to `people`. */
export const PERSON_IMPORT_COLUMNS = [
  "display_name",
  "given_name",
  "family_name",
  "birth_date",
  "birth_circa",
  "death_date",
  "death_circa",
  "family_branch",
  "bio",
] as const;

export type PersonImportColumn = (typeof PERSON_IMPORT_COLUMNS)[number];

/** The `people` column set an import writes — identical to the tree form's. */
export type ImportedPersonFields = {
  display_name: string;
  given_name: string | null;
  family_name: string | null;
  birth_date: string | null;
  birth_circa: string | null;
  death_date: string | null;
  death_circa: string | null;
  family_branch: string | null;
  bio: string | null;
};

/**
 * A ready-to-fill template with a header row and two worked examples: a member
 * with exact dates and an ancestor with only approximate ("circa") ones. Kept
 * as the single source of truth for the downloadable file so the columns can
 * never drift from {@link PERSON_IMPORT_COLUMNS}.
 */
export const PERSON_IMPORT_TEMPLATE = [
  PERSON_IMPORT_COLUMNS.join(","),
  '"Margaret Ann Mathieson",Margaret,Mathieson,1931-04-12,,1998-11-03,,Mathieson,"Grew up in Aberdeen; emigrated to Boston in 1952."',
  '"Thomas Mathieson",Thomas,Mathieson,,circa 1903,,summer 1971,Mathieson,"Ran the family hardware store for forty years."',
].join("\n") + "\n";

// ---------------------------------------------------------------------------
// CSV parsing (RFC 4180-ish). Dependency-free so we don't add a parser lib to
// the bundle; handles quoted fields, embedded commas/newlines, and "" escapes.
// ---------------------------------------------------------------------------

/**
 * Parse CSV text into a grid of cells. Quoted fields may contain commas,
 * newlines, and doubled quotes (`""` → `"`). Both `\n` and `\r\n` (and a lone
 * `\r`) terminate a record outside quotes. Fully-blank lines are dropped.
 */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, ""); // strip a leading BOM
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      endField();
    } else if (c === "\n") {
      endRow();
    } else if (c === "\r") {
      endRow();
      if (text[i + 1] === "\n") i++; // swallow the paired LF
    } else {
      field += c;
    }
  }
  // Flush a final record that had no trailing newline.
  if (field.length > 0 || row.length > 0) endRow();

  // Drop wholly-empty rows (blank lines, or a trailing newline artifact).
  return rows.filter((r) => r.some((cell) => cell.trim().length > 0));
}

// ---------------------------------------------------------------------------
// Row mapping + validation.
// ---------------------------------------------------------------------------

export type ParsedImportRow = {
  /** 1-based data-row number (excludes the header), for the preview table. */
  rowNumber: number;
  fields: ImportedPersonFields;
  /** Non-fatal notes (bad date dropped, etc.). Row is still importable. */
  warnings: string[];
  /** false when `display_name` is missing — the row cannot be imported. */
  importable: boolean;
};

export type ParseResult =
  | { ok: false; error: string }
  | {
      ok: true;
      rows: ParsedImportRow[];
      recognized: PersonImportColumn[];
      ignored: string[];
    };

function normalizeHeader(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, "_");
}

/** True for a strict ISO calendar date that is also a real day. */
export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

/** Normalize a display name for case-insensitive dedup comparisons. */
export function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Parse CSV text into validated rows. Fatal errors (empty file, no
 * `display_name` column) short-circuit with `ok: false`; everything else is a
 * per-row warning so one bad cell never sinks the batch.
 */
export function parsePeopleCsv(input: string): ParseResult {
  const grid = parseCsv(input);
  if (grid.length === 0) {
    return { ok: false, error: "The file is empty." };
  }

  const header = grid[0]!.map(normalizeHeader);
  const known = new Set<string>(PERSON_IMPORT_COLUMNS);
  const columnIndex = new Map<PersonImportColumn, number>();
  const ignored: string[] = [];
  header.forEach((name, idx) => {
    if (known.has(name) && !columnIndex.has(name as PersonImportColumn)) {
      columnIndex.set(name as PersonImportColumn, idx);
    } else if (name.length > 0) {
      ignored.push(grid[0]![idx]!.trim());
    }
  });

  if (!columnIndex.has("display_name")) {
    return {
      ok: false,
      error:
        "No 'display_name' column found. Download the template and keep its header row.",
    };
  }

  const cell = (cols: string[], col: PersonImportColumn): string | null => {
    const idx = columnIndex.get(col);
    if (idx === undefined) return null;
    const v = cols[idx];
    if (typeof v !== "string") return null;
    const t = v.trim();
    return t.length ? t : null;
  };

  const rows: ParsedImportRow[] = [];
  for (let r = 1; r < grid.length; r++) {
    const cols = grid[r]!;
    const warnings: string[] = [];

    const display_name = cell(cols, "display_name");

    // Validate the two exact-date columns; a malformed date is dropped (kept
    // null) with a warning rather than failing the row.
    const readDate = (col: PersonImportColumn, label: string): string | null => {
      const raw = cell(cols, col);
      if (!raw) return null;
      if (!isValidIsoDate(raw)) {
        warnings.push(`${label} "${raw}" isn't a valid YYYY-MM-DD date; left blank.`);
        return null;
      }
      return raw;
    };

    const fields: ImportedPersonFields = {
      display_name: display_name ?? "",
      given_name: cell(cols, "given_name"),
      family_name: cell(cols, "family_name"),
      birth_date: readDate("birth_date", "Birth date"),
      birth_circa: cell(cols, "birth_circa"),
      death_date: readDate("death_date", "Death date"),
      death_circa: cell(cols, "death_circa"),
      family_branch: cell(cols, "family_branch"),
      bio: cell(cols, "bio"),
    };

    if (!display_name) {
      warnings.push("Missing a name, so this row can't be imported.");
    }

    rows.push({
      rowNumber: r,
      fields,
      warnings,
      importable: Boolean(display_name),
    });
  }

  return {
    ok: true,
    rows,
    recognized: [...columnIndex.keys()],
    ignored,
  };
}

// ---------------------------------------------------------------------------
// Dedup verdicts. Case-insensitive on display name, against both the existing
// people and earlier rows in the same file (a spreadsheet often repeats names).
// ---------------------------------------------------------------------------

export type DedupVerdict = "new" | "duplicate-existing" | "duplicate-in-file";

/**
 * Assign a dedup verdict to each importable row. Non-importable rows (no name)
 * are marked "new" but the caller should exclude them by their `importable`
 * flag; they're never counted as duplicates.
 */
export function computeVerdicts(
  rows: ParsedImportRow[],
  existingNamesLower: Iterable<string>,
): Map<number, DedupVerdict> {
  const existing = new Set<string>();
  for (const n of existingNamesLower) existing.add(n);
  const seenInFile = new Set<string>();
  const verdicts = new Map<number, DedupVerdict>();

  for (const row of rows) {
    if (!row.importable) {
      verdicts.set(row.rowNumber, "new");
      continue;
    }
    const key = normalizeName(row.fields.display_name);
    if (existing.has(key)) {
      verdicts.set(row.rowNumber, "duplicate-existing");
    } else if (seenInFile.has(key)) {
      verdicts.set(row.rowNumber, "duplicate-in-file");
    } else {
      verdicts.set(row.rowNumber, "new");
      seenInFile.add(key);
    }
  }
  return verdicts;
}
