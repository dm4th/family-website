# 05 — General File Uploads & Google Picker

**Phase**: 1.5 (post-first-slice polish) · **Depends on**: 02, 03 (photo upload component already exists)

## Goal

Extend the photo upload component to handle a few non-photo file types (PDF, common docs) for general family stuff like recipes, scanned cards, kids' drawings. Optionally add a Google Photos / Drive Picker so people can pull from where they already keep their files.

> **Hard stop**: this is *not* for trust / legal / financial documents. Those wait for Phase 3 and the security decision. The UI should explicitly say so.

## User stories

- As a member, I upload Grandma's secret-recipe PDF to the family files area; everyone can download it.
- As a Gmail-using member on iPhone, I tap "Add from Google Photos" and pick five photos from this weekend; they appear in the property gallery without me having to download then re-upload.

## In scope

- Generic file upload to Supabase Storage with attribution + categorization
- A small "Family files" index page listing general (non-property, non-profile) files
- Google Photos Picker integration (the new Picker API, not full library OAuth)
- Google Drive Picker integration (for PDFs, etc.)
- Copy-on-pick: when a user picks from Google, we download the file server-side and store in Supabase. Source of truth = Supabase.

## Out of scope

- Trust / legal / financial doc uploads (Phase 3)
- Folder hierarchies
- File versioning beyond Supabase Storage's built-in
- Sharing files externally

## Open questions

- File size limits? Recommendation: 50MB for general files, 25MB per photo. Configurable.
- Do we run any malware scanning? Recommendation: defer — small private audience, low risk; revisit if scope grows.
- Picker UX: separate "Add from Google" button next to "Upload", or one unified "Add files" modal with tabs? Recommendation: unified modal.

## References / reuse

- Upload component from `02-family-directory.md` — extend type filter rather than fork
