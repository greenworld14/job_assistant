# Job Apply Assistant (Chrome extension, Manifest V3)

Autofill job applications from your resume, review everything before you submit, and keep an accurate count of the jobs you've applied to.

Everything stays in `chrome.storage.local` in your browser. The extension never sends your resume or personal data anywhere and never touches CAPTCHAs. It clicks Submit only when you use **🚀 Auto apply**.

## Install (load unpacked)

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select this folder (the one containing `manifest.json`).
4. Pin the extension: click the puzzle icon in the toolbar and pin **Job Apply Assistant**.
5. The options page opens on first install. Upload your resume (PDF or DOCX), review the extracted fields, then click **Save profile**.

After you edit the code, click the reload icon on the extension's card in `chrome://extensions`. Reload any open job tabs too.

## Using it

**Auto apply (one click)**
- Click **🚀 Auto apply** on the floating button or in the panel. It opens the site's Apply / 1-Click Apply button if no form is open yet, fills the form, answers the screening questions (saved answers first, then AI), and clicks **Next** / **Continue** on every step.
- It answers every company question it can by itself: saved answers first, then the AI in "auto mode", which accepts low-confidence answers. The AI answers questions like "Have you worked at {company}?", "Are you over 18?", location and experience from your profile.
- Voluntary questions (gender, race, veteran, disability) are set to "Decline / prefer not to say" when that option exists.
- Questions it can't answer are **skipped**, and it continues to the next step and submits. It never guesses work authorization, sponsorship, citizenship, clearance or licenses, and it skips salary unless you have a saved answer.
- If the site refuses to continue because of a skipped required question, Auto apply stops and opens the review screen. Answer the question, then click **Auto apply** again.

**Autofill**
- Dropdown choices (including custom dropdowns such as ZipRecruiter's) are read automatically, so the review screen shows a real dropdown for each question. If one still shows **Load choices**, click it to try again.
- On a supported job page, click the floating **⚡ Fill application** button (bottom-right), or open the toolbar popup and click **Fill application**.
- Filled fields get a green outline. Fields that need your attention get a dashed amber outline and appear in the review list: cover letter, salary, work authorization/sponsorship, voluntary disclosures, "how did you hear", custom questions, dropdowns with no matching option, and fields your profile has no data for. Click an item to scroll to that field.
- Your stored resume file is attached to resume/CV upload fields.
- Multi-step forms (Workday, LinkedIn Easy Apply, Indeed) need **Fill** clicked again on each step.
- On LinkedIn, open the **Easy Apply** dialog first.
- On Dice, click **Easy apply** first, then **Fill** on each wizard step. When a Dice or ZipRecruiter job sends you to the company's own site (Greenhouse, Lever, Workday…), the extension works there as usual.
- On ZipRecruiter, **1-Click Apply** has no form. The job is counted when the button changes to "Applied". For quick-apply forms, click **Apply**, then **Fill**.
- On an unsupported site, the popup says so and offers **Try generic fill on this page**.

**Screening questions**
- After **Fill**, the **Review your answers** screen opens. It lists every screening question on the current step, each with an input that matches its type:

  | Question type | Detected from | Input in the review screen |
  | --- | --- | --- |
  | Yes / No | 2-option radio groups, 2-option dropdowns (Yes/No), single checkboxes, ARIA radio groups | Yes / No toggle |
  | Single choice | radio groups, dropdowns, custom dropdowns (React-Select style, Workday "Select One") | dropdown |
  | Multiple choice | checkbox groups, multi-select lists | checkbox list |
  | Free text | text inputs, text areas | text box with a live character counter; the limit comes from `maxlength` or from "max N characters" in the question |
  | Unsupported | controls the extension can't operate | message plus **Show on page** |

- **Saved answers:** tick **Save as default answer** on a question, or add answers under **Profile → Saved answers**. You can edit, delete (with Undo), search, and add a starter set with **+ Common questions**. In text answers, `{company}` and `{title}` are replaced with the job's company and title.
- **Matching:** a saved answer is filled in only when the new question clearly matches it: at least 80% similar by default (adjustable in Settings), with the same topic (work authorization, sponsorship, salary, relocation, …), the same country, and the same numbers. Anything uncertain is left empty and shows the closest saved question with its match percentage. A saved answer that doesn't fit the field (not one of the options, or over the character limit) is not filled either, and the reason is shown.
- **Required questions** (marked with `*`, `required` or `aria-required`) get a **Required** badge. When you click the site's **Submit**, the extension stops that click and shows the review screen. **Looks good — I'll submit** stays disabled while any required question is unanswered or any answer is over its limit. Once you confirm, click **Submit** again yourself. **Submit anyway** lets you override if a question was detected wrongly.
- All three behaviors can be turned off in **Settings**: automatic filling of saved answers, the review screen on Submit, and blocking Submit.

**AI assistant (DeepSeek, optional)**
- **Set up:** in **Profile → ✨ AI assistant**, paste your DeepSeek API key, click **Save key**, then **Test connection**, and tick **Turn on the AI assistant**. The key is stored only in this browser (`chrome.storage.local`, key `aiKey`), never in the code.
- **Answering:** after **Fill**, any question without a confident saved answer is sent to DeepSeek in a single request. You can also click **✨ Answer with AI** at the top of the review screen, or **✨ Ask AI** on a single question. Untick "Answer automatically" to make it on-demand only.
  - For dropdowns (including custom ones like ZipRecruiter's), radio buttons and checkboxes, the AI must pick one of the listed options. For text boxes, the answer is kept within the character limit.
- **Checking:** AI answers get a purple outline and the note "Answered by AI (N% confident) — please verify". Answers below 50% confidence are shown as a suggestion but not filled. When the AI can't tell from your profile, for example sponsorship, the question is left for you.
- **Never sent to AI:** salary, consent (including "okay to text me"), criminal-history and voluntary-disclosure questions, plus your email, phone, street address and resume file.
- **What is sent:** the question text and options, the job title and company, your work history, skills, education, location, links and saved answers. They go to `api.deepseek.com` only.
- **Errors** (bad key, no balance, rate limit, timeout) appear as a red banner in the review screen, and the form stays as it was.

**Counting applications**
- A job counts only when you actually submit. The extension watches for your click on the site's Submit button, then counts the job when the confirmation appears ("Application submitted", "Thanks for applying", …).
- In **Settings** you can switch to counting on the Submit click itself.
- If the confirmation isn't detected, use **Mark as applied** (floating panel or popup) or **Count now** in the notification.
- Duplicates are ignored. Jobs are matched by site plus job ID (or normalized URL) plus company, so refreshing, revisiting or resubmitting the same posting doesn't add to the count.
- Every count shows a notification with **Undo**. The popup and the tracker also have **Undo last count**.
- The badge shows the total (or today's count, set in Settings) and turns green when you reach your daily goal.

**Tracker** (popup → 📋 Tracker)
- Shows totals for all time, today, this week (weeks start Monday), this month, and saved jobs, plus a daily-goal progress bar.
- Search, filter by status, date range or site, and sort by any column.
- Edit the date, company, title, status (Applied / Saved / Interview / Rejected / Offer) and notes inline.
- Delete entries (with Undo), or add entries manually.
- **Export CSV** exports the currently filtered rows.
- **Reset counter** deletes all entries after two confirmations.

## Supported sites

| Site | Hosts |
| --- | --- |
| Greenhouse (including forms embedded on company career pages) | `*.greenhouse.io` |
| Lever | `*.lever.co` |
| Ashby | `*.ashbyhq.com` |
| Workday | `*.myworkdayjobs.com`, `*.myworkdaysite.com` |
| LinkedIn Easy Apply | `*.linkedin.com` |
| Indeed (incl. Indeed Apply) | `*.indeed.com` |
| Dice (Easy apply wizard) | `*.dice.com` |
| ZipRecruiter (1-Click Apply and quick-apply forms) | `*.ziprecruiter.com`, `*.ziprecruiter.co.uk`, `*.ziprecruiter.ca` |

Permissions are limited to `storage`, `activeTab` and `scripting`, plus host access to the sites above and to `api.deepseek.com`. DeepSeek is contacted only when the AI assistant is turned on. `activeTab` is only used when you click **Try generic fill** on some other site.

## Files

```
manifest.json         MV3 manifest
background.js         service worker: application log, dedupe, badge, per-tab job context, saved answers, migrations
shared.js             helpers shared by all contexts (site detection, job IDs, stats, CSV, question similarity)
questions.js          screening questions: type detection, answer matching/filling, review screen
content.js            field detection/autofill, review panel, submit interception & confirmation detection
popup.html / .js      toolbar popup: counts, goal, fill / mark / save
options.html / .js    resume upload, editable profile, saved answers, settings
tracker.html / .js    application log with search, filters, editing, CSV export, reset
ui.css                shared styles for the extension pages (light/dark)
lib/resume-parser.js  local resume parsing (PDF via pdf.js, DOCX via built-in unzip)
lib/zip.js            minimal ZIP reader for DOCX
lib/pdf.min.js, lib/pdf.worker.min.js   Mozilla pdf.js 3.11.174 (bundled, Apache-2.0)
icons/                toolbar icons
```

## Stored data

Everything is kept in `chrome.storage.local`:

| Key | Contents |
| --- | --- |
| `profile` | Your details from the resume and profile form |
| `resumeFile` | The original resume file (base64) |
| `applications` | Tracker entries |
| `lastAction` | The last count, so it can be undone |
| `settings` | Your settings |
| `answers` *(new in v1.2)* | Saved answers: `{ id, question, type: "yesno" \| "select" \| "multi" \| "text", value, options[], uses, lastUsedAt, createdAt, updatedAt }` |
| `schemaVersion` *(new in v1.2)* | `2` |
| `aiKey` *(new in v1.3)* | Your DeepSeek API key. It is only read by the background service worker, never by web pages. |

**Migration (schema 1 → 2)** runs automatically on install, update and browser start. It creates an empty `answers` list and adds the new settings with their defaults: `autoFillSavedAnswers: true`, `reviewBeforeSubmit: true`, `blockUnansweredRequired: true`, `matchThreshold: 0.8`. Existing data is left unchanged.

## Testing screening questions

Test on the application form of any supported site (for example a Greenhouse job). Before you start, add a few saved answers under **Profile → Saved answers**, or use **+ Common questions** and fill them in.

1. **Yes / No:** save "Are you authorized to work in the US?" = Yes. On a form asking "Are you legally authorized to work in the United States?" (radio buttons or a Yes/No dropdown), click **Fill**. It's filled with Yes and the card reads "Filled from saved answer (90% match)". A question about *Canada* is not filled.
2. **Single choice:** save "How did you hear about us?" = LinkedIn. Click **Fill**. The dropdown, including custom React-Select-style dropdowns, is set to LinkedIn. Save an answer that isn't one of the options and the card explains that it isn't one of the options, leaving the field empty.
3. **Multiple choice:** on a checkbox-group question, tick options in the review screen. The page checkboxes follow. Tick **Save as default answer**, reload, click **Fill** again, and the same choices are restored.
4. **Free text:** type into a text question in the review screen. The page field updates and the counter shows `n / limit`; you can't type past a `maxlength`. Save a default longer than a question's limit. On that question it isn't filled, and the card shows "Answer is N characters; the limit here is M".
5. **No confident match:** save "Which programming languages do you use?" and open a form asking "Which of these languages do you use professionally?". It stays empty and the card shows the closest saved question with its match percentage.
6. **Required and blocking:** leave a required question empty and click the site's **Submit**. The review screen opens instead, the page doesn't submit, and **Looks good — I'll submit** is disabled with "N required questions unanswered". Answer the question, click **Looks good — I'll submit**, then click **Submit** on the page again.
7. **Unsupported control:** a custom dropdown whose choices can't be read shows **Load choices**. Clicking it changes the card to "Unsupported" with **Show on page**, and nothing breaks.
8. **Edit and delete:** under **Profile → Saved answers**, change an answer and click **Save**. Delete one, then click **Undo** in the notification.

## Limitations

- Resume parsing is heuristic. Always review the profile form after uploading. Scanned (image-only) PDFs and old `.doc` files can't be read.
- Job sites change their markup often. If a field isn't detected, it's flagged for review rather than guessed.
- Custom dropdown widgets (Workday "Select One", react-select location pickers) aren't auto-selected. The text is typed where possible and the field is flagged so you can pick the right option.
- Radio buttons, checkboxes and sensitive questions are always left for you to answer.
