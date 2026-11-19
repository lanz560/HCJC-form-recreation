Recreates the public Complaint form linked from the Commission on Judicial Conduct portal. No dependencies or build step.

Preview: `python3 -m http.server 8080 --directory dist`

Checks: `node check.mjs`

The form validates locally and does not send or store entries. The original CAPTCHA and Jira submission service are not connected. Some dropdown choices were not exposed in the reference page data; the role choices need verification before production use.
