# Game Code Execution Engine

A comprehensive game development platform featuring a web-based code editor and execution engine powered by WebAssembly.

## Project Structure

- **frontend/** - React-based web application with Monaco Editor integration
  - Interactive code playground
  - Real-time preview
  - Template system for quick project setup
  
- **backend/** - Node.js backend with WebAssembly compilation
  - Code execution engine using Emscripten
  - WebSocket support for hot-reload
  - Multi-game support with room-based architecture

## Getting Started

### Frontend
```bash
cd frontend
docker-compose up
```

### Backend
```bash
cd backend
docker-compose up --build
```

## Features

- Real-time game preview
- Monaco Editor with syntax highlighting
- Hot-reload support via WebSocket
- Dockerized frontend and backend
- Multiple color themes (Ayu Dark)
- Mobile-responsive interface

## Tech Stack

- **Frontend**: React, TypeScript, Vite, Monaco Editor, FlexLayout
- **Backend**: Node.js, Express, Emscripten, WebSocket, Docker
- **Build System**: Configurable build profiles with custom emcc flags

## License

MIT
