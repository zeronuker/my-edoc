import { IconArrowDown, IconArrowUp, IconChevronDown } from "@tabler/icons-react";
import { useDropdown } from "./useDropdown.js";

const OPTIONS = [
  { by: "name", label: "Name", dirs: { asc: "A to Z", desc: "Z to A" } },
  { by: "date", label: "Date added", dirs: { asc: "Oldest first", desc: "Newest first" } },
  { by: "size", label: "Size", dirs: { asc: "Smallest first", desc: "Largest first" } },
];

// "Sort: Size ↓ ▾". The menu lists the three keys; only each row's arrow
// does anything: on the key in use it flips the direction, on another key it
// switches to that key (keeping the direction shown). The menu stays open so
// several can be tried.
export default function SortMenu({ sort, onChange }) {
  const menu = useDropdown();
  const current = OPTIONS.find((o) => o.by === sort.by);
  const Arrow = sort.dir === "asc" ? IconArrowUp : IconArrowDown;

  function pick(by) {
    onChange({ by, dir: by === sort.by ? (sort.dir === "asc" ? "desc" : "asc") : sort.dir });
  }

  return (
    <div className="sort-menu" ref={menu.ref}>
      <button
        className="sort-trigger"
        aria-haspopup="true"
        aria-expanded={menu.open}
        data-tip={current.dirs[sort.dir]}
        onClick={() => menu.setOpen((v) => !v)}
      >
        Sort: {current.label}
        <Arrow size={13} />
        <IconChevronDown size={13} />
      </button>
      {menu.open && (
        <div className={`sort-menu-list${menu.closing ? " is-closing" : ""}`} ref={menu.menuRef}>
          {OPTIONS.map((o) => {
            const active = o.by === sort.by;
            return (
              <div className={`sort-option${active ? " active" : ""}`} key={o.by}>
                <span>{o.label}</span>
                <button
                  className="sort-option-arrow"
                  data-tip={active ? o.dirs[sort.dir] : `Sort by ${o.label.toLowerCase()}`}
                  aria-label={active ? `${o.label}: ${o.dirs[sort.dir]}. Click to reverse` : `Sort by ${o.label.toLowerCase()}`}
                  onClick={() => pick(o.by)}
                >
                  <Arrow size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
