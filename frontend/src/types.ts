export type Role = "school_admin" | "class_teacher" | "parent";
export type Session = { role: Role; id: string };
export type LinkStatus =
  | "not_submitted"
  | "pending"
  | "verified"
  | "declined"
  | "expired";
export type SchoolClass = {
  id: string;
  schoolId: string;
  grade: string;
  section: string;
  academicYear: string;
  status: "draft" | "active" | "inactive";
  sendingEnabled: boolean;
  teacherIds: string[];
};
export type Teacher = {
  id: string;
  schoolId: string;
  name: string;
  email: string;
  suspended: boolean;
};
export type Student = {
  id: string;
  schoolId: string;
  classId: string;
  name: string;
  rollNumber: string;
  guardianLinkStatus: LinkStatus;
  guardianId?: string;
};
export type Guardian = {
  id: string;
  name: string;
  phoneMasked: string;
  phoneFingerprint?: string;
  phoneVerified: boolean;
  consentedAt?: string;
  linkedStudentIds: string[];
};
export type Subject = { id: string; name: string; maximumMarks: number };
export type Exam = {
  id: string;
  schoolId: string;
  classId: string;
  name: string;
  date: string;
  subjects: Subject[];
  published: boolean;
};
export type Mark = {
  examId: string;
  studentId: string;
  subjectId: string;
  obtained: number | null;
};
export type ReportLog = {
  id: string;
  schoolId: string;
  classId: string;
  examId: string;
  studentId: string;
  status: "queued" | "sent" | "delivered" | "read" | "failed";
  createdAt: string;
  failureReason?: string;
  isSimulation: true;
};
export type Invite = {
  token: string;
  classId: string;
  expiresAt: number;
  studentId?: string;
  attempts: number;
};
export type DB = {
  school: {
    id: string;
    name: string;
    city: string;
    active: boolean;
    logoUrl?: string;
    tagline?: string;
    accent?: string;
    address?: string;
    contactEmail?: string;
  };
  classes: SchoolClass[];
  teachers: Teacher[];
  students: Student[];
  guardians: Guardian[];
  exams: Exam[];
  marks: Mark[];
  logs: ReportLog[];
  invites: Invite[];
  attendance: Attendance[];
  notices: Notice[];
  conversations: Conversation[];
  messages: Message[];
  diary: DiaryEntry[];
  leaveRequests: LeaveRequest[];
};
export type AttendanceStatus = "present" | "absent" | "late" | "leave";
export type Attendance = {
  id: string;
  schoolId: string;
  classId: string;
  studentId: string;
  date: string;
  status: AttendanceStatus;
  recordedBy: string;
  note?: string;
};
export type Notice = {
  id: string;
  schoolId: string;
  audience: "school" | "class" | "student";
  classId?: string;
  studentId?: string;
  category:
    | "Announcement"
    | "Behaviour"
    | "Uniform"
    | "Achievement"
    | "Reminder";
  title: string;
  body: string;
  priority: "normal" | "important";
  authorId: string;
  authorRole: "school_admin" | "class_teacher";
  createdAt: string;
  published: boolean;
  acknowledgedBy: string[];
};
export type Conversation = {
  id: string;
  schoolId: string;
  classId: string;
  studentId: string;
  guardianId: string;
  teacherId: string;
  subject: string;
  status: "open" | "resolved";
  createdAt: string;
};
export type Message = {
  readBy?: string[];
  id: string;
  conversationId: string;
  senderId: string;
  senderRole: Role;
  body: string;
  createdAt: string;
};
export type DiaryEntry = {
  id: string;
  schoolId: string;
  classId: string;
  subject: string;
  title: string;
  instructions: string;
  dueDate: string;
  authorId: string;
  completedStudentIds: string[];
};
export type LeaveRequest = {
  id: string;
  schoolId: string;
  classId: string;
  studentId: string;
  guardianId: string;
  from: string;
  to: string;
  reason: string;
  status: "pending" | "approved" | "declined";
  response?: string;
  reviewedBy?: string;
};
