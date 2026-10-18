// DragLayer.jsx = the card that follows the pointer while you drag something (a task, a note, a block).
//
// It is drawn straight into <body>, outside every column, so it floats ABOVE everything: a column hides what spills
// out of it and a glass column would also trap it, so inside one the card would be cut off or end up underneath.
// Put it inside the <DndContext> of whatever is being dragged, with the card as its child (or nothing, when
// nothing is being dragged).

import { createPortal } from 'react-dom';
import { DragOverlay } from '@dnd-kit/core';

export default function DragLayer({ children }) {
  return createPortal(
    <DragOverlay zIndex={10000} dropAnimation={{ duration: 140, easing: 'ease-out' }}>
      {children}
    </DragOverlay>,
    document.body
  );
}
