// Mathieson Family design system — shell primitives.
//
// These are the editorial building blocks layered on top of shadcn/ui.
// Each interior page should compose itself from these, picking a panel
// tone that matches the page mode (Family / Operations / Advisory).

export {
  Panel,
  SalonPanel,
  LedgerPanel,
  BriefingPanel,
  PanelHeader,
  PanelEyebrow,
  PanelTitle,
  PanelDescription,
  PanelBody,
  PanelFooter,
  panelVariants,
} from "./panel";

export { PageIntro } from "./page-intro";
export type { PageMode } from "./page-intro";
export { Eyebrow } from "./eyebrow";
export { SectionRule } from "./section-rule";
export { StatLine, StatRow } from "./stat-line";
export { ActivityDigest, ActivityDigestItem } from "./activity-digest";
