export interface PasswordStrengthResult {
  isValid: boolean;
  label: 'weak' | 'medium' | 'strong';
  score: number;
  checks: {
    minLength: boolean;
    uppercase: boolean;
    lowercase: boolean;
    number: boolean;
    special: boolean;
  };
}

/**
 * Evaluates a password against the app's minimum security rules and returns
 * both the overall verdict and per-rule results for UI feedback.
 */
export const validatePasswordStrength = (password: string): PasswordStrengthResult => {
  const checks = {
    minLength: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[!@#$%^&*]/.test(password),
  };

  const score = Object.values(checks).filter(Boolean).length;
  const isValid = Object.values(checks).every(Boolean);

  let label: PasswordStrengthResult['label'] = 'weak';
  if (score >= 5) {
    label = 'strong';
  } else if (score >= 3) {
    label = 'medium';
  }

  return {
    isValid,
    label,
    score,
    checks,
  };
};
