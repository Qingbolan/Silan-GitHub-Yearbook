# Silan GitHub Yearbook

A self-hosted tool to generate beautiful, shareable yearbooks of your GitHub activity. It provides interactive web summaries, responsive screenshots for your profile, and embeddable widgets for your website.

[![Example Yearbook](http://yearbook.silan.tech/api/screenshot/Qingbolan/pastyear?width=1280)](http://yearbook.silan.tech/api/embed/Qingbolan/pastyear)

## Features

- **Interactive Yearbook**: A React-based web view with detailed stats, charts, and a "Spotify Wrapped" style summary.
- **Responsive Screenshots**: Generate PNG images of your stats optimized for Mobile or Desktop.
- **Flexible Time Periods**: Support for specific years (`2024`), or rolling windows like `pastyear` (last 365 days) and `pastmonth` (last 30 days).
- **Embeddable**: Easy-to-use endpoints for embedding in GitHub profiles (as images) or personal websites (as iframes).
- **Markdown Support**: Render your bio with GitHub Flavored Markdown.

---

- **Markdown Support**: Render your bio with GitHub Flavored Markdown.

## 📸 Examples Gallery

Here are all the ways you can display your yearbook.

### 1. Viewport Variants (Responsive)

**Desktop Layout (Default)**
[![My Stats (Desktop)](http://yearbook.silan.tech/api/screenshot/Qingbolan/2024?width=1280)](http://yearbook.silan.tech/api/embed/Qingbolan/2024)

**Mobile Layout (Narrow)**
[![My Stats (Mobile)](http://yearbook.silan.tech/api/screenshot/Qingbolan/2024?width=400)](http://yearbook.silan.tech/api/embed/Qingbolan/2024)

### 2. Time Periods (Flexible)

**Specific Year**
[![2024 Stats](http://yearbook.silan.tech/api/screenshot/Qingbolan/2024)](http://yearbook.silan.tech/api/embed/Qingbolan/2024)

**Rolling Past Year (Last 365 Days)**
[![Past Year Stats](http://yearbook.silan.tech/api/screenshot/Qingbolan/pastyear)](http://yearbook.silan.tech/api/embed/Qingbolan/pastyear)

**Rolling Past Month (Last 30 Days)**
[![Past Month Stats](http://yearbook.silan.tech/api/screenshot/Qingbolan/pastmonth)](http://yearbook.silan.tech/api/embed/Qingbolan/pastmonth)

### 3. Embed Modules (Sectional)

These are best used as **Iframes** so you can see the specific section live.

**Full Dashboard**

<iframe src="http://yearbook.silan.tech/api/embed/Qingbolan/pastyear" width="100%" height="800" frameborder="0"></iframe>

**Overview Only (`#overview`)**

<iframe src="http://yearbook.silan.tech/api/embed/Qingbolan/pastyear#overview" width="100%" height="400" frameborder="0"></iframe>

**Map Only (`#viewmapi`)**

<iframe src="http://yearbook.silan.tech/api/embed/Qingbolan/pastyear#viewmapi" width="100%" height="400" frameborder="0"></iframe>

---

## 🚀 Usage Guide

### 1. GitHub Profile (Image + Link)

To add your yearbook to your GitHub profile `README.md`, usage a standard Markdown image link.

**Pattern:** `[![Alt Text](Image_URL)](Link_URL)`

```markdown
<!-- Display specific year -->
[![Silan 2024 Stats](http://your-domain/api/screenshot/{username}/2024)](http://your-domain/api/embed/{username}/2024)

<!-- Display last 365 days (Auto-updating) -->
[![Silan Recent Stats](http://your-domain/api/screenshot/{username}/pastyear)](http://your-domain/api/embed/{username}/pastyear)
```

### 2. Personal Website (Iframe)

You can embed the full interactive experience directly into your website.

```html
<iframe 
  src="http://your-domain/api/embed/{username}/pastyear" 
  width="100%" 
  height="800px" 
  frameborder="0"
></iframe>
></iframe>
```

### 3. Sectional Views (Modules)

You can display specific sections of the yearbook using URL text fragments (hashes). This is perfect for building custom dashboards where you only want to show the map or the summary card.

- **Full View (Default)**: `.../api/embed/{username}/pastyear`
- **Overview Only** (`#overview`): Shows only the stats card.
  - `.../api/embed/{username}/pastyear#overview`
- **Map Only** (`#viewmapi`): Shows only the visitor map.
  - `.../api/embed/{username}/pastyear#viewmapi`

Example of embedding just the map:

```html
<iframe src="http://your-domain/api/embed/{username}/pastyear#viewmapi" ...></iframe>
```

---

## ⚙️ API Reference

### 1. Screenshot Generation

Generates a static PNG image of the yearbook.

**Endpoint:** `GET /api/screenshot/{username}/{period}`

| Parameter  | Type     | Default      | Description                                                      |
| :--------- | :------- | :----------- | :--------------------------------------------------------------- |
| `username` | `string` | **Required** | Your GitHub username                                             |
| `period`   | `string` | **Required** | `YYYY` (e.g. `2024`), `pastyear`, or `pastmonth`                 |
| `width`    | `int`    | `1280`       | Viewport width. Use `400` for mobile layout, `1280` for desktop. |

**Examples:**

- `.../api/screenshot/benz/2024?width=1280` (Desktop view)
- `.../api/screenshot/benz/pastyear?width=400` (Mobile view)

### 2. Embed Redirect

Returns a redirect to the interactive frontend. Useful for permanent links.

**Endpoint:** `GET /api/embed/{username}/{period}`

| Parameter  | Type     | Default      | Description                                     |
| :--------- | :------- | :----------- | :---------------------------------------------- |
| `username` | `string` | **Required** | Your GitHub username                            |
| `period`   | `string` | **Required** | `YYYY`, `pastyear`, or `pastmonth`              |
| `hash`     | `string` | Optional     | `#overview` (Card only), `#viewmapi` (Map only) |

### 3. Raw Card (Legacy)

Low-level access to the card generator with custom date ranges.

**Endpoint:** `GET /api/card/{username}/{start}/{end}`

- `start` / `end`: Dates in `YYYY-MM-DD` format.

---

## 🛠️ Setup & Development

### Backend (Python/FastAPI)

```bash
cd backend
pip install -r requirements.txt
playwright install chromium
uvicorn app.main:app --reload
```

### Frontend (React/Vite)

```bash
cd web
npm install
npm run dev
```

### Running Together

The backend is configured to serve the frontend static files.

1. Build frontend: `cd web && npm run build`
2. Run backend: `cd backend && uvicorn app.main:app`
3. Access at `http://yearbook.silan.tech`

---

## 📝 Markdown Support

- **Web Version**: Supports **GitHub Flavored Markdown** (Tables, Task lists, Strikethrough, etc.) via `react-markdown`.
- **Screenshot/Image**: Renders Markdown using the backend's Python renderer. Basic formatting (Bold, Italic, Lists) is supported.
