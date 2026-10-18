# Command Centre v10.32.1

Schoolbook text now follows the printed lines and grid rows, including wrapping and formatted text. Phone and desktop layouts share the same paper spacing. Photos occupy complete rows so the writing below them stays aligned.

Both notes and schoolbooks support Tab to insert indentation and Shift+Tab to remove a leading tab or up to four spaces. Selecting several lines indents or outdents the selected lines while retaining formatting. Tabs and repeated spaces survive saving. Escape leaves the editor so normal keyboard navigation can resume.

Provider 2 now accepts HTTPS players from ehgembxe.cfd alongside epiembeds.online. Its other host and HTTPS checks remain active. Actual availability and playback still depend on the provider.

No storage keys, note identities, account records or database schemas change in this update. Existing local recovery snapshots and account sync remain in place. No database migration or new secret is required.

Deploy from this project folder with `npm run deploy`, then refresh/reopen the app. The service-worker cache and updated editor asset URLs are versioned for this release. Native iOS version remains 1.14.0 build 22.

Validation: project syntax/dependency bundle check; Provider 2 host regression tests; 10 browser keyboard regression checks; manual desktop and 390px phone layout checks for lined/grid writing, wrapping, font sizes, photos, indentation and save/reopen.
