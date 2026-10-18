# ESD — Escape Room Designer

ESD is a browser based escape room layout editor. It has a top down Build mode for laying out rooms and furniture, and a first person Explore mode for walking through the design.

## Current scope

### Build mode

- Place fixed size, **5 × 5 m square rooms**. Each new room must touch an existing room along an edge; rooms cannot overlap.
- Add or remove doors by clicking wall segments. Each door occupies one 1 m wall segment.
- Set the player start marker inside a room.
- Place, inspect, and remove furniture:
  - **1 × 1 m table**
  - **2 × 1 m table**, rotatable between horizontal and vertical orientations
  - **Poster**, attached to a 1 m wall segment. A poster can be placed on either side of a shared wall, with one on each side. A poster cannot share a segment with a door.
- Tables snap to the floor grid and can be placed in wall-adjacent cells. Their visible tops are inset slightly from the cell edges.
- Zoom with the zoom controls or scroll wheel. Pan by holding Space and dragging, or by middle-dragging.

### Explore mode

- Walk through rooms in first person with WASD and look around with the mouse.
- Movement is constrained to the room layout, blocked by walls and tables, and can pass between rooms through doors.
- Scroll to select a table, poster, or **Remove furniture**. Aim at a valid surface to see a wireframe preview; placement previews are green when valid and red when blocked. Selecting removal highlights targeted furniture with a red wireframe.
- Click to place selected furniture or remove the targeted item. The first click enters pointer lock; click again to act. Press Escape to release the mouse.
- Use the Build control or **B** to return to Build mode.

### Saving

The plan is saved in this browser's `localStorage`. Changes are auto-saved after a short delay. **Save plan** saves immediately, and **Load** restores the saved plan in the current browser. The plan contains rooms, doors, the start marker, furniture, and the selected room. It is not currently exported to a file or synchronized between browsers.

## Not implemented yet

- Puzzle placement or puzzle slots
- Furniture beyond tables and posters
- File export/import or cloud storage
- GitHub Pages deployment configuration

## Run locally

Requirements: Node.js and npm.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite in your browser.

Create a production build with:

```sh
npm run build
```

The generated static site is written to `dist/`. Preview that build locally with `npm run preview`.

## Implementation

- TypeScript
- Three.js for the 2D layout view and 3D Explore view
- Vite for development and static production builds

The app is client-only and does not require a backend. GitHub Pages support is configured for the project URL path `/EscapeRoomDesigner/`:

- `vite.config.ts` uses that base only in the `github-pages` build mode, so local development keeps the normal `/` path.
- `.github/workflows/deploy.yml` builds and deploys `dist/` on pushes to `main`, or when manually run from the Actions tab.

To publish, push this branch to the GitHub repository named `EscapeRoomDesigner`, then open **Settings → Pages** and set **Build and deployment → Source** to **GitHub Actions**. GitHub Actions will provide the published URL after the first successful deployment. If the repository has a different name or is published as a user site/custom domain, update the Vite `base` in `vite.config.ts` to match its URL path.
