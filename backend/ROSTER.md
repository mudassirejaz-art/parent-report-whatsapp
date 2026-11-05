# Class roster import

In the connected workspace, open a class, select **Students**, and expand **Import students from CSV**. School admins and teachers assigned to an active class can import students. The roster search matches name, admission number, or roll number.

1. Download the template and replace its fictional example row. Save as CSV UTF-8 with `name`, `admission_number`, and `roll_number`. Format identifier columns as text in the spreadsheet to preserve leading zeroes.
2. Choose the CSV and run **Preview and check**. The preview lists row errors, including duplicate admission numbers in the school and duplicate roll numbers in the class. Correct all errors before confirming.
3. Confirm the preview and select **Import students**. The limit is 200 students and 100 KB per file. Existing records are preserved. Parent linking and consent take place separately under **Parent links**.

Apply migration `011_roster_import.sql` with `backend/scripts/Invoke-Database.ps1 migrate`, then restart the API. Follow [API setup](API.md) for the local workspace. Preview and import both require an authenticated session, CSRF, and current class access. Import rechecks the file in a single transaction and uses a request ID so a retry after a lost response cannot add duplicate students.

Run `backend/.venv/Scripts/python.exe -m pytest backend/tests/test_roster.py -q` for targeted checks. Run `node scripts/browser-roster.mjs` from the frontend directory in a monorepo checkout, or from the local workspace root. The browser script uses the fictional admin fixture created by `browser-accounts.mjs`. Its results are in `verification/roster-browser-results.json` relative to the frontend.
