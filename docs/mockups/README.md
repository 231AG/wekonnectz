# WeKonnectz — UI mock-ups

Design reference for the build. `screens/` holds PNG images of every screen; `html/` holds the static HTML/CSS source of the same screens (open in a browser; exact colours, spacing and type are in the inline styles).

People in the photos are AI-generated and fictional. Use them only as placeholders.

## Design tokens

| Token | Value |
| --- | --- |
| Background | `#0D0D11` |
| Surface 1 | `#17171D` |
| Surface 2 | `#202028` |
| Border | `#30303B` |
| Text | `#F3F1EC` |
| Muted text | `#A9A7B2` |
| Primary (buttons) | `#E3C28E` on text `#17140E` |
| Relationship mode | `#8EB0FF` |
| Casual mode | `#F2945C` |
| Success / available | `#6FCF97` |
| Danger | `#FF8A7E` |
| Display font | Sora 600/700 |
| Body font | Manrope 400–700 |
| Radius | 12–18 px cards, 14 px inputs/buttons, 999 px pills |
| Min touch target | 44 px |

Brand logo colours (orange → pink → purple) come from the WeKonnectz logo; reconcile the palette with the logo in Sprint 0.

## Screens

| Area | File | Screen | Size |
| --- | --- | --- | --- |
| onboarding | `screens/onboarding/01-welcome.png` | Welcome | 390×844 |
| onboarding | `screens/onboarding/02-age-gate.png` | Age gate | 390×844 |
| onboarding | `screens/onboarding/03-phone-otp.png` | Phone + OTP | 390×844 |
| onboarding | `screens/onboarding/04-community-rules.png` | Community rules | 390×844 |
| onboarding | `screens/onboarding/05-about-you.png` | About you | 390×844 |
| onboarding | `screens/onboarding/06-photos.png` | Photos | 390×844 |
| onboarding | `screens/onboarding/07-verification-selfie.png` | Verification selfie | 390×844 |
| onboarding | `screens/onboarding/08-under-review.png` | Under review | 390×844 |
| member | `screens/member/01-home.png` | Home | 390×844 |
| member | `screens/member/02-relationship-discover.png` | Relationship · Discover | 390×844 |
| member | `screens/member/03-casual-available-now.png` | Casual · Available Now | 390×844 |
| member | `screens/member/04-casual-member-profile.png` | Casual · Member profile | 390×844 |
| member | `screens/member/05-message-requests.png` | Message requests | 390×844 |
| member | `screens/member/06-conversation.png` | Conversation | 390×844 |
| member | `screens/member/07-get-a-pass.png` | Get a pass | 390×844 |
| member | `screens/member/08-availability.png` | Availability | 390×844 |
| admin | `screens/admin/01-admin-dashboard.png` | Admin · Dashboard | 1440×980 |
| admin | `screens/admin/02-admin-verification-queue.png` | Admin · Verification queue | 1440×980 |
| admin | `screens/admin/03-admin-reports.png` | Admin · Reports | 1440×980 |

## Known differences from the build spec

- The mock-ups predate spec v3 payments. `Get a pass` shows mobile money only; the spec (§16) adds card subscriptions (Weekly/Monthly) and the mobile money **payment claim** flow (instructions → submit transaction ID + screenshot → claim status). Follow the spec.
- `[App name]` in the mock-ups = **WeKonnectz**.
- Values shown as `[PRICE]`, `[REVIEW TIME]`, `[WINDOW LIMIT]` are open decisions in the spec; never hard-code them.
- Admin dashboard figures are placeholders.
