// Hand-made pages in the calendar's layout. Not copied from Western: if the real layout differs,
// fix pages.ts and these samples together.
import { describe, expect, it } from "vitest";
import { antireqKeys, toCourses } from "./convert.ts";
import { coursesFromSubjectPage, subjectsFromCoursesPage } from "./pages.ts";

const coursesPage = `<table>
  <tr><td><a href="Courses.cfm?Subject=COMPSCI&amp;SelectedCalendar=Live&amp;ArchiveID=">Computer Science</a></td><td>CATEGORY C</td></tr>
  <tr><td><a href="Courses.cfm?Subject=MATH&amp;SelectedCalendar=Live&amp;ArchiveID=">Mathematics</a></td><td>CATEGORY C</td></tr>
  <tr><td><a href="Courses.cfm?Subject=BLACKST&amp;SelectedCalendar=Live&amp;ArchiveID=">Black Studies</a></td><td>CATEGORY A or CATEGORY B</td></tr>
</table>`;

const panel = (id: string, heading: string, weight: string, facts: string) => `
<div class="panel">
  <div class="panel-heading"><h4 class="courseTitleNoBlueLink">${heading}</h4></div>
  <div class="panel-body"><div class="col-xs-12">${facts}
    <h5>Course Weight: ${weight}</h5>
    <a href="Courses.cfm?CourseAcadCalendarID=${id}&amp;SelectedCalendar=Live&amp;ArchiveID=">More details</a>
  </div></div>
</div>`;

const subjectPage =
  panel(
    "MAIN_011111_1",
    "Computer Science 2210A/B DATA STRUCTURES AND ALGORITHMS",
    "0.50",
    `<div><strong>Antirequisite(s):</strong> Computer Science 2211A/B, 1037A/B, Mathematics 2155F/G.</div>
     <div><strong>Prerequisite(s):</strong> Computer Science 1027A/B or 1037A/B, with at least 65%.</div>`,
  ) +
  panel("HURON_022222_1", "Computer Science 2210A/B DATA STRUCTURES AND ALGORITHMS", "0.50", "") +
  panel("MAIN_033333_1", "Computer Science 4490Z SPECIAL TOPICS", "", "");

describe("calendar pages", () => {
  const subjects = subjectsFromCoursesPage(coursesPage);

  it("reads every subject with its categories", () => {
    expect(subjects.map((s) => s.code)).toEqual(["COMPSCI", "MATH", "BLACKST"]);
    expect(subjects[0]).toMatchObject({ name: "Computer Science", categories: ["C"] });
    expect(subjects[2].categories).toEqual(["A", "B"]);
  });

  it("reads courses and keeps the Main campus listing", () => {
    const raw = coursesFromSubjectPage(subjectPage, subjects[0]);
    expect(raw).toHaveLength(3);
    expect(raw[0]).toMatchObject({ number: "2210A/B", title: "DATA STRUCTURES AND ALGORITHMS", weight: 0.5, campus: "Main", category: "C" });
    expect(raw[0].prereqText).toBe("Computer Science 1027A/B or 1037A/B, with at least 65%.");
    expect(raw[1].campus).toBe("Huron");

    const courses = toCourses(raw, subjects);
    expect(courses.map((c) => c.key)).toEqual(["COMPSCI 2210", "COMPSCI 4490"]);
    expect(courses[0]).toMatchObject({ suffix: "A/B", essay: false, campus: "Main", antireqs: ["COMPSCI 2211", "COMPSCI 1037", "MATH 2155"] });
    expect(courses[0]).toMatchObject({
      title: "DATA STRUCTURES AND ALGORITHMS",
      weight: 0.5,
      prereqText: "Computer Science 1027A/B or 1037A/B, with at least 65%.",
      antireqText: "Computer Science 2211A/B, 1037A/B, Mathematics 2155F/G.",
    });
    expect(courses[1].weight).toBe(0.5);
  });

  it("gives a bare number the subject named before it", () => {
    expect(antireqKeys("Computer Science 1025A/B, 1026A/B", subjects)).toEqual(["COMPSCI 1025", "COMPSCI 1026"]);
  });
});
