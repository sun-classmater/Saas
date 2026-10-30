const TOKEN_KEY = "saas_admin_token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const token = getToken();
  if (!options.noAuth && token) headers.Authorization = `Bearer ${token}`;
  let body = options.body;
  if (options.text !== undefined) {
    headers["Content-Type"] = "text/csv; charset=utf-8";
    body = options.text;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(body);
  }
  const response = await fetch(path, { method: options.method || "GET", headers, body });
  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await response.json() : null;
  if (!response.ok) {
    const error = new Error(data?.error?.message || `请求失败（${response.status}）`);
    error.code = data?.error?.code;
    error.details = data?.error?.details;
    error.status = response.status;
    if (response.status === 401) clearToken();
    throw error;
  }
  return data?.data ?? data;
}
