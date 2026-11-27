

import { describe, expect, it } from "vitest";
import { parsePrereq, parseAntireqs } from "./prereqs.ts";
import type { Rule } from "../../apps/web/src/data/library.ts";
import subjectsData from "../data/subjects.json";
import type { Subject } from "./pages.ts";

const subjects = subjectsData.subjects as Subject[];


describe("parsePrereq", () => {
  it("returns null for empty prerequisites", () => {
    expect(parsePrereq("", subjects)).toBeNull();
  });

  it("recognizes a single course", () => {
    expect(
      parsePrereq("Computer Science 1027A/B.", subjects)
    ).toEqual({ course: "COMPSCI 1027" });
  });

  it("recognizes official subject codes", () => {
    expect(
      parsePrereq("COMPSCI 1027A/B", subjects)
    ).toEqual({ course: "COMPSCI 1027" });
  });

  it("handles AND requirements", () => {
    expect(
      parsePrereq("Computer Science 1026 and 1027.", subjects)
    ).toEqual({
      all: [
        { course: "COMPSCI 1026" },
        { course: "COMPSCI 1027" }
      ]
    });
  });

  it("handles OR requirements", () => {
    expect(
      parsePrereq("Computer Science 1027A/B or 1037A/B.", subjects)
    ).toEqual({
      any: [
        { course: "COMPSCI 1027" },
        { course: "COMPSCI 1037" }
      ]
    });
  });

  it("handles one-of requirements", () => {
    expect(
      parsePrereq("One of Mathematics 1228, 1229, 1600.", subjects)
    ).toEqual({
      any: [
        { course: "MATH 1228" },
        { course: "MATH 1229" },
        { course: "MATH 1600" }
      ]
    });
  });

  it("handles multiple subjects", () => {
    expect(
      parsePrereq("Computer Science 1027 and Mathematics 1600.", subjects)
    ).toEqual({
      all: [
        { course: "COMPSCI 1027" },
        { course: "MATH 1600" }
      ]
    });
  });

  it("handles a minimum mark", () => {
    expect(
      parsePrereq("Computer Science 1027 with at least 65%.", subjects)
    ).toEqual({
      course: "COMPSCI 1027",
      minMark: 65
    });
  });

  it("applies a minimum mark to either course", () => {
    expect(
      parsePrereq(
        "Computer Science 1027A/B or 1037A/B, with at least 65%.",
        subjects
      )
    ).toEqual({
      any: [
        { course: "COMPSCI 1027", minMark: 65 },
        { course: "COMPSCI 1037", minMark: 65 }
      ]
    });
  });

  it("preserves unclear requirements", () => {
    const text = "Permission of the instructor.";

    expect(parsePrereq(text, subjects)).toEqual({
      check: text
    });
  });

  it("does not ignore additional requirements", () => {
    const text =
      "Computer Science 1027 and permission of the department.";

    expect(parsePrereq(text, subjects)).toEqual({
      check: text
    });
  });

  it("does not guess ambiguous AND/OR grouping", () => {
    const text = "Computer Science 1026 or 1027 and 1037.";

    expect(parsePrereq(text, subjects)).toEqual({
      check: text
    });
  });

  it("does not guess unknown subjects", () => {
    const text = "Unknown Subject 1027.";

    expect(parsePrereq(text, subjects)).toEqual({
      check: text
    });
  });
});

describe("real Western calendar prerequisites", () => {
  const cases: { text: string; expected: Rule }[] = [
    {
      text: "Engineering Science 1036A/B.",
      expected: { course: "ENGSCI 1036" }
    },
    {
      text: "Computer Science 1033A/B.",
      expected: { course: "COMPSCI 1033" }
    },
    {
      text: "Computer Science 2210A/B and Computer Science 2211A/B.",
      expected: {
        all: [
          { course: "COMPSCI 2210" },
          { course: "COMPSCI 2211" }
        ]
      }
    },
    {
      text: "Computer Science 2121A/B or Digital Humanities 2221A/B.",
      expected: {
        any: [
          { course: "COMPSCI 2121" },
          { course: "DIGIHUM 2221" }
        ]
      }
    },
    {
      text: "Calculus 2502A/B or Calculus 2302A/B.",
      expected: {
        any: [
          { course: "CALCULUS 2502" },
          { course: "CALCULUS 2302" }
        ]
      }
    },
    {
      text: "AISE 3309A/B or Computer Science 3319A/B.",
      expected: {
        any: [
          { course: "AISE 3309" },
          { course: "COMPSCI 3319" }
        ]
      }
    },
    {
      text: "Either Computer Science 3340A/B or Software Engineering 3310A/B.",
      expected: {
        any: [
          { course: "COMPSCI 3340" },
          { course: "SE 3310" }
        ]
      }
    },
    {
      text: "Computer Science 3331A/B and Computer Science 3342A/B.",
      expected: {
        all: [
          { course: "COMPSCI 3331" },
          { course: "COMPSCI 3342" }
        ]
      }
    },
    {
      text: "Data Science 3000A/B.",
      expected: { course: "DATASCI 3000" }
    },
    {
      text: "Computer Science 3357A/B.",
      expected: { course: "COMPSCI 3357" }
    },
    {
      text: "Data Science 3000A/B (or the former Computer Science 4414A/B).",
      expected: {
        any: [
          { course: "DATASCI 3000" },
          { course: "COMPSCI 4414" }
        ]
      }
    },
    {
      text: "Computer Science 1025A/B, Computer Science 1026A/B, Data Science 1200A/B, or Engineering Science 1036A/B, (in each case with a mark of at least 65%).",
      expected: {
        any: [
          { course: "COMPSCI 1025", minMark: 65 },
          { course: "COMPSCI 1026", minMark: 65 },
          { course: "DATASCI 1200", minMark: 65 },
          { course: "ENGSCI 1036", minMark: 65 }
        ]
      }
    },
    {
      text: "Computer Science 1027A/B, Computer Science 1037A/B, or the former Computer Science 2101A/B, in each case with a mark of at least 65%.",
      expected: {
        any: [
          { course: "COMPSCI 1027", minMark: 65 },
          { course: "COMPSCI 1037", minMark: 65 },
          { course: "COMPSCI 2101", minMark: 65 }
        ]
      }
    },
    {
      text: "A minimum mark of 55% in one of Calculus 1000A/B, Calculus 1500A/B, Numerical and Mathematical Methods 1412A/B, the former Applied Mathematics 1412A/B.",
      expected: {
        any: [
          { course: "CALCULUS 1000", minMark: 55 },
          { course: "CALCULUS 1500", minMark: 55 },
          { course: "NMM 1412", minMark: 55 },
          { course: "APPLMATH 1412", minMark: 55 }
        ]
      }
    },
    {
      text: "A final mark of at least 55% in either Calculus 1000A/B, Calculus 1500A/B, Numerical and Mathematical Methods 1412A/B, the former Applied Mathematics 1412A/B.",
      expected: {
        any: [
          { course: "CALCULUS 1000", minMark: 55 },
          { course: "CALCULUS 1500", minMark: 55 },
          { course: "NMM 1412", minMark: 55 },
          { course: "APPLMATH 1412", minMark: 55 }
        ]
      }
    },
    {
      text: "A minimum mark of 60% in one of Calculus 1000A/B, Calculus 1500A/B, Numerical and Mathematical Methods 1412A/B, the former Applied Mathematics 1412A/B.",
      expected: {
        any: [
          { course: "CALCULUS 1000", minMark: 60 },
          { course: "CALCULUS 1500", minMark: 60 },
          { course: "NMM 1412", minMark: 60 },
          { course: "APPLMATH 1412", minMark: 60 }
        ]
      }
    },
    {
      text: "Computer Science 1027A/B or Computer Science 1037A/B, in each case with at least 65%; and Computer Science 1020A/B with at least 60%.",
      expected: {
        all: [
          {
            any: [
              { course: "COMPSCI 1027", minMark: 65 },
              { course: "COMPSCI 1037", minMark: 65 }
            ]
          },
          { course: "COMPSCI 1020", minMark: 60 }
        ]
      }
    },
    {
      text: "(Computer Science 3305A/B or Software Engineering 3313A/B) and (Computer Science 3357A/B or Electrical and Computer Engineering 4436A/B).",
      expected: {
        all: [
          {
            any: [
              { course: "COMPSCI 3305" },
              { course: "SE 3313" }
            ]
          },
          {
            any: [
              { course: "COMPSCI 3357" },
              { course: "ECE 4436" }
            ]
          }
        ]
      }
    },
    {
      text: "0.5 course from: Computer Science 3305A/B, Computer Science 3357A/B, Electrical and Computer Engineering 4436A/B, Software Engineering 3313A/B, Software Engineering 3314A/B.",
      expected: {
        credits: 0.5,
        from: [
          "COMPSCI 3305",
          "COMPSCI 3357",
          "ECE 4436",
          "SE 3313",
          "SE 3314"
        ]
      }
    },
    {
      text: "A minimum mark of 55% in Calculus 1501A/B or Calculus 1301A/B, or Applied Mathematics 1413.",
      expected: {
        any: [
          { course: "CALCULUS 1501", minMark: 55 },
          { course: "CALCULUS 1301", minMark: 55 },
          { course: "APPLMATH 1413", minMark: 55 }
        ]
      }
    }
  ];

  it.each(cases)("parses $text", ({ text, expected }) => {
    expect(parsePrereq(text, subjects)).toEqual(expected);
  });
});

describe("additional real Western calendar prerequisites", () => {
  const cases: { text: string; expected: Rule }[] = [
    {
      text: "One or more of Ontario Secondary School MCF3M, MCR3U, or equivalent.",
      expected: {
        check: "One or more of Ontario Secondary School MCF3M, MCR3U, or equivalent."
      }
    },
    {
      text: "0.5 course in Applied Mathematics, Calculus, Mathematics, Statistics (including Introductory Statistics) at the 1000-level or above.",
      expected: {
        check: "0.5 course in Applied Mathematics, Calculus, Mathematics, Statistics (including Introductory Statistics) at the 1000-level or above."
      }
    },
    {
      text: "Computer Science 2120A/B, Digital Humanities 2220A/B, Computer Science 1026A/B with a mark of at least 60% and registration in Medical Sciences First Entry and permission of the Computer Science Department.",
      expected: {
        check: "Computer Science 2120A/B, Digital Humanities 2220A/B, Computer Science 1026A/B with a mark of at least 60% and registration in Medical Sciences First Entry and permission of the Computer Science Department."
      }
    },
    {
      text: "Grade 12U Mathematics or Mathematics 0109A/B, Mathematics 0110A/B or Mathematics 1229A/B.",
      expected: {
        check: "Grade 12U Mathematics or Mathematics 0109A/B, Mathematics 0110A/B or Mathematics 1229A/B."
      }
    },
    {
      text: "One or more of grade 12U Mathematics or Mathematics 0109A/B, Mathematics 0110A/B, Mathematics 1229A/B or Statistical Sciences 1023A/B.",
      expected: {
        check: "One or more of grade 12U Mathematics or Mathematics 0109A/B, Mathematics 0110A/B, Mathematics 1229A/B or Statistical Sciences 1023A/B."
      }
    },
    {
      text: "Ontario Secondary School MCV4U or Mathematics 0110A/B.",
      expected: {
        check: "Ontario Secondary School MCV4U or Mathematics 0110A/B."
      }
    },
    {
      text: "2.0 courses from: Computer Science 3305A/B, Computer Science 3307A/B/Y, Computer Science 3331A/B, Computer Science 3340A/B, Computer Science 3342A/B, Computer Science 3350A/B; or permission of the Department.",
      expected: {
        check: "2.0 courses from: Computer Science 3305A/B, Computer Science 3307A/B/Y, Computer Science 3331A/B, Computer Science 3340A/B, Computer Science 3342A/B, Computer Science 3350A/B; or permission of the Department."
      }
    },
    {
      text: "Calculus 1301A/B or Calculus 1501A/B or Numerical and Mathematical Methods 1414A/B or the former Applied Mathematics 1414A/B, or the former Applied Mathematics 1413, in each case with a minimum mark of 55%. Integrated Science 1001X with a minimum mark of 60% can be used in place of Calculus 1301A/B.",
      expected: {
        check: "Calculus 1301A/B or Calculus 1501A/B or Numerical and Mathematical Methods 1414A/B or the former Applied Mathematics 1414A/B, or the former Applied Mathematics 1413, in each case with a minimum mark of 55%. Integrated Science 1001X with a minimum mark of 60% can be used in place of Calculus 1301A/B."
      }
    },
    {
      text: "0.5 course from Calculus 1000A/B, Calculus 1500A/B, Numerical and Mathematical Methods 1412A/B, the former Applied Mathematics 1412A/B, plus 0.5 course from Calculus 1301A/B, Calculus 1501A/B, Numerical and Mathematical Methods 1414A/B, the former Applied Mathematics 1414A/B. The former Applied Mathematics 1413 may also be used to meet this 1.0 course prerequisite.",
      expected: {
        check: "0.5 course from Calculus 1000A/B, Calculus 1500A/B, Numerical and Mathematical Methods 1412A/B, the former Applied Mathematics 1412A/B, plus 0.5 course from Calculus 1301A/B, Calculus 1501A/B, Numerical and Mathematical Methods 1414A/B, the former Applied Mathematics 1414A/B. The former Applied Mathematics 1413 may also be used to meet this 1.0 course prerequisite."
      }
    }
  ];

  it.each(cases)("preserves $text", ({ text, expected }) => {
    expect(parsePrereq(text, subjects)).toEqual(expected);
  });
});

describe("complex real Western calendar prerequisites", () => {
  const mathCourses =
    "Applied Mathematics 1201A/B, Numerical and Mathematical Methods 1411A/B, Numerical and Mathematical Methods 1412A/B, Numerical and Mathematical Methods 1414A/B, Calculus 1000A/B, Calculus 1301A/B, Calculus 1500A/B, Calculus 1501A/B, Mathematics 1600A/B, the former Applied Mathematics 1411A/B, the former Applied Mathematics 1412A/B, the former Applied Mathematics 1414A/B, the former Applied Mathematics 1413.";

  const mathKeys = [
    "APPLMATH 1201",
    "NMM 1411",
    "NMM 1412",
    "NMM 1414",
    "CALCULUS 1000",
    "CALCULUS 1301",
    "CALCULUS 1500",
    "CALCULUS 1501",
    "MATH 1600",
    "APPLMATH 1411",
    "APPLMATH 1412",
    "APPLMATH 1414",
    "APPLMATH 1413"
  ];

  it("handles multiple groups with marks and credits", () => {
    const text =
      "Computer Science 1027A/B, Computer Science 1037A/B, Computer Science 2121A/B or Digital Humanities 2221A/B in each case with at least 65%; Computer Science 1020A/B with at least 60%; and 1.0 course with at least 60% in each from: " +
      mathCourses;

    expect(parsePrereq(text, subjects)).toEqual({
      all: [
        {
          any: [
            { course: "COMPSCI 1027", minMark: 65 },
            { course: "COMPSCI 1037", minMark: 65 },
            { course: "COMPSCI 2121", minMark: 65 },
            { course: "DIGIHUM 2221", minMark: 65 }
          ]
        },
        { course: "COMPSCI 1020", minMark: 60 },
        {
          credits: 1,
          from: mathKeys,
          minMark: 60
        }
      ]
    });
  });

  it("handles historical courses alongside credit requirements", () => {
    const text =
      "Computer Science 1027A/B, Computer Science 1037A/B, the former Computer Science 2101A/B, Computer Science 2121A/B or Digital Humanities 2221A/B in each case with at least 65%; and 1.0 course with at least 60% in each from: " +
      mathCourses;

    expect(parsePrereq(text, subjects)).toEqual({
      all: [
        {
          any: [
            { course: "COMPSCI 1027", minMark: 65 },
            { course: "COMPSCI 1037", minMark: 65 },
            { course: "COMPSCI 2101", minMark: 65 },
            { course: "COMPSCI 2121", minMark: 65 },
            { course: "DIGIHUM 2221", minMark: 65 }
          ]
        },
        {
          credits: 1,
          from: mathKeys,
          minMark: 60
        }
      ]
    });
  });

  it("preserves complex grouped credit alternatives", () => {
    const text =
      "One full course or equivalent from: Applied Mathematics 1201A/B, Data Science 1000A/B, (Calculus 1000A/B or Calculus 1500A/B or Numerical and Mathematical Methods 1412A/B or the former Applied Mathematics 1412A/B), (Calculus 1301A/B or Calculus 1501A/B or Numerical and Mathematical Methods 1414A/B or the former Applied Mathematics 1414A/B), Mathematics 1600A/B or Mathematics 1700A/B, Mathematics 1225A/B, Mathematics 1228A/B, Mathematics 1229A/B, Mathematics 1230A/B, or the former Applied Mathematics 1413, Statistical Sciences 1024A/B.";

    expect(parsePrereq(text, subjects)).toEqual({
      check: text
    });
  });
});
describe("ambiguous prerequisite wording", () => {
  it("does not guess the scope of a minimum mark", () => {
    const text =
      "Computer Science 1027 or 1037 with at least 65%.";

    expect(parsePrereq(text, subjects)).toEqual({
      check: text
    });
  });

  it("rejects invalid minimum marks", () => {
    const text =
      "Computer Science 1027 with at least 105%.";

    expect(parsePrereq(text, subjects)).toEqual({
      check: text
    });
  });

  it("preserves requirements with missing subject names", () => {
    const text = "1027A/B or 1037A/B.";

    expect(parsePrereq(text, subjects)).toEqual({
      check: text
    });
  });

  it("preserves the exact original text in Check rules", () => {
    const text = "  Permission of the Department.  ";

    expect(parsePrereq(text, subjects)).toEqual({
      check: text
    });
  });
});

describe("parseAntireqs", () => {
  it("returns an empty array for empty text", () => {
    expect(parseAntireqs("", subjects)).toEqual([]);
  });

  it("handles a single antirequisite", () => {
    expect(
      parseAntireqs("Software Engineering 2205A/B.", subjects)
    ).toEqual(["SE 2205"]);
  });

  it("handles multiple subjects", () => {
    expect(
      parseAntireqs(
        "Computer Science 1037A/B, Computer Science 2121A/B, Digital Humanities 2221A/B.",
        subjects
      )
    ).toEqual([
      "COMPSCI 1037",
      "COMPSCI 2121",
      "DIGIHUM 2221"
    ]);
  });

  it("inherits the previous subject for bare course numbers", () => {
    expect(
      parseAntireqs(
        "Computer Science 1025A/B, 1026A/B",
        subjects
      )
    ).toEqual(["COMPSCI 1025", "COMPSCI 1026"]);
  });

  it("recognizes subject abbreviations", () => {
    expect(
      parseAntireqs("MediaCom 2570A/B, Digital Communication 2203A/B.", subjects)
    ).toEqual(["MEDIACOM 2570", "DIGICOMM 2203"]);
  });

  it("removes duplicate course codes", () => {
    expect(
      parseAntireqs(
        "Computer Science 1027A/B, COMPSCI 1027A/B.",
        subjects
      )
    ).toEqual(["COMPSCI 1027"]);
  });

  it("handles former courses and subject names containing and", () => {
    expect(
      parseAntireqs(
        "Calculus 1500A/B, Numerical and Mathematical Methods 1412A/B, the former Applied Mathematics 1412A/B, the former Applied Mathematics 1413.",
        subjects
      )
    ).toEqual([
      "CALCULUS 1500",
      "NMM 1412",
      "APPLMATH 1412",
      "APPLMATH 1413"
    ]);
  });

  it("removes different course suffixes", () => {
    expect(
      parseAntireqs(
        "Mathematics 2151A/B, Mathematics 2155F/G.",
        subjects
      )
    ).toEqual(["MATH 2151", "MATH 2155"]);
  });

  it("handles lists containing and", () => {
    expect(
      parseAntireqs(
        "Computer Science 1025A/B, Computer Science 1026A/B, Computer Science 2120A/B, Data Science 1200A/B, Engineering Science 1036A/B and Software Engineering 2202A/B.",
        subjects
      )
    ).toEqual([
      "COMPSCI 1025",
      "COMPSCI 1026",
      "COMPSCI 2120",
      "DATASCI 1200",
      "ENGSCI 1036",
      "SE 2202"
    ]);
  });

  it("handles lists containing or", () => {
    expect(
      parseAntireqs(
        "Computer Science 1025A/B or Computer Science 1026A/B, Data Science 1200A/B, Engineering Science 1036A/B, Digital Humanities 2220A/B.",
        subjects
      )
    ).toEqual([
      "COMPSCI 1025",
      "COMPSCI 1026",
      "DATASCI 1200",
      "ENGSCI 1036",
      "DIGIHUM 2220"
    ]);
  });

  it("does not guess secondary school requirements", () => {
    expect(
      parseAntireqs(
        "Ontario Secondary School MCV4U, any university level calculus course.",
        subjects
      )
    ).toEqual([]);
  });

  it("does not treat conditional restrictions as unconditional", () => {
    expect(
      parseAntireqs(
        "Software Engineering 2203A/B if taken before the 2022-2023 academic year.",
        subjects
      )
    ).toEqual([]);
  });

  it("does not include explicitly excluded courses", () => {
    expect(
      parseAntireqs(
        "All other courses or half courses in Introductory Statistics, except Statistical Sciences 1023A/B and Statistical Sciences 2037A/B, Data Science 1000A/B.",
        subjects
      )
    ).toEqual([]);
  });

  it("does not guess unknown subject codes", () => {
    expect(
      parseAntireqs("Unknown Subject 1027A/B.", subjects)
    ).toEqual([]);
  });

  it("does not guess missing subject names", () => {
    expect(
      parseAntireqs("1027A/B, 1037A/B.", subjects)
    ).toEqual([]);
  });
});
describe("ambiguous minimum mark scope", () => {
  it("does not guess marks in credit requirements", () => {
    const text =
      "1.0 course from: Computer Science 1026A/B, Computer Science 1027A/B with at least 65%.";

    expect(parsePrereq(text, subjects)).toEqual({
      check: text
    });
  });

  it("does not guess marks in parenthesized alternatives", () => {
    const text =
      "Data Science 3000A/B (or Computer Science 4414A/B) with at least 65%.";

    expect(parsePrereq(text, subjects)).toEqual({
      check: text
    });
  });
});