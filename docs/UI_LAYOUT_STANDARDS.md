# Spark UI Layout Standards

Status: living standard for the current dashboard UI. These rules evolve with the product; they do not restore an earlier information model or API contract.

## Design direction

Spark pages should read in this order:

1. Quiet application shell.
2. Strong page identity and current state.
3. Concise explanation and primary action.
4. Supporting evidence or trends.
5. Optional diagnostic depth.

Older interface captures are a reference for visual restraint, compact rows, and clear hierarchy. Current routes, repository-understanding projections, trajectory features, and compatibility contracts remain authoritative.

## Content rails

| Rail | Maximum width | Intended use |
| --- | ---: | --- |
| Analytics | `1180px` | Dashboard and comparative chart views |
| Standard | `980px` | Activity and pull-request trajectory |
| Reading | `760px` | Evaluation detail, account, and settings |

Page gutters are `32px` on desktop and `16px` below `700px`. A page selects its rail through `--layout-content-width`; it must not introduce an independent hard-coded wrapper width.

## Spacing

Use the shared spacing scale:

| Token | Value | Typical use |
| --- | ---: | --- |
| `--space-1` | `4px` | Closely related labels |
| `--space-2` | `8px` | Icon and control gaps |
| `--space-3` | `12px` | Compact component spacing |
| `--space-4` | `16px` | Rows and small card padding |
| `--space-5` | `24px` | Section content and panel padding |
| `--space-6` | `32px` | Major section separation |
| `--space-7` | `48px` | Page-header separation |
| `--space-8` | `64px` | Large page rhythm |

New components should use these values before introducing an exception.

## Surfaces

- Use a divider for repeated rows; do not turn every row into a card.
- Use `--radius-panel` (`12px`) for major summary or chart panels.
- Use `--radius-card` (`8px`) for small cards.
- Use `--radius-control` (`6px`) for controls.
- Keep at most two visibly nested surface levels.
- Use backgrounds and spacing before adding extra borders or shadows.
- Reserve status colour for meaning and always pair it with text.

## Type and controls

- Page titles use compact line height and approximately `30–36px` type.
- Section titles use `15–18px`; uppercase labels remain secondary.
- Primary row copy uses `14–15px`; metadata uses `12–13px`.
- Standard controls are at least `38px` high.
- Coarse-pointer controls are at least `44px` high.
- Focus order follows the document order; positive `tabindex` values are prohibited.

## Responsive behavior

- Analytics grids collapse to a single column below `760px`.
- Four-up metric summaries become two columns below `760px`.
- Essential information must not require horizontal scrolling.
- Historical rails may scroll horizontally only as secondary inspection tools and must remain keyboard accessible.
- Mobile pages show conclusions before history, methodology, or forensic detail.

## Route hierarchy

### Dashboard

Page controls, operational metrics, needs-attention work, active changes, a compact route into dedicated trend analysis, recent activity, and optional supporting insight. Full comparative charts belong to their overview drilldown rather than the operational dashboard.

### Activity

A scan-focused standard rail. Filters remain close to the heading; repeated changes stay compact and divider-based. Expanded run history is subordinate to the pull-request row.

### Pull request

Title and current state, trajectory summary, key moments, evaluation history, then optional behavior and forensic depth. No current capability is removed when material moves behind disclosure.

### Evaluation detail

A reading rail with flat, divided sections. The V1 contract and existing terminology remain unchanged until the repository-understanding backend gates documented in the compatibility audit are met.

## Review checklist

- The page uses one of the three content rails.
- The primary state and action are visible before diagnostic content.
- Repeated information uses rows and dividers.
- Mobile at `390×844` has no viewport overflow.
- Status remains understandable without colour.
- Heading order and keyboard order match the visual narrative.
- Any disclosure explains the content it hides.
