import type { DB } from "./types";
import { schoolLifeSeed } from "./school-life-data";
export const seed = (): DB => {
  const students: DB["students"] = [
    "Ahmed Hassan",
    "Ayesha Khan",
    "Zain Ali",
    "Fatima Noor",
    "Ibrahim Shah",
    "Maryam Asif",
    "Hamza Tariq",
    "Hania Malik",
    "Usman Raza",
  ].map((name, i) => ({
    id: `s${i + 1}`,
    schoolId: "school",
    classId: i < 5 ? "c6" : i < 8 ? "c7" : "c8",
    name,
    rollNumber: String(i + 1).padStart(3, "0"),
    guardianLinkStatus:
      i === 0 || i === 5
        ? "verified"
        : i === 1
          ? "pending"
          : i === 2
            ? "declined"
            : i === 3
              ? "expired"
              : "not_submitted",
    guardianId: i === 0 ? "g1" : i === 5 ? "g2" : undefined,
  }));
  const subjects = [
    { id: "math", name: "Mathematics", maximumMarks: 100 },
    { id: "eng", name: "English", maximumMarks: 100 },
    { id: "sci", name: "Science", maximumMarks: 100 },
  ];
  return {
    ...schoolLifeSeed(),
    school: {
      id: "school",
      name: "Bright Future Academy",
      city: "Lahore",
      active: true,
    },
    classes: [
      {
        id: "c6",
        schoolId: "school",
        grade: "6",
        section: "A",
        academicYear: "2026–27",
        status: "active",
        sendingEnabled: true,
        teacherIds: ["t1"],
      },
      {
        id: "c7",
        schoolId: "school",
        grade: "7",
        section: "A",
        academicYear: "2026–27",
        status: "active",
        sendingEnabled: true,
        teacherIds: ["t2"],
      },
      {
        id: "c8",
        schoolId: "school",
        grade: "8",
        section: "B",
        academicYear: "2026–27",
        status: "inactive",
        sendingEnabled: false,
        teacherIds: ["t3"],
      },
    ],
    teachers: [
      {
        id: "t1",
        schoolId: "school",
        name: "Amina Siddiqui",
        email: "amina@example.test",
        suspended: false,
      },
      {
        id: "t2",
        schoolId: "school",
        name: "Bilal Ahmed",
        email: "bilal@example.test",
        suspended: false,
      },
      {
        id: "t3",
        schoolId: "school",
        name: "Sara Farooq",
        email: "sara@example.test",
        suspended: false,
      },
    ],
    students,
    guardians: [
      {
        id: "g1",
        name: "Demo Parent A",
        phoneMasked: "+92 ••• ••• 0101",
        phoneVerified: true,
        consentedAt: "2026-10-01T08:00:00Z",
        linkedStudentIds: ["s1"],
      },
      {
        id: "g2",
        name: "Demo Parent B",
        phoneMasked: "+92 ••• ••• 0202",
        phoneVerified: true,
        consentedAt: "2026-10-02T08:00:00Z",
        linkedStudentIds: ["s6"],
      },
    ],
    exams: [
      {
        id: "e6",
        schoolId: "school",
        classId: "c6",
        name: "October assessment",
        date: "2026-10-28",
        subjects,
        published: true,
      },
      {
        id: "draft6",
        schoolId: "school",
        classId: "c6",
        name: "November assessment",
        date: "2026-11-15",
        subjects,
        published: false,
      },
      {
        id: "e7",
        schoolId: "school",
        classId: "c7",
        name: "October assessment",
        date: "2026-10-28",
        subjects,
        published: true,
      },
    ],
    marks: students
      .filter((s) => s.classId !== "c8")
      .flatMap((s, i) =>
        subjects.map((subject, j) => ({
          examId: s.classId === "c6" ? "e6" : "e7",
          studentId: s.id,
          subjectId: subject.id,
          obtained: [88, 92, 85, 76, 81, 94, 68, 79][i] - j * 3,
        })),
      ),
    logs: [
      {
        id: "l1",
        schoolId: "school",
        classId: "c6",
        examId: "e6",
        studentId: "s1",
        status: "delivered",
        createdAt: "2026-10-29T09:30:00Z",
        isSimulation: true,
      },
      {
        id: "l2",
        schoolId: "school",
        classId: "c7",
        examId: "e7",
        studentId: "s6",
        status: "failed",
        createdAt: "2026-10-29T09:32:00Z",
        failureReason: "Simulated network failure",
        isSimulation: true,
      },
      {
        id: "l3",
        schoolId: "school",
        classId: "c7",
        examId: "e7",
        studentId: "s6",
        status: "queued",
        createdAt: "2026-10-31T09:32:00Z",
        isSimulation: true,
      },
    ],
    invites: [
      {
        token: "demo-class6",
        classId: "c6",
        expiresAt: Date.now() + 86400000,
        attempts: 0,
      },
      { token: "expired-demo", classId: "c6", expiresAt: 0, attempts: 0 },
    ],
  };
};
