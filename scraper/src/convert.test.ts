// Module pages as pageText reads them, shaped like the real calendar's.
import { describe, expect, it } from "vitest";
import { toDegreeRequirements, toModule } from "./convert.ts";
import type { ModuleLink } from "./pages.ts";

const link = (type: string): ModuleLink => ({
  id: "21112",
  name: `${type} in COMPUTER SCIENCE`,
  type,
  area: "COMPUTER SCIENCE",
  faculty: "Faculty of Science",
  department: "Computer Science",
  url: "https://westerncalendar.uwo.ca/Modules.cfm?ModuleID=21112",
});

describe("module pages", () => {
  it("splits admission from the course list at the Module line", () => {
    const mod = toModule(link("Major"), {
      title: "MAJOR IN COMPUTER SCIENCE Faculty of Science - Computer Science (CS Program)",
      sections: [
        {
          heading: "MAJOR IN COMPUTER SCIENCE",
          lines: ["Faculty of Science - Computer Science (CS Program)", "Completion of first-year requirements.", "Module", "6.0 courses:", "3.5 courses: Computer Science 2208A/B."],
        },
        { heading: "Progression Requirements", lines: ["A modular average of 60%."] },
        { heading: "Failure to Meet Progression Standards", lines: ["Students must withdraw."] },
        { heading: "Graduation Requirements", lines: ["A modular average of 60%."] },
        { heading: "Fees", lines: ["Prevailing fees."] },
      ],
    });
    expect(mod).toMatchObject({
      name: "MAJOR IN COMPUTER SCIENCE",
      department: "Computer Science (CS Program)",
      admission: ["Completion of first-year requirements."],
      courses: ["6.0 courses:", "3.5 courses: Computer Science 2208A/B."],
      progression: ["A modular average of 60%.", "Failure to Meet Progression Standards", "Students must withdraw."],
      graduation: ["A modular average of 60%."],
      other: [{ heading: "Fees", lines: ["Prevailing fees."] }],
      requirements: null,
    });
  });

  it("starts the course list at its total when a major has no Module line", () => {
    const mod = toModule(link("Major"), {
      title: "",
      sections: [{ heading: "MAJOR IN CHINA STUDIES", lines: ["Completion of first-year requirements.", "3.5 principal courses:", "6.0 courses:", "1.0 course from: Chinese 2250."] }],
    });
    expect(mod.admission).toEqual(["Completion of first-year requirements.", "3.5 principal courses:"]);
    expect(mod.courses).toEqual(["6.0 courses:", "1.0 course from: Chinese 2250."]);
  });

  it("keeps a combined degree's text in other, without guessing", () => {
    const mod = toModule(link("Combined Degree Program"), {
      title: "",
      sections: [{ heading: "LAW/MBA", lines: ["Faculty of Science - Law Combined Programs", "See JD/MBA Combined Program.", "4.0 courses:"] }],
    });
    expect(mod.courses).toEqual([]);
    expect(mod.other).toEqual([{ heading: "", lines: ["See JD/MBA Combined Program.", "4.0 courses:"] }]);
  });
});

describe("degree page", () => {
  it("drops the policy menu above the content", () => {
    const page = toDegreeRequirements({
      title: "Degree Requirements and Graduation",
      sections: [
        { heading: "Policy Categories", lines: [] },
        { heading: "Degree Requirements and Graduation", lines: [] },
        { heading: "Registration", lines: ["Browse by Academic Policy"] },
        { heading: "Degree Requirements and Graduation", lines: ["ADMISSION - BMSc"] },
        { heading: "GRADUATION REQUIREMENTS", lines: ["20.0 courses."] },
      ],
    });
    expect(page.sections).toEqual([{ heading: "GRADUATION REQUIREMENTS", lines: ["20.0 courses."] }]);
  });
});
