import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { normalizePhone } from "../../shared/phone.ts";
import { he } from "../i18n/he.ts";
import { cx, fmtDmy } from "../util.ts";

interface FieldProps {
  id: string;
  label: string;
  /** Keep the label for screen readers only (the card heading already says it). */
  labelHidden?: boolean;
  value: string;
  onInput: (v: string) => void;
  type?: "text" | "date" | "time" | "tel";
  placeholder?: string;
  hint?: string;
  error?: string | null;
  highlight?: boolean;
  required?: boolean;
  inputMode?: "text" | "tel" | "numeric" | "email";
  maxLength?: number;
  /** For date/time inputs. */
  min?: string;
  autoComplete?: string;
  /** id of a `<datalist>` with suggestions (pass it as a child). */
  list?: string;
  dir?: "ltr" | "rtl";
  onBlur?: () => void;
  /** Shows a small spinner inside the input (its left edge: busy fields are `dir="ltr"`, text aligned right). */
  busy?: boolean;
  children?: ComponentChildren;
}

export function Field(p: FieldProps) {
  const hintId = `${p.id}-hint`;
  const dmy = p.type === "date" ? fmtDmy(p.value) : "";
  const input = (
    <input
      id={p.id}
      type={(p.type ?? "text") as "text"}
      value={p.value}
      placeholder={p.placeholder}
      required={p.required}
      inputMode={p.inputMode}
      maxLength={p.maxLength}
      min={p.min}
      autoComplete={p.autoComplete}
      list={p.list}
      dir={p.dir}
      aria-invalid={p.error ? true : undefined}
      aria-busy={p.busy || undefined}
      aria-describedby={p.error || p.hint ? hintId : undefined}
      onInput={(e) => p.onInput((e.currentTarget as HTMLInputElement).value)}
      onBlur={p.onBlur}
    />
  );
  return (
    <div class={cx("fld", p.highlight && "hl", p.error && "err")}>
      <label for={p.id} class={p.labelHidden ? "vh" : undefined}>
        {p.label}
        {p.highlight && <i class="auto">{he.newEvent.detected}</i>}
      </label>
      {p.type === "date" ? (
        // Native picker underneath; the visible text is our own dd/mm/yyyy, whatever the device region.
        <div class="datebox">
          {input}
          <span class={cx("datebox-text", !dmy && "is-empty")} aria-hidden="true">
            {dmy ? <bdi dir="ltr">{dmy}</bdi> : he.common.datePlaceholder}
          </span>
        </div>
      ) : p.busy === undefined ? (
        input
      ) : (
        <span class={cx("inwrap", p.busy && "busy")}>
          {input}
          {p.busy && <i class="spin" aria-hidden="true" />}
        </span>
      )}
      {(p.error || p.hint) && (
        <span class="hint" id={hintId}>
          {p.error || p.hint}
        </span>
      )}
      {p.children}
    </div>
  );
}

/** Israeli mobile input, validated with normalizePhone on blur (and when `showErrors`). */
export function PhoneInput({
  id,
  label,
  value,
  onInput,
  required,
  showErrors,
}: {
  id: string;
  label: string;
  value: string;
  onInput: (v: string) => void;
  required?: boolean;
  showErrors?: boolean;
}) {
  const [touched, setTouched] = useState(false);
  const err = phoneError(value, !!required);
  const show = (touched || showErrors) && err;
  const ok = value.trim() !== "" && !err;
  return (
    <div class={cx("fld", show && "err", ok && touched && "okv")}>
      <label for={id}>{label}</label>
      <input
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        dir="ltr"
        value={value}
        placeholder="050-1234567"
        aria-invalid={show ? true : undefined}
        aria-describedby={`${id}-hint`}
        onInput={(e) => onInput((e.currentTarget as HTMLInputElement).value)}
        onBlur={() => setTouched(true)}
      />
      <span class="hint" id={`${id}-hint`}>
        {show ? err : required ? he.form.phoneHintRequired : he.form.phoneHintOptional}
      </span>
    </div>
  );
}

export function phoneError(v: string, required: boolean): string | null {
  if (!v.trim()) return required ? he.form.phoneHintRequired : null;
  return normalizePhone(v) ? null : he.form.phoneInvalid;
}

export function Stepper({
  id,
  label,
  value,
  min,
  max,
  onChange,
  hint,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
  hint?: string;
}) {
  return (
    <div class="row sp stepper-row">
      <span>
        <span id={id}>{label}</span>
        {hint && <small class="muted d-block">{hint}</small>}
      </span>
      <span class="step" role="group" aria-labelledby={id}>
        <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label={he.form.less}>
          −
        </button>
        <b class="num" aria-live="polite">
          {value}
        </b>
        <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={he.form.more}>
          +
        </button>
      </span>
    </div>
  );
}

export function Switch({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button type="button" class="sw" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}>
      <span>{label}</span>
      <i aria-hidden="true" />
    </button>
  );
}
