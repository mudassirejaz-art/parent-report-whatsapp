from datetime import date
from decimal import Decimal
from typing import Annotated, Literal
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

Text = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)]
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
Short = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)]
Password = Annotated[str, StringConstraints(min_length=12, max_length=128)]
Amount = Annotated[Decimal, Field(ge=0, le=999999, max_digits=8, decimal_places=2)]

class Model(BaseModel):
    model_config = ConfigDict(extra="forbid")

class Login(Model):
    email: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=254, pattern=r"^[^\s@]+@[^\s@]+\.[^\s@]+$")]
    password: Annotated[str, StringConstraints(min_length=1, max_length=128)]

class ClassCreate(Model):
    school_id: UUID
    grade: Short
    section: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=20)]
    academic_year: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=30)]
    status: Literal["draft", "active", "inactive"] = "draft"
    sending_enabled: bool = False

class ClassUpdate(Model):
    status: Literal["draft", "active", "inactive"]
    sending_enabled: bool

class TeacherCreate(Model):
    school_id: UUID
    name: Name
    email: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=254, pattern=r"^[^\s@]+@[^\s@]+\.[^\s@]+$")]
    password: Password

class Assignment(Model):
    teacher_id: UUID
    assigned: bool

class TeacherAccess(Model):
    school_id: UUID
    suspended: bool

class StudentCreate(Model):
    name: Name
    admission_number: Short
    roll_number: Short

class Subject(Model):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
    maximum_marks: Annotated[Decimal, Field(gt=0, le=999999, max_digits=8, decimal_places=2)]

class ExamCreate(Model):
    name: Text
    date: date
    subjects: list[Subject] = Field(min_length=1, max_length=30)

    @model_validator(mode="after")
    def unique_subjects(self):
        names = [s.name.casefold() for s in self.subjects]
        if len(names) != len(set(names)):
            raise ValueError("Subject names must be unique.")
        return self

class MarkCell(Model):
    enrollment_id: UUID
    subject_id: UUID
    obtained: Amount | None

class MarksSave(Model):
    marks: list[MarkCell] = Field(min_length=1, max_length=5000)

    @model_validator(mode="after")
    def unique_cells(self):
        cells = [(x.enrollment_id, x.subject_id) for x in self.marks]
        if len(cells) != len(set(cells)):
            raise ValueError("Duplicate mark cells are not allowed.")
        return self

class AttendanceCell(Model):
    enrollment_id: UUID
    status: Literal["present", "absent", "late", "leave"]
    note: Annotated[str, StringConstraints(max_length=1000)] = ""

class AttendanceSave(Model):
    date: date
    records: list[AttendanceCell] = Field(min_length=1, max_length=1000)

    @model_validator(mode="after")
    def unique_students(self):
        ids = [x.enrollment_id for x in self.records]
        if len(ids) != len(set(ids)):
            raise ValueError("Duplicate attendance records.")
        return self

class NoticeCreate(Model):
    school_id: UUID | None = None
    class_id: UUID | None = None
    enrollment_id: UUID | None = None
    audience: Literal["school", "class", "student"]
    category: Literal["Announcement", "Behaviour", "Uniform", "Achievement", "Reminder"] = "Announcement"
    title: Text
    body: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=5000)]
    priority: Literal["normal", "important"] = "normal"
    published: bool = True

    @model_validator(mode="after")
    def audience_scope(self):
        if self.audience == "school":
            valid = self.school_id and not self.class_id and not self.enrollment_id
        elif self.audience == "class":
            valid = self.class_id and not self.enrollment_id
        else:
            valid = self.class_id and self.enrollment_id
        if not valid:
            raise ValueError("Choose the required school, class or student audience.")
        if self.category in ("Behaviour", "Uniform") and self.audience != "student":
            raise ValueError("Behaviour and uniform notices must be private to one student.")
        return self

class HomeworkCreate(Model):
    subject: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
    title: Text
    instructions: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=5000)]
    due_date: date

class HomeworkComplete(Model):
    enrollment_id: UUID

class LeaveCreate(Model):
    enrollment_id: UUID
    from_date: date
    to_date: date
    reason: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]

    @model_validator(mode="after")
    def date_order(self):
        if self.to_date < self.from_date:
            raise ValueError("End date must be on or after start date.")
        return self

class LeaveReview(Model):
    status: Literal["approved", "declined"]
    response: Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)] = ""

class Simulation(Model):
    idempotency_key: UUID

