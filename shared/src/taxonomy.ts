/**
 * The curriculum map: education levels, then subjects (Primary and Secondary) or courses (University and
 * Advanced), then topics. It is generic rather than tied to one country's syllabus.
 *
 * Every card points at one course and one of that course's topics, and the deck validator rejects any that
 * do not. Adding a course or topic here is all it takes to make it selectable. Never rename an id once cards
 * use it: add a new one instead.
 */

export const LEVELS = [1, 2, 3, 4] as const;
export type Level = (typeof LEVELS)[number];
export const LEVEL_LABELS: Record<Level, string> = { 1: "Primary", 2: "Secondary", 3: "University", 4: "Advanced" };
/** What a level calls the things inside it. */
export const LEVEL_UNIT: Record<Level, "subject" | "course"> = { 1: "subject", 2: "subject", 3: "course", 4: "course" };

/** The broad disciplines. They give card ids their prefix and tell guessers roughly where a card comes from. */
export const SUBJECTS = ["Maths", "Physics", "Chemistry", "Biology", "Computing"] as const;
export type Subject = (typeof SUBJECTS)[number];

export interface Course {
  id: string;
  level: Level;
  name: string;
  /** The disciplines its cards may belong to. Primary Science spans three. */
  subjects: readonly Subject[];
  topics: readonly string[];
}

const course = (level: Level, id: string, name: string, subjects: Subject | Subject[], topics: string[]): Course => ({
  id,
  level,
  name,
  subjects: Array.isArray(subjects) ? subjects : [subjects],
  topics,
});

export const COURSES: readonly Course[] = [
  // ---- Primary: subjects ----------------------------------------------------------------------------
  course(1, "primary-maths", "Maths", "Maths", [
    "Number", "Addition and subtraction", "Multiplication and division", "Fractions", "Measurement", "Shapes",
    "Data handling",
  ]),
  course(1, "primary-science", "Science", ["Physics", "Chemistry", "Biology"], [
    "Living things", "Human body", "Plants", "Animals", "Materials", "Forces", "Light and sound", "Electricity",
    "Earth and space",
  ]),
  course(1, "primary-computing", "Computing", "Computing", [
    "Using computers", "Algorithms", "Coding", "Staying safe online",
  ]),

  // ---- Secondary: subjects --------------------------------------------------------------------------
  course(2, "secondary-maths", "Maths", "Maths", [
    "Number", "Algebra", "Geometry", "Trigonometry", "Coordinate geometry", "Functions", "Sequences", "Vectors",
    "Probability", "Statistics",
  ]),
  course(2, "secondary-physics", "Physics", "Physics", [
    "Mechanics", "Energy", "Electricity", "Fields", "Waves", "Matter", "Materials", "Atoms", "Space",
  ]),
  course(2, "secondary-chemistry", "Chemistry", "Chemistry", [
    "Atoms", "Periodic table", "Bonding", "Matter", "Formulae", "Quantities", "Reactions", "Energetics", "Kinetics",
    "Acids and bases", "Redox", "Electrolysis", "Inorganic", "Organic",
  ]),
  course(2, "secondary-biology", "Biology", "Biology", [
    "Cells", "Cell division", "Organisation", "Transport", "Digestion", "Blood", "Circulation", "Respiration",
    "Nervous system", "Hormones", "Homeostasis", "Immunity", "Plants", "Proteins", "Genetics", "Evolution", "Ecology",
  ]),
  course(2, "secondary-computer-science", "Computer Science", "Computing", [
    "Fundamentals", "Computational thinking", "Algorithms", "Programming", "Debugging", "Data types",
    "Data structures", "Data", "Data representation", "Logic", "Hardware", "Software", "Networks", "Security",
  ]),

  // ---- University: courses --------------------------------------------------------------------------
  course(3, "university-calculus", "Calculus", "Maths", [
    "Limits", "Differentiation", "Integration", "Series", "Differential equations", "Functions and graphs",
  ]),
  course(3, "university-linear-algebra", "Linear Algebra", "Maths", [
    "Vectors", "Matrices", "Determinants", "Eigenvalues", "Linear systems",
  ]),
  course(3, "university-statistics", "Statistics and Probability", "Maths", [
    "Probability", "Distributions", "Descriptive statistics", "Inference", "Regression",
  ]),
  course(3, "university-discrete-maths", "Algebra and Discrete Maths", "Maths", [
    "Logic and proof", "Combinatorics", "Number theory", "Complex numbers", "Graph theory",
  ]),
  course(3, "university-mechanics", "Classical Mechanics", "Physics", [
    "Kinematics", "Dynamics", "Circular motion", "Gravitation", "Oscillations",
  ]),
  course(3, "university-electromagnetism", "Electromagnetism", "Physics", [
    "Electric fields", "Circuits", "Magnetism", "Induction", "Optics",
  ]),
  course(3, "university-thermodynamics", "Thermodynamics", "Physics", [
    "Heat", "Laws of thermodynamics", "Kinetic theory", "Statistical physics",
  ]),
  course(3, "university-modern-physics", "Modern Physics", "Physics", [
    "Relativity", "Quantum physics", "Nuclear physics", "Particle physics", "Astrophysics",
  ]),
  course(3, "university-physical-chemistry", "Physical Chemistry", "Chemistry", [
    "Gases", "Thermochemistry", "Kinetics", "Equilibria", "Electrochemistry",
  ]),
  course(3, "university-organic-chemistry", "Organic Chemistry", "Chemistry", [
    "Hydrocarbons", "Functional groups", "Reactions", "Isomerism", "Analysis",
  ]),
  course(3, "university-inorganic-chemistry", "Inorganic Chemistry", "Chemistry", [
    "Atomic structure", "Bonding", "Redox", "Periodic trends", "Structure",
  ]),
  course(3, "university-cell-biology", "Cell and Molecular Biology", "Biology", [
    "Cells", "Cell division", "Molecular biology", "Genetics", "Biochemistry",
  ]),
  course(3, "university-physiology", "Physiology", "Biology", [
    "Nervous system", "Endocrine system", "Homeostasis", "Digestion", "Transport", "Immunity", "Respiration",
  ]),
  course(3, "university-ecology-evolution", "Ecology and Evolution", "Biology", [
    "Ecology", "Evolution", "Biodiversity",
  ]),
  course(3, "university-programming", "Programming", "Computing", [
    "Programming concepts", "Object-oriented programming", "Software engineering", "Languages and compilers",
  ]),
  course(3, "university-algorithms", "Data Structures and Algorithms", "Computing", [
    "Data structures", "Searching and sorting", "Recursion", "Complexity", "Graphs and trees",
  ]),
  course(3, "university-systems", "Computer Systems", "Computing", [
    "Hardware", "Logic", "Data representation", "Networks", "Operating systems",
  ]),
  course(3, "university-security", "Cyber Security", "Computing", ["Cryptography", "Network security"]),
  course(3, "university-ai", "Artificial Intelligence", "Computing", ["Machine learning", "Search", "AI ethics"]),

  // ---- Advanced: courses ----------------------------------------------------------------------------
  course(4, "advanced-pure-maths", "Pure Mathematics", "Maths", [
    "Complex analysis", "Abstract algebra", "Real analysis", "Proof",
  ]),
  course(4, "advanced-applied-maths", "Applied Mathematics", "Maths", [
    "Differential equations", "Vector calculus", "Numerical methods", "Linear algebra",
  ]),
  course(4, "advanced-probability", "Probability and Statistics", "Maths", [
    "Probability theory", "Statistical inference", "Stochastic processes",
  ]),
  course(4, "advanced-quantum", "Quantum Mechanics", "Physics", ["Foundations", "Atomic physics", "Quantum phenomena"]),
  course(4, "advanced-statistical-physics", "Statistical Physics", "Physics", [
    "Entropy", "Thermodynamics", "Statistical mechanics",
  ]),
  course(4, "advanced-condensed-matter", "Condensed Matter", "Physics", ["Solids", "Superconductivity", "Materials"]),
  course(4, "advanced-electrodynamics", "Electrodynamics and Relativity", "Physics", [
    "Electrodynamics", "Special relativity", "General relativity",
  ]),
  course(4, "advanced-physical-chemistry", "Advanced Physical Chemistry", "Chemistry", [
    "Thermodynamics", "Kinetics", "Equilibria", "Quantum chemistry",
  ]),
  course(4, "advanced-organic-chemistry", "Advanced Organic Chemistry", "Chemistry", [
    "Synthesis", "Stereochemistry", "Reaction mechanisms",
  ]),
  course(4, "advanced-materials-chemistry", "Materials and Structure", "Chemistry", [
    "Bonding", "Crystal structure", "Intermolecular forces",
  ]),
  course(4, "advanced-molecular-genetics", "Molecular Genetics", "Biology", [
    "Inheritance", "Gene expression", "Genomics", "DNA structure",
  ]),
  course(4, "advanced-biotechnology", "Biotechnology", "Biology", [
    "Genetic engineering", "Bioinformatics", "Applications",
  ]),
  course(4, "advanced-systems-physiology", "Systems Physiology", "Biology", [
    "Homeostasis", "Neuroscience", "Endocrinology",
  ]),
  course(4, "advanced-algorithms", "Advanced Algorithms", "Computing", [
    "Complexity theory", "Algorithm design", "Advanced data structures",
  ]),
  course(4, "advanced-programming-languages", "Programming Languages", "Computing", [
    "Memory and pointers", "Type systems", "Compilers", "Paradigms",
  ]),
  course(4, "advanced-machine-learning", "Machine Learning", "Computing", [
    "Neural networks", "Learning theory", "Probabilistic models",
  ]),
  course(4, "advanced-distributed-systems", "Distributed Systems", "Computing", [
    "Concurrency", "Consensus", "Cloud computing",
  ]),
];

const byId = new Map(COURSES.map((c) => [c.id, c]));
export const COURSE_IDS = COURSES.map((c) => c.id);
export const getCourse = (id: string): Course | undefined => byId.get(id);
export const coursesAt = (level: Level): Course[] => COURSES.filter((c) => c.level === level);

/** A topic is named by its course: "secondary-physics/Waves". */
export const topicKey = (courseId: string, topic: string) => `${courseId}/${topic}`;
export const ALL_TOPIC_KEYS = COURSES.flatMap((c) => c.topics.map((t) => topicKey(c.id, t)));
const topicKeys = new Set(ALL_TOPIC_KEYS);
export const isTopicKey = (key: string) => topicKeys.has(key);
export function splitTopicKey(key: string): { courseId: string; topic: string } {
  const i = key.indexOf("/");
  return { courseId: key.slice(0, i), topic: key.slice(i + 1) };
}

/**
 * What players chose to play. Each list narrows the one before it, and an empty list means "all of them",
 * so the empty selection is General: everything.
 */
export interface Selection {
  levels: readonly Level[];
  courses: readonly string[];
  topics: readonly string[];
}
export const GENERAL: Selection = { levels: [], courses: [], topics: [] };

export interface Placed {
  level: Level;
  course: string;
  topic: string;
}

/** Whether a card (or anything with a level, course and topic) is inside a selection. */
export function inSelection(card: Placed, s: Selection): boolean {
  if (s.levels.length && !s.levels.includes(card.level)) return false;
  if (s.courses.length && !s.courses.includes(card.course)) return false;
  if (s.topics.length && !s.topics.includes(topicKey(card.course, card.topic))) return false;
  return true;
}

/** Every topic key a selection covers. */
export function selectedTopicKeys(s: Selection): string[] {
  return COURSES.filter((c) => (!s.levels.length || s.levels.includes(c.level)) && (!s.courses.length || s.courses.includes(c.id)))
    .flatMap((c) => c.topics.map((t) => topicKey(c.id, t)))
    .filter((key) => !s.topics.length || s.topics.includes(key));
}

/**
 * Drop choices that no longer fit: a course whose level was unticked, a topic whose course was. Keeps the
 * picker honest when someone narrows and then widens again.
 */
export function tidySelection(s: Selection): Selection {
  const courses = s.courses.filter((id) => {
    const c = getCourse(id);
    return c !== undefined && (!s.levels.length || s.levels.includes(c.level));
  });
  const topics = s.topics.filter((key) => {
    const { courseId } = splitTopicKey(key);
    const c = getCourse(courseId);
    return isTopicKey(key) && c !== undefined && (!s.levels.length || s.levels.includes(c.level)) && (!courses.length || courses.includes(courseId));
  });
  return { levels: [...s.levels], courses, topics };
}

/** A short human description: "General", "Secondary · Physics · Waves", "University · 3 courses". */
export function describeSelection(s: Selection): string {
  if (!s.levels.length && !s.courses.length && !s.topics.length) return "General: everything";
  const parts: string[] = [];
  if (s.levels.length) parts.push(s.levels.map((l) => LEVEL_LABELS[l]).join(" + "));
  if (s.courses.length === 1) parts.push(getCourse(s.courses[0]!)?.name ?? "");
  else if (s.courses.length > 1) parts.push(`${s.courses.length} subjects or courses`);
  if (s.topics.length === 1) parts.push(splitTopicKey(s.topics[0]!).topic);
  else if (s.topics.length > 1) parts.push(`${s.topics.length} topics`);
  return parts.join(" · ");
}

/** Selections travel in links: `levels=2&courses=secondary-physics&topics=secondary-physics/Waves`. */
export function selectionToQuery(s: Selection): string {
  const q = new URLSearchParams();
  if (s.levels.length) q.set("levels", s.levels.join(","));
  if (s.courses.length) q.set("courses", s.courses.join(","));
  if (s.topics.length) q.set("topics", s.topics.join(","));
  return q.toString();
}

/** The reverse. Anything unknown is dropped, so a stale or tampered link degrades to a wider selection. */
export function selectionFromQuery(query: string): Selection {
  const q = new URLSearchParams(query);
  const list = (name: string) => (q.get(name) ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  const levels = list("levels").map(Number).filter((n): n is Level => (LEVELS as readonly number[]).includes(n));
  return tidySelection({
    levels: [...new Set(levels)],
    courses: [...new Set(list("courses"))].filter((id) => byId.has(id)),
    topics: [...new Set(list("topics"))].filter(isTopicKey),
  });
}
