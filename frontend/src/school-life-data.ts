import type { DB } from "./types";
export function schoolLifeSeed(): Pick<
  DB,
  | "attendance"
  | "notices"
  | "conversations"
  | "messages"
  | "diary"
  | "leaveRequests"
> {
  return {
    attendance: Array.from({ length: 10 }, (_, i) => i + 19)
      .filter((day) => ![24, 25].includes(day))
      .flatMap((day) =>
        ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8"].map(
          (studentId, i) => ({
            id: `att-${studentId}-${day}`,
            schoolId: "school",
            classId: i < 5 ? "c6" : "c7",
            studentId,
            date: `2026-10-${day}`,
            status:
              day === 21 && i === 0
                ? ("absent" as const)
                : day === 26 && i === 0
                  ? ("late" as const)
                  : ("present" as const),
            recordedBy: i < 5 ? "t1" : "t2",
          }),
        ),
      ),
    notices: [
      {
        id: "notice-school",
        schoolId: "school",
        audience: "school",
        category: "Announcement",
        title: "Parent–teacher meeting · Saturday, 7 November",
        body: "Dear parents, please join us between 9:00 am and 12:00 pm to discuss your child’s learning. Please follow the school noticeboard for meeting arrangements.",
        priority: "important",
        authorId: "admin",
        authorRole: "school_admin",
        createdAt: "2026-10-30T08:00:00Z",
        published: true,
        acknowledgedBy: [],
      },
      {
        id: "notice-class6",
        schoolId: "school",
        audience: "class",
        classId: "c6",
        category: "Reminder",
        title: "Science activity: bring a small plant",
        body: "Class 6-A will explore plant growth next week. Please send one small potted plant on Monday. A reused container is welcome.",
        priority: "normal",
        authorId: "t1",
        authorRole: "class_teacher",
        createdAt: "2026-10-30T09:00:00Z",
        published: true,
        acknowledgedBy: [],
      },
      {
        id: "notice-private1",
        schoolId: "school",
        audience: "student",
        classId: "c6",
        studentId: "s1",
        category: "Uniform",
        title: "A gentle uniform reminder for Ahmed",
        body: "Ahmed’s school tie was missing today. Please help him pack it for the next school day. Thank you for your support. This note is private to your family and authorized school staff.",
        priority: "normal",
        authorId: "t1",
        authorRole: "class_teacher",
        createdAt: "2026-10-31T07:00:00Z",
        published: true,
        acknowledgedBy: [],
      },
      {
        id: "notice-private6",
        schoolId: "school",
        audience: "student",
        classId: "c7",
        studentId: "s6",
        category: "Achievement",
        title: "Wonderful teamwork, Maryam!",
        body: "Maryam helped her group complete the English reading activity today. Please celebrate her kindness and effort at home.",
        priority: "normal",
        authorId: "t2",
        authorRole: "class_teacher",
        createdAt: "2026-10-31T07:00:00Z",
        published: true,
        acknowledgedBy: [],
      },
    ],
    conversations: [
      {
        id: "thread1",
        schoolId: "school",
        classId: "c6",
        studentId: "s1",
        guardianId: "g1",
        teacherId: "t1",
        subject: "Supporting Ahmed’s reading at home",
        status: "open",
        createdAt: "2026-10-29T09:00:00Z",
      },
    ],
    messages: [
      {
        id: "message1",
        conversationId: "thread1",
        senderId: "g1",
        senderRole: "parent",
        body: "Assalam-o-Alaikum, which reading activities would you recommend for Ahmed this week?",
        createdAt: "2026-10-29T09:00:00Z",
      },
      {
        id: "message2",
        conversationId: "thread1",
        senderId: "t1",
        senderRole: "class_teacher",
        body: "Wa Alaikum Assalam! Ten minutes of reading aloud each evening would be a great start. I have added the English task to the homework diary.",
        createdAt: "2026-10-29T10:00:00Z",
      },
    ],
    diary: [
      {
        id: "diary1",
        schoolId: "school",
        classId: "c6",
        subject: "English",
        title: "Read a little, every day",
        instructions:
          "Read pages 18–20 aloud. Write five new words with their meanings. Parents can mark this task complete after checking the work.",
        dueDate: "2026-11-02",
        authorId: "t1",
        completedStudentIds: [],
      },
      {
        id: "diary2",
        schoolId: "school",
        classId: "c7",
        subject: "Mathematics",
        title: "Fractions practice",
        instructions:
          "Complete exercise 4.2, questions 1–5, in your mathematics notebook.",
        dueDate: "2026-11-03",
        authorId: "t2",
        completedStudentIds: [],
      },
    ],
    leaveRequests: [],
  };
}
