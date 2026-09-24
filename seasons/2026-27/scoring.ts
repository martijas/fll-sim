// BIOGLOW (2026-27) robot game scoring, following the official Robot Game Rulebook and
// Challenge Update 01 (Lucky Leaves, 2 Sep 2026). Mirrors the official scoresheet questions.

export type Answer = boolean | number | string;

export interface Question {
  id: string;
  label: string;
  kind: "yesno" | "count" | "choice";
  max?: number;
  options?: string[];
  /** Missions with FIRST's "No Equipment Constraint" symbol. */
  noEquipment?: boolean;
}

export interface MissionSheet {
  id: string;
  number: number | null;
  name: string;
  questions: Question[];
}

export const SHEET: MissionSheet[] = [
  { id: "ei", number: null, name: "Equipment Inspection", questions: [{ id: "ei", label: "(Prematch) The robot and all equipment fit completely in one launch area and under the height limit", kind: "yesno" }] },
  { id: "m01", number: 1, name: "Drone Survey", questions: [
    { id: "m01a", label: "The drone is no longer touching the mat", kind: "yesno" },
    { id: "m01b", label: "Bonus: and the LiDAR map is completely flipped over, with the scan marker at least partly in the survey area", kind: "yesno" },
  ] },
  { id: "m02", number: 2, name: "Exploding Seeds", questions: [{ id: "m02", label: "Number of seeds no longer touching the stalk", kind: "count", max: 3 }] },
  { id: "m03", number: 3, name: "Flip the Rock", questions: [
    { id: "m03a", label: "The research flag is down", kind: "yesno" },
    { id: "m03b", label: "Bonus: and the rock has been returned to its original starting position", kind: "yesno" },
  ] },
  { id: "m04", number: 4, name: "Lucky Leaves", questions: [
    { id: "m04a", label: "Number of leaves no longer touching the nest", kind: "count", max: 2 },
    { id: "m04b", label: "The katydid is at least partly in the leaf habitat", kind: "yesno" },
    { id: "m04c", label: "Bonus: and the katydid is in its original position and remained at least partly in the leaf habitat throughout the match", kind: "yesno" },
  ] },
  { id: "m05", number: 5, name: "Reaching Roots", questions: [{ id: "m05", label: "The plant root is extended", kind: "choice", options: ["No", "Partially", "Completely"] }] },
  { id: "m06", number: 6, name: "Leafcutter Frenzy", questions: [
    { id: "m06a", label: "The ant is touching the nest", kind: "yesno" },
    { id: "m06b", label: "Number of leaf fragments contained within the nest", kind: "count", max: 4 },
  ] },
  { id: "m07", number: 7, name: "Humongous Fungus", questions: [
    { id: "m07a", label: "The mycelium is completely extended", kind: "yesno" },
    { id: "m07b", label: "Bonus: Number of connections formed between one team's extended mycelium and the opposing team's fully extended plant root", kind: "count", max: 2 },
  ] },
  { id: "m08", number: 8, name: "Tangled", questions: [{ id: "m08", label: "The vine is touching the mat", kind: "yesno" }] },
  { id: "m09", number: 9, name: "Research Platform", questions: [
    { id: "m09a", label: "The research platform is raised", kind: "yesno" },
    { id: "m09b", label: "The camera trap is deployed", kind: "yesno" },
    { id: "m09c", label: "The seed is no longer touching the tree", kind: "yesno" },
  ] },
  { id: "m10", number: 10, name: "Fragile Microhabitats", questions: [
    { id: "m10a", label: "The spider habitat is in its original starting position", kind: "yesno", noEquipment: true },
    { id: "m10b", label: "The snail habitat is in its original starting position", kind: "yesno", noEquipment: true },
  ] },
  { id: "m11", number: 11, name: "Window to the Past", questions: [{ id: "m11", label: "The root cover is down, touching the mat", kind: "yesno" }] },
  { id: "m12", number: 12, name: "Forest Elder", questions: [
    { id: "m12a", label: "The cane is completely raised, touching the tree", kind: "yesno" },
    { id: "m12b", label: "The support tie is around the post", kind: "yesno" },
  ] },
  { id: "m13", number: 13, name: "Keystone Species", questions: [{ id: "m13", label: "Your keystone species is on the restoration platform, and the young trees are raised", kind: "yesno" }] },
  { id: "m14", number: 14, name: "Seeds of Renewal", questions: [
    { id: "m14a", label: "Number of seeds contained within the replantation station", kind: "count", max: 4 },
    { id: "m14b", label: "Bonus: and touching the mat", kind: "count", max: 4 },
  ] },
  { id: "m15", number: 15, name: "Biocentric Architecture", questions: [
    { id: "m15a", label: "The nesting canopy is raised", kind: "yesno" },
    { id: "m15b", label: "The garden skylight is completely in", kind: "yesno" },
    { id: "m15c", label: "The compost hatch is completely opened, touching the mat", kind: "yesno" },
    { id: "m15d", label: "Dock location", kind: "choice", options: ["Mine", "City", "Farm"] },
  ] },
  { id: "pt", number: null, name: "Precision Tokens", questions: [{ id: "pt", label: "Number of precision tokens remaining", kind: "count", max: 6 }] },
];

export const PRECISION_POINTS = [0, 10, 15, 25, 35, 50, 50];

export type Answers = Record<string, Answer>;

export function defaultAnswers(): Answers {
  const a: Answers = {};
  for (const m of SHEET)
    for (const q of m.questions) a[q.id] = q.kind === "yesno" ? false : q.kind === "count" ? (q.id === "pt" ? 6 : 0) : q.options![0];
  return a;
}

const yes = (a: Answers, id: string) => a[id] === true;
const num = (a: Answers, id: string, max: number) => Math.max(0, Math.min(max, Math.floor(Number(a[id]) || 0)));

/** Points per mission id (and the total). */
export function score(a: Answers): { byMission: Record<string, number>; total: number } {
  const s: Record<string, number> = {};
  s.ei = yes(a, "ei") ? 20 : 0;
  s.m01 = yes(a, "m01a") ? 20 + (yes(a, "m01b") ? 10 : 0) : 0;
  s.m02 = 10 * num(a, "m02", 3);
  s.m03 = yes(a, "m03a") ? 20 + (yes(a, "m03b") ? 10 : 0) : 0;
  // Update 01: katydid completely outside the leaf habitat at the end -> zero for the mission.
  const leaves = num(a, "m04a", 2);
  s.m04 = !yes(a, "m04b") ? 0 : (leaves >= 1 ? 10 : 0) + (leaves === 2 && yes(a, "m04c") ? 20 : 0);
  s.m05 = a.m05 === "Completely" ? 20 : a.m05 === "Partially" ? 10 : 0;
  s.m06 = yes(a, "m06a") ? 10 * num(a, "m06b", 4) : 0;
  s.m07 = yes(a, "m07a") ? 20 + 10 * num(a, "m07b", 2) : 0;
  s.m08 = yes(a, "m08") ? 30 : 0;
  s.m09 = (yes(a, "m09a") ? 10 : 0) + (yes(a, "m09b") ? 10 : 0) + (yes(a, "m09c") ? 10 : 0);
  s.m10 = (yes(a, "m10a") ? 10 : 0) + (yes(a, "m10b") ? 10 : 0);
  s.m11 = yes(a, "m11") ? 20 : 0;
  s.m12 = (yes(a, "m12a") ? 20 : 0) + (yes(a, "m12b") ? 10 : 0);
  s.m13 = yes(a, "m13") ? 30 : 0;
  const seeds = num(a, "m14a", 4);
  s.m14 = 5 * seeds + 5 * Math.min(seeds, num(a, "m14b", 4));
  const env = a.m15d === "Mine" ? yes(a, "m15a") : a.m15d === "City" ? yes(a, "m15b") : a.m15d === "Farm" ? yes(a, "m15c") : false;
  s.m15 = (yes(a, "m15a") ? 10 : 0) + (yes(a, "m15b") ? 10 : 0) + (yes(a, "m15c") ? 10 : 0) + (env ? 10 : 0);
  s.pt = PRECISION_POINTS[num(a, "pt", 6)];
  return { byMission: s, total: Object.values(s).reduce((x, y) => x + y, 0) };
}

/** Maximum possible (single table, no opposing team for the M07 bonus = 20 less). */
export function maxScore(): number {
  const a = defaultAnswers();
  for (const m of SHEET) for (const q of m.questions) {
    if (q.kind === "yesno") a[q.id] = true;
    else if (q.kind === "count") a[q.id] = q.max!;
  }
  a.m04b = true;
  a.m05 = "Completely";
  a.m15d = "Mine";
  return score(a).total;
}
