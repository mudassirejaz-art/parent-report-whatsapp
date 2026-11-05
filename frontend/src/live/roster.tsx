import { useRef, useState } from "react";
import { Download, FileUp, Search } from "lucide-react";
import { Card } from "../components";
import { api, ApiError, type Student } from "./api";

type Preview = {
  total: number;
  invalid: number;
  ready: boolean;
  rows: {
    row: number;
    name: string;
    admission_number: string;
    roll_number: string;
    errors: string[];
  }[];
};
const template =
  "name,admission_number,roll_number\r\nFictitious Student,ADM-NEW-001,101\r\n";
function downloadTemplate() {
  const url = URL.createObjectURL(
    new Blob(["\ufeff" + template], { type: "text/csv;charset=utf-8" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "parentreport-students-template.csv";
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function ClassRoster({
  classId,
  students,
  onImported,
}: {
  classId: string;
  students: Student[];
  onImported: () => void;
}) {
  const [query, setQuery] = useState("");
  const term = query.trim().toLocaleLowerCase();
  const visible = students.filter((s) =>
    [s.name, s.admission_number, s.roll_number].some((v) =>
      v.toLocaleLowerCase().includes(term),
    ),
  );
  return (
    <>
      <Card>
        <div className="live-roster-top">
          <label className="live-roster-search">
            <span>
              <Search size={16} /> Search students
            </span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Name, admission or roll number"
            />
          </label>
          <p className="muted" role="status">
            {visible.length} / {students.length} students
          </p>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Roll number</th>
                <th>Student</th>
                <th>Admission</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((s) => (
                <tr key={s.enrollment_id}>
                  <td>{s.roll_number}</td>
                  <td>{s.name}</td>
                  <td>{s.admission_number}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!visible.length && (
          <p className="muted">
            {students.length
              ? "No students match your search."
              : "Add the first student to this class."}
          </p>
        )}
      </Card>
      <RosterImport key={classId} classId={classId} onImported={onImported} />
    </>
  );
}
function RosterImport({
  classId,
  onImported,
}: {
  classId: string;
  onImported: () => void;
}) {
  const [csv, setCsv] = useState(""),
    [filename, setFilename] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null),
    [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  const requestId = useRef(crypto.randomUUID());
  const fileInput = useRef<HTMLInputElement>(null);
  const generation = useRef(0);
  async function choose(file?: File) {
    const version = ++generation.current;
    setCsv("");
    setPreview(null);
    setConfirmed(false);
    setError("");
    setSuccess("");
    setFilename(file?.name ?? "");
    requestId.current = crypto.randomUUID();
    if (!file) return;
    if (file.size > 100000) {
      setError("Choose a CSV file smaller than 100 KB.");
      return;
    }
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(
        await file.arrayBuffer(),
      );
      if (version === generation.current) setCsv(text);
    } catch {
      if (version === generation.current)
        setError("Save the file as CSV UTF-8 and try again.");
    }
  }
  return (
    <Card>
      <details className="live-import">
        <summary>
          <FileUp size={18} /> Import students from CSV
        </summary>
        <p className="helper">
          Use an Excel or Google Sheets CSV export with these three columns:
          name, admission_number, roll_number. Up to 200 students and 100 KB per
          file. This adds new students; existing records stay intact.
        </p>
        <p className="helper">
          Parent WhatsApp numbers are collected and verified separately through
          Parent links.
        </p>
        <button
          className="btn secondary"
          type="button"
          onClick={downloadTemplate}
        >
          <Download size={16} /> Download CSV template
        </button>
        <fieldset className="live-fieldset" disabled={pending}>
          <label className="live-import-file">
            1. Choose a CSV file
            <input
              ref={fileInput}
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => void choose(e.target.files?.[0])}
            />
          </label>
          {filename && (
            <p className="helper live-import-filename">{filename}</p>
          )}
          <button
            className="btn secondary"
            type="button"
            disabled={!csv || pending}
            onClick={async () => {
              setPending(true);
              setError("");
              setSuccess("");
              setPreview(null);
              setConfirmed(false);
              try {
                setPreview(
                  await api<Preview>(
                    "/classes/" + classId + "/students/import-preview",
                    "POST",
                    { csv },
                  ),
                );
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setPending(false);
              }
            }}
          >
            {pending ? "Checking…" : "2. Preview and check"}
          </button>
          {preview && (
            <div className="live-import-preview">
              <h3>Import preview</h3>
              <p role="status">
                {preview.ready
                  ? "All rows are ready to import."
                  : "Fix the highlighted rows, then choose the corrected file."}
              </p>
              <p className="helper">
                {preview.total} rows · {preview.invalid} rows need attention
              </p>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>CSV line</th>
                      <th>Student</th>
                      <th>Admission</th>
                      <th>Roll number</th>
                      <th>Check</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((r) => (
                      <tr
                        key={r.row}
                        className={r.errors.length ? "live-import-invalid" : ""}
                      >
                        <td>{r.row}</td>
                        <td>{r.name || "—"}</td>
                        <td>{r.admission_number || "—"}</td>
                        <td>{r.roll_number || "—"}</td>
                        <td>
                          {r.errors.length ? (
                            <ul>
                              {r.errors.map((e) => (
                                <li key={e}>{e}</li>
                              ))}
                            </ul>
                          ) : (
                            "Ready"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.ready && (
                <>
                  <label className="live-import-confirm">
                    <input
                      type="checkbox"
                      checked={confirmed}
                      onChange={(e) => setConfirmed(e.target.checked)}
                    />
                    I reviewed these students for this class.
                  </label>
                  <button
                    className="btn"
                    type="button"
                    disabled={!confirmed || pending}
                    onClick={async () => {
                      setPending(true);
                      setError("");
                      try {
                        const result = await api<{ count: number }>(
                          "/classes/" + classId + "/students/import",
                          "POST",
                          { csv, request_id: requestId.current },
                        );
                        setSuccess(
                          result.count +
                            " students imported. Parent verification is still required.",
                        );
                        setCsv("");
                        setPreview(null);
                        setConfirmed(false);
                        setFilename("");
                        if (fileInput.current) fileInput.current.value = "";
                        onImported();
                      } catch (e) {
                        setError((e as Error).message);
                        // A lost response may follow a committed import. Retain
                        // the same request id so a transport retry is safe.
                        if (!(e instanceof ApiError) || e.status < 500) {
                          setPreview(null);
                          setConfirmed(false);
                        }
                      } finally {
                        setPending(false);
                      }
                    }}
                  >
                    {pending ? "Importing…" : "3. Import students"}
                  </button>
                </>
              )}
            </div>
          )}
        </fieldset>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {success && (
          <p className="live-success" role="status">
            {success}
          </p>
        )}
      </details>
    </Card>
  );
}
