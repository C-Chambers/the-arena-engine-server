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

## 🚀 Getting Started

### Prerequisites

- Node.js (v14 or higher)
- PostgreSQL database
- npm or yarn package manager

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd the-arena-engine-server
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Setup**
   
   Create a `.env` file in the root directory:
   ```env
   DATABASE_URL=postgresql://username:password@localhost:5432/arena_engine_db
   JWT_SECRET=your-super-secret-jwt-key
   PORT=3001
   ```

4. **Database Setup**
   
   Create the PostgreSQL database and run the seeding script:
   ```bash
   # Create the database (adjust connection details as needed)
   createdb arena_engine_db
   
   # Seed the database with initial data
   npm run dbseed
   ```

5. **Start the server**
   ```bash
   # Development mode with hot reloading
   npm run dev
   
   # Production mode
   npm start
   ```

The server will start on `http://localhost:3001` (or your configured PORT).

## 📁 Project Structure

```
src/
├── config/
│   └── database.js          # Database connection configuration
├── controllers/             # Request handlers for each route
│   ├── authController.js
│   ├── characterController.js
│   ├── teamController.js
│   └── ...
├── routes/                  # API route definitions
│   ├── auth.js
│   ├── characters.js
│   ├── team.js
│   └── ...
├── services/                # Business logic and data services
│   ├── characterService.js
│   ├── ratingService.js
│   ├── missionService.js
│   └── ...
├── game/                    # Core game engine
│   ├── engine.js           # Game mechanics and combat system
│   ├── manager.js          # Matchmaking and game session management
│   └── data.js             # Game data (characters, skills, etc.)
└── server.js               # Main application entry point

scripts/
└── seed.js                 # Database seeding script
```

## 🔌 API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout

### Characters
- `GET /api/characters` - Get all available characters
- `GET /api/characters/:id` - Get specific character details

### Team Management
- `GET /api/team` - Get player's current team
- `POST /api/team` - Save/update player's team composition

### Ratings & Statistics
- `GET /api/ratings` - Get player ratings and statistics
- `GET /api/ratings/leaderboard` - Get top-rated players

### Missions
- `GET /api/missions` - Get available missions
- `POST /api/missions/progress` - Update mission progress

### Admin (Protected Routes)
- `GET /api/admin/users` - Manage user accounts
- `POST /api/admin/seed` - Manually trigger database seeding

### Status
- `GET /status` - Server health and game activity status

## 🎯 Game Flow

1. **Authentication**: Players register/login to get JWT tokens
2. **Team Setup**: Players select their 3-character team composition
3. **Matchmaking**: Players enter matchmaking queue based on skill level
4. **Game Session**: Real-time turn-based combat via WebSockets
5. **Results**: Rating updates, mission progress, and statistics tracking

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | Required |
| `JWT_SECRET` | Secret key for JWT tokens | Required |
| `PORT` | Server port | 3001 |

### Matchmaking Parameters

Key configuration values in `src/game/manager.js`:
- `MATCHMAKING_TICK_RATE`: Base matchmaking frequency (1000ms)
- `NEW_PLAYER_GAME_THRESHOLD`: Games threshold for veteran status (20)
- `INITIAL_MMR_RANGE`: Initial rating search range (100)
- `MMR_RANGE_INCREASE_PER_TICK`: Rating range expansion (50 per tick)

## 📊 Monitoring & Analytics

The server includes comprehensive analytics for:
- Match quality metrics
- Player wait times
- Queue population tracking
- Rating distribution analysis
- Performance monitoring

Access real-time statistics at `/status` endpoint.

## 🔮 Future Development

See [MATCHMAKING_IMPLEMENTATION_PLAN.md](./MATCHMAKING_IMPLEMENTATION_PLAN.md) for detailed roadmap including:

### Phase 1: Core Improvements
- Wait time priority for new players
- Dynamic tick rates based on population
- Enhanced metrics and logging

### Phase 2: Enhanced Matching
- Graduated new player tiers
- Cross-queue matching capabilities
- Advanced match quality scoring

### Phase 3: Advanced Features
- Seasonal rating adjustments
- Team composition balancing
- Advanced analytics dashboard

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 Scripts

- `npm run dev` - Start development server with hot reloading
- `npm run dbseed` - Populate database with initial game data
- `npm test` - Run test suite (to be implemented)

## 🐛 Troubleshooting

### Common Issues

**Database Connection Errors**
- Verify PostgreSQL is running
- Check DATABASE_URL format and credentials
- Ensure database exists

**WebSocket Connection Issues**
- Check CORS configuration
- Verify client WebSocket URL matches server port
- Ensure firewall allows WebSocket connections

**Matchmaking Problems**
- Check server logs for queue status
- Verify player authentication tokens
- Review matchmaking tick rate settings

## 📄 License

This project is licensed under the ISC License.

## 👥 Support

For support and questions:
- Check the [Issues](../../issues) page for known problems
- Review the implementation plan for development roadmap
- Contact the development team for technical assistance

---

**The Arena Engine** - Where strategy meets skill in tactical combat!