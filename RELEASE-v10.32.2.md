# Command Centre v10.32.2

Schoolbooks now scroll as a complete page. The writing sheet has a minimum height of 600px on laptops and 480px on phones, and grows with longer notes instead of shrinking below the controls. The background page is locked while the book is open so only the book scrolls. Save and Done remain available at the bottom.

Typing scrolls the book to keep the current line visible. Phone writing mode retains the existing full-viewport editor and keyboard formatting dock. Lined/grid paper, indentation, photos and autosave are retained.

No note storage keys, account records or schemas change. Existing notes and recovery snapshots are retained. No database migration, new secret or native rebuild is required for this web layout update.

Deploy with `npm run deploy` from the project folder, then refresh/reopen the app.

Validation: 14 Node tests passed, including page/editor caret scrolling above save controls and phone keyboard mode. `npm run check` passed. Browser checks covered a short 640x600 laptop window, a 45-line note growing to 1465px with its last line visible above the controls, save/reopen, and a 390x844 phone with and without writing focus. No horizontal overflow occurred. Browser QA used disposable localhost data; the preview server was stopped.
