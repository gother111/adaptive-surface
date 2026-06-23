use super::contracts::{ControlPlaneError, ControlPlaneErrorKind, RuntimeEventEnvelope};
use std::sync::{Arc, Mutex};
use tauri::Emitter;

pub trait RuntimeEventPublisher: Send + Sync {
    fn publish(&self, event: &RuntimeEventEnvelope) -> Result<(), ControlPlaneError>;
}

#[derive(Default)]
pub struct NoopEventPublisher;

impl RuntimeEventPublisher for NoopEventPublisher {
    fn publish(&self, _event: &RuntimeEventEnvelope) -> Result<(), ControlPlaneError> {
        Ok(())
    }
}

pub struct TauriEventPublisher {
    app: tauri::AppHandle,
}

impl TauriEventPublisher {
    pub fn new(app: tauri::AppHandle) -> Self {
        Self { app }
    }
}

impl RuntimeEventPublisher for TauriEventPublisher {
    fn publish(&self, event: &RuntimeEventEnvelope) -> Result<(), ControlPlaneError> {
        self.app
            .emit("control-plane://runtime-event", event)
            .map_err(|error| ControlPlaneError {
                kind: ControlPlaneErrorKind::Io,
                message: "could not publish runtime event".to_string(),
                raw_diagnostic: Some(error.to_string()),
                retryable: true,
            })
    }
}

#[derive(Clone)]
pub struct SharedEventPublisher {
    publisher: Arc<Mutex<Arc<dyn RuntimeEventPublisher>>>,
}

impl SharedEventPublisher {
    pub fn noop() -> Self {
        Self {
            publisher: Arc::new(Mutex::new(Arc::new(NoopEventPublisher))),
        }
    }

    pub fn replace(&self, publisher: Arc<dyn RuntimeEventPublisher>) -> Result<(), ControlPlaneError> {
        let mut current = self.publisher.lock().map_err(|_| {
            ControlPlaneError::new(ControlPlaneErrorKind::Io, "event publisher lock was poisoned")
        })?;
        *current = publisher;
        Ok(())
    }
}

impl RuntimeEventPublisher for SharedEventPublisher {
    fn publish(&self, event: &RuntimeEventEnvelope) -> Result<(), ControlPlaneError> {
        let publisher = {
            let current = self.publisher.lock().map_err(|_| {
                ControlPlaneError::new(ControlPlaneErrorKind::Io, "event publisher lock was poisoned")
            })?;
            Arc::clone(&current)
        };
        publisher.publish(event)
    }
}

#[cfg(test)]
#[derive(Default)]
pub struct CollectingEventPublisher {
    pub events: Mutex<Vec<RuntimeEventEnvelope>>,
}

#[cfg(test)]
impl RuntimeEventPublisher for CollectingEventPublisher {
    fn publish(&self, event: &RuntimeEventEnvelope) -> Result<(), ControlPlaneError> {
        self.events
            .lock()
            .expect("collecting publisher lock should not be poisoned")
            .push(event.clone());
        Ok(())
    }
}
