# wasmcode

A browser-based, sandboxed execution environment for native C/C++ applications, compiled to WebAssembly via Emscripten, with support for real-time graphical and console output.

## Getting Started

### Frontend
```bash
cd frontend
docker-compose up
```

### Backend
```bash
cd backend
docker-compose up
```

## Features

- In-browser execution of C/C++ programs compiled to WebAssembly
- Real-time console output and graphical preview
- File-based project structure (multiple source files and assets)
- Live code editing and execution
- Sandboxed runtime environment

## Tech Stack

- **Frontend**: React, TypeScript, Vite, Monaco Editor, FlexLayout
- **Backend**: Node.js, Express, Emscripten, WebSocket
