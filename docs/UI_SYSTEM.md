# R.O.F.I.E.S Interface System

## Direction

The interface uses a **bench sheet** visual language: matte technical surfaces, fine measurement rules, restrained cyan signal rails, and compact operational notation. It should feel like a carefully maintained robotics workbench—not a generic analytics dashboard. The memorable element is the vertical cyan availability rail used on equipment and operation cards; its tick pattern encodes physical stock state rather than serving as decoration.

UI UX Pro Max supplied the calm cyan foundation, 4/8 px rhythm, 44 px touch targets, and responsive/accessibility checklist. Its generated restaurant classification and wellness serif pairing were rejected as a poor domain match. Frontend Design’s subject-first critique replaced them with an engineering-specific type and layout system.

## Typography

- **Display and headings:** Space Grotesk Variable, 540–680 weight. Its squared forms echo control labels without becoming a novelty face.
- **Body and controls:** Source Sans 3 Variable, 400–650 weight for high legibility in dense operational screens.
- **Operational data:** system monospace for IDs, quantities, timestamps, and tabular figures only.
- Base text is 16 px with 1.55 line-height. Working labels never fall below 13 px.
- Desktop long-form measure is capped at 72 characters; mobile copy targets 35–60 characters.

## Color roles

| Token          | Light     | Dark      | Use                                           |
| -------------- | --------- | --------- | --------------------------------------------- |
| Canvas         | `#F4F8F8` | `#091517` | Page background                               |
| Surface        | `#FFFFFF` | `#102226` | Primary working surface                       |
| Surface raised | `#EAF2F3` | `#173136` | Selected and nested surfaces                  |
| Ink            | `#102A2E` | `#F0FAFA` | Primary text                                  |
| Muted ink      | `#526B70` | `#A8C0C4` | Secondary text                                |
| Signal         | `#007F95` | `#55D5E7` | Primary action, focus, active rail            |
| Signal strong  | `#005F70` | `#8CE6F2` | Hover/high-emphasis signal                    |
| Healthy        | `#147A55` | `#6ED6AB` | Available/complete, always with text/icon     |
| Warning        | `#9A5A00` | `#FFC46B` | Due/conflict/low stock, always with text/icon |
| Danger         | `#B42335` | `#FF8A99` | Destructive/error, always with text/icon      |
| Border         | `#C8D7D9` | `#315057` | Dividers and component boundaries             |

All component styles use semantic tokens. Normal text pairs meet at least 4.5:1 contrast; focus and non-text state indicators meet 3:1.

## Spacing, shape, and elevation

- Spacing scale: 4, 8, 12, 16, 24, 32, 48, and 64 px.
- Mobile gutters: 16 px; tablet: 24 px; desktop: 32 px.
- Controls are at least 44 px high. Adjacent touch controls retain at least 8 px separation.
- Radius: 6 px for inputs, 10 px for controls/cards, 14 px for dialogs. Circles are reserved for avatars and notification dots.
- Elevation is quiet: borders establish hierarchy; a single low shadow lifts dialogs/popovers. Cards do not float gratuitously.
- Z-index scale: content 0, sticky 20, navigation 40, dialog scrim 80, dialog 90, toast 100.

## Icons and status

- Lucide outline icons at 18, 20, or 24 px with consistent 1.75–2 px strokes.
- No emoji or icon-only navigation. Icon-only utility buttons require an accessible name and 44 px hit area.
- Every status includes visible text and a semantic icon or shape; color is supplemental.
- Status terms follow `docs/DOMAIN_MODEL.md`: reservations are not called issued before physical handover, and expected capacity is explicitly labeled expected.

## Components and states

- Buttons have one primary action per region, visible hover/pressed/focus/loading/disabled states, and no layout-shifting transform.
- Inputs use persistent labels and helper/error text. On validation failure, focus moves to the first invalid control.
- Tables switch to labeled record cards below 720 px; essential actions remain visible without horizontal scrolling.
- Dialogs have a heading, explicit close/cancel path, focus trap/return, and confirmation text for destructive or inventory-changing actions.
- Loading over 300 ms uses reserved skeleton geometry. Empty states explain the next useful action.
- Conflict states show refreshed availability and safe alternatives. Permission errors disclose no record detail. Unexpected errors show a correlation ID.
- Offline/degraded mode leaves clearly marked cached catalog reads available and disables inventory mutations.

## Responsive shell

- 375–767 px: compact top bar and a four-destination labeled bottom navigation. Staff task pages use full-width cards and sticky, safe-area-aware confirmation bars.
- 768–1023 px: two-column working layouts where useful; navigation remains compact.
- 1024 px and above: persistent 248 px sidebar with a maximum 1440 px content canvas.
- Primary content order is preserved across breakpoints. No essential content is hover-only or hidden solely to fit desktop composition.
- In connected mode, the shell shows the signed-in account name, role/status, and unread in-app notification count from server state. Demo mode keeps fictional names and counts clearly labeled as demo data.

## Auth and onboarding surfaces

- Authentication, onboarding, pending, and review pages use the same bench-sheet visual language as the catalog: persistent labels, calm cyan signals, explicit privacy copy, and large touch targets.
- Signup and recovery acknowledgements are intentionally generic and do not reveal whether an address exists.
- Pending/rejected application states explain access restrictions in text, not color alone.
- College-ID controls must never render durable object paths, signed URLs, or raw storage names.

## Motion and accessibility

- Motion is functional and limited to 150–220 ms opacity/color transitions. Loading indicators may rotate; content does not animate continuously.
- `prefers-reduced-motion: reduce` removes nonessential transitions and smooth scrolling.
- A skip link, sequential headings, semantic landmarks, visible `:focus-visible`, live regions, associated form labels/errors, and logical DOM order are mandatory.
- Zoom is never disabled. Layout remains operable at 200% zoom and with enlarged text.
- Verification widths: 375, 768, 1024, and 1440 px; mobile landscape is included.
