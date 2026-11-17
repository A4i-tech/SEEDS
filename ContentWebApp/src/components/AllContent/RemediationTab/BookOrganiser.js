import React, { useEffect, useRef, useState } from "react";
import { MAX_REMEDIATION_PDF_MB } from "../../../Constants";
import "./RemediationTab.css";
import "../shared/buttons.css";

export const sortByName = (items) =>
  [...items].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

const BookOrganiser = ({ items, onChange, allowRemove = false, onSort }) => {
  const [announcement, setAnnouncement] = useState("");
  const [dragFrom, setDragFrom] = useState(null);
  const [dragOver, setDragOver] = useState(null);
  const buttonRefs = useRef({});
  const pendingFocus = useRef(null);

  // Reordering moves DOM nodes, which drops focus. Put it back after the render.
  useEffect(() => {
    if (!pendingFocus.current) return;
    const { id, actions } = pendingFocus.current;
    pendingFocus.current = null;
    actions
      .map((action) => buttonRefs.current[`${id}:${action}`])
      .find((button) => button && !button.disabled)
      ?.focus();
  }, [items]);

  const move = (from, to, action) => {
    if (to < 0 || to >= items.length) return;
    const next = [...items];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    pendingFocus.current = action && { id: item.id, actions: action === "up" ? ["up", "down"] : ["down", "up"] };
    setAnnouncement(`${item.name} moved to position ${to + 1} of ${items.length}`);
    onChange(next);
  };

  const remove = (index) => {
    const next = items.filter((_, i) => i !== index);
    const neighbour = next[Math.min(index, next.length - 1)];
    pendingFocus.current = neighbour && { id: neighbour.id, actions: ["remove"] };
    setAnnouncement(`${items[index].name} removed. ${next.length} remaining`);
    onChange(next);
  };

  const sort = () => {
    setAnnouncement("Sorted by name");
    (onSort || onChange)(sortByName(items));
  };

  const handleKeyDown = (event, index) => {
    if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
    event.preventDefault();
    const up = event.key === "ArrowUp";
    move(index, up ? index - 1 : index + 1, up ? "up" : "down");
  };

  const handleDrop = (event, index) => {
    event.preventDefault();
    const from = dragFrom;
    setDragFrom(null);
    setDragOver(null);
    if (from !== index) move(from, index, null);
  };

  const setButtonRef = (id, action) => (element) => {
    buttonRefs.current[`${id}:${action}`] = element;
  };

  return (
    <div className="book-organiser">
      <div className="book-organiser-head">
        <b>Book order</b>
        <span className="table-cell-secondary">(top to bottom is the order of the book)</span>
        <button type="button" className="action-ghost-button book-small-button" onClick={sort}>
          Sort by name
        </button>
      </div>
      <p className="table-cell-secondary book-organiser-hint">
        Drag a row, press the buttons, or press Alt with the up and down arrow keys.
      </p>
      <ol className="book-organiser-list" aria-label="Book order">
        {items.map((item, index) => {
          const tooBig = item.sizeMb > MAX_REMEDIATION_PDF_MB;
          const className = [
            "book-organiser-item",
            tooBig && "book-organiser-item-bad",
            dragFrom === index && "book-organiser-item-drag",
            dragOver === index && dragFrom !== index && "book-organiser-item-over",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <li
              key={item.id}
              className={className}
              draggable
              onKeyDown={(event) => handleKeyDown(event, index)}
              onDragStart={(event) => {
                setDragFrom(index);
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", item.id);
              }}
              onDragOver={(event) => {
                if (dragFrom === null) return;
                event.preventDefault();
                setDragOver(index);
              }}
              onDrop={(event) => handleDrop(event, index)}
              onDragEnd={() => {
                setDragFrom(null);
                setDragOver(null);
              }}
            >
              <span className="book-organiser-position" aria-hidden="true">
                {index + 1}
              </span>
              <span className="book-organiser-file">
                <span className="book-organiser-name">{item.name}</span>
                <span className="table-cell-secondary">
                  {[item.pages && `${item.pages} pages`, item.sizeMb !== undefined && `${item.sizeMb.toFixed(1)} MB`]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                {tooBig && (
                  <span className="content-details-error book-organiser-problem">
                    Over the {MAX_REMEDIATION_PDF_MB} MB limit. Compress or remove this file.
                  </span>
                )}
              </span>
              <span className="book-organiser-buttons">
                <button
                  type="button"
                  ref={setButtonRef(item.id, "up")}
                  className="action-ghost-button book-small-button"
                  disabled={index === 0}
                  aria-label={
                    index === 0 ? `Move ${item.name} up` : `Move ${item.name} up, now position ${index} of ${items.length}`
                  }
                  onClick={() => move(index, index - 1, "up")}
                >
                  Up
                </button>
                <button
                  type="button"
                  ref={setButtonRef(item.id, "down")}
                  className="action-ghost-button book-small-button"
                  disabled={index === items.length - 1}
                  aria-label={
                    index === items.length - 1
                      ? `Move ${item.name} down`
                      : `Move ${item.name} down, now position ${index + 2} of ${items.length}`
                  }
                  onClick={() => move(index, index + 1, "down")}
                >
                  Down
                </button>
                {allowRemove && (
                  <button
                    type="button"
                    ref={setButtonRef(item.id, "remove")}
                    className="action-ghost-button book-small-button"
                    aria-label={`Remove ${item.name}`}
                    onClick={() => remove(index)}
                  >
                    Remove
                  </button>
                )}
              </span>
            </li>
          );
        })}
      </ol>
      <div className="book-sr-only" role="status" aria-live="polite">
        {announcement}
      </div>
    </div>
  );
};

export default BookOrganiser;
