// ---------------------------------------------------------------------------
// Shared keyboard builders
// ---------------------------------------------------------------------------

import { InlineKeyboard } from 'grammy';
import type { AlertPreferences } from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const CATEGORY_LABELS: Record<keyof AlertPreferences, string> = {
  whales: 'Whale Moves',
  politics: 'Political Scanner',
  movers: 'Big Price Movers',
  new_markets: 'New Markets',
  risk_reward: 'Risk/Reward Plays',
  smart_money: 'Smart Money Consensus',
};

const CATEGORY_ORDER: (keyof AlertPreferences)[] = [
  'whales',
  'politics',
  'movers',
  'new_markets',
  'risk_reward',
  'smart_money',
];

// ---------------------------------------------------------------------------
// Trade keyboard (used by alerts + search)
// ---------------------------------------------------------------------------

/**
 * Build inline keyboard with Buy YES / Buy NO buttons at $25, $50, $100.
 * Callback data format: trade:SIDE:TOKEN_ID:CONDITION_ID:AMOUNT
 */
export function buildTradeKeyboard(
  yesTokenId: string,
  noTokenId: string,
  conditionId: string,
): InlineKeyboard {
  const amounts = [25, 50, 100];
  const keyboard = new InlineKeyboard();

  // Row 1: Buy YES at each amount
  for (const amount of amounts) {
    keyboard.text(
      `Buy YES $${amount}`,
      `trade:BUY:${yesTokenId}:${conditionId}:${amount}`,
    );
  }
  keyboard.row();

  // Row 2: Buy NO at each amount
  for (const amount of amounts) {
    keyboard.text(
      `Buy NO $${amount}`,
      `trade:BUY:${noTokenId}:${conditionId}:${amount}`,
    );
  }

  return keyboard;
}

// ---------------------------------------------------------------------------
// Alert toggle keyboard
// ---------------------------------------------------------------------------

export function buildAlertToggleKeyboard(
  prefs: AlertPreferences,
): InlineKeyboard {
  const kb = new InlineKeyboard();

  for (const category of CATEGORY_ORDER) {
    const enabled = prefs[category];
    const label = `${enabled ? '[V]' : '[ ]'} ${CATEGORY_LABELS[category]}`;
    kb.text(label, `alert_toggle:${category}`).row();
  }

  return kb;
}

// ---------------------------------------------------------------------------
// Copy config keyboard
// ---------------------------------------------------------------------------

export function buildConfigKeyboard(
  configId: number,
  currentSizing: string,
  currentValue: number,
  currentDirection: string,
  currentMax: number | null,
  smartCopyEnabled: boolean = false,
  smartCopyMinConfidence: number = 0.7,
  smartCopyCategories: string[] | null = null,
): InlineKeyboard {
  const kb = new InlineKeyboard();

  // Row 1: Sizing options
  const sizingOptions = [
    { label: '10%', data: `copy_sizing:${configId}:percent:10` },
    { label: '25%', data: `copy_sizing:${configId}:percent:25` },
    { label: '50%', data: `copy_sizing:${configId}:percent:50` },
    { label: '$100', data: `copy_sizing:${configId}:fixed:100` },
    { label: 'Mirror', data: `copy_sizing:${configId}:mirror:0` },
  ];
  for (const opt of sizingOptions) {
    const selected = isSizingSelected(opt, currentSizing, currentValue);
    kb.text(selected ? `[${opt.label}]` : opt.label, opt.data);
  }
  kb.row();

  // Row 2: Direction
  const dirOptions = [
    { label: 'All', value: 'all' },
    { label: 'Buys only', value: 'buys_only' },
    { label: 'Sells only', value: 'sells_only' },
  ];
  for (const opt of dirOptions) {
    const selected = currentDirection === opt.value;
    kb.text(
      selected ? `[${opt.label}]` : opt.label,
      `copy_dir:${configId}:${opt.value}`,
    );
  }
  kb.row();

  // Row 3: Max per trade
  const maxOptions = [
    { label: '$50', value: 50 },
    { label: '$100', value: 100 },
    { label: '$250', value: 250 },
    { label: 'No limit', value: 0 },
  ];
  for (const opt of maxOptions) {
    const selected =
      opt.value === 0 ? currentMax === null : currentMax === opt.value;
    kb.text(
      selected ? `[${opt.label}]` : opt.label,
      `copy_max:${configId}:${opt.value}`,
    );
  }
  kb.row();

  // Row 4: Smart Copy toggle
  kb.text(
    smartCopyEnabled ? '[ON]' : 'ON',
    `smart_copy_toggle:${configId}`,
  );
  kb.text(
    !smartCopyEnabled ? '[OFF]' : 'OFF',
    `smart_copy_toggle:${configId}`,
  );
  kb.row();

  // Row 5: Min confidence (only shown if smart copy enabled)
  if (smartCopyEnabled) {
    const confOptions = [60, 70, 80, 90];
    for (const pct of confOptions) {
      const selected = Math.round(smartCopyMinConfidence * 100) === pct;
      kb.text(
        selected ? `[${pct}%]` : `${pct}%`,
        `smart_conf:${configId}:${pct}`,
      );
    }
    kb.row();

    // Row 6: Category filter
    const catOptions = [
      { label: 'All', value: 'all' },
      { label: 'Politics', value: 'politics' },
      { label: 'Crypto', value: 'crypto' },
      { label: 'Sports', value: 'sports' },
    ];
    for (const opt of catOptions) {
      const isAll = opt.value === 'all' && !smartCopyCategories;
      const isSelected =
        isAll || (smartCopyCategories?.includes(opt.value) ?? false);
      kb.text(
        isSelected ? `[${opt.label}]` : opt.label,
        `smart_cat:${configId}:${opt.value}`,
      );
    }
    kb.row();
  }

  // Row 7: Start / Cancel
  kb.text('Start copying', `copy_start:${configId}`);
  kb.text('Cancel', `copy_cancel:${configId}`);

  return kb;
}

function isSizingSelected(
  opt: { data: string },
  currentSizing: string,
  currentValue: number,
): boolean {
  // Parse the data to check match
  const parts = opt.data.split(':');
  const mode = parts[2]; // percent, fixed, mirror
  const val = parseFloat(parts[3]);
  return mode === currentSizing && val === currentValue;
}
