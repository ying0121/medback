const COOKIE_EXPIRY_DAYS = 7;

export const setCookie = (name: string, value: string, days = COOKIE_EXPIRY_DAYS): void => {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)};expires=${expires};path=/;SameSite=Lax`;
};

export const getCookie = (name: string): string | null => {
  const encoded = encodeURIComponent(name);
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${encoded}=`));
  return match ? decodeURIComponent(match.slice(encoded.length + 1)) : null;
};

export const deleteCookie = (name: string): void => {
  document.cookie = `${encodeURIComponent(name)}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
};
