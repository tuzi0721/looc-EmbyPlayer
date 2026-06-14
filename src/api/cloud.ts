// Standalone client for the Hills Lite Cloud backend (问6 云同步 / 问7 账号+兑换码).
// Pure fetch + types, framework-agnostic and self-contained. Wire it into a
// "云账号" settings section once the backend is deployed (configure base URL +
// persist the token). Kept decoupled so it never touches local settings/persistence.

export interface CloudUser {
  id: string;
  username: string;
  email: string | null;
  role: "user" | "admin";
  tier: "free" | "pro";
  proExpiresAt: string | null;
  proActive: boolean;
  disabled: boolean;
}

export interface CloudAuthResult {
  token: string;
  user: CloudUser;
}

export interface CloudEmbyAccount {
  serverName: string;
  baseUrl: string;
  username?: string | null;
  secret: string; // emby access token / password (encrypted at rest server-side)
  meta?: Record<string, unknown>;
}

export class CloudApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super(code);
    this.name = "CloudApiError";
  }
}

export interface CloudClientOptions {
  baseUrl: string;
  token?: string | null;
  timeoutMs?: number;
}

export class HillsCloudClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  token: string | null;

  constructor(opts: CloudClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.token = opts.token ?? null;
    this.timeoutMs = opts.timeoutMs ?? 15000;
  }

  setToken(token: string | null): void {
    this.token = token;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
          ...(init?.headers ?? {}),
        },
      });
      const raw: unknown = await res.json().catch(() => ({}));
      if (!res.ok) {
        const code = (raw as { error?: string }).error ?? `http_${res.status}`;
        throw new CloudApiError(res.status, code);
      }
      return raw as T;
    } catch (err) {
      if (err instanceof CloudApiError) throw err;
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new CloudApiError(0, "timeout");
      }
      throw new CloudApiError(0, "network_error");
    } finally {
      clearTimeout(timer);
    }
  }

  health(): Promise<{ ok: boolean; time: string }> {
    return this.request("/health");
  }

  async register(username: string, password: string, email?: string): Promise<CloudAuthResult> {
    const result = await this.request<CloudAuthResult>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, password, ...(email ? { email } : {}) }),
    });
    this.token = result.token;
    return result;
  }

  async login(username: string, password: string): Promise<CloudAuthResult> {
    const result = await this.request<CloudAuthResult>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    this.token = result.token;
    return result;
  }

  async me(): Promise<CloudUser> {
    const { user } = await this.request<{ user: CloudUser }>("/me");
    return user;
  }

  redeemCode(code: string): Promise<{ ok: boolean; tier: string; proExpiresAt: string }> {
    return this.request("/codes/redeem", { method: "POST", body: JSON.stringify({ code }) });
  }

  pushEmbyAccounts(accounts: CloudEmbyAccount[]): Promise<{ ok: boolean; count: number }> {
    return this.request("/sync/emby-accounts", {
      method: "PUT",
      body: JSON.stringify({ accounts }),
    });
  }

  async pullEmbyAccounts(): Promise<CloudEmbyAccount[]> {
    const { accounts } = await this.request<{ accounts: CloudEmbyAccount[] }>("/sync/emby-accounts");
    return accounts;
  }
}
