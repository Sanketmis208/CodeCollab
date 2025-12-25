# 🚀 CodeCollab - Collaborative Code Editor

<div align="center">

![CodeCollab Banner](https://img.shields.io/badge/CodeCollab-Collaborative%20IDE-blue?style=for-the-badge)

**A real-time collaborative coding platform with integrated whiteboard, chat, and video calling**

[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-18+-61DAFB.svg?logo=react)](https://reactjs.org/)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-Real--time-black.svg?logo=socket.io)](https://socket.io/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

[Features](#-features) • [Installation](#%EF%B8%8F-installation) • [Usage](#-usage) • [Tech Stack](#%EF%B8%8F-tech-stack) • [Contributing](#-contributing)

</div>

---

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#-features)
- [Project Structure](#%EF%B8%8F-project-structure)
- [Prerequisites](#-prerequisites)
- [Installation](#%EF%B8%8F-installation)
- [Usage](#-usage)
- [Tech Stack](#%EF%B8%8F-tech-stack)
- [Notes & Limitations](#-notes--limitations)
- [Future Improvements](#-future-improvements)
- [Contributing](#-contributing)
- [License](#-license)

---

## Overview

**CodeCollab** is a collaborative coding platform built using Node.js, Express, Socket.IO, React, and Vite. It mirrors a modern collaborative IDE experience, enabling multiple users to code together in real-time with integrated communication tools.

Perfect for:
- 👨‍💻 Pair programming sessions
- 🎓 Educational coding workshops
- 🤝 Remote team collaboration
- 💡 Technical interviews

---

## ✨ Features

<table>
<tr>
<td>

### Core Features
- 📁 **File Explorer** - Create and manage folders & files
- 🧠 **Monaco Editor** - VS Code-like editing experience
- 🔄 **Real-time Sync** - Instant code synchronization
- 👥 **Live Presence** - See who's online in your room

</td>
<td>

### Collaboration Tools
- 🖊️ **Whiteboard** - Visual brainstorming canvas
- 💬 **Chat** - Text messaging within rooms
- 🎥 **Video Calls** - WebRTC-powered video conferencing
- ⚡ **Low Latency** - Socket.IO for instant updates

</td>
</tr>
</table>

---

## 🏗️ Project Structure

```
CodeCollab/
│
├── server/                 # Backend (Node.js + Express + Socket.IO)
│   ├── src/
│   │   ├── index.js       # Server entry point
│   │   ├── socket/        # Socket.IO event handlers
│   │   └── models/        # Data models (in-memory)
│   ├── package.json
│   └── .env.example
│
└── client/                 # Frontend (React + Vite)
    ├── src/
    │   ├── components/    # React components
    │   ├── pages/         # Page components
    │   ├── utils/         # Utility functions
    │   └── App.jsx        # Main App component
    ├── package.json
    └── vite.config.js
```

### Backend (`server/`)
- **Express server** for REST API endpoints
- **Socket.IO** for real-time bidirectional communication
- **MongoDB** for persistent data storage:
  - User accounts and authentication
  - Rooms and sessions
  - Files and folder structure
  - Chat message history
- **In-memory cache** for:
  - Active user presence
  - Real-time collaboration state

### Frontend (`client/`)
- **React + Vite** for fast development and optimized builds
- **Monaco Editor** integration for code editing
- **WebRTC** for peer-to-peer video calls
- **Tailwind-inspired** utility CSS classes

---

## 🧰 Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** v18 or higher ([Download](https://nodejs.org/))
- **npm** (comes with Node.js)
- **Git** ([Download](https://git-scm.com/))
- **MongoDB** ([Download](https://www.mongodb.com/try/download/community)) or use [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) (free cloud database)

---

## ⚙️ Installation

### 1. Clone the Repository

```bash
git clone https://github.com/Sanketmis208/CodeCollab.git
cd CodeCollab
```

### 2. Install Dependencies

You'll need to install dependencies for both server and client.

#### Backend Setup
```bash
cd server
npm install
```

#### Configure Environment Variables

Create a `.env` file in the `server` directory:

```bash
cp .env.example .env
```

Edit `.env` and add your configuration:

```env
PORT=4000
MONGODB_URI=mongodb://localhost:27017/codecollab
# OR use MongoDB Atlas:
# MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/codecollab

JWT_SECRET=your_jwt_secret_key_here
NODE_ENV=development
```

#### Frontend Setup
```bash
cd ../client
npm install
```

---

## 🚀 Usage

### Running in Development Mode

Open **two terminal windows** and run the following commands:

#### Step 1 - Start MongoDB (if running locally)

```bash
# On macOS (using Homebrew)
brew services start mongodb-community

# On Windows
net start MongoDB

# On Linux
sudo systemctl start mongod
```

> **Note:** Skip this step if you're using MongoDB Atlas (cloud database)

#### Step 2 - Start Backend Server

```bash
cd server
npm run dev
```

✅ Server will run at: **http://localhost:4000**

#### Step 3 - Start Frontend Client

```bash
cd client
npm run dev
```

✅ Client will run at: **http://localhost:5174**

### Configuration (Optional)

To configure the backend URL in the client:

```bash
cd client
echo "VITE_SERVER_URL=http://localhost:4000" > .env.local
```

### Access the Application

1. Open your browser and navigate to **http://localhost:5174**
2. Create or join a room
3. Start collaborating!

---

## 🛠️ Tech Stack

### Frontend
| Technology | Purpose |
|------------|---------|
| ![React](https://img.shields.io/badge/React-61DAFB?logo=react&logoColor=black) | UI Framework |
| ![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white) | Build Tool |
| ![Monaco](https://img.shields.io/badge/Monaco-Editor-0078D4) | Code Editor |
| ![WebRTC](https://img.shields.io/badge/WebRTC-333333?logo=webrtc) | Video Calling |

### Backend
| Technology | Purpose |
|------------|---------|
| ![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white) | Runtime Environment |
| ![Express](https://img.shields.io/badge/Express-000000?logo=express&logoColor=white) | Web Framework |
| ![Socket.IO](https://img.shields.io/badge/Socket.IO-010101?logo=socket.io) | Real-time Communication |
| ![MongoDB](https://img.shields.io/badge/MongoDB-47A248?logo=mongodb&logoColor=white) | Database |
| ![Mongoose](https://img.shields.io/badge/Mongoose-880000?logo=mongoose&logoColor=white) | ODM |

### Development Tools
- Git & GitHub
- npm
- ESLint
- Prettier

---

## 📝 Notes & Limitations

| ⚠️ Issue | Description | Solution |
|---------|-------------|----------|
| **WebRTC STUN Only** | Video calls may fail on restricted networks | Add TURN server for production use |
| **Basic Authentication** | Simple JWT implementation without advanced security | Add OAuth, 2FA, and refresh tokens |
| **Single Server** | No horizontal scaling support | Implement Redis adapter for Socket.IO |
| **File Size Limits** | Large files may cause performance issues | Implement file size restrictions and chunking |

### Known Features
- ✅ **MongoDB Integration** - Persistent storage for users, rooms, and files
- ✅ **Auto-save enabled** - Editor changes are debounced and broadcast
- ✅ **Whiteboard sync** - Drawing strokes synced via Socket.IO
- ✅ **Room-based isolation** - Each room has separate file system
- ✅ **User Authentication** - JWT-based authentication system

---

## 🚧 Future Improvements

### Planned Features
- [ ] **Enhanced Authentication** - OAuth integration (Google, GitHub)
- [ ] **Role-based Access Control** - Admin, Editor, Viewer permissions
- [ ] **Code Execution** - Run code directly in browser
- [ ] **TURN Server** - Reliable video calls in all networks
- [ ] **File Upload/Download** - Import/export projects
- [ ] **Syntax Highlighting** - Support for 50+ languages
- [ ] **Git Integration** - Version control within the editor
- [ ] **Themes** - Dark/Light mode customization
- [ ] **Mobile Responsive** - Better mobile experience
- [ ] **Search & Replace** - Advanced code search functionality

### Performance Enhancements
- [ ] Redis for Socket.IO scaling
- [ ] WebSocket compression
- [ ] Code splitting and lazy loading
- [ ] Service worker for offline support
- [ ] Database indexing optimization
- [ ] CDN integration for static assets

---

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. **Fork the repository**
2. **Create a feature branch**
   ```bash
   git checkout -b feature/AmazingFeature
   ```
3. **Commit your changes**
   ```bash
   git commit -m 'Add some AmazingFeature'
   ```
4. **Push to the branch**
   ```bash
   git push origin feature/AmazingFeature
   ```
5. **Open a Pull Request**

### Development Guidelines
- Follow existing code style
- Write meaningful commit messages
- Add comments for complex logic
- Test your changes thoroughly

---

---

## 👤 Author

**Sanket Mistry**

- GitHub: [@Sanketmis208](https://github.com/Sanketmis208)

---

## 🙏 Acknowledgments

- [Monaco Editor](https://microsoft.github.io/monaco-editor/) for the code editor
- [Socket.IO](https://socket.io/) for real-time communication
- [React](https://reactjs.org/) and [Vite](https://vitejs.dev/) communities

---

<div align="center">

### ⭐ Star this repository if you found it helpful!

**Made with ❤️ for collaborative coding**

</div>
