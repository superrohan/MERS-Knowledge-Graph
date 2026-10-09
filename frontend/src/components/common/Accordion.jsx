import { useState } from "react";

/** One collapsible section. Renders as a plain, always-open block when
 * `defaultOpen` and no sibling accordion state needs coordinating - used
 * standalone (see InstructionsPage) rather than a single-open-at-a-time
 * group, since a reference/help page is meant to be skimmed and jumped
 * around in, not stepped through one section at a time. */
export function AccordionItem({ title, icon, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="accordion-item">
      <button
        type="button"
        className="accordion-item__trigger"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="accordion-item__title">
          {icon && (
            <span className="accordion-item__icon" aria-hidden="true">
              {icon}
            </span>
          )}
          {title}
        </span>
        <span className={`accordion-item__chevron${open ? " accordion-item__chevron--open" : ""}`} aria-hidden="true">
          ▸
        </span>
      </button>
      {open && <div className="accordion-item__body">{children}</div>}
    </div>
  );
}
