# Pennywise

Pennywise is a private, local-first personal finance tracker.

## Pages

- `index.html` - public landing page for GitHub Pages
- `app.html` - local finance dashboard

Financial data is stored in the browser's IndexedDB. Passwords are hashed locally with the Web Crypto API. The app does not connect to a bank or send financial data to a server.

Your data is stored only on this device. Use Export CSV/PDF to back it up.

## Publish with GitHub Pages

1. Create a new GitHub repository.
2. Upload all files in this folder to the repository.
3. In **Settings > Pages**, choose **Deploy from a branch**.
4. Select the `main` branch and the `/ (root)` folder.
5. Open the generated Pages URL. The landing page will be at the root, and the app will be available at `/app.html`.

When a custom domain is purchased, add it in **Settings > Pages > Custom domain** and follow GitHub's DNS instructions.
