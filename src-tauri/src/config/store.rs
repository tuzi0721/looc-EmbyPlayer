use std::sync::Arc;

use parking_lot::RwLock;
use serde::de::DeserializeOwned;
use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Wry};
use tauri_plugin_store::{Store, StoreExt};

use crate::config::models::{Account, AppSettings, Server};
use crate::download::DownloadTask;
use crate::error::{AppError, AppResult};
use crate::notifications::Notification;

const STORE_FILE: &str = "config.json";

const KEY_SERVERS: &str = "servers";
const KEY_ACCOUNTS: &str = "accounts";
const KEY_ACTIVE_ACCOUNT: &str = "active_account_id";
const KEY_SETTINGS: &str = "settings";
const KEY_DOWNLOADS: &str = "downloads";
const KEY_NOTIFICATIONS: &str = "notifications";
const KEY_CLEARED_NOTIFICATION_KEYS: &str = "cleared_notification_keys";
const KEY_NOTIFICATIONS_CLEARED_AT: &str = "notifications_cleared_at";

fn account_identity_key(account: &Account) -> String {
    if !account.server_id.trim().is_empty() && !account.user_id.trim().is_empty() {
        return format!("{}\0user:{}", account.server_id, account.user_id);
    }
    if !account.server_id.trim().is_empty() && !account.username.trim().is_empty() {
        return format!(
            "{}\0name:{}",
            account.server_id,
            account.username.to_lowercase()
        );
    }
    format!("id:{}", account.id)
}

#[derive(Clone)]
pub struct ConfigStore {
    inner: Arc<RwLock<ConfigInner>>,
    store: Arc<Store<Wry>>,
}

struct ConfigInner {
    servers: Vec<Server>,
    accounts: Vec<Account>,
    active_account_id: Option<String>,
    settings: AppSettings,
    downloads: Vec<DownloadTask>,
    notifications: Vec<Notification>,
}

impl ConfigStore {
    pub fn load(handle: &AppHandle) -> AppResult<Self> {
        let store = handle.store(STORE_FILE)?;

        let servers: Vec<Server> = read_or_default(&store, KEY_SERVERS)?;
        let accounts: Vec<Account> = read_or_default(&store, KEY_ACCOUNTS)?;
        let active_account_id: Option<String> = read_optional(&store, KEY_ACTIVE_ACCOUNT)?;
        let settings: AppSettings = read_or_default(&store, KEY_SETTINGS)?;
        let downloads: Vec<DownloadTask> = read_or_default(&store, KEY_DOWNLOADS)?;
        let notifications: Vec<Notification> = read_or_default(&store, KEY_NOTIFICATIONS)?;

        Ok(Self {
            inner: Arc::new(RwLock::new(ConfigInner {
                servers,
                accounts,
                active_account_id,
                settings,
                downloads,
                notifications,
            })),
            store,
        })
    }

    pub fn servers(&self) -> Vec<Server> {
        self.inner.read().servers.clone()
    }

    pub fn server(&self, id: &str) -> Option<Server> {
        self.inner
            .read()
            .servers
            .iter()
            .find(|s| s.id == id)
            .cloned()
    }

    pub fn upsert_server(&self, server: Server) -> AppResult<()> {
        {
            let mut g = self.inner.write();
            if let Some(existing) = g.servers.iter_mut().find(|s| s.id == server.id) {
                *existing = server;
            } else {
                g.servers.push(server);
            }
        }
        self.persist_servers()
    }

    pub fn remove_server(&self, id: &str) -> AppResult<()> {
        {
            let mut g = self.inner.write();
            g.servers.retain(|s| s.id != id);
            g.accounts.retain(|a| a.server_id != id);
            if let Some(active) = &g.active_account_id {
                if !g.accounts.iter().any(|a| a.id == *active) {
                    g.active_account_id = None;
                }
            }
        }
        self.persist_servers()?;
        self.persist_accounts()?;
        self.persist_active_account()?;
        Ok(())
    }

    pub fn accounts(&self) -> Vec<Account> {
        self.inner.read().accounts.clone()
    }

    pub fn account(&self, id: &str) -> Option<Account> {
        self.inner
            .read()
            .accounts
            .iter()
            .find(|a| a.id == id)
            .cloned()
    }

    pub fn upsert_account(&self, mut account: Account) -> AppResult<Account> {
        {
            let mut g = self.inner.write();
            let key = account_identity_key(&account);
            if let Some(existing) = g
                .accounts
                .iter()
                .find(|existing| account_identity_key(existing) == key)
                .cloned()
            {
                account.id = existing.id;
                account.created_at = existing.created_at;
            }
            g.accounts.retain(|existing| {
                existing.id == account.id || account_identity_key(existing) != key
            });
            if let Some(existing) = g.accounts.iter_mut().find(|a| a.id == account.id) {
                *existing = account.clone();
            } else {
                g.accounts.push(account.clone());
            }
            if let Some(active) = g.active_account_id.as_ref() {
                if !g.accounts.iter().any(|existing| existing.id == *active) {
                    g.active_account_id = Some(account.id.clone());
                }
            }
        }
        self.persist_accounts()?;
        self.persist_active_account()?;
        Ok(account)
    }

    pub fn remove_account(&self, id: &str) -> AppResult<()> {
        {
            let mut g = self.inner.write();
            g.accounts.retain(|a| a.id != id);
            if g.active_account_id.as_deref() == Some(id) {
                g.active_account_id = None;
            }
        }
        self.persist_accounts()?;
        self.persist_active_account()?;
        Ok(())
    }

    pub fn active_account(&self) -> Option<Account> {
        let g = self.inner.read();
        g.active_account_id
            .as_ref()
            .and_then(|id| g.accounts.iter().find(|a| a.id == *id).cloned())
    }

    pub fn active_account_id(&self) -> Option<String> {
        self.inner.read().active_account_id.clone()
    }

    pub fn set_active_account(&self, id: Option<String>) -> AppResult<()> {
        {
            let mut g = self.inner.write();
            g.active_account_id = id;
        }
        self.persist_active_account()
    }

    pub fn settings(&self) -> AppSettings {
        self.inner.read().settings.clone()
    }

    pub fn update_settings<F: FnOnce(&mut AppSettings)>(&self, f: F) -> AppResult<()> {
        {
            let mut g = self.inner.write();
            f(&mut g.settings);
        }
        self.persist_settings()
    }

    pub fn set_config_snapshot(
        &self,
        settings: AppSettings,
        servers: Vec<Server>,
        accounts: Vec<Account>,
        active_account_id: Option<String>,
    ) -> AppResult<()> {
        let active_account_id = active_account_id
            .filter(|id| accounts.iter().any(|account| account.id == *id))
            .or_else(|| accounts.first().map(|account| account.id.clone()));
        {
            let mut g = self.inner.write();
            g.settings = settings;
            g.servers = servers;
            g.accounts = accounts;
            g.active_account_id = active_account_id;
        }
        self.persist_settings()?;
        self.persist_servers()?;
        self.persist_accounts()?;
        self.persist_active_account()?;
        Ok(())
    }

    pub fn downloads(&self) -> Vec<DownloadTask> {
        self.inner.read().downloads.clone()
    }

    pub fn download(&self, id: &str) -> Option<DownloadTask> {
        self.inner
            .read()
            .downloads
            .iter()
            .find(|d| d.id == id)
            .cloned()
    }

    pub fn upsert_download(&self, task: DownloadTask) -> AppResult<()> {
        {
            let mut g = self.inner.write();
            if let Some(existing) = g.downloads.iter_mut().find(|d| d.id == task.id) {
                *existing = task;
            } else {
                g.downloads.push(task);
            }
        }
        self.persist_downloads()
    }

    pub fn remove_download(&self, id: &str) -> AppResult<()> {
        {
            let mut g = self.inner.write();
            g.downloads.retain(|d| d.id != id);
        }
        self.persist_downloads()
    }

    pub fn notifications(&self) -> Vec<Notification> {
        self.inner.read().notifications.clone()
    }

    pub fn replace_notifications(&self, items: Vec<Notification>) -> AppResult<()> {
        {
            let mut g = self.inner.write();
            g.notifications = items;
        }
        self.persist_notifications()
    }

    pub fn cleared_notification_keys(&self) -> Vec<String> {
        normalize_string_list(self.store.get(KEY_CLEARED_NOTIFICATION_KEYS), 250)
    }

    pub fn replace_cleared_notification_keys(&self, keys: Vec<String>) -> AppResult<()> {
        self.store.set(
            KEY_CLEARED_NOTIFICATION_KEYS,
            serde_json::to_value(normalize_strings(keys, 250))?,
        );
        self.store.save()?;
        Ok(())
    }

    pub fn record_notifications_cleared(&self) -> AppResult<()> {
        self.store.set(
            KEY_NOTIFICATIONS_CLEARED_AT,
            Value::String(chrono::Utc::now().to_rfc3339()),
        );
        self.store.save()?;
        Ok(())
    }

    fn persist_servers(&self) -> AppResult<()> {
        let v = serde_json::to_value(&self.inner.read().servers)?;
        self.store.set(KEY_SERVERS, v);
        self.store.save()?;
        Ok(())
    }

    fn persist_accounts(&self) -> AppResult<()> {
        let v = serde_json::to_value(&self.inner.read().accounts)?;
        self.store.set(KEY_ACCOUNTS, v);
        self.store.save()?;
        Ok(())
    }

    fn persist_active_account(&self) -> AppResult<()> {
        let v = serde_json::to_value(&self.inner.read().active_account_id)?;
        self.store.set(KEY_ACTIVE_ACCOUNT, v);
        self.store.save()?;
        Ok(())
    }

    /// Read an arbitrary JSON value stored under `key`, or `None` if the key
    /// is unset (or stored as `null`). Used by experimental subsystems that
    /// don't yet warrant a dedicated typed slot.
    pub fn get_raw(&self, key: &str) -> Option<Value> {
        match self.store.get(key) {
            Some(Value::Null) | None => None,
            Some(v) => Some(v),
        }
    }

    /// Persist an arbitrary JSON value under `key`.
    pub fn set_raw(&self, key: &str, value: Value) -> AppResult<()> {
        self.store.set(key, value);
        self.store.save()?;
        Ok(())
    }

    fn persist_settings(&self) -> AppResult<()> {
        let v = serde_json::to_value(&self.inner.read().settings)?;
        self.store.set(KEY_SETTINGS, v);
        self.store.save()?;
        Ok(())
    }

    fn persist_downloads(&self) -> AppResult<()> {
        let v = serde_json::to_value(&self.inner.read().downloads)?;
        self.store.set(KEY_DOWNLOADS, v);
        self.store.save()?;
        Ok(())
    }

    fn persist_notifications(&self) -> AppResult<()> {
        let v = serde_json::to_value(&self.inner.read().notifications)?;
        self.store.set(KEY_NOTIFICATIONS, v);
        self.store.save()?;
        Ok(())
    }
}

fn read_or_default<T>(store: &Store<Wry>, key: &str) -> AppResult<T>
where
    T: DeserializeOwned + Default + Serialize,
{
    match store.get(key) {
        Some(v) => serde_json::from_value::<T>(v).map_err(AppError::from),
        None => Ok(T::default()),
    }
}

fn read_optional<T>(store: &Store<Wry>, key: &str) -> AppResult<Option<T>>
where
    T: DeserializeOwned,
{
    match store.get(key) {
        Some(Value::Null) | None => Ok(None),
        Some(v) => serde_json::from_value(v).map_err(AppError::from),
    }
}

fn normalize_string_list(value: Option<Value>, keep: usize) -> Vec<String> {
    match value {
        Some(Value::Array(items)) => normalize_strings(
            items
                .into_iter()
                .filter_map(|item| match item {
                    Value::String(text) => Some(text),
                    _ => None,
                })
                .collect(),
            keep,
        ),
        _ => Vec::new(),
    }
}

fn normalize_strings(values: Vec<String>, keep: usize) -> Vec<String> {
    let mut out = Vec::new();
    for value in values {
        let text = value.trim();
        if text.is_empty() || out.iter().any(|existing| existing == text) {
            continue;
        }
        out.push(text.to_string());
    }
    if out.len() > keep {
        out.split_off(out.len() - keep)
    } else {
        out
    }
}
