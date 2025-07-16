# ICG Card Game - Component Structure

This document describes the modular component architecture of the ICG Card Game application.

## Project Structure

```
client/src/
├── App.vue                 # Main application component
├── styles/
│   ├── global.css         # Global styles and utilities
│   └── unimplemented.css  # Styles for unimplemented feature indicators
└── components/
    ├── index.js           # Component exports
    ├── ConnectionStatus.vue   # Connection status indicator
    ├── Lobby.vue             # Pre-game lobby and matching
    ├── TurnInfo.vue          # Turn and phase information display
    ├── CardGrid.vue          # Reusable card grid component
    ├── AuctionPanel.vue      # Auction-specific UI
    ├── ActionButtons.vue     # Game action buttons
    ├── MessageLog.vue        # Message logging system
    ├── GameModals.vue        # All modal dialogs
    └── GameBoard.vue         # Main game board container
```

## Component Overview

### App.vue
The main application component that orchestrates the entire game. Handles:
- Socket.io connection and event handling
- Game state management
- Communication between components via props and events

### ConnectionStatus.vue
**Props:**
- `isConnected` (Boolean) - Connection status

Displays a fixed position indicator showing server connection status.

### Lobby.vue
**Props:**
- `isMatching` (Boolean) - Whether currently matching

**Events:**
- `join-game` - Emitted when player joins with name
- `cancel-matching` - Emitted when player cancels matching

Handles pre-game state including player name input and matchmaking display.

### TurnInfo.vue
**Props:**
- `currentTurn` (Number) - Current turn number
- `currentPhase` (String) - Current game phase
- `playerName` (String) - Player's name
- `playerIP` (Number) - Player's IP points
- `opponentName` (String) - Opponent's name
- `opponentIP` (Number) - Opponent's IP points

Displays turn information, current phase, and player details in a styled header.

### CardGrid.vue
**Props:**
- `title` (String) - Grid title
- `cards` (Array) - Array of card objects
- `fieldType` (String) - Type of field ('opponent-field', 'neutral-field', 'player-field')
- `selectedCard` (Object) - Currently selected card
- `currentPhase` (String) - Current game phase
- `isMyTurn` (Boolean) - Whether it's player's turn
- `playerField` (Array) - Player's field for card count calculations

**Events:**
- `card-click` - Card clicked for options
- `card-detail` - Card right-clicked for details
- `use-ability` - Ability button clicked

Reusable component for displaying cards in different fields. Includes ability buttons for player field and unimplemented feature indicators.

### AuctionPanel.vue
**Props:**
- `currentPhase` (String) - Current game phase
- `selectedCard` (Object) - Selected card for bidding
- `playerIP` (Number) - Player's available IP

**Events:**
- `place-bid` - Bid placed with selected card and amount

Shows auction interface when in auction phase, including selected card details and bidding controls.

### ActionButtons.vue
**Props:**
- `currentPhase` (String) - Current game phase
- `isMyTurn` (Boolean) - Whether it's player's turn

**Events:**
- `pass-turn` - Player passes turn
- `end-turn` - Player ends turn

Context-sensitive action buttons based on game phase and turn status.

### MessageLog.vue
**Props:**
- `messages` (Array) - Array of message objects
- `isMinimized` (Boolean) - Whether log is minimized

**Events:**
- `toggle-log` - Toggle minimized state

Fixed position message log with different message types (info, warning, success, error, reaction).

### GameModals.vue
**Props:**
Multiple props for different modal states and data

**Events:**
Multiple events for modal interactions

Contains all modal dialogs:
- Match result notification
- Auction result display
- Turn/phase change notifications
- Target selection dialog
- Card options menu
- Card detail view
- Game over screen

### GameBoard.vue
**Props:**
Game state data (turns, phases, fields, etc.)

**Events:**
Game actions (card interactions, bidding, turn management)

Container component that combines TurnInfo, CardGrid instances, AuctionPanel, and ActionButtons to create the main game interface.

## Styling Architecture

### global.css
- CSS reset and base styles
- Utility classes for common layouts
- Button styles and variants
- Form input styles
- Modal base styles
- Animation keyframes
- Responsive design breakpoints

### unimplemented.css
- Styles for unimplemented feature indicators
- Priority-based color schemes (high/medium/low)
- Badge styles for different contexts
- Accessibility considerations

## Key Features

### Unimplemented Feature Detection
The application includes a comprehensive system for detecting and displaying unimplemented card abilities:
- Visual indicators with priority-based colors
- Tooltips with detailed information
- Server-side validation and client-side preview
- Consistent styling across all components

### Responsive Design
- Mobile-friendly layouts
- Flexible grid systems
- Adaptive modal sizes
- Touch-friendly interactions

### Accessibility
- Keyboard navigation support
- Screen reader compatibility
- High contrast mode support
- Reduced motion preferences

## Development Notes

### Component Communication
Components use Vue's props and events system for communication:
- Props flow down from parent to child
- Events bubble up from child to parent
- The main App.vue component acts as the state management hub

### Socket.io Integration
All socket communication is handled in App.vue to maintain centralized state management. Components receive data via props and trigger actions via events.

### Code Organization
- Each component is self-contained with its own template, script, and styles
- Shared functionality is extracted into reusable components
- Global styles provide consistency across components
- CSS variables could be added for theme customization

## Future Improvements

1. **State Management**: Consider Vuex/Pinia for complex state management
2. **TypeScript**: Add type safety for better development experience
3. **Testing**: Add unit tests for individual components
4. **Internationalization**: Add i18n support for multiple languages
5. **Themes**: Implement dark/light theme switching
6. **Performance**: Add virtual scrolling for large card lists
7. **PWA**: Add service worker for offline capabilities

## Usage Example

```vue
<template>
  <div>
    <ConnectionStatus :is-connected="connected" />
    <GameBoard
      v-if="gameActive"
      :current-turn="turn"
      :current-phase="phase"
      :player-field="cards"
      @card-click="handleCardClick"
    />
  </div>
</template>

<script>
import { ConnectionStatus, GameBoard } from './components';

export default {
  components: {
    ConnectionStatus,
    GameBoard
  },
  // ... component logic
}
</script>
```
