export type Actor = {
  id: string;
  name: string;
  email: string;
  csrf_token: string;
  memberships: {
    school_id: string;
    role: "school_admin" | "class_teacher";
    school_name: string;
  }[];
  is_parent: boolean;
};
export type SchoolClass = {
  id: string;
  school_id: string;
  grade: string;
  section: string;
  academic_year: string;
  status: "draft" | "active" | "inactive";
  sending_enabled: boolean;
};
export type Student = {
  student_id: string;
  enrollment_id: string;
  name: string;
  roll_number: string;
  admission_number: string;
};
export type Exam = {
  id: string;
  name: string;
  exam_date: string;
  status: "draft" | "published";
  class_id: string;
};
export type Subject = { id: string; name: string; maximum_marks: number };
export type Mark = {
  subject_id: string;
  enrollment_id: string;
  obtained: number | null;
};
export type ClassData = {
  class: SchoolClass;
  students: Student[];
  exams: Exam[];
};
export type ExamData = { exam: Exam; subjects: Subject[]; marks: Mark[] };
export type Teacher = {
  id: string;
  name: string;
  email: string;
  suspended: boolean;
  class_ids: string[];
};
export type Notice = {
  id: string;
  title: string;
  body: string;
  audience: string;
  category: string;
  published: boolean;
  acknowledged: boolean;
  created_at: string;
};
export type Report = {
  id: string;
  student_id: string;
  snapshot: {
    student_name: string;
    school_name: string;
    class_name: string;
    exam_name: string;
    exam_date: string;
    total: number;
    maximum: number;
    subjects: { name: string; obtained: number; maximum: number }[];
  };
};
export type Child = {
  id: string;
  name: string;
  enrollment_id: string;
  class_id: string;
  grade: string;
  section: string;
  school_name: string;
};
export type AttendanceRecord = {
  enrollment_id: string;
  attendance_date: string;
  status: string;
  note: string;
};
export type Leave = {
  id: string;
  student_name: string;
  class_name: string;
  enrollment_id: string;
  from_date: string;
  to_date: string;
  reason: string;
  status: "pending" | "approved" | "declined";
  response: string | null;
};
export type Homework = {
  id: string;
  class_id: string;
  subject: string;
  title: string;
  instructions: string;
  due_date: string;
};
let csrf = "";
export const setCsrf = (value: string) => {
  csrf = value;
};
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch("/api/v1" + path, {
      method,
      credentials: "same-origin",
      signal,
      headers: {
        "Content-Type": "application/json",
        ...(method !== "GET" && csrf ? { "X-CSRF-Token": csrf } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError")
      throw error;
    throw new ApiError(
      "The school service is unavailable. Start the backend and try again.",
      503,
    );
  }
  const result = await response.json().catch(() => ({
    detail: "The school service is unavailable. Please try again.",
  }));
  if (!response.ok) {
    if (response.status === 401 && path !== "/auth/login" && csrf)
      window.dispatchEvent(new Event("pr-auth-expired"));
    const detail =
      typeof result.detail === "string"
        ? result.detail
        : Array.isArray(result.detail)
          ? result.detail.map((x: { msg: string }) => x.msg).join(" ")
          : "We could not complete this action.";
    throw new ApiError(detail, response.status);
  }
  return result as T;
}
