import bcrypt from "bcryptjs";

export function validatePasswordStrength(password: string): string | null {
  const trimmed = password.trim();
  if (trimmed.length < 8) {
    return "Password must be at least 8 characters long.";
  }

  if (!/[A-Z]/.test(trimmed) || !/[a-z]/.test(trimmed)) {
    return "Password must include both uppercase and lowercase letters.";
  }

  if (!/[0-9]/.test(trimmed)) {
    return "Password must include at least one number.";
  }

  if (!/[!@#$%^&*(),.?\":{}|<>\-_[\]\\/;'+=]/.test(trimmed)) {
    return "Password must include at least one special character.";
  }

  return null;
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}
