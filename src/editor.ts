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
    _config: { state: true },
    _offer: { state: true }
  };

  hass?: HomeAssistant;
  private _config?: PowerOriginCardConfig;
  private _offer: string[] = [];
  private _prefs?: EnergyPrefs;

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
    void this._measureOffer();
  }

  /**
   * What the Energy dashboard could still contribute. The card takes it on
   * its own when it is added, so most of the time the answer is nothing —
   * and then there is no reason to show a button.
   */
  private async _measureOffer(): Promise<void> {
    if (!this.hass || !this._config) return;
    try {
      this._prefs ??= await this.hass.callWS<EnergyPrefs>({
        type: "energy/get_prefs"
      });
      this._offer = mergePick(this._config, pickFromEnergy(this._prefs)).filled;
    } catch {
      this._offer = [];
    }
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
      ${this._offer.length === 0
        ? nothing
        : html`<div class="adopt">
            <ha-button @click=${this._adopt}
              >${localize("editor.adopt", localeOf(this.hass))}</ha-button
            >
            <span class="note"
              >${localize("editor.adopt_offer", localeOf(this.hass))}
              ${this._offer.length}</span
            >
          </div>`}
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
    try {
      const prefs = await this.hass.callWS<EnergyPrefs>({ type: "energy/get_prefs" });
      const { merged, filled } = mergePick(this._config, pickFromEnergy(prefs));
      if (filled.length === 0) {
        this._offer = [];
        return;
      }
      this._config = merged;
      this._offer = [];
      this.dispatchEvent(
        new CustomEvent("config-changed", {
          bubbles: true,
          composed: true,
          detail: { config: merged }
        })
      );
    } catch {
      this._offer = [];
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
