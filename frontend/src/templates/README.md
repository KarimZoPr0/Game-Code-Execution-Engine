# Template System

This project uses Vite's `import.meta.glob` to automatically load project templates from the `src/templates/` directory.

## How It Works

1. **Template Location**: All templates are in `src/templates/`
2. **Auto-Discovery**: Templates are automatically discovered at build time
3. **No Manifests**: No manifest files needed - just create folders and files
4. **Template Metadata**: Each template should have a `template.json` with name and description

## Template Structure

```
src/templates/
├── simple-sdl-demo/
│   ├── template.json          # Name and description
│   ├── main.c                 # Source files
│   └── build_config.json      # Build configuration
├── live-coding-demo/
│   ├── template.json
│   ├── sdl_app.c
│   ├── build_config.json
│   └── game/                  # Nested folders work too!
│       ├── game.h
│       └── game.c
└── multiplayer-pong/
    ├── template.json
    ├── sdl_app.c
    ├── build_config.json
    └── game/
        ├── game.h
        └── game.c
```

## Adding a New Template

1. Create a new folder in `src/templates/`
2. Add a `template.json` file:
   ```json
   {
     "name": "My Template Name",
     "description": "Template description"
   }
   ```
3. Add your source files (`.c`, `.h`, etc.)
4. Add a `build_config.json` if needed
5. Rebuild the app - your template will appear automatically!

## Important Notes

- Templates are **NOT** saved to IndexedDB
- They always load fresh from `src/templates/`
- User-created projects ARE saved to IndexedDB
- Templates have fixed IDs matching their folder names
- Clearing site data will remove user projects but templates will reload
