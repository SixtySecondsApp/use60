# Pipeline Feature Documentation

## Overview

The Pipeline feature is a Kanban-style board that allows sales teams to visualize and manage deals through customizable pipeline stages. It provides real-time updates with Supabase and uses `@hello-pangea/dnd` for smooth drag-and-drop functionality.

## Features

- Drag-and-drop deal management between stages
- Customizable pipeline stages with color coding and probability settings
- Deal cards with key information, time tracking, and probability indicators
- Deal creation and editing with detailed form
- Search and filtering capabilities
- Time-in-stage tracking with visual alerts
- Win probability calculation
- Responsive design for all devices

## Database Schema

The Pipeline feature relies on four main tables in Supabase:

1. `deal_stages`: Pipeline stages with names, colors, and default probabilities
2. `deals`: Deal information including values, contacts, and current stages
3. `deal_activities`: Activities associated with deals
4. `deal_stage_history`: Historical tracking of deals moving through stages

You can find the full SQL schema in `pipeline_tables.sql`.

## Component Architecture

The feature is organized around several key components:

- `Pipeline.jsx`: The main component that integrates all pipeline components
- `PipelineHeader.jsx`: Header with controls for search, filtering, and adding deals
- `PipelineColumn.jsx`: Represents a pipeline stage with draggable deal cards
- `DealCard.jsx`: Individual deal cards showing key information
- `DealForm.jsx`: Form for creating and editing deals
- `Badge.jsx`: Reusable badge component for status indicators

State is managed through three custom hooks:

- `useDeals.js`: CRUD operations and state for deals
- `useDealStages.js`: Manages pipeline stages
- `useDealActivities.js`: Tracks and manages deal activities

All state is coordinated through the `PipelineContext.jsx` context provider.

## How to Use

1. **View Pipeline**: Navigate to the Pipeline page through the sidebar.
2. **Create a Deal**: Click "New Deal" or the "+" button in any stage column.
3. **Move Deals**: Drag and drop deals between pipeline stages to update their status.
4. **Edit Deals**: Click on any deal card to edit its details.
5. **Search/Filter**: Use the search bar and filter controls to find specific deals.

## Technical Details

### Real-time Updates

The Pipeline uses Supabase's real-time functionality to provide immediate updates across all users when:

- A deal is created, updated, or deleted
- A deal is moved to a different stage
- Deal activities are added or updated

### Drag and Drop Implementation

We use `@hello-pangea/dnd` (a maintained fork of react-beautiful-dnd) for smooth drag-and-drop functionality:

- `DragDropContext` wraps the entire pipeline
- Each stage is a `Droppable` area
- Deal cards are `Draggable` elements
- The `handleDragEnd` function in `PipelineContext` processes the drop events

### Testing

The Pipeline components include tests to verify functionality:

- `Pipeline.test.jsx`: Tests the main Pipeline component rendering, stage and deal display
- Tests are run with Vitest and React Testing Library

## Extending the Pipeline

### Adding New Fields to Deals

1. Update the `deals` table in Supabase
2. Modify the `DealForm.jsx` component to include the new field
3. Update the `DealCard.jsx` to display the new information if needed

### Creating New Visualizations

The data structure supports additional visualizations. Consider:

- Win probability forecasts
- Deal velocity analysis
- Value distribution by stage
- Activity heatmaps

### Performance Optimization

For large pipelines with many deals, consider these optimizations:

- Virtualized lists using react-window or react-virtualized
- Pagination for API requests when dealing with hundreds of deals
- More aggressive memoization of expensive components
- Lazy loading of deal details 