# JIS University Brand & Asset Directory

This directory (`apps/web/public/assets/`) is your dedicated workspace to drop and manage all visual assets used throughout the **JIS University CampusConnect** application.

---

## 📁 Directory Structure

```text
apps/web/public/assets/
├── logos/          # Institution, portal, and department logos
│   ├── jis-university-logo.svg
│   └── campusconnect-logo.svg
│
├── icons/          # System navigation, actions, and portal icons
│   ├── home.svg
│   ├── tickets.svg
│   ├── scholarships.svg
│   ├── academics.svg
│   ├── settings.svg
│   └── notifications.svg
│
└── profiles/       # Persona avatars and student/faculty photos
    ├── default-avatar.svg
    ├── student-ananya.svg
    ├── staff-rahul.svg
    ├── admin-suresh.svg
    └── exec-meera.svg
```

---

## 🚀 How to Add Your Own Files

1. **Custom Institution Logo**:
   - Save your university logo as `/assets/logos/my-logo.svg` or `/assets/logos/my-logo.png`.
   - Open the app, click the logo edit trigger next to the brand lockup in the header (or go to Admin Config -> Institution Logo Section), and enter:
     `/assets/logos/my-logo.svg`
   - *Strict Rule*: Emojis are strictly prohibited as institutional logos.

2. **Custom Icons**:
   - Drop any custom SVG or PNG icons into `/assets/icons/`.
   - They can be referenced anywhere in code or settings via `/assets/icons/<filename>.svg`.

3. **Profile Pictures & Avatars**:
   - Drop real photos or custom avatars into `/assets/profiles/`.
   - Supported formats: `.svg`, `.png`, `.jpg`, `.webp`.
   - They can be referenced via `/assets/profiles/<filename>.jpg`.

---

*All files in this directory are statically served by Vite at the web root `/assets/...`.*

