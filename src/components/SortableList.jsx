import { useState } from "react";
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

function SortableRow({ item, label, disabled, dropPosition, children }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging, isOver } = useSortable({ id: item.id, disabled });
  return (
    <div ref={setNodeRef} role="listitem" data-sortable-id={item.id} data-drop-position={dropPosition}
      className={`sortable-row${isDragging ? " is-dragging" : ""}${isOver && !isDragging ? " is-drop-target" : ""}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}>
      <button ref={setActivatorNodeRef} type="button" className="drag-handle"
        {...attributes} {...(disabled ? {} : listeners)} aria-disabled={disabled} aria-label={`Reordenar ${label}`}
        title="Arrastrá para ordenar. Con teclado: espacio, flechas y espacio para soltar; Escape para cancelar.">
        <span aria-hidden="true">⋮⋮</span>
      </button>
      <div className="sortable-row__content">{children}</div>
    </div>
  );
}

// Each list owns a context: tasks cannot be dropped into another routine.
export default function SortableList({ items, label, itemLabel, disabled, onReorder, onDraggingChange, children }) {
  const [activeId, setActiveId] = useState(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const name = (id) => itemLabel(items.find((item) => item.id === id));
  const finish = () => { setActiveId(null); onDraggingChange(false); };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter}
      accessibility={{
        screenReaderInstructions: { draggable: "Para reordenar, presioná espacio. Usá las flechas para mover. Presioná espacio para guardar o Escape para cancelar." },
        announcements: {
          onDragStart: ({ active }) => `Seleccionaste ${name(active.id)}. Usá las flechas para mover.`,
          onDragOver: ({ over }) => over ? `Posición ${items.findIndex(({ id }) => id === over.id) + 1} de ${items.length}.` : "Fuera de la lista.",
          onDragEnd: ({ active, over }) => over && active.id !== over.id ? "Elemento soltado. Guardando el orden." : "Orden sin cambios.",
          onDragCancel: () => "Reordenamiento cancelado.",
        },
      }}
      onDragStart={({ active }) => { setActiveId(active.id); onDraggingChange(true); }}
      onDragCancel={finish}
      onDragEnd={({ active, over }) => {
        finish();
        if (disabled || !over || active.id === over.id) return;
        const from = items.findIndex(({ id }) => id === active.id);
        const to = items.findIndex(({ id }) => id === over.id);
        if (from >= 0 && to >= 0) onReorder(arrayMove(items, from, to));
      }}>
      <SortableContext items={items.map(({ id }) => id)} strategy={verticalListSortingStrategy}>
        <div role="list" aria-label={label} className="sortable-list" data-dragging={Boolean(activeId)}>
          {items.map((item, index) => <SortableRow key={item.id} item={item} label={itemLabel(item)} disabled={disabled}
            dropPosition={items.findIndex(({ id }) => id === activeId) < index ? "after" : "before"}>
            {children(item)}
          </SortableRow>)}
        </div>
      </SortableContext>
    </DndContext>
  );
}
