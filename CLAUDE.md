# Project rules

- Never reference Elon Musk, Tesla, SpaceX, or any related brand/name/entity
  anywhere in this project — code, comments, commit messages, branch names,
  content, or file names. This is a permanent rule for this repository.

- Always deploy after pushing changes — trigger the FTP deploy workflow
  (ftp-deploy.yml) against the current branch without asking for
  confirmation first. Bob tests in the live environment, not staging.

- The navigation and framework font for the site is Century Gothic Pro —
  this is Bob's brand font, also used for the "bobcooley" wordmark.

- Keep `main` in sync with what is live. Before deploying a branch, merge the
  latest `origin/main` into it (a stale branch deploy overwrites newer live
  files). After a branch deploy, open a pull request to `main` and merge it
  without asking, because any push to `main` auto-deploys and will delete or
  revert live files that only exist on the branch. Hold the merge and tell Bob
  only when: a review finding is unresolved, the branch deploy failed or broke
  something live, merging `main` needs a judgment call, Bob said the work is
  experimental or in progress, or the change deletes data or touches
  credentials.

- Never alter Bob's logos in any way: no opacity, filters, blend modes,
  recoloring, tinting or tonal adjustment to fit a page palette. Use the
  logo file as-is. The current site logo is `art/2026-logo_longw-tag.png`
  (the homepage logo); use it unless Bob specifies another.
