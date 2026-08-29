# The Menagerie

A compact, folder-backed catalog for animated ChatGPT pets. The public gallery
loads pets from the bundled catalog and the server-maintained upload catalog.
Each pet profile renders the official v2 animation states at the native
192 × 208 frame size.

Uploaded assets and metadata are stored in the deployment-preserved sibling
folder `menagerie-data/`, which is intentionally excluded from FTP cleanup.

Profile pages link to `download.php?pet=<slug>`. The endpoint resolves a known
catalog entry and only streams image files located inside the application or
the preserved Menagerie data folder.

Authenticated owners can edit a Pet's name and profile slug. Slug aliases are
stored in the preserved data folder so prior profile and download links redirect
to the current Pet without moving the stored sprite sheet.
