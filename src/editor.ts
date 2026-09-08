import { LitElement, css, html, nothing } from "lit";
import { getConfigForm, resolveConfig } from "./config";
import { mergePick, pickFromEnergy, type EnergyPrefs } from "./energy";
import { localize } from "./localize";
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
  private _picked?: string;

  static styles = css`
    :host {
      display: block;
    }

    .adopt {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
      margin: 0 0 16px;
    }

    .note {
      font-size: 12.5px;
      color: var(--secondary-text-color);
      margin: -8px 0 16px;
    }
  `;

  setConfig(config: PowerOriginCardConfig): void {
    this.form().assertConfig(config);
    this._config = config;
  }

  private form() {
    return getConfigForm(localeOf(this.hass), this._config);
  }

  protected render() {
    if (!this.hass || !this._config) return nothing;

    const form = this.form();
    // Show the values the card is really using, not the sparse stored config —
    // otherwise every unset switch reads as off while its block is on screen.
    const data = resolveConfig(this._config);
    return html`
      <div class="adopt">
        <ha-button @click=${this._adopt}
          >${localize("editor.adopt", localeOf(this.hass))}</ha-button
        >
      </div>
      ${this._picked
        ? html`<p class="note">${this._picked}</p>`
        : nothing}
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

  /**
   * Home Assistant's own Energy dashboard already knows most of this. Taking
   * it from there turns sixteen pickers into one, and only the fields that
   * are still empty are touched.
   */
  private async _adopt(): Promise<void> {
    if (!this.hass || !this._config) return;
    const locale = localeOf(this.hass);
    try {
      const prefs = await this.hass.callWS<EnergyPrefs>({ type: "energy/get_prefs" });
      const { merged, filled } = mergePick(this._config, pickFromEnergy(prefs));
      if (filled.length === 0) {
        this._picked = localize("editor.adopt_none", locale);
        return;
      }
      this._picked = `${localize("editor.adopt_done", locale)} ${filled.length}`;
      this._config = merged;
      this.dispatchEvent(
        new CustomEvent("config-changed", {
          bubbles: true,
          composed: true,
          detail: { config: merged }
        })
      );
    } catch {
      this._picked = localize("editor.adopt_failed", locale);
    }
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
