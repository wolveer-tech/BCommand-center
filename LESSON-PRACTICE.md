# Practise from a video lesson

Open **Schoolbooks → Practise from a book or lesson**. Under **Study material**,
choose **Lesson transcript & pictures**. No schoolbook needs to be created first.

Paste the transcript (timestamps are fine), optionally give it a title, and add
selected lesson slides or screenshots. Click the picture paste area and use
Ctrl+V / ⌘V, paste a picture while editing the transcript, choose **Add pictures**,
or drop image files into the lesson editor. On a phone, Add pictures opens the
normal photo/file picker. Each picture has an Include checkbox, an optional
caption/timestamp and a Remove button.

You can use transcript text alone, pictures alone, or both. Only included pictures
and the pasted transcript enter the AI request when Generate is pressed. The
Include photos switch excludes all pictures and their captions. The app does not
fetch a video, extract a transcript from a URL, or upload the original video.

Choose the study level, subject/course, format and provider, then generate the
questions. Existing mixed tests, multiple choice, paragraphs, calculations,
T-accounts and journal entries work with lesson sources too, where supported by
the material. Picture questions require a provider/model that supports images;
DeepSeek Flash supports them and manual Pro requires photos off. Automatic keeps
the same image-aware routing rules as schoolbook practice.

Feedback includes **Source evidence → View lesson source** to view the original
transcript section or selected picture. Saved sessions retain their own source
material even after the draft is edited. Transcript quotations are checked against
the selected text; photo evidence remains linked to the original for inspection.
Transcripts, image text and captions are study data, never operational instructions.

Limits are 48,000 transcript characters, 12 pictures and 12 MB of prepared image
data per set. Oversized transcripts are rejected explicitly without cutting the
draft; use a shorter lesson section. PNG, JPEG, WebP and GIF files up to 20 MB each
are accepted, resized to at most 2,400 pixels on the longest side and rasterised
locally. SVG and remote image URLs are not accepted as lesson picture uploads.

Drafts, pictures and practice answers stay on this device, separately for each
note-account owner. They are not book/account sync data or portable exports. An
IndexedDB image store keeps picture bytes once while answer autosaves contain
references; unused images are pruned only after the referring session/draft save
commits. A small tab-local draft checkpoint protects quick text/selection edits
across reloads once pictures have been stored. Wait for the saved notice before
closing a tab after adding new pictures. Storage/import errors keep the existing
material and explain the problem. No API keys are added to lesson records.
