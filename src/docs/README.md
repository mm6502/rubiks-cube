# Rubik's Cube Architecture Documentation

This directory contains comprehensive documentation for the 3D coordinate-based Rubik's Cube system.

## Documentation Overview

### 🏗️ [Architecture Overview](./architecture-overview.md)

High-level system design and architectural patterns

Learn about:

- System design philosophy and core principles
- Component architecture and relationships
- Move execution patterns
- Architectural limitations and design decisions
- Type system overview
- Future enhancements

**Start here if:** You want to understand the overall system design and architectural decisions.

### 📐 [Coordinate System](./coordinate-system.md)

Core concepts for 3D cubie identification and type system design

Learn about:

- 3D coordinate system (x, y, z axes from 0 to n-1)
- Cubie ID format: `"pos_XX_YY_ZZ"` (e.g., `"pos_00_00_00"`)
- Sticker ID format: `"{cubie_id}_{face}_sticker"`
- Cubie type determination (corner, edge, center)
- Coordinate-to-layer mapping
- Lazy layer evaluation
- Unified Face/Layer/Plane types for better type safety

**Start here if:** You need to understand how cubies are identified and organized in 3D space.

### 🎯 [Move Notation](./move-notation.md)

Complete reference for move notation and parsing

Learn about:

- Standard face moves (R, L, U, D, F, B with modifiers ', 2)
- Wide moves (Rw, 3Uw for multiple layers)
- Middle slices (M, E, S with numeric prefixes)
- Alternative notations (indexed layers, axis notation)
- Coordinate mapping for each move type
- Move normalization rules

**Start here if:** You need to understand how moves are specified or want to implement move parsing.

### 🎯 [Discrete Orientation System](./discrete-orientation-system.md)

Integer-based cubie orientation model

Learn about:

- Corner (0/1/2) and edge (0/1) orientation encoding
- Sticker local-index and face computation formulas
- Pre-computed move tables and orientation deltas
- Cubology invariants (corner twist, edge flip, permutation parity)

**Start here if:** You need to understand how cubie orientations work or how move tables are validated.

### 💾 [State Import/Export System](./state-import-export.md)

State persistence, import, and export functionality

Learn about:

- Automatic state persistence on app exit
- Automatic state restoration on app start
- Manual export/import of cube states
- Compact string format and serialization
- API reference for StatePersistence
- Error handling and validation

**Start here if:** You need to understand how cube states are saved, loaded, or shared.

### 🎮 [Commanding and Eventing System](./commanding-and-eventing-system.md)

Command and event architecture for user interactions

Learn about:

- Centralized command and event system
- View interaction handling
- Animation coordination
- Keyboard and mouse event management

**Start here if:** You need to understand how user interactions are handled across views.

### 🖥️ [User Interface Design](./user-interface-design.md)

UI layout and functionality overview

Learn about:

- Main application container structure
- Window management for floating views
- View discovery mechanism
- Available actions and commands

**Start here if:** You need to understand the UI design and user interface components.

### 🔵 [Circular View](./circular-view.md)

SVG-based concentric-circles visualization

Learn about:

- Axis-circle layout and SVG structure
- Coordinate-to-SVG element mapping
- Runtime initialization and sticker lookup
- Selective (move-based) rendering updates

**Start here if:** You are working on or contributing to the circular view implementation.

### 🚀 [Quickstart for Contributors](./quickstart-contributors.md)

Getting started with development

Learn about:

- Project structure and key files
- Development setup and CLI commands
- Build system and deployment
- Debugging in VS Code

**Start here if:** You are new to the codebase and want to get up and running quickly.

### 🔧 [Implementation Guide](./implementation-guide.md)

Detailed API reference and implementation patterns

Learn about:

- File organization and component locations
- Complete API documentation for all core components
- Common implementation patterns
- Type system quick reference
- Testing and debugging tips
- Performance optimization guidelines

**Start here if:** You're implementing features or need detailed API information.
