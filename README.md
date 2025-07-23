# The Arena Engine Server

A real-time multiplayer turn-based combat game server featuring advanced matchmaking, team composition mechanics, and progression systems.

## 🎮 Overview

The Arena Engine is a Node.js-based game server that powers a tactical combat game where players assemble teams of characters and battle against each other in real-time matches. The server features sophisticated matchmaking algorithms, character progression systems, and comprehensive player analytics.

## ✨ Features

### Core Game Mechanics
- **Turn-based Combat System**: Strategic gameplay with chakra-based skill system
- **Team Composition**: Players can create teams of 3 characters from a diverse roster
- **Character Progression**: Unlock and upgrade characters through gameplay
- **Real-time Multiplayer**: WebSocket-based real-time game sessions

### Matchmaking System
- **Dual-Queue System**: Separate queues for new and veteran players
- **Glicko-2 Rating System**: Advanced player skill rating with uncertainty tracking
- **Dynamic Tick Rates**: Adaptive matchmaking frequency based on player population
- **Cross-Queue Matching**: Allows experienced new players to match with low-rated veterans
- **Wait Time Priority**: Prioritizes players who have been waiting longer

### Player Progression
- **Mission System**: Achievement-based progression with rewards
- **Rating System**: Competitive ranking with seasonal adjustments
- **Character Unlocks**: Earn new characters through gameplay milestones
- **Statistics Tracking**: Comprehensive player performance analytics

### Admin Features
- **User Management**: Admin controls for player accounts
- **Game Analytics**: Detailed matchmaking and game performance metrics
- **Database Seeding**: Tools for populating initial game data

## 🛠 Tech Stack

- **Backend**: Node.js with Express.js
- **Database**: PostgreSQL with connection pooling
- **Real-time Communication**: WebSockets (ws library)
- **Authentication**: JWT-based authentication with bcrypt
- **Rating System**: Glicko-2 algorithm implementation
- **Development**: Nodemon for hot reloading

## 📦 Dependencies

```json
{
  "bcryptjs": "^3.0.2",
  "cors": "^2.8.5", 
  "dotenv": "^16.5.0",
  "express": "^5.1.0",
  "glicko2": "^1.2.1",
  "jsonwebtoken": "^9.0.2",
  "pg": "^8.16.2",
  "uuid": "^11.1.0",
  "ws": "^8.18.2"
}
```

## 🎯 Game Flow

1. **Authentication**: Players register/login to get JWT tokens
2. **Team Setup**: Players select their 3-character team composition
3. **Matchmaking**: Players enter matchmaking queue based on skill level
4. **Game Session**: Real-time turn-based combat via WebSockets
5. **Results**: Rating updates, mission progress, and statistics tracking

## 📄 License

This project is licensed under the ISC License.

## 👥 Support

For support and questions:
- Check the [Issues](../../issues) page for known problems
- Review the implementation plan for development roadmap
- Contact the development team for technical assistance

---

**The Arena Engine** - Where strategy meets skill in tactical combat!
