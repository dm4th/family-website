---
name: page-mode-orchestrator
description: Use when adding or refactoring a page in the Mathieson family website so Claude first classifies the page into family, operations, or advisory mode and then applies the correct layout and component recipe.
---

# Page Mode Orchestrator

This skill exists to stop Claude from making every page look the same.

Use whenever:
- creating a new page
- redesigning a route
- breaking a dashboard into more coherent sections
- deciding which visual language a feature should use

Read:
- `resources/mode-classifier.md`
- `resources/page-brief-template.md`

## Process
1. Classify the page as Family, Operations, or Advisory.
2. State the classification explicitly before coding.
3. Summarize what the user needs on that page in 3–6 bullets.
4. Pick the matching layout pattern.
5. Choose the dominant module and two secondary modules.
6. Implement using existing shared components when possible.

## Important rule
If a page mixes concerns, do not average them into a bland compromise.
Choose a primary mode and let secondary concerns appear as supporting modules.

## Example
- Photos page -> Family mode
- Property detail page -> Operations mode
- Trust overview page -> Advisory mode
- Dashboard home -> hybrid shell with explicit mode gateways
