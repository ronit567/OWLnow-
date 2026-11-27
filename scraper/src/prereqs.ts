
import type { Rule } from "../../apps/web/src/data/library.ts";
import type { Subject } from "./pages.ts";

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Map subject names and official abbreviations to course codes. */
function subjectLookup(subjects: Subject[]): Map<string, string> {
  const lookup = new Map<string, string>();

  for (const subject of subjects) {
    lookup.set(subject.name.toLowerCase(), subject.code);
    lookup.set(subject.code.toLowerCase(), subject.code);
  }

  return lookup;
}

/** Split only outside parentheses. */
function splitTopLevel(text: string, separator: RegExp): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;

  for (let i = 0; i < text.length; i++) {
    if (text[i] === "(") depth++;
    if (text[i] === ")") depth--;

    if (depth === 0) {
      const match = text.slice(i).match(separator);

      if (match?.index === 0 && match[0].length > 0) {
        parts.push(text.slice(start, i).trim());
        i += match[0].length - 1;
        start = i + 1;
      }
    }
  }

  parts.push(text.slice(start).trim());
  return parts;
}

/** Check whether parentheses wrap the entire expression. */
function isWrapped(text: string): boolean {
  if (!text.startsWith("(") || !text.endsWith(")")) {
    return false;
  }

  let depth = 0;

  for (let i = 0; i < text.length; i++) {
    if (text[i] === "(") depth++;
    if (text[i] === ")") depth--;

    if (depth === 0 && i < text.length - 1) return false;
    if (depth < 0) return false;
  }

  return depth === 0;
}

/** Convert prerequisite wording into a structured planner rule. */
export function parsePrereq(
  text: string,
  subjects: Subject[]
): Rule | null {
  if (!text.trim()) return null;

  const fallback: Rule = { check: text };

  let input = text
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\.$/, "")
    .trim();

  if (/^none$/i.test(input)) return null;

  const lookup = subjectLookup(subjects);

  if (lookup.size === 0) return fallback;

  const names = [...lookup.keys()]
    .sort((a, b) => b.length - a.length)
    .map(escapeRegex)
    .join("|");

    // Normalize subject names before interpreting logical operators.
    // For example, Numerical and Mathematical Methods becomes NMM.
    const subjectPattern = new RegExp(
    `\\b(${names})(?=\\s+\\d{4})`,
    "gi"
    );

    input = input.replace(subjectPattern, (name) => {
    return lookup.get(name.toLowerCase()) ?? name;
    });

  const coursePattern = new RegExp(
    `^(?:the former\\s+)?(?:(${names})\\s+)?(\\d{4})(?:[A-Z](?:/[A-Z])*)?$`,
    "i"
  );

  function parseCourse(
    value: string,
    previousSubject?: string
  ): { key: string; subject: string } | null {
    const match = value.trim().match(coursePattern);

    if (!match) return null;

    const subject = match[1]
      ? lookup.get(match[1].toLowerCase())
      : previousSubject;

    if (!subject) return null;

    return {
      key: `${subject} ${match[2]}`,
      subject
    };
  }

  function parse(value: string, inheritedMark?: number): Rule | null {
    let expression = value.trim();

    if (!expression) return null;

    while (isWrapped(expression)) {
      expression = expression.slice(1, -1).trim();
    }

    // Semicolon-separated groups with an explicit final "and".
    const clauses = splitTopLevel(expression, /^\s*;\s*/);

    if (clauses.length > 1) {
      if (inheritedMark !== undefined) return null;
      if (!/^and\s+/i.test(clauses[clauses.length - 1])) return null;

      const rules: Rule[] = [];

      for (const clause of clauses) {
        const rule = parse(clause.replace(/^and\s+/i, ""));

        if (!rule) return null;

        rules.push(rule);
      }

      return { all: rules };
    }

    // Explicitly grouped AND / OR expressions.
    const andParts = splitTopLevel(expression, /^\s+and\s+/i);
    const orParts = splitTopLevel(expression, /^\s+or\s+/i);

    if (
      andParts.length > 1 &&
      orParts.length > 1
    ) {
      return null;
    }

    if (andParts.length > 1 && andParts.every(isWrapped)) {
      const rules: Rule[] = [];

      for (const part of andParts) {
        const rule = parse(part, inheritedMark);

        if (!rule) return null;

        rules.push(rule);
      }

      return { all: rules };
    }

    if (orParts.length > 1 && orParts.every(isWrapped)) {
      const rules: Rule[] = [];

      for (const part of orParts) {
        const rule = parse(part, inheritedMark);

        if (!rule) return null;

        rules.push(rule);
      }

      return { any: rules };
    }

    let minMark = inheritedMark;
    let explicitSharedMark = false;

    // Minimum marks before the course list.
    const prefixMark = expression.match(
      /^(?:a\s+)?(?:minimum\s+mark\s+of|(?:final\s+)?mark\s+of\s+at\s+least)\s+(\d{1,3})\s*%\s+in\s+/i
    );

    if (prefixMark) {
      if (minMark !== undefined) return null;

      minMark = Number(prefixMark[1]);
      explicitSharedMark = true;
      expression = expression.slice(prefixMark[0].length);
    }

    // Parenthesized minimum mark shared by every option.
    const parenthesizedMark = expression.match(
      /,?\s*\(in each case with (?:a mark of at least|at least|a minimum mark of)\s+(\d{1,3})\s*%\)$/i
    );

    if (parenthesizedMark) {
      if (minMark !== undefined) return null;

      minMark = Number(parenthesizedMark[1]);
      explicitSharedMark = true;
      expression = expression
        .slice(0, parenthesizedMark.index)
        .trim();
    }

    // Minimum marks after the course list.
    const suffixMark = expression.match(
      /,?\s+(in each case\s+)?with\s+(?:a\s+minimum\s+(?:mark\s+)?of|a\s+mark\s+of\s+at\s+least|at\s+least)\s+(\d{1,3})\s*%$/i
    );

    if (suffixMark) {
      if (minMark !== undefined) return null;

      minMark = Number(suffixMark[2]);
      explicitSharedMark =
        Boolean(suffixMark[1]) ||
        suffixMark[0].startsWith(",");
      expression = expression.slice(0, suffixMark.index).trim();
    }

    if (minMark !== undefined && (minMark < 0 || minMark > 100)) {
      return null;
    }

    // Credit requirements from explicit course lists.
    const creditMatch = expression.match(
      /^(\d+(?:\.\d+)?)\s+courses?\s+(?:with\s+at\s+least\s+(\d{1,3})\s*%\s+in\s+each\s+)?from\s*:?\s+/i
    );

    if (creditMatch) {
        if (minMark !== undefined && !explicitSharedMark) {
            return null;
        }

        const credits = Number(creditMatch[1]);

      if (!Number.isFinite(credits) || credits <= 0) return null;

      if (creditMatch[2] !== undefined) {
        if (minMark !== undefined) return null;

        minMark = Number(creditMatch[2]);
      }

      if (minMark !== undefined && minMark > 100) return null;

      const list = expression.slice(creditMatch[0].length);

      const parts = list.split(
        /\s*,\s*(?:or\s+)?|\s+or\s+/i
      );

      const from: string[] = [];
      let currentSubject: string | undefined;

      for (const part of parts) {
        const course = parseCourse(part, currentSubject);

        if (!course) return null;

        currentSubject = course.subject;
        from.push(course.key);
      }

      const unique = [...new Set(from)];

      return minMark === undefined
        ? { credits, from: unique }
        : { credits, from: unique, minMark };
    }

    // Recognize "either", "one of" and "any one of".
    const oneOf = /^(?:(?:any\s+)?one\s+of|either)\s*:?\s+/i;
    const requiresOne = oneOf.test(expression);

    expression = expression.replace(oneOf, "");

    // Recognize a final parenthesized alternative.
    const alternative = expression.match(
      /^([^()]+?)\s+\(or\s+([^()]+)\)$/i
    );

    if (alternative) {
        if (minMark !== undefined && !explicitSharedMark) {
            return null;
        }

        const first = parse(alternative[1], minMark);
      const second = parse(alternative[2], minMark);

      if (!first || !second) return null;

      return { any: [first, second] };
    }

    const hasAnd = /\band\b/i.test(expression);
    const hasOr = /\bor\b/i.test(expression);

    if (hasAnd && hasOr) return null;
    if (requiresOne && hasAnd) return null;

    if (hasAnd && minMark !== undefined && !explicitSharedMark) {
        return null;
    }

    if (
        (hasOr || requiresOne) &&
        minMark !== undefined &&
        !explicitSharedMark
    ) {
        return null;
    }

    if (
      expression.includes(",") &&
      !requiresOne &&
      !hasAnd &&
      !hasOr
    ) {
      return null;
    }

    const parts = expression.split(
      /\s*,\s*(?:(?:and|or)\s+)?|\s+(?:and|or)\s+/i
    );

    const rules: Rule[] = [];
    let currentSubject: string | undefined;

    for (const part of parts) {
      const course = parseCourse(part, currentSubject);

      if (!course) return null;

      currentSubject = course.subject;

      rules.push(
        minMark === undefined
          ? { course: course.key }
          : { course: course.key, minMark }
      );
    }

    if (rules.length === 0) return null;
    if (rules.length === 1) return rules[0];

    return requiresOne || hasOr
      ? { any: rules }
      : { all: rules };
  }

  return parse(input) ?? fallback;
}

/** Extract explicitly listed, unconditional antirequisite course codes. */
export function parseAntireqs(
  text: string,
  subjects: Subject[]
): string[] {
  if (!text.trim()) return [];

  let input = text
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\.$/, "")
    .trim();

  // Conditional restrictions cannot be represented by string[].
  if (/\b(?:if|unless|before|after|only if)\b/i.test(input)) {
    return [];
  }

  // Campus-specific restrictions require manual interpretation.
  if (/\b(?:main campus|king's campus|huron campus)\b/i.test(input)) {
    return [];
  }

  // An introductory category description may precede an explicit list.
  // Remove the description only when it clearly ends with a colon.
  const categoryList = input.match(
    /^all other courses[^:]*:\s*(.+)$/i
  );

  if (categoryList) {
    input = categoryList[1];
  } else if (/\bexcept\b/i.test(input)) {
    // Do not interpret exceptions as antirequisites.
    return [];
  }

  const lookup = subjectLookup(subjects);

  if (lookup.size === 0) return [];

  const names = [...lookup.keys()]
    .sort((a, b) => b.length - a.length)
    .map(escapeRegex)
    .join("|");

  // Normalize subject names before splitting the list.
  const subjectPattern = new RegExp(
    `\\b(${names})(?=\\s+\\d{4})`,
    "gi"
  );

  input = input.replace(subjectPattern, (name) => {
    return lookup.get(name.toLowerCase()) ?? name;
  });

  const coursePattern = new RegExp(
    `^(?:the former\\s+)?(?:(${names})\\s+)?(\\d{4})(?:[A-Z](?:/[A-Z])*)?$`,
    "i"
  );

  const parts = input.split(
    /\s*,\s*(?:(?:and|or)\s+)?|\s+(?:and|or)\s+/i
  );

  const keys = new Set<string>();
  let currentSubject: string | undefined;

  for (const part of parts) {
    const match = part.trim().match(coursePattern);

    // Do not guess when the wording cannot be parsed.
    if (!match) return [];

    if (match[1]) {
      currentSubject = lookup.get(match[1].toLowerCase());
    }

    if (!currentSubject) return [];

    keys.add(`${currentSubject} ${match[2]}`);
  }

  return [...keys];
}
