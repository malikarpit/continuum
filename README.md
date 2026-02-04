# Continuum 🌊

A comprehensive personal productivity PWA for tracking daily progress, tasks, nutrition, and training.

## Features

### 📅 Today View
- Real-time day progress tracking
- Time block-based task organization
- Energy level check-in
- Holiday mode with minimal tracking

### ✅ Tasks
- Drag-and-drop task widgets
- Recurring tasks (daily/weekly)
- Time block assignment
- Completion tracking

### 🍽️ Nutrition
- Meal logging (breakfast, lunch, dinner, snacks)
- Quick add foods with one tap
- Protein and macro tracking
- Progress visualization

### 💪 Training
- Workout planning and logging
- Exercise timer during workouts
- Set/rep/weight tracking
- Rest day and skip options

### 📊 Analytics
- Weekly task completion charts
- Time block performance heatmap
- Nutrition insights
- Training statistics

### 📆 Calendar
- Day history with visual indicators
- Extended analytics per day
- Status tracking (active, inactive, closed)

### ⚙️ Settings
- Customizable widget layout
- Day boundary configuration
- Protein goals
- Template management

## Tech Stack

- **React 18** - UI framework
- **Vite** - Build tool
- **Zustand** - State management
- **Dexie.js** - IndexedDB wrapper
- **PWA** - Offline-first with service worker

## Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/continuum.git
cd continuum

# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

### Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build |
| `npm run lint` | Run ESLint |
| `npm run test` | Run Playwright tests |

## Project Structure

```
src/
├── components/          # React components
│   ├── analytics/       # Analytics views
│   ├── calendar/        # Calendar component
│   ├── common/          # Shared components
│   ├── dashboard/       # Dashboard widgets
│   ├── meals/           # Nutrition tracking
│   ├── settings/        # Settings page
│   ├── tasks/           # Task management
│   ├── templates/       # Day templates
│   ├── today/           # Today view
│   └── training/        # Training tracker
├── db/                  # Database layer
│   ├── database.js      # IndexedDB setup
│   ├── dayStore.js      # Day operations
│   ├── taskStore.js     # Task operations
│   ├── mealStore.js     # Meal operations
│   └── trainingStore.js # Training operations
├── hooks/               # Custom React hooks
├── store/               # Zustand store
└── index.css            # Global styles
```

## PWA Support

This app is a Progressive Web App with:
- Offline functionality
- Install prompt
- Service worker caching
- Responsive design

## License

MIT License - Feel free to use and modify.

---

Built with ❤️ for personal productivity.
