---
title: "Forms — User Manual"
description: "Build your own survey or request/report sheets, then collect, summarise and export the answers."
screenshots: []
---
Build your own survey or request/report sheets and collect the answers. The operation code is `CM02`.

## What you can do

- Lay out your own questions to build a **form**.
- Share the form's **URL** so people in the company can answer it.
- View all answers in a list, or **export them to Excel**.
- Print a single answer as a **PDF**, or print a whole batch at once.
- See "how many people chose what" on the **summary** screen.
- Hand the data to **Metabase** when you need deeper analysis.

## Words used on this page

- **Field** … one question in the form. "Name" and "Department" are two fields.
- **Response** … one submission. If one person submits twice, that is two responses.
- **Survey / Request-report** … the two kinds of form. A request-report goes to approvers once submitted.
- **Form code** … an 8-character code given to each form. You use it to filter in Metabase.
- **Sharing** … who may see or answer this form. **With no sharing set, only you and administrators can see it.**

## Before you start

You need permission to create forms. If you cannot find the buttons, ask an administrator.

To collect answers you need **both** to set the form to "published" **and** to set up sharing. If either is missing, people will not see the form even with the URL.

## Reading the screen

Opening the app shows a list of the forms you have made. Click a row to open that form.

The detail screen is split into tabs.

- **Fields** … the questions in the form. Press "Edit" at the top right to change them.
- **Responses** … the answers collected. Exporting starts here.
- **Approval** … only for request-report forms. Sets who approves.
- **Sharing** … who may see or answer.
- **History** … who did what, and when.

> 💡 Tabs open in read-only mode. Press **Edit** at the top right of a tab to change it, then press Save.

## Export answers to Excel [#export-excel]

1. Open the **Responses** tab.
2. Press **Export**.
3. Narrow it down if you need to. Leave it alone to export everything.
   - **Status** … for example only "Approved".
   - **Submitted date** … for example only March.
   - **Fields to export** … which questions become columns. All are ticked at first.
4. Press **Download as Excel**.

One row is one response and one column is one field. Numeric questions stay numeric, so you can total and sort them in Excel straight away.

> ⚠️ Answers contain what people wrote personally. Be careful where you save the file and who you send it to. **Every export is recorded.**

## Print answers as PDF [#export-pdf]

**A single answer**

1. On the **Responses** tab, click the answer you want.
2. Press **⋯** at the top right and choose **Print as PDF**.

For request-report forms, **the record of who approved and when is printed too**.

**A batch**

1. On the **Responses** tab press **Export**.
2. Narrow it down as you would for Excel.
3. Press **Print all as PDF**.

One answer becomes one page. A large batch takes a while.

Multi-line answers keep their line breaks and sub-tables print as tables.
Questions with no answer print "（未回答）" rather than a blank, so you can tell a
skipped question from a printing fault.

> 💡 Batch printing does not include the approval record. Print one at a time if you need it.

## Summarise the answers [#summary]

Press **View summary** on the Responses tab. Each question gets the chart that
suits its type.

| Question type | What you get |
|---|---|
| Pick one (dropdown, business-data lookup) | Doughnut chart with a breakdown |
| Pick several | Horizontal bars |
| Number | Min / average / median / max, plus a column chart of the spread |
| Date, time | A column chart showing when submissions cluster |
| Free text | No chart — a count and a few recent answers |
| Attachment, sub-table | Counts only |

Each question shows **Answered N / Unanswered M**. On optional questions, how many
people skipped it is a result too, so the denominator is shown alongside the count.

- **Most first / Definition order** changes how the choices are sorted. Definition
  order reads better when the order means something (a 1–5 rating scale).
- **Auto / Pie / Bar** picks the chart shape for choice questions.
- **Monthly / Daily** changes how submissions over time are grouped.
- **CSV** saves the numbers behind the charts.

> 💡 **Pick-several questions never get a pie chart.** One person can tick two
> options, so the percentages add up to more than 100%. A pie would make "share of
> the whole" a lie, so those stay as bars (the percentage is "of the people who
> answered").

This screen only shows the breakdown of one question at a time. For cross-question analysis, use Metabase below.

## Deeper analysis in Metabase [#metabase]

**Metabase** turns company data into charts and tables. You do not need to write any code — it is all mouse work.

### Before you start

- Metabase uses **the same login you use every day**.
- If you are not sure how to open it, press **Open Metabase** on the summary screen.

### Steps

1. On the summary screen, press **Copy** next to **Form code**. The 8-character code is copied.
2. Press **Open Metabase**.
3. Choose **New** → **Question**.
4. For the data, pick **CKK Business** → **Form answer details**.
5. Press **Filter**, choose **Form code**, and paste the code you copied.
6. Press **Summarize** and choose **Count**.
7. Under **Group by**, choose **Field label** for a count per question. Add **Answer value** for the breakdown per choice.
8. Press **Visualization** to switch the table to a bar or pie chart.

### Worth knowing

- **Form answer details** has **one row per question per response**. Ten responses to a five-question form is fifty rows. Keep that in mind when counting.
- To see **one row per response**, use **Form responses** instead.
- Use the **Answer value (number)** and **Answer value (date)** columns for numeric and date questions — the plain text column cannot be calculated on.
- **Save** your question and you can reopen it any time for up-to-date numbers.

> ⚠️ On forms set to hide respondents, names do not appear in Metabase either. What the app hides stays hidden here.

> 💡 Draft answers never reach Metabase. Only submitted ones do.

## Questions and problems

**Q. I shared the URL but people say they cannot open it.**
A. Check the Sharing tab to confirm they are covered. A form with no sharing set is visible only to you and administrators. Also check that the form is published.

**Q. The Excel file has a column for a question I deleted.**
A. That is expected. Deleting a question does not delete the answers given before that. Dropping the column would make those responses unreadable.

**Q. Dates in Excel look shifted.**
A. Dates are exported in the time zone from your profile settings. Check that setting.

**Q. Some answers are missing from the export.**
A. There is a limit per export. Split it by month using the submitted-date filter.

**Q. My form does not appear in Metabase.**
A. Forms with no submitted answers do not appear. Metabase data can also lag slightly behind.

**Q. Metabase numbers do not match the app's summary.**
A. Form answer details has one row per question per response. To count responses, use Form responses, or count distinct response numbers.

**Q. I want to correct an answer I submitted.**
A. You can edit your own answer within the window the form allows. Open it and press Edit on the Answer tab. Once approval has progressed you cannot — ask an approver to send it back.

<!-- permissions:start -->
## Permissions required

This screen needs no special permission — being signed in is enough.

Permissions come through roles. If something is missing, ask an administrator.

For the whole picture see [Permissions and roles](../../../permissions).
<!-- permissions:end -->
