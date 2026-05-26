use std::future::Future;
use std::time::{Duration, Instant};

use futures::future::FutureExt;
use futures::stream::{FuturesUnordered, StreamExt};
use tokio::time::timeout;

use crate::error::{AppError, AppResult};

/// Result of a race: which contestant won and how long it took.
#[derive(Debug)]
pub struct RaceOutcome<T> {
    #[allow(dead_code)]
    pub winner_id: String,
    pub value: T,
    #[allow(dead_code)]
    pub elapsed_ms: u64,
}

/// Race a batch of async tasks; the first successful one wins.
/// Each contestant is `(id, future producing AppResult<T>)`.
/// If all fail, the last error is returned. If none completes within `timeout_ms`,
/// returns a timeout error.
pub async fn race_first_success<T, F, Fut>(
    contestants: Vec<(String, F)>,
    overall_timeout_ms: u64,
) -> AppResult<RaceOutcome<T>>
where
    F: FnOnce() -> Fut + Send + 'static,
    Fut: Future<Output = AppResult<T>> + Send + 'static,
    T: Send + 'static,
{
    if contestants.is_empty() {
        return Err(AppError::Other("race: no contestants".into()));
    }

    let started = Instant::now();
    let mut futs = FuturesUnordered::new();
    for (id, mk) in contestants {
        let id_cloned = id.clone();
        let f = (mk)().map(move |res| (id_cloned, res));
        futs.push(Box::pin(f));
    }

    let race_fut = async {
        let mut last_err: Option<AppError> = None;
        while let Some((id, res)) = futs.next().await {
            match res {
                Ok(value) => {
                    return Ok(RaceOutcome {
                        winner_id: id,
                        value,
                        elapsed_ms: started.elapsed().as_millis() as u64,
                    });
                }
                Err(e) => {
                    last_err = Some(e);
                }
            }
        }
        Err(last_err.unwrap_or_else(|| AppError::Other("race: no winner".into())))
    };

    match timeout(Duration::from_millis(overall_timeout_ms), race_fut).await {
        Ok(r) => r,
        Err(_) => Err(AppError::Other(format!(
            "race: overall timeout after {overall_timeout_ms}ms"
        ))),
    }
}
