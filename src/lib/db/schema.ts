// Drizzle schema — hand-mirrored from supabase/migrations/.
// The SQL files in supabase/migrations/ are authoritative; this file exists
// only to give the app TypeScript types via `import { db } from "@/lib/db"`.
// When you change the SQL, mirror the change here.

import { sql } from "drizzle-orm";
import {
  date,
  index,
  integer,
  jsonb,
  pgSchema,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// ----------------------------------------------------------------------------
// Reference to Supabase's auth.users for FKs. We don't manage this table.
// ----------------------------------------------------------------------------
const authSchema = pgSchema("auth");
export const authUsers = authSchema.table("users", {
  id: uuid("id").primaryKey(),
  email: text("email"),
});

// ----------------------------------------------------------------------------
// profiles
// ----------------------------------------------------------------------------
export type Role = "admin" | "member" | "guest";

export const profiles = pgTable(
  "profiles",
  {
    id: uuid("id")
      .primaryKey()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    fullName: text("full_name"),
    avatarUrl: text("avatar_url"),
    role: text("role").$type<Role>().notNull().default("member"),
    familyBranch: text("family_branch"),
    generation: integer("generation"),
    relationshipNotes: text("relationship_notes"),
    phone: text("phone"),
    bio: text("bio"),
    deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("profiles_branch_gen_idx").on(table.familyBranch, table.generation)],
);

export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;

// ----------------------------------------------------------------------------
// properties
// ----------------------------------------------------------------------------
export type PropertyStatus = "active" | "maintenance" | "inactive";

export const properties = pgTable("properties", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  location: text("location"),
  description: text("description"),
  address: text("address"),
  heroImagePath: text("hero_image_path"),
  amenities: text("amenities").array().notNull().default(sql`'{}'`),
  guidelines: text("guidelines"),
  howTo: text("how_to"),
  status: text("status").$type<PropertyStatus>().notNull().default("active"),
  updatedBy: uuid("updated_by").references(() => authUsers.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Property = typeof properties.$inferSelect;
export type NewProperty = typeof properties.$inferInsert;

// ----------------------------------------------------------------------------
// property_contacts
// ----------------------------------------------------------------------------
export const propertyContacts = pgTable(
  "property_contacts",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    name: text("name"),
    phone: text("phone"),
    email: text("email"),
    notes: text("notes"),
    sortOrder: integer("sort_order").notNull().default(0),
    updatedBy: uuid("updated_by").references(() => authUsers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("property_contacts_property_idx").on(
      table.propertyId,
      table.sortOrder,
    ),
  ],
);

export type PropertyContact = typeof propertyContacts.$inferSelect;
export type NewPropertyContact = typeof propertyContacts.$inferInsert;

// ----------------------------------------------------------------------------
// photos
// ----------------------------------------------------------------------------
export type PhotoSource = "upload" | "google_photos";

export const photos = pgTable(
  "photos",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    storagePath: text("storage_path").notNull(),
    caption: text("caption"),
    takenAt: date("taken_at"),
    uploadedBy: uuid("uploaded_by").references(() => authUsers.id, {
      onDelete: "set null",
    }),
    propertyId: uuid("property_id").references(() => properties.id, {
      onDelete: "set null",
    }),
    source: text("source").$type<PhotoSource>().notNull().default("upload"),
    googleMediaId: text("google_media_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("photos_property_idx").on(table.propertyId, table.createdAt),
    index("photos_uploaded_by_idx").on(table.uploadedBy),
    index("photos_source_idx").on(table.source),
  ],
);

export type Photo = typeof photos.$inferSelect;
export type NewPhoto = typeof photos.$inferInsert;

// ----------------------------------------------------------------------------
// photo_subjects
// ----------------------------------------------------------------------------
export const photoSubjects = pgTable(
  "photo_subjects",
  {
    photoId: uuid("photo_id")
      .notNull()
      .references(() => photos.id, { onDelete: "cascade" }),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.photoId, table.profileId] }),
    index("photo_subjects_profile_idx").on(table.profileId),
  ],
);

export type PhotoSubject = typeof photoSubjects.$inferSelect;

// ----------------------------------------------------------------------------
// revisions (immutable audit log)
// ----------------------------------------------------------------------------
export type RevisionEntity = "property" | "profile" | "property_contact";

export const revisions = pgTable(
  "revisions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    entityType: text("entity_type").$type<RevisionEntity>().notNull(),
    entityId: uuid("entity_id").notNull(),
    changedBy: uuid("changed_by").references(() => authUsers.id, {
      onDelete: "set null",
    }),
    diff: jsonb("diff").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("revisions_entity_idx").on(
      table.entityType,
      table.entityId,
      table.createdAt,
    ),
  ],
);

export type Revision = typeof revisions.$inferSelect;
export type NewRevision = typeof revisions.$inferInsert;

// ----------------------------------------------------------------------------
// invitations
// ----------------------------------------------------------------------------
export type InvitationStatus = "pending" | "accepted" | "expired" | "revoked";

export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    email: text("email").notNull(),
    role: text("role").$type<Role>().notNull().default("member"),
    invitedBy: uuid("invited_by").references(() => authUsers.id, {
      onDelete: "set null",
    }),
    status: text("status").$type<InvitationStatus>().notNull().default("pending"),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("invitations_one_pending_per_email")
      .on(sql`lower(${table.email})`)
      .where(sql`status = 'pending'`),
  ],
);

export type Invitation = typeof invitations.$inferSelect;
export type NewInvitation = typeof invitations.$inferInsert;

// ----------------------------------------------------------------------------
// property_admins — per-property admin role (join table)
// ----------------------------------------------------------------------------
export const propertyAdmins = pgTable(
  "property_admins",
  {
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    grantedBy: uuid("granted_by").references(() => authUsers.id, {
      onDelete: "set null",
    }),
    grantedAt: timestamp("granted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.propertyId, table.profileId] }),
    index("property_admins_profile_idx").on(table.profileId),
  ],
);

export type PropertyAdmin = typeof propertyAdmins.$inferSelect;
export type NewPropertyAdmin = typeof propertyAdmins.$inferInsert;
