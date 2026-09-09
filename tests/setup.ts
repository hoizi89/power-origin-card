import { vi } from "vitest";

/*
 * The fixtures describe a day from midnight to now, and the card reads the
 * clock for sunrise, the runtime and the chart. Run at seven in the morning
 * the day had no shape yet and half the suite went red. Every test now runs
 * at one in the afternoon of the same June day, whatever the wall clock says.
 * Only Date is faked; timers stay real so rendering can await them.
 */
vi.useFakeTimers({ toFake: ["Date"] });
vi.setSystemTime(new Date(2026, 5, 15, 13, 0, 0));
