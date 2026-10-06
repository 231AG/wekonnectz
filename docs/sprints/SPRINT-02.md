# Sprint 02 — Profile & onboarding

**Goal:** a new member finishes onboarding steps 4–8 (rules, about you, intent, interests, bio) and resumes at the first incomplete step.

## Scope

- Tables: `areas`, `interests`, `user_interests`, `user_settings`, `legal_documents`; profile fields (display name, gender, interested in, area, intents, bio, completion flag).
- Consents stored per document **with version**; a new published version requires acceptance again.
- Detection engine (`lib/domain/detection.ts`) with two modes (OD-31); term list in `app_settings.detection.terms`.
- Screens: Community rules (mock-up 04), About you (mock-up 05), Interests & bio (no mock-up), Photos placeholder (Phase 3).
- Resume routing from database state; steps can't be skipped; earlier steps can be re-opened to edit.

## Out of scope

Photos (Phase 3), verification selfie and Under review (Phase 4), admin management of areas/interests/terms/documents (Phase 10).

## Acceptance checklist

- [x] Each step saves server-side; leaving and returning lands on the first incomplete step
- [x] Consents stored with document version; outdated version refused
- [x] ≥3 interests from the active list; bio ≤ 500 characters
- [x] BR-31: bio or display name with phone numbers, links, handles or prices → "Contact details and prices aren’t allowed."
- [x] OD-31: conversation mode flags only prices / payment / money requests (engine ready for Phase 6)
- [x] BR-20: area chosen from the controlled list only
- [x] DOB not editable (BR-4, from Phase 1)
- [x] Members can't write profile fields directly or call the write functions
- [ ] Owner provides areas (T-09), interests (T-10), reviews detection terms (T-11)
- [ ] Owner confirms Q14–Q16 (gender options, optional bio, display-name rules)
