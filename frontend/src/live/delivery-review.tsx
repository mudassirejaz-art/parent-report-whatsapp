import { useRef } from "react";
import { Link } from "react-router-dom";
import { Card } from "../components";
import { api, ApiError } from "./api";
import { ActionButton, RemoteState, useRemote } from "./common";

const labels = {
  eligible: "Ready to simulate",
  not_published: "Publish the reports first",
  class_sending_disabled: "Activate the class and enable report sending first",
  enrollment_ended: "Enrollment ended",
  no_guardian_link: "No active parent link",
  guardian_unverified: "Parent verification required",
  consent_missing: "WhatsApp consent required",
  report_ineligible: "Report does not meet delivery requirements",
};

type Review = {
  blocker: "not_published" | "class_sending_disabled" | null;
  reports: {
    report_id: string;
    student_name: string;
    eligible_recipients: number;
    reason: keyof typeof labels;
  }[];
  campaigns: {
    id: string;
    created_at: string;
    queued: number;
    reports: number;
    retrying: number;
    delivered: number;
    skipped: number;
    failed: number;
  }[];
};

export function DeliveryReview({ examId }: { examId: string }) {
  const endpoint = "/exams/" + examId;
  const review = useRemote<Review>(endpoint + "/delivery-review");
  const requestId = useRef<string | null>(null);
  const data = review.data;
  const eligible =
    data?.reports.filter((row) => row.eligible_recipients > 0).length ?? 0;

  return (
    <Card>
      <h2>Reports are published</h2>
      <p>
        Simulation only. Parents can view published report cards in the portal.
      </p>
      <Link className="text-link" to="/workspace/reports">
        View report cards →
      </Link>
      <h3>Report delivery review</h3>
      <RemoteState {...review} retry={review.refresh} />
      {data && !review.error && (
        <>
          {data.blocker && <p className="helper">{labels[data.blocker]}</p>}
          <p className="helper">
            {eligible} ready · {data.reports.length - eligible} skipped
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Delivery check</th>
                  <th>Eligible recipients</th>
                </tr>
              </thead>
              <tbody>
                {data.reports.map((row) => (
                  <tr key={row.report_id}>
                    <td>{row.student_name}</td>
                    <td>{labels[row.reason]}</td>
                    <td>{row.eligible_recipients}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!data.blocker && (eligible > 0 || requestId.current) && (
            <ActionButton
              secondary
              onAction={async () => {
                requestId.current ??= crypto.randomUUID();
                try {
                  const result = await api<{ queued: number }>(
                    endpoint + "/simulate-reports",
                    "POST",
                    {
                      idempotency_key: requestId.current,
                    },
                  );
                  requestId.current = null;
                  review.refresh();
                  return (
                    "Simulation only: " + result.queued + " recipients queued."
                  );
                } catch (error) {
                  if (error instanceof ApiError && error.status < 500)
                    requestId.current = null;
                  throw error;
                }
              }}
            >
              Simulate WhatsApp queue
            </ActionButton>
          )}
          <details>
            <summary>Recent simulations</summary>
            <button
              className="btn secondary"
              onClick={review.refresh}
              disabled={review.loading}
            >
              Refresh simulation history
            </button>
            {data.campaigns.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Run time (PKT)</th>
                      <th>Reports</th>
                      <th>Recipients queued</th>
                      <th>Retry scheduled</th>
                      <th>Mock delivered</th>
                      <th>Skipped</th>
                      <th>Mock failed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.campaigns.map((run) => (
                      <tr key={run.id}>
                        <td>
                          {new Date(run.created_at).toLocaleString("en-PK", {
                            timeZone: "Asia/Karachi",
                          })}
                        </td>
                        <td>{run.reports}</td>
                        <td>{run.queued}</td>
                        <td>{run.retrying}</td>
                        <td>{run.delivered}</td>
                        <td>{run.skipped}</td>
                        <td>{run.failed}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="helper">No simulations yet.</p>
            )}
          </details>
        </>
      )}
    </Card>
  );
}
