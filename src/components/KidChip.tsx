import { famColor, initial, cx } from "../util.ts";

export function Avatar({ name, color, size }: { name: string; color: number; size?: "lg" }) {
  return (
    <span class={cx("av", size)} style={{ "--fc": famColor(color) }} aria-hidden="true">
      {initial(name)}
    </span>
  );
}

/** A kid as a chip. Interactive when `onClick` is given; `selected` shows the armed state. */
export function KidChip({
  name,
  color,
  selected,
  onClick,
  label,
}: {
  name: string;
  color: number;
  selected?: boolean;
  onClick?: () => void;
  label?: string;
}) {
  if (!onClick)
    return (
      <span class="kchip ro">
        <Avatar name={name} color={color} />
        {name}
      </span>
    );
  return (
    <button type="button" class={cx("kchip", selected && "sel")} aria-pressed={selected} onClick={onClick} aria-label={label}>
      <Avatar name={name} color={color} />
      {name}
    </button>
  );
}
