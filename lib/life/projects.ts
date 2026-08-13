export interface LifeProject {
  slug: string;
  name: string;
  summary: string;
  aliases: string[];
}

export const LIFE_PROJECTS: LifeProject[] = [
  {
    slug: "swipey",
    name: "Swipey",
    summary: "Mobile admin design work and related execution.",
    aliases: ["swipey", "swipy"],
  },
  {
    slug: "albers",
    name: "ALBERS",
    summary: "The macOS color-theory tool and surrounding product work.",
    aliases: ["albers"],
  },
  {
    slug: "robin",
    name: "Project Robin",
    summary: "The survey platform, research system, and stakeholder work.",
    aliases: ["robin", "project robin"],
  },
  {
    slug: "scad",
    name: "SCAD",
    summary: "Coursework, deadlines, and school-related admin.",
    aliases: ["scad", "class", "classes", "assignment", "studio"],
  },
  {
    slug: "ops",
    name: "Ops",
    summary: "Personal admin, logistics, and operational maintenance.",
    aliases: ["admin", "ops", "operation", "travel", "visa", "rent", "bills"],
  },
  {
    slug: "health",
    name: "Health",
    summary: "Training, recovery, health appointments, and physical maintenance.",
    aliases: ["lift", "lifting", "gym", "workout", "health", "doctor", "recovery"],
  },
];

export function getProjectBySlug(slug: string | null | undefined) {
  if (!slug) {
    return null;
  }

  return LIFE_PROJECTS.find((project) => project.slug === slug) || null;
}

export function normalizeProjectSlug(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return getProjectBySlug(normalized)?.slug || null;
}

export function detectProjectSlug(text: string | null | undefined) {
  if (!text) {
    return null;
  }

  const normalized = text.toLowerCase();

  for (const project of LIFE_PROJECTS) {
    for (const alias of project.aliases) {
      if (normalized.includes(alias.toLowerCase())) {
        return project.slug;
      }
    }
  }

  return null;
}

export function getProjectLabel(slug: string | null | undefined) {
  return getProjectBySlug(slug)?.name || null;
}
