// api/lib/stripe-constants.js
// Shared Stripe → internal mapping constants used by webhook.js and stripe-reconcile.js

export const PLAN_MAP = {
  prospector: 'prospector',
  dealmaker:  'dealmaker',
  team:       'team',
  fund:       'fund',
  // legacy aliases
  solo:       'prospector',
  enterprise: 'fund',
};

export const STATUS_MAP = {
  active:             'active',
  trialing:           'trialing',
  past_due:           'past_due',
  canceled:           'cancelled',
  cancelled:          'cancelled',
  unpaid:             'past_due',
  incomplete:         'past_due',
  incomplete_expired: 'cancelled',
  paused:             'paused',
};
