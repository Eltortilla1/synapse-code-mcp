export function formatName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '-');
}

export function formatEmail(email: string): string {
  return email.trim().toLowerCase();
}
