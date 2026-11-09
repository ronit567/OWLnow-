// Hand-made pages in the calendar's layout. Not copied from Western: if the real layout differs,
// fix pages.ts and these samples together.
import { describe, expect, it } from "vitest";
import { antireqKeys, isEssay, toCourses } from "./convert.ts";
import { coursesFromSubjectPage, moduleLinks, pageText, splitFacts, subjectsFromCoursesPage } from "./pages.ts";

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

  it("keeps two labels in one block apart", () => {
    const [course] = coursesFromSubjectPage(
      panel(
        "MAIN_044444_1",
        "Computer Science 3305A/B OPERATING SYSTEMS",
        "0.50",
        `<div><strong>Antirequisite(s):</strong> Software Engineering 3313A/B. <strong>Prerequisite(s):</strong> Computer Science 2210A/B <strong>Corequisite(s):</strong> Computer<br>Science 3350A/B.</div>
         <div><strong>Extra Information:</strong> 3 lecture hours.</div>`,
      ),
      subjects[0],
    );
    expect(course).toMatchObject({
      antireqText: "Software Engineering 3313A/B.",
      prereqText: "Computer Science 2210A/B",
      coreqText: "Computer Science 3350A/B.",
      extraInfo: "3 lecture hours.",
    });
  });

  it("recognises every spelling of a label, and only labels", () => {
    expect(splitFacts("Math 1600A/B Pre- or Co-requisite(s): Math 2120A/B", "prereq")).toEqual({ prereq: "Math 1600A/B", coreq: "Math 2120A/B" });
    expect(splitFacts("Math 1600A/B Co-requisites: Math 2120A/B", "prereq")).toEqual({ prereq: "Math 1600A/B", coreq: "Math 2120A/B" });
    const prose = "Film 2201F/G. Students who took Film 3300F/G also meet the prerequisite: see the department. Note: by permission.";
    expect(splitFacts(prose, "prereq")).toEqual({ prereq: prose });
  });

  it("counts E, F, G and Z as essay suffixes", () => {
    expect(["E", "F/G", "G", "Z", "F/G/Z"].every(isEssay)).toBe(true);
    expect(["", "A/B", "Y", "A/B/Y", "Q/R/S/T"].some(isEssay)).toBe(false);
  });
});

describe("module and degree pages", () => {
  it("reads each module bubble with its row's area, faculty and department", () => {
    const bubble = (id: string, type: string) =>
      `<a href="./Modules.cfm?ModuleID=${id}&SelectedCalendar=Live&ArchiveID="><img src="x.png" title="${type}" alt="${type}"></a>`;
    const links = moduleLinks(`<table><thead><tr><th>Area of Study</th><th>Faculty</th><th>Department</th><th>Modules</th></tr></thead><tbody>
      <tr><td><div>COMPUTER SCIENCE</div></td><td><div><a href="./Faculties.cfm?FacultyID=1">Faculty of Science</a></div></td>
        <td><div><a href="./Departments.cfm?DepartmentID=2">Computer Science</a></div></td>
        <td><div>${bubble("21580", "Honours Specialization")}${bubble("21600", "Minor")}${bubble("21580", "Honours Specialization")}</div></td></tr>
      </tbody></table>`);
    expect(links.map((m) => m.id)).toEqual(["21580", "21600"]);
    expect(links[0]).toEqual({
      id: "21580",
      name: "Honours Specialization in COMPUTER SCIENCE",
      type: "Honours Specialization",
      area: "COMPUTER SCIENCE",
      faculty: "Faculty of Science",
      department: "Computer Science",
      url: "https://westerncalendar.uwo.ca/Modules.cfm?ModuleID=21580&SelectedCalendar=Live&ArchiveID=",
    });
    expect(links[1].type).toBe("Minor");
  });

  it("keeps the wording under its headings and drops the navigation", () => {
    const page = pageText(`<html><head><title>Calendar</title></head><body>
      <div class="container"><nav>Home</nav><p>Skip to content</p></div>
      <div class="container">
        <h2>Honours Specialization in Computer Science</h2>
        <h3>Admission
          Requirements</h3>
        <p>Completion of first-year
           requirements with no failures.</p>
        <p>First line<br>Second line</p>
        <h4>Return to top</h4>
        <h3></h3>
        <h3>Module</h3>
        <table><tr><td>1.0 course from:</td><td>Computer Science 1027A/B, 1037A/B</td></tr></table>
        <ul><li>0.5 course: Mathematics 1600A/B</li></ul>
        <form>Search</form><script>var x = 1;</script>
      </div></body></html>`);
    expect(page.title).toBe("Honours Specialization in Computer Science");
    expect(page.sections).toEqual([
      { heading: "Honours Specialization in Computer Science", lines: [] },
      { heading: "Admission Requirements", lines: ["Completion of first-year requirements with no failures.", "First line", "Second line"] },
      { heading: "Module", lines: ["1.0 course from: Computer Science 1027A/B, 1037A/B", "0.5 course: Mathematics 1600A/B"] },
    ]);
  });
});
