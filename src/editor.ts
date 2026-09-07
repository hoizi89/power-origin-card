import { LitElement, css, html, nothing } from "lit";
import { getConfigForm, resolveConfig } from "./config";
import type { HomeAssistant, PowerOriginCardConfig } from "./types";
import { localeOf } from "./values";

type ConfigElementCardConstructor = Function & {
  getConfigElement?: () => HTMLElement | Promise<HTMLElement>;
};

/**
 * `ha-form` is only defined once some built-in card editor has been opened, so
 * a freshly loaded frontend needs a nudge before the editor can render.
 */
export async function ensureHaFormLoaded(): Promise<void> {
  if (customElements.get("ha-form")) return;

  const helpers = await window.loadCardHelpers?.();
  const buttonCard = await helpers?.createCardElement({ type: "button" });
  const constructor = buttonCard?.constructor as ConfigElementCardConstructor | undefined;
  await constructor?.getConfigElement?.();

  if (!customElements.get("ha-form")) {
    throw new Error("Home Assistant's form editor is unavailable.");
  }
}

export class PowerOriginCardEditor extends LitElement {
  static properties = {
    hass: { attribute: false },
    _config: { state: true }
  };

  hass?: HomeAssistant;
  private _config?: PowerOriginCardConfig;

  static styles = css`
    :host {
      display: block;
    }
  `;

  setConfig(config: PowerOriginCardConfig): void {
    this.form().assertConfig(config);
    this._config = config;
  }

  private form() {
    return getConfigForm(localeOf(this.hass));
  }

  protected render() {
    if (!this.hass || !this._config) return nothing;

    const form = this.form();
    // Show the values the card is really using, not the sparse stored config —
    // otherwise every unset switch reads as off while its block is on screen.
    const data = resolveConfig(this._config);
    return html`
      <ha-form
        .hass=${this.hass}
        .data=${data}
        .schema=${form.schema}
        .computeLabel=${form.computeLabel}
        .computeHelper=${form.computeHelper}
        @value-changed=${this._valueChanged}
      ></ha-form>
    `;
  }

  private _valueChanged(event: CustomEvent): void {
    event.stopPropagation();
    const config = event.detail.value as PowerOriginCardConfig;
    this._config = config;
    this.dispatchEvent(
      new CustomEvent("config-changed", {
        bubbles: true,
        composed: true,
        detail: { config }
      })
    );
  }
}
