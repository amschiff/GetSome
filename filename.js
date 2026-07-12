/*
 * GetSome - compact export filenames
 *
 * Turns verbose browser tab titles into short, filesystem-safe handles and
 * chooses readable numeric suffixes from Chrome's existing download history.
 */

const MAX_TITLE_LENGTH = 42;
const MAX_TITLE_WORDS = 6;

const ACRONYMS = new Map([
  ["ai", "AI"],
  ["api", "API"],
  ["css", "CSS"],
  ["elo", "ELO"],
  ["gdp", "GDP"],
  ["gnp", "GNP"],
  ["html", "HTML"],
  ["json", "JSON"],
  ["npv", "NPV"],
  ["pdf", "PDF"],
  ["sql", "SQL"],
  ["ui", "UI"],
  ["url", "URL"],
  ["ux", "UX"],
]);

const LONG_TITLE_FILLER = new Set([
  "a", "an", "and", "about", "current", "detailed", "existing", "explained",
  "explanation", "guide", "key", "of", "on", "options", "overview", "the", "to",
]);

function titleCaseAcronyms(title) {
  return title.replace(/\b[\p{L}\p{N}]+\b/gu, (word) => ACRONYMS.get(word.toLowerCase()) || word);
}

function trimAtWord(title, maximum = MAX_TITLE_LENGTH) {
  if (title.length <= maximum) return title;
  const shortened = title.slice(0, maximum + 1).replace(/\s+\S*$/, "").trim();
  return shortened || title.slice(0, maximum).trim();
}

/** Produces a conservative short handle from a provider-supplied tab title. */
export function compactTitle(title) {
  let result = (title || "Page")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const withoutProvider = result.replace(
    /\s*(?:[-–—|]\s*)?(?:Shared\s+)?(?:ChatGPT|Claude|Google\s+Gemini|Gemini|Grok)(?:\s+Conversation)?$/i,
    "",
  ).trim();
  if (withoutProvider) result = withoutProvider;

  result = result
    .replace(/\s*\((\d+)\)\s*$/, " $1")
    .replace(/^A conversation (?:with|about)\s+/i, "")
    .replace(/^Discussion (?:with|of|about)\s+/i, "")
    .replace(/^Understanding\s+/i, "")
    .replace(/^Highest\s+(.+?)\s+and\s+(?:Newbie|Beginner|Newcomer)\s+Rating$/i, "$1 Rating");

  const apartmentFor = result.match(/\bapartments?\s+for\s+(.+)$/i);
  if (apartmentFor) result = `Apts for ${apartmentFor[1]}`;

  const replacements = [
    [/\bapartments\b/gi, "Apts"],
    [/\bapartment\b/gi, "Apt"],
    [/\bapplications\b/gi, "Apps"],
    [/\bapplication\b/gi, "App"],
    [/\bconfiguration\b/gi, "Config"],
    [/\bconversation\b/gi, "Chat"],
    [/\bcreation\b/gi, "Build"],
    [/\bdeployment\b/gi, "Deploy"],
    [/\bdevelopment\b/gi, "Dev"],
    [/\bmanagement\b/gi, "Mgmt"],
    [/\brecommendations\b/gi, "Recs"],
    [/\bversus\b/gi, "vs"],
    [/\bwebsite\b/gi, "Site"],
  ];
  for (const [pattern, replacement] of replacements) result = result.replace(pattern, replacement);

  result = titleCaseAcronyms(result).replace(/\s+/g, " ").trim();
  const words = result.split(" ");
  if (words.length > MAX_TITLE_WORDS || result.length > MAX_TITLE_LENGTH) {
    const informative = words.filter((word) => !LONG_TITLE_FILLER.has(word.toLowerCase().replace(/[^\p{L}]/gu, "")));
    result = (informative.length >= 2 ? informative : words).slice(0, MAX_TITLE_WORDS).join(" ");
  }

  return trimAtWord(result).replace(/[. ]+$/, "") || "Page";
}

export function suggestedPdfFilename(title, mode, partial = false) {
  const kind = mode === "scrolling" ? "scrolling" : "clean";
  return `${compactTitle(title)} ${kind}${partial ? " partial" : ""}.pdf`;
}

export function suggestedMarkdownFilename(title) {
  return `${compactTitle(title)}.md`;
}

function escapedRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Uses "Name 2" rather than Chrome's harder-to-scan "Name (1)" duplicates. */
export function nextAvailableFilename(filename, existingPaths = []) {
  const extensionIndex = filename.lastIndexOf(".");
  const stem = extensionIndex > 0 ? filename.slice(0, extensionIndex) : filename;
  const extension = extensionIndex > 0 ? filename.slice(extensionIndex) : "";
  const pattern = new RegExp(`^${escapedRegex(stem)}(?: \\((\\d+)\\)| (\\d+))?${escapedRegex(extension)}$`, "i");
  let highest = 0;

  for (const path of existingPaths) {
    const basename = String(path || "").split(/[\\/]/).at(-1) || "";
    const match = basename.match(pattern);
    if (!match) continue;
    const number = match[2] ? Number(match[2]) : match[1] ? Number(match[1]) + 1 : 1;
    highest = Math.max(highest, number);
  }

  return highest ? `${stem} ${highest + 1}${extension}` : filename;
}
